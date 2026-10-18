-- BeheerTunr: databaseschema van het Supabase-project "tunr" (idempotent; mag elke keer opnieuw).
-- Toegepast door de workflow Backend via de Management API (POST /v1/projects/{ref}/database/query).
-- Bron van waarheid: docs/CONTRACT.md. Alleen de Edge Functions (service role) lezen en schrijven.

-- ===== tabellen (letterlijk uit het contract) =====
create table if not exists public.installs (
  install_id uuid primary key,
  platform text not null check (platform in ('ios','ipados','macos','tvos','android','androidtv','web')),
  device text not null default '',          -- 'iPhone','iPad','Mac','Apple TV','Android-telefoon','Android-tablet','Android TV','Google TV','Fire TV','Browser'
  model text not null default '',           -- bv. 'iPhone16,2', 'Pixel 8', 'Chrome 129 (macOS)' — max 60 tekens, geen persoonsgegevens
  os_version text not null default '',
  app_version text not null default '',
  app_build int not null default 0,
  country text not null default '',         -- landcode die de gebruiker in Tunr koos (2 letters, hoofdletters)
  lang text not null default '',            -- 'nl' | 'en'
  carplay boolean not null default false,   -- ooit CarPlay/Android Auto gebruikt
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists public.install_days (
  install_id uuid not null references public.installs(install_id) on delete cascade,
  day date not null,
  primary key (install_id, day)
);
create index if not exists installs_last_seen on public.installs(last_seen);
create index if not exists install_days_day on public.install_days(day);
create table if not exists public.admin_token_state (id int primary key default 1, v int not null default 1);
insert into public.admin_token_state(id, v) values (1, 1) on conflict do nothing;
create table if not exists public.admin_audit (id bigserial primary key, at timestamptz not null default now(), action text not null, detail text not null default '', ip_hash text not null default '');
alter table public.installs enable row level security;
alter table public.install_days enable row level security;
alter table public.admin_token_state enable row level security;
alter table public.admin_audit enable row level security;
-- geen policies: alleen de functies (service role) lezen en schrijven

-- presskit-downloads (functie presskit): alleen tijdstip en versie, geen IP of andere gegevens
create table if not exists public.presskit_downloads (id bigserial primary key, at timestamptz not null default now(), version text not null default '');
alter table public.presskit_downloads enable row level security;

-- ===== aanvullend (niet in het contract-blok, wel nodig voor de functies) =====
create index if not exists installs_first_seen on public.installs(first_seen);
create index if not exists admin_audit_login on public.admin_audit(action, at);
create index if not exists presskit_downloads_at on public.presskit_downloads(at);
create index if not exists presskit_downloads_version on public.presskit_downloads(version);

-- Extra slot op de deur: anon/authenticated mogen niets met deze tabellen (RLS zonder policies doet dat al).
revoke all on table public.installs, public.install_days, public.admin_token_state, public.admin_audit, public.presskit_downloads from anon, authenticated;
revoke all on sequence public.presskit_downloads_id_seq from anon, authenticated;

-- ping: upsert van een installatie en de dag van vandaag (UTC). first_seen blijft, carplay = oud OR nieuw.
create or replace function public.tunr_ping(
  p_id uuid, p_platform text, p_device text, p_model text, p_os text, p_version text,
  p_build int, p_country text, p_lang text, p_carplay boolean
) returns void
language sql security definer set search_path = public as $$
  insert into public.installs as i (install_id, platform, device, model, os_version, app_version, app_build, country, lang, carplay, first_seen, last_seen)
  values (p_id, p_platform, p_device, p_model, p_os, p_version, p_build, p_country, p_lang, p_carplay, now(), now())
  on conflict (install_id) do update set
    platform = excluded.platform, device = excluded.device, model = excluded.model, os_version = excluded.os_version,
    app_version = excluded.app_version, app_build = excluded.app_build, country = excluded.country, lang = excluded.lang,
    carplay = i.carplay or excluded.carplay, last_seen = now();
  insert into public.install_days (install_id, day) values (p_id, (now() at time zone 'utc')::date) on conflict do nothing;
$$;

-- overal uitloggen: tokenversie + 1 (alle beheer-tokens vervallen)
create or replace function public.tunr_admin_logout_all() returns int
language sql security definer set search_path = public as $$
  insert into public.admin_token_state(id, v) values (1, 2)
  on conflict (id) do update set v = public.admin_token_state.v + 1
  returning v;
$$;

-- opschonen: hoogstens 1x per 23 uur (bijgehouden als actie 'cleanup' in admin_audit). Geeft null als het niet nodig was.
create or replace function public.tunr_cleanup() returns json
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'utc')::date;
  n_inst int; n_days int; n_audit int;
