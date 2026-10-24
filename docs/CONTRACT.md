# BeheerTunr — contract (backend, dashboard, Beheer-app, Tunr-apps)

Dit document is de bron van waarheid voor alle onderdelen. Wijzig het eerst hier.

## Onderdelen

| Onderdeel | Waar | Wat |
|---|---|---|
| Supabase-project **tunr** | supabase.com (eigen project, los van Bingr) | tabellen `installs`, `install_days`, `admin_token_state`, `admin_audit`, `presskit_downloads`; Edge Functions `ping` en `presskit` (openbaar) en `admin` (beheer) |
| Dashboard | repo `LRvdLinden/tunr-beheer`, map `web/` → **https://beheer.tunr.online** (FTPS) | statische HTML/JS/CSS; tabs Overzicht, Downloads, Instellingen; `dl.php` + afgesloten map `builds/` |
| Beheer-app **BeheerTunr** | repo `tunr-beheer`, map `apple/` | SwiftUI, één multiplatform-target (iOS/iPadOS 17+, macOS 14+), bundle-id `nl.lrvdlinden.tunr.beheer`, Team `EU3UY476T6` |
| Tunr-apps + webspeler | repo `int-radio-app` | sturen een anonieme **ping**; build-workflows zetten Xcode-zip en APK via FTPS in `builds/` van beheer.tunr.online (niet meer op GitHub) |
| Presskit | repo `int-radio-app`, workflow *Website* + `tools/make_presskit.py` → **https://tunr.online/presskit/** | `Tunr-PressKit.zip` + `presskit.json`, gemaakt uit `appstore/` van deze repo; footer-link **PressKit** op tunr.online → functie `presskit` |

## Configuratie (openbaar, mag in de repo's)

