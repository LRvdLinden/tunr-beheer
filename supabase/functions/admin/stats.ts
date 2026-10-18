// Functie admin, actie stats: de telling gebeurt in SQL (public.tunr_stats in supabase/schema.sql, via rpc met de
// service role). Dit bestand controleert de periode (days/offset) en maakt het antwoord netjes in de vorm van
// docs/CONTRACT.md, inclusief de samenvatting per reeks. Pure code, getest in stats_test.ts.

/** Toegestane periodes in dagen: week, maand, kwartaal, jaar. */
export const RANGE_DAYS = [7, 30, 90, 365] as const;
export const DAYS_DEFAULT = 30;
/** Zo ver terug bewaren we gegevens (opschonen na 400 dagen): offset * days mag hier niet overheen. */
export const RETENTION_DAYS = 400;

export type RangeQuery = { days: number; offset: number };

/** Hoeveel periodes van `days` je terug kunt (de periode eindigt dan nog binnen de bewaartermijn). */
export const maxOffset = (days: number) => Math.floor(RETENTION_DAYS / days);

const intOf = (v: unknown): number => {
  if (typeof v === "number") return Number.isInteger(v) ? v : NaN;
  if (typeof v === "string" && /^\d{1,4}$/.test(v.trim())) return Number(v.trim());
  return NaN;
};

/**
 * Periode uit het verzoek. `days` ∈ {7, 30, 90, 365} (ontbreekt = 30); `offset` = aantal periodes terug, geheel
 * getal ≥ 0 (ontbreekt = 0) met offset * days ≤ 400. Ongeldig → null (de functie antwoordt dan 400 bad_range).
 */
export function parseRange(days: unknown, offset: unknown): RangeQuery | null {
  const d = days === undefined || days === null || days === "" ? DAYS_DEFAULT : intOf(days);
  if (!(RANGE_DAYS as readonly number[]).includes(d)) return null;
  const o = offset === undefined || offset === null || offset === "" ? 0 : intOf(offset);
  if (!Number.isInteger(o) || o < 0 || o > maxOffset(d)) return null;
  return { days: d, offset: o };
}

/** Periode [to - (days-1), to] met to = vandaag (UTC) - offset * days, als `YYYY-MM-DD`. */
export function rangeFor(q: RangeQuery, now = new Date()): { from: string; to: string; days: number; offset: number } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = 86_400_000;
  const to = today - q.offset * q.days * day;
  const from = to - (q.days - 1) * day;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to), days: q.days, offset: q.offset };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const key = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : v === null || v === undefined ? "" : String(v).slice(0, 80));
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export type Row = { key: string; installs: number; active_30d?: number };
export type DayRow = { day: string; active: number; new: number };
export type Summary = { min: number; max: number; avg: number; last: number; total?: number };
export type Stats = {
  generated: string;
  totals: { installs: number; active_today: number; active_7d: number; active_30d: number; new_today: number; new_7d: number; carplay: number };
  range: { from: string; to: string; days: number; offset: number };
  per_day: DayRow[];
  summary: { active: Summary; new: Summary };
  platforms: Row[]; devices: Row[]; versions: Row[]; countries: Row[]; langs: Row[];
};

function rows(v: unknown, withActive: boolean, limit: number): Row[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((r) => {
    const o: Row = { key: key(r.key), installs: num(r.installs) };
    if (withActive) o.active_30d = num(r.active_30d);
    return o;
  }).sort((a, b) => b.installs - a.installs || a.key.localeCompare(b.key)).slice(0, limit);
}

/** Min, max, gemiddelde (1 decimaal) en laatste waarde van een reeks (oud → nieuw); met `withTotal` ook de som. */
export function summarize(values: number[], withTotal = false): Summary {
  const s: Summary = values.length
    ? {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      last: values[values.length - 1],
    }
    : { min: 0, max: 0, avg: 0, last: 0 };
  if (withTotal) s.total = values.reduce((a, b) => a + b, 0);
  return s;
}

/** Antwoord van tunr_stats -> contractvorm (ontbrekende velden worden 0 of leeg). */
export function cleanStats(raw: unknown, now = new Date(), q: RangeQuery = { days: DAYS_DEFAULT, offset: 0 }): Stats {
  const r = isObj(raw) ? raw : {};
  const t = isObj(r.totals) ? r.totals : {};
  const perDayRaw = Array.isArray(r.per_day) ? r.per_day.filter(isObj) : [];
  const fallback = rangeFor(q, now);
  const rr = isObj(r.range) ? r.range : {};
  const range = isDay(rr.from) && isDay(rr.to) && rr.from <= rr.to
    ? { from: rr.from, to: rr.to, days: num(rr.days) || q.days, offset: num(rr.offset) }
    : fallback;
  const perDay: DayRow[] = perDayRaw
    .filter((d) => isDay(d.day) && d.day >= range.from && d.day <= range.to)
    .map((d) => ({ day: d.day as string, active: num(d.active), new: num(d.new) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  return {
    generated: typeof r.generated === "string" ? r.generated : now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    totals: {
      installs: num(t.installs), active_today: num(t.active_today), active_7d: num(t.active_7d), active_30d: num(t.active_30d),
      new_today: num(t.new_today), new_7d: num(t.new_7d), carplay: num(t.carplay),
    },
    range,
    per_day: perDay,
    summary: { active: summarize(perDay.map((d) => d.active)), new: summarize(perDay.map((d) => d.new), true) },
    platforms: rows(r.platforms, true, 20),
    devices: rows(r.devices, true, 30),
    versions: rows(r.versions, false, 12),
    countries: rows(r.countries, false, 15),
    langs: rows(r.langs, false, 10),
  };
}