begin
  if exists (select 1 from public.admin_audit where action = 'cleanup' and at > now() - interval '23 hours') then
    return null;
  end if;
  delete from public.installs where last_seen < now() - interval '400 days';
  get diagnostics n_inst = row_count;
  delete from public.install_days where day < today - 400;
  get diagnostics n_days = row_count;
  delete from public.admin_audit where at < now() - interval '400 days';
  get diagnostics n_audit = row_count;
  insert into public.admin_audit(action, detail) values ('cleanup', json_build_object('installs', n_inst, 'days', n_days, 'audit', n_audit)::text);
  return json_build_object('installs', n_inst, 'days', n_days, 'audit', n_audit);
end $$;

-- statistieken voor het dashboard en de Beheer-app (vorm: docs/CONTRACT.md, actie stats). Alles in UTC.
-- "actief" = last_seen in de periode (gelijk aan een rij in install_days, die per ping wordt gezet).
-- per_day: periode van p_days dagen (7, 30, 90 of 365) die p_offset periodes terug eindigt:
-- [vandaag - p_offset*p_days - (p_days-1), vandaag - p_offset*p_days]; p_offset*p_days ≤ 400 (bewaartermijn).
-- De kengetallen en verdelingen gaan over nu (los van de periode).
-- Oude versie met één parameter opruimen (anders twee overloads); idempotent.
drop function if exists public.tunr_stats(int);
create or replace function public.tunr_stats(p_days int default 30, p_offset int default 0) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  n int := case when p_days in (7, 30, 90, 365) then p_days else 30 end;
  o int := least(greatest(coalesce(p_offset, 0), 0), 400 / n);
  today date := (now() at time zone 'utc')::date;
  t0 timestamptz := (today::timestamp at time zone 'utc');   -- vandaag 00:00 UTC
  a30 timestamptz := t0 - interval '29 days';
  d_to date := today - o * n;                                -- laatste dag van de periode
  d_from date := today - o * n - (n - 1);                    -- eerste dag van de periode
  f0 timestamptz := (d_from::timestamp at time zone 'utc');
  f1 timestamptz := ((d_to + 1)::timestamp at time zone 'utc');
  out json;
