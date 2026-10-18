// Functie admin, actie stats → blok `presskit` (docs/CONTRACT.md). Tellingen uit SQL (public.tunr_presskit_stats),
// versie/datum/grootte uit https://tunr.online/presskit/presskit.json (gemaakt door tools/make_presskit.py in
// int-radio-app). Pure code, getest in presskit_test.ts. Elke functie is zelfstandig te deployen, daarom staat de
// controle van presskit.json ook (gelijk) in supabase/functions/presskit/logic.ts.

export const PRESSKIT_META_URL = "https://tunr.online/presskit/presskit.json";
export const PRESSKIT_ZIP_URL = "https://tunr.online/presskit/Tunr-PressKit.zip";
const VERSION_RE = /^\d{4}\.\d{2}\.\d{2}-[0-9a-f]{6}$/;

export type PresskitMeta = { version: string; date: string; size: number; files: number; platforms: string[] };
export type Presskit = {
  available: boolean;                // presskit.json online gevonden
  version: string; date: string; size: number; files: number; platforms: string[];
  url: string;                       // directe link naar de zip (telt niet mee)
  downloads_total: number; downloads_30d: number;
  per_version: { version: string; count: number }[];   // nieuwste eerst
  per_day: { day: string; count: number }[];           // laatste 30 dagen, oud → nieuw
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,12}$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parsePresskitMeta(raw: unknown): PresskitMeta | null {
  if (!isObj(raw)) return null;
  const version = typeof raw.version === "string" ? raw.version.trim() : "";
  if (!VERSION_RE.test(version)) return null;
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw.date) ? raw.date.slice(0, 10) : "";
  const platforms = Array.isArray(raw.platforms)
    ? raw.platforms.filter((p): p is string => typeof p === "string" && /^[A-Za-z][A-Za-z0-9 ]{0,23}$/.test(p)).slice(0, 12)
    : [];
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e12 ? v : 0);
  return { version, date, size: int(raw.size), files: int(raw.files), platforms };
}

/** Laatste 30 dagen t/m vandaag (UTC) als `YYYY-MM-DD`, oud → nieuw. */
export function last30(now = new Date()): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: 30 }, (_, i) => new Date(today - (29 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** Tellingen (tunr_presskit_stats, of null als dat mislukte) + presskit.json (of null) → contractvorm. */
export function cleanPresskit(meta: PresskitMeta | null, raw: unknown, now = new Date()): Presskit {
  const r = isObj(raw) ? raw : {};
  const byDay = new Map<string, number>();
  if (Array.isArray(r.per_day)) for (const d of r.per_day) if (isObj(d) && isDay(d.day)) byDay.set(d.day, count(d.count));
  const perVersion = Array.isArray(r.per_version)
    ? r.per_version.filter(isObj).map((v) => ({ version: typeof v.version === "string" ? v.version.slice(0, 40) : "", count: count(v.count) }))
      .filter((v) => v.count > 0).sort((a, b) => b.version.localeCompare(a.version)).slice(0, 20)
    : [];
  return {
    available: !!meta,
    version: meta?.version ?? "",
    date: meta?.date ?? "",
    size: meta?.size ?? 0,
    files: meta?.files ?? 0,
    platforms: meta?.platforms ?? [],
    url: meta ? `${PRESSKIT_ZIP_URL}?v=${encodeURIComponent(meta.version)}` : PRESSKIT_ZIP_URL,
    downloads_total: count(r.total),
    downloads_30d: count(r.last_30d),
    per_version: perVersion,
    per_day: last30(now).map((day) => ({ day, count: byDay.get(day) ?? 0 })),
  };
}