- `SUPABASE_URL` = `https://<project-ref>.supabase.co` en `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). Staan op één plek per onderdeel:
  - tunr-beheer: `web/config.js` (`window.BEHEER = { url, key }`), `apple/Shared/Config.swift`
  - int-radio-app: `apple/Shared/App/Brand.swift` (`Brand.statsURL`, `Brand.statsKey`), `android/…/Brand.kt` (`STATS_URL`, `STATS_KEY`), `website/assets/js/brand.js` (`window.TUNR.stats = { url, key }`)
  - Zolang de URL leeg is, sturen de apps geen ping en toont het dashboard "Nog niet ingericht".

## Geheimen (alleen GitHub-secrets / Supabase function-secrets)

**tunr-beheer** (GitHub-secrets):
- `SUPABASE_ACCESS_TOKEN` (persoonlijk token supabase.com), `SUPABASE_PROJECT_REF` (optioneel; anders uit `web/config.js`)
- `TUNR_ADMIN_USER`, `TUNR_ADMIN_PASSWORD` (≥ 12 tekens) → function-secrets van `admin`
- `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` (eigen FTP-account van beheer.tunr.online; komt direct uit in de map van het subdomein), optioneel `FTP_DIR`
- De workflow maakt zelf **`TUNR_BUILDS_KEY`** (64 hex) aan als die er nog niet is: als function-secret in Supabase én als `builds/key.php` op de server. Daarnaast `TUNR_TOKEN_SECRET` (64 hex, HMAC voor inlogtokens) op dezelfde manier, alleen als function-secret.

**int-radio-app** (GitHub-secrets, extra):
- `BEHEER_FTP_USERNAME`, `BEHEER_FTP_PASSWORD` (hetzelfde FTP-account van beheer.tunr.online; server = `FTP_SERVER` die er al staat)

## Database (SQL, idempotent; workflow *Backend* in tunr-beheer via de Management API `POST /v1/projects/{ref}/database/query`)

```sql
create table if not exists public.installs (
  install_id uuid primary key,
  platform text not null check (platform in ('ios','ipados','macos','tvos','watchos','android','androidtv','windows','web')),
  device text not null default '',          -- 'iPhone','iPad','Mac','Apple TV','Apple Watch','Android-telefoon','Android-tablet','Android TV','Google TV','Fire TV','Browser'
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
```

SQL-functies (service role): `tunr_presskit_hit(p_version text)` (één rij, versie max 40 tekens) en `tunr_presskit_stats()` → `{total, last_30d, per_version:[{version,count}] (nieuwste 20), per_day:[{day,count}] (laatste 30 dagen t/m vandaag, UTC, ook 0)}`. Presskit-downloads worden niet opgeschoond (geen persoonsgegevens; totaal blijft kloppen).

Opschonen: installs zonder ping in 400 dagen en `install_days` ouder dan 400 dagen worden bij elke `stats`-aanroep (max 1× per dag) verwijderd.

## Functie `ping` (openbaar, `verify_jwt = false`)

`POST {SUPABASE_URL}/functions/v1/ping` met kopregels `apikey: <publishable key>`, `Content-Type: application/json`:

```json
{ "id": "<uuid v4, per installatie>", "platform": "ios", "device": "iPhone", "model": "iPhone16,2",
  "os": "18.1", "version": "1.0.0", "build": 14, "country": "NL", "lang": "nl", "carplay": false }
```

- Valideert alles strikt (uuid, platform uit de lijst, strings ingekort, build 0–99999, country `^[A-Z]{2}$` of leeg, lang `nl|en`). Fout → 400 `{error}`.
- Upsert in `installs` (`first_seen` blijft, `last_seen = now()`, `carplay = carplay OR nieuw`) en `insert … on conflict do nothing` in `install_days` (vandaag, UTC).
- Slaat **geen IP-adres** op. Limiet: max 30 pings per IP per uur (in het geheugen van de functie; best effort).
- Antwoord 200 `{ "ok": true }`. CORS: `Access-Control-Allow-Origin: https://tunr.online` (+ `OPTIONS`).

**Wanneer pingen de apps?** Bij het starten (en bij terugkomen naar de voorgrond) als de laatste geslaagde ping > 12 uur geleden is. Install-id: willekeurige UUID, lokaal bewaard (Apple: UserDefaults, niet in iCloud; Android: SharedPreferences; web: localStorage `tunr.installId`). Instelling **"Anonieme gebruiksstatistieken"** (standaard aan) in Instellingen → uit = geen pings. Fouten worden genegeerd.

## Functie `presskit` (openbaar, `verify_jwt = false`)

`GET {SUPABASE_URL}/functions/v1/presskit` (de footer-link **PressKit** op elke pagina van tunr.online behalve de webspeler; gewone link, geen apikey, werkt zonder JS):

- Leest de huidige versie uit `https://tunr.online/presskit/presskit.json` (10 minuten in het geheugen; na een fout 1 minuut, met de laatste goede waarde).
- Telt één download met `tunr_presskit_hit(versie)`: alleen bij `GET` van een browser (geen HEAD, geen robots/linkvoorbeelden/scripts op basis van de User-Agent), hoogstens **5 per IP per uur** (in het geheugen van de functie; best effort). Slaat **geen IP-adres** op.
- Antwoord altijd **302** naar `https://tunr.online/presskit/Tunr-PressKit.zip?v=<versie>` (zonder `?v=` als de versie onbekend is), `Cache-Control: no-store`. Ook bij elke fout wordt doorgestuurd: de download mag nooit breken. Andere methodes: 405.

`presskit.json` (gemaakt door `tools/make_presskit.py` in int-radio-app; workflow *Website*, bij elke upload en maandelijks, of alleen de presskit met de invoer `presskit_only`):
```json
{ "version": "2026.10.18-8140c4", "date": "2026-10-18", "size": 50796528, "files": 50, "platforms": ["Apple"] }
```
`version` = `<YYYY.MM.DD>-<eerste 6 tekens sha256 van de inhoud>`; verandert alleen als de inhoud verandert (dan ook een nieuwe datum). Zip: map `Tunr Press Kit/` met `README.txt`, `Brand/`, `Apple/<apparaat>/`, `Promo/` (later bv. `Android/`).

## Functie `admin` (`verify_jwt = false`, eigen tokens)

`POST {SUPABASE_URL}/functions/v1/admin` met `apikey` en JSON `{ "action": "...", ...}`; na inloggen kopregel `Authorization: Bearer <token>`.

- `login` `{user, password}` → `{ token, expires }`. Token = `base64url(json {v, e, s:"admin"}) . base64url(HMAC-SHA256(TUNR_TOKEN_SECRET, payload))`, 12 uur. Constant-time vergelijken; na 5 mislukte pogingen per IP 15 minuten blokkade. Audit `login` / `login_failed` (IP alleen gehasht).
- `logout_all` → verhoogt `admin_token_state.v` (alle tokens vervallen).
- `stats` `{days?: 30, offset?: 0}` →
  - `days` ∈ {7, 30, 90, 365} (week, maand, kwartaal, jaar; ontbreekt = 30). `offset` = aantal periodes terug (geheel getal ≥ 0, ontbreekt = 0) met `offset × days ≤ 400` (bewaartermijn). Anders 400 `{error:"bad_range"}`.
  - Periode (UTC): `to = vandaag − offset × days`, `from = to − (days − 1)`. `per_day` bevat elke dag van die periode (ook dagen met 0), oud → nieuw.
  - `summary` per reeks over `per_day`: `min`, `max`, `avg` (1 decimaal), `last` (laatste dag; bij offset 0 is dat vandaag, nog niet compleet); bij `new` ook `total`.
  - `totals` en de verdelingen gaan altijd over nu (los van de periode).
```json
{ "generated": "2026-10-17T09:00:00Z",
  "totals": { "installs": 1234, "active_today": 120, "active_7d": 480, "active_30d": 900, "new_today": 15, "new_7d": 90, "carplay": 40 },
  "range": { "from": "2026-09-18", "to": "2026-10-17", "days": 30, "offset": 0 },
  "per_day": [ { "day": "2026-09-18", "active": 100, "new": 10 } ],      // elke dag van de periode, oud → nieuw
  "summary": { "active": { "min": 80, "max": 140, "avg": 112.4, "last": 120 },
               "new":    { "min": 2, "max": 21, "avg": 9.3, "last": 15, "total": 280 } },
  "platforms": [ { "key": "ios", "installs": 500, "active_30d": 400 } ],  // aflopend
  "devices":   [ { "key": "iPhone", "installs": 480, "active_30d": 390 } ],
  "versions":  [ { "key": "1.0.0 (14)", "installs": 300 } ],              // top 12, actief 30d
  "countries": [ { "key": "NL", "installs": 700 } ],                      // top 15, actief 30d
  "langs":     [ { "key": "nl", "installs": 800 } ],
  "presskit":  { "available": true, "version": "2026.10.18-8140c4", "date": "2026-10-18", "size": 50796528, "files": 50,
                 "platforms": ["Apple"], "url": "https://tunr.online/presskit/Tunr-PressKit.zip?v=2026.10.18-8140c4",
                 "downloads_total": 120, "downloads_30d": 34,
                 "per_version": [ { "version": "2026.10.18-8140c4", "count": 30 } ],   // nieuwste eerst (max 20)
                 "per_day": [ { "day": "2026-09-19", "count": 0 } ] } }           // laatste 30 dagen t/m vandaag, oud → nieuw
```
  `presskit`: versie/datum/grootte/bestanden uit `presskit.json` (server-side opgehaald, 10 min in het geheugen; niet bereikbaar = `available:false` en lege velden), tellingen uit `tunr_presskit_stats()` (mislukt = nullen). Het blok laat `stats` nooit mislukken. `url` = directe link naar de zip (telt niet mee).
  SQL: `public.tunr_stats(p_days int, p_offset int)` (service role); de functie `admin` controleert de invoer, rekent `summary` uit en maakt het antwoord netjes (`supabase/functions/admin/stats.ts`).
- `builds` → `{ ready: bool, platforms: { apple: [build…], android: [build…], play: [build…], windows: [build…], beheer: [build…] } }`, build = `{version, build, file, size, sha256, date, notes}` nieuwste eerst. Leest `manifest.json` via `https://beheer.tunr.online/dl.php` met een eigen kortgeldig token. Zonder `TUNR_BUILDS_KEY` → `ready:false`.
- `build_link` `{platform, file}` → `{ url, expires }` = `https://beheer.tunr.online/dl.php?t=<token>` (10 minuten). Audit `build_link` (platform + bestand).
- Fout: 401 `{error:"unauthorized"}` (token ongeldig/verlopen/oude versie), 400/429/500 met `{error}`.

## Downloads (buildpakketten)

Op de server van beheer.tunr.online:
```
builds/.htaccess        Require all denied
builds/key.php          <?php return '<TUNR_BUILDS_KEY>';
builds/manifest.json    { "apple": [ {version, build, file, size, sha256, date, notes} ], "android": [...], "play": [...], "windows": [...], "beheer": [...] }
builds/apple/Tunr-1.0.0-build14-Xcode.zip
builds/android/Tunr-1.0.0-build14.apk
builds/play/Tunr-1.0.0-build14.aab      Android App Bundle voor Google Play (workflow Android, naast de APK)
builds/windows/Tunr-1.0.0-build14-Setup.exe   Windows-installer van de desktop-app (workflow Windows)
builds/beheer/BeheerTunr-1.0.0-build3-Xcode.zip
dl.php                  ?t=<payload>.<sig>  — payload base64url({"f":"<apple|android|play|windows|beheer>/<bestand>"|"manifest.json","e":<unix>}), HMAC-SHA256(key) ; max 15 min geldig; ?ping=1 → {"ok":true,"ready":bool}
```

Aanleveren (int-radio-app workflows *Apple*, *Android* en *Windows*, tunr-beheer workflow *Beheer-app*) met `tools/beheer_upload.sh <platform> <bestand> <versie> <build> [notities.md]`:
1. haalt `builds/manifest.json` op via FTPS (of begint leeg), voegt het item vooraan toe (zelfde build vervangt), houdt per platform de **laatste 10** builds en verwijdert oudere bestanden;
2. uploadt het bestand en het manifest via **FTPS met certificaatcontrole** (zelfde aanpak als de workflow *Website*: certificaat van de hoster, `cpanel04.zxcs.nl`).
Er komt nooit een pakket op GitHub (geen repo, geen release, geen artefact).

## Dashboard (web) en Beheer-app — schermen

- **Inloggen**: gebruikersnaam + wachtwoord. App: token in de Keychain (alleen dit apparaat), Face ID/Touch ID-vergrendeling (standaard aan).
- **Overzicht**: kengetallen (Gebruikers totaal, Actief vandaag, Actief 7 dagen, Actief 30 dagen, Nieuw vandaag, Nieuw 7 dagen, CarPlay/Android Auto); grafiekkaart **Gebruikers** in de stijl van Homey Insights: periodekeuze Week · Maand · Kwartaal · Jaar (7/30/90/365 dagen), pijltjes ‹ › om een periode terug/vooruit te gaan (› uit bij de huidige periode, ‹ uit voorbij de bewaartermijn) met het periodelabel (bv. "18 sep – 17 okt 2026"), reeksen als aan/uit-chips: **Actieve gebruikers** (vloeiende lijn + verloopvlak, #FF5A1F → #FFB020) en **Nieuwe gebruikers** (staafjes, #22D3EE; eigen as rechts als beide zichtbaar zijn), horizontale hulplijnen met aslabels, datumlabels die uitdunnen per periode, kruisdraad bij aanwijzen/slepen (verticale lijn, punt per reeks, label met datum en waarden; web: ook met de pijltjestoetsen), samenvatting onder de grafiek (Min · Max · Gem. · Laatste, bij nieuw ook Totaal) en vergroten (volledig scherm; web: Esc sluit); verdeling **per platform** (iPhone, iPad, Mac, Apple TV, Apple Watch, Android, Android TV, Windows, Web), **per type apparaat**, **app-versies**, **landen** (vlag + naam) en **talen**; elk als staafjes met aantallen en percentages; kaart **PressKit**: huidige versie, datum, grootte, aantal bestanden, downloads totaal en laatste 30 dagen, staafjes per dag (30 dagen), lijst per versie en de link **Download presskit** (opent `presskit.url`, telt niet mee). Vernieuwen-knop; "bijgewerkt om …".
- **Downloads**: per platform (Apple, Android, Google Play (.aab), Windows (.exe), BeheerTunr) de nieuwste build (versie, build, datum, grootte, notities) met **Downloaden** (opent de kortgeldige link) en de oudere builds. Een manifest zonder sleutel voor een platform (bv. `windows` in oudere manifesten) telt als leeg.
- **Instellingen**: uitloggen, overal uitloggen, (app) vergrendelen aan/uit, links naar tunr.online en de webspeler.
- Stijl: Tunr-huisstijl (donker #0A0A0C, accent #FF5A1F → #FFB020), NL (standaard) / EN.
- Web: `robots.txt` blokkeert alles, `noindex`, strikte CSP via `web/.htaccess` (alleen verbinding met de Supabase-URL).