begin
  select json_build_object(
    'generated', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'totals', (select json_build_object(
        'installs', count(*),
        'active_today', count(*) filter (where last_seen >= t0),
        'active_7d', count(*) filter (where last_seen >= t0 - interval '6 days'),
        'active_30d', count(*) filter (where last_seen >= a30),
        'new_today', count(*) filter (where first_seen >= t0),
        'new_7d', count(*) filter (where first_seen >= t0 - interval '6 days'),
        'carplay', count(*) filter (where carplay))
      from public.installs),
    'range', json_build_object('from', to_char(d_from, 'YYYY-MM-DD'), 'to', to_char(d_to, 'YYYY-MM-DD'), 'days', n, 'offset', o),
    'per_day', (select coalesce(json_agg(json_build_object('day', to_char(g.d, 'YYYY-MM-DD'), 'active', coalesce(a.c, 0), 'new', coalesce(nw.c, 0)) order by g.d), '[]'::json)
      from (select d_from + k as d from generate_series(0, n - 1) as k) g
      left join (select day, count(*) as c from public.install_days where day between d_from and d_to group by day) a on a.day = g.d
      left join (select (first_seen at time zone 'utc')::date as day, count(*) as c from public.installs
                 where first_seen >= f0 and first_seen < f1 group by 1) nw on nw.day = g.d),
    'platforms', (select coalesce(json_agg(json_build_object('key', platform, 'installs', c, 'active_30d', a) order by c desc, platform), '[]'::json)
      from (select platform, count(*) as c, count(*) filter (where last_seen >= a30) as a from public.installs group by platform) s),
    'devices', (select coalesce(json_agg(json_build_object('key', device, 'installs', c, 'active_30d', a) order by c desc, device), '[]'::json)
      from (select device, count(*) as c, count(*) filter (where last_seen >= a30) as a from public.installs group by device) s),
    'versions', (select coalesce(json_agg(json_build_object('key', k, 'installs', c) order by c desc, k desc), '[]'::json)
      from (select case when app_version = '' then '?' else app_version || ' (' || app_build || ')' end as k, count(*) as c
            from public.installs where last_seen >= a30 group by 1 order by 2 desc, 1 desc limit 12) s),
    'countries', (select coalesce(json_agg(json_build_object('key', country, 'installs', c) order by c desc, country), '[]'::json)
      from (select country, count(*) as c from public.installs where last_seen >= a30 group by country order by 2 desc, 1 limit 15) s),
    'langs', (select coalesce(json_agg(json_build_object('key', lang, 'installs', c) order by c desc, lang), '[]'::json)
      from (select lang, count(*) as c from public.installs where last_seen >= a30 group by lang) s)
  ) into out;
  return out;
end $$;

-- presskit: één download tellen (functie presskit). Versie ingekort tot 40 tekens.
create or replace function public.tunr_presskit_hit(p_version text) returns void
language sql security definer set search_path = public as $$
  insert into public.presskit_downloads(version) values (left(coalesce(p_version, ''), 40));
$$;

-- presskit: tellingen voor de actie stats (vorm: docs/CONTRACT.md, stats → presskit). Alles in UTC.
-- per_day = de laatste 30 dagen t/m vandaag (ook dagen met 0), oud → nieuw; per_version = nieuwste 20 versies.
create or replace function public.tunr_presskit_stats() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'utc')::date;
  f0 timestamptz := ((today - 29)::timestamp at time zone 'utc');
  out json;
begin
  select json_build_object(
    'total', (select count(*) from public.presskit_downloads),
    'last_30d', (select count(*) from public.presskit_downloads where at >= f0),
    'per_version', (select coalesce(json_agg(json_build_object('version', v, 'count', c) order by v desc), '[]'::json)
      from (select version as v, count(*) as c from public.presskit_downloads group by version order by version desc limit 20) s),
    'per_day', (select coalesce(json_agg(json_build_object('day', to_char(g.d, 'YYYY-MM-DD'), 'count', coalesce(x.c, 0)) order by g.d), '[]'::json)
      from (select today - 29 + k as d from generate_series(0, 29) as k) g
      left join (select (at at time zone 'utc')::date as d, count(*) as c from public.presskit_downloads where at >= f0 group by 1) x on x.d = g.d)
  ) into out;
  return out;
end $$;

-- functies alleen voor de service role (Edge Functions)
revoke all on function public.tunr_ping(uuid, text, text, text, text, text, int, text, text, boolean) from public, anon, authenticated;
revoke all on function public.tunr_admin_logout_all() from public, anon, authenticated;
revoke all on function public.tunr_cleanup() from public, anon, authenticated;
revoke all on function public.tunr_stats(int, int) from public, anon, authenticated;
grant execute on function public.tunr_ping(uuid, text, text, text, text, text, int, text, text, boolean) to service_role;
grant execute on function public.tunr_admin_logout_all() to service_role;
grant execute on function public.tunr_cleanup() to service_role;
grant execute on function public.tunr_stats(int, int) to service_role;
revoke all on function public.tunr_presskit_hit(text) from public, anon, authenticated;
revoke all on function public.tunr_presskit_stats() from public, anon, authenticated;
grant execute on function public.tunr_presskit_hit(text) to service_role;
grant execute on function public.tunr_presskit_stats() to service_role;
