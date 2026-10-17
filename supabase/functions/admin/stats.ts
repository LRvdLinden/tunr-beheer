// Functie admin, actie stats: de telling gebeurt in SQL (public.tunr_stats in supabase/schema.sql, via rpc met de
// service role). Dit bestand maakt het antwoord netjes in de vorm van docs/CONTRACT.md. Pure code, getest in stats_test.ts.

export const DAYS_DEFAULT = 30;
export const DAYS_MAX = 90;

/** Aantal dagen voor per_day: geheel getal 1..90, anders 30. */
export function clampDays(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1) return DAYS_DEFAULT;
  return Math.min(n, DAYS_MAX);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const key = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : v === null || v === undefined ? "" : String(v).slice(0, 80));

export type Row = { key: string; installs: number; active_30d?: number };
export type Stats = {
  generated: string;
  totals: { installs: number; active_today: number; active_7d: number; active_30d: number; new_today: number; new_7d: number; carplay: number };
  per_day: { day: string; active: number; new: number }[];
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

/** Antwoord van tunr_stats -> contractvorm (ontbrekende velden worden 0 of leeg). */
export function cleanStats(raw: unknown, now = new Date()): Stats {
  const r = isObj(raw) ? raw : {};
  const t = isObj(r.totals) ? r.totals : {};
  const perDay = Array.isArray(r.per_day) ? r.per_day.filter(isObj) : [];
  return {
    generated: typeof r.generated === "string" ? r.generated : now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    totals: {
      installs: num(t.installs), active_today: num(t.active_today), active_7d: num(t.active_7d), active_30d: num(t.active_30d),
      new_today: num(t.new_today), new_7d: num(t.new_7d), carplay: num(t.carplay),
    },
    per_day: perDay
      .filter((d) => typeof d.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.day))
      .map((d) => ({ day: d.day as string, active: num(d.active), new: num(d.new) }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    platforms: rows(r.platforms, true, 20),
    devices: rows(r.devices, true, 30),
    versions: rows(r.versions, false, 12),
    countries: rows(r.countries, false, 15),
    langs: rows(r.langs, false, 10),
  };
}
