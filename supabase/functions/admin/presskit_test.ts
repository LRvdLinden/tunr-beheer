// deno test supabase/functions/admin/presskit_test.ts
import { cleanPresskit, last30, parsePresskitMeta, PRESSKIT_ZIP_URL } from "./presskit.ts";

const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const NOW = new Date("2026-10-18T09:00:00Z");
const META = { version: "2026.10.18-8140c4", date: "2026-10-18", size: 50796528, files: 50, platforms: ["Apple"] };

Deno.test("last30: 30 dagen t/m vandaag (UTC)", () => {
  const d = last30(NOW);
  ok(d.length === 30 && d[0] === "2026-09-19" && d[29] === "2026-10-18", JSON.stringify([d[0], d[29]]));
});

Deno.test("presskit: tellingen + presskit.json in contractvorm", () => {
  const raw = {
    total: 7, last_30d: "4",
    per_version: [{ version: "2026.09.01-aaaaaa", count: 1 }, { version: "2026.10.18-8140c4", count: 5 }, { version: "", count: 1 }, { version: "x", count: 0 }],
    per_day: [{ day: "2026-10-17", count: 2 }, { day: "2026-10-18", count: 2 }, { day: "2025-01-01", count: 9 }, { day: "rommel", count: 3 }],
  };
  const p = cleanPresskit(parsePresskitMeta(META), raw, NOW);
  ok(p.available && p.version === META.version && p.size === META.size && p.files === 50 && p.date === "2026-10-18", "meta");
  ok(p.url === `${PRESSKIT_ZIP_URL}?v=2026.10.18-8140c4`, p.url);
  ok(p.downloads_total === 7 && p.downloads_30d === 4, "totalen");
  ok(JSON.stringify(p.per_version.map((v) => v.version)) === '["2026.10.18-8140c4","2026.09.01-aaaaaa",""]', JSON.stringify(p.per_version));
  ok(p.per_day.length === 30 && p.per_day[29].count === 2 && p.per_day[28].count === 2 && p.per_day[0].count === 0, "per dag");
  ok(p.per_day.reduce((a, d) => a + d.count, 0) === 4, "oude/ongeldige dagen vallen weg");
});

Deno.test("presskit: niets online en geen tellingen → leeg, maar geldig", () => {
  const p = cleanPresskit(null, null, NOW);
  ok(!p.available && p.version === "" && p.size === 0 && p.downloads_total === 0 && p.url === PRESSKIT_ZIP_URL, JSON.stringify(p));
  ok(p.per_day.length === 30 && p.per_version.length === 0, "lege reeksen");
});

Deno.test("presskit.json: ongeldige versie wordt genegeerd", () => {
  ok(parsePresskitMeta({ ...META, version: "1.0.0" }) === null, "versie");
  ok(parsePresskitMeta("x") === null, "geen object");
  const m = parsePresskitMeta({ ...META, size: "groot", platforms: ["Apple", 1, "<x>"] });
  ok(m !== null && m.size === 0 && JSON.stringify(m.platforms) === '["Apple"]', JSON.stringify(m));
});
