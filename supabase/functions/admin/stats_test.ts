// deno test supabase/functions/admin/stats_test.ts
import { cleanStats, maxOffset, parseRange, rangeFor, summarize } from "./stats.ts";

const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

Deno.test("periode: days ∈ {7,30,90,365}, standaard 30; offset ≥ 0", () => {
  eq(parseRange(undefined, undefined), { days: 30, offset: 0 }, "standaard");
  eq(parseRange(null, null), { days: 30, offset: 0 }, "null");
  eq(parseRange(7, 0), { days: 7, offset: 0 }, "week");
  eq(parseRange("90", "2"), { days: 90, offset: 2 }, "tekst");
  eq(parseRange(365, 1), { days: 365, offset: 1 }, "jaar, 1 terug");
  for (const d of [0, 1, 14, 31, 100, -7, 2.5, "x", "7d", true, {}]) ok(parseRange(d, 0) === null, `ongeldige days ${String(d)}`);
  for (const o of [-1, 1.5, "x", "-2", false, []]) ok(parseRange(30, o) === null, `ongeldige offset ${String(o)}`);
});

Deno.test("periode: niet verder terug dan de bewaartermijn (400 dagen)", () => {
  ok(maxOffset(7) === 57 && maxOffset(30) === 13 && maxOffset(90) === 4 && maxOffset(365) === 1, "maxOffset");
  ok(parseRange(7, 57) !== null && parseRange(7, 58) === null, "week");
  ok(parseRange(365, 1) !== null && parseRange(365, 2) === null, "jaar");
});

Deno.test("periode: van/tot in UTC", () => {
  const now = new Date("2026-10-17T23:30:00Z");
  eq(rangeFor({ days: 30, offset: 0 }, now), { from: "2026-09-18", to: "2026-10-17", days: 30, offset: 0 }, "30 dagen");
  eq(rangeFor({ days: 30, offset: 1 }, now), { from: "2026-08-19", to: "2026-09-17", days: 30, offset: 1 }, "30 dagen, 1 terug");
  eq(rangeFor({ days: 7, offset: 2 }, now), { from: "2026-09-27", to: "2026-10-03", days: 7, offset: 2 }, "week, 2 terug");
  eq(rangeFor({ days: 365, offset: 0 }, now), { from: "2025-10-18", to: "2026-10-17", days: 365, offset: 0 }, "jaar");
});

Deno.test("samenvatting: min, max, gem., laatste (en totaal)", () => {
  eq(summarize([4, 10, 1, 7]), { min: 1, max: 10, avg: 5.5, last: 7 }, "actief");
  eq(summarize([1, 2, 2], true), { min: 1, max: 2, avg: 1.7, last: 2, total: 5 }, "nieuw");
  eq(summarize([], true), { min: 0, max: 0, avg: 0, last: 0, total: 0 }, "leeg");
});

Deno.test("stats: contractvorm uit het antwoord van tunr_stats", () => {
  const s = cleanStats({
    generated: "2026-10-17T09:00:00Z",
    totals: { installs: 1234, active_today: "120", active_7d: 480, active_30d: 900, new_today: 15, new_7d: 90, carplay: 40 },
    range: { from: "2026-10-16", to: "2026-10-17", days: 7, offset: 0 },
    per_day: [{ day: "2026-10-17", active: 120, new: 15 }, { day: "2026-10-16", active: 100, new: 10 }, { day: "x" }, { day: "2026-10-01", active: 5 }],
    platforms: [{ key: "android", installs: 300, active_30d: 200 }, { key: "ios", installs: 500, active_30d: 400 }],
    devices: [{ key: "iPhone", installs: 480, active_30d: 390 }],
    versions: [{ key: "1.0.0 (14)", installs: 300 }],
    countries: [{ key: "NL", installs: 700 }, { key: "", installs: 3 }],
    langs: [{ key: "nl", installs: 800 }],
  });
  ok(s.generated === "2026-10-17T09:00:00Z" && s.totals.active_today === 120 && s.totals.carplay === 40, "totals");
  ok(s.per_day.length === 2 && s.per_day[0].day === "2026-10-16", "per_day oud -> nieuw, alleen binnen de periode");
  eq(s.range, { from: "2026-10-16", to: "2026-10-17", days: 7, offset: 0 }, "range");
  eq(s.summary.active, { min: 100, max: 120, avg: 110, last: 120 }, "samenvatting actief");
  eq(s.summary.new, { min: 10, max: 15, avg: 12.5, last: 15, total: 25 }, "samenvatting nieuw");
  ok(s.platforms[0].key === "ios" && s.platforms[0].active_30d === 400, "platforms aflopend");
  ok(!("active_30d" in s.versions[0]) && s.countries[1].key === "", "versies/landen");
});

Deno.test("stats: zonder range in het antwoord wordt de periode berekend", () => {
  const s = cleanStats({ per_day: [{ day: "2026-09-17", active: 3, new: 1 }] }, new Date("2026-10-17T09:00:00Z"), { days: 30, offset: 1 });
  eq(s.range, { from: "2026-08-19", to: "2026-09-17", days: 30, offset: 1 }, "berekend");
  ok(s.per_day.length === 1 && s.summary.new.total === 1, "per_day");
});

Deno.test("stats: leeg of kapot antwoord = nullen", () => {
  const s = cleanStats(null, new Date("2026-10-17T09:00:00.123Z"));
  ok(s.generated === "2026-10-17T09:00:00Z" && s.totals.installs === 0 && s.per_day.length === 0 && s.platforms.length === 0, "leeg");
  ok(s.range.to === "2026-10-17" && s.range.days === 30 && s.summary.active.max === 0 && s.summary.new.total === 0, "range/samenvatting");
  const t = cleanStats({ totals: { installs: -5, new_today: NaN }, platforms: "x", versions: Array(30).fill({ key: "v", installs: 1 }), range: { from: "b", to: "a" } });
  ok(t.totals.installs === 0 && t.totals.new_today === 0 && t.platforms.length === 0 && t.versions.length === 12, "opgeschoond");
  ok(/^\d{4}-\d{2}-\d{2}$/.test(t.range.from), "kapotte range vervangen");
});
