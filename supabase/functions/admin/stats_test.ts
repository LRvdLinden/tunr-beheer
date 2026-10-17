// deno test supabase/functions/admin/stats_test.ts
import { clampDays, cleanStats } from "./stats.ts";

const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };

Deno.test("dagen: 1..90, standaard 30", () => {
  ok(clampDays(undefined) === 30 && clampDays(null) === 30 && clampDays("x") === 30 && clampDays(0) === 30 && clampDays(-3) === 30, "standaard");
  ok(clampDays(7) === 7 && clampDays("14") === 14 && clampDays(500) === 90 && clampDays(2.5) === 30, "grenzen");
});

Deno.test("stats: contractvorm uit het antwoord van tunr_stats", () => {
  const s = cleanStats({
    generated: "2026-10-17T09:00:00Z",
    totals: { installs: 1234, active_today: "120", active_7d: 480, active_30d: 900, new_today: 15, new_7d: 90, carplay: 40 },
    per_day: [{ day: "2026-10-17", active: 120, new: 15 }, { day: "2026-10-16", active: 100, new: 10 }, { day: "x" }],
    platforms: [{ key: "android", installs: 300, active_30d: 200 }, { key: "ios", installs: 500, active_30d: 400 }],
    devices: [{ key: "iPhone", installs: 480, active_30d: 390 }],
    versions: [{ key: "1.0.0 (14)", installs: 300 }],
    countries: [{ key: "NL", installs: 700 }, { key: "", installs: 3 }],
    langs: [{ key: "nl", installs: 800 }],
  });
  ok(s.generated === "2026-10-17T09:00:00Z" && s.totals.active_today === 120 && s.totals.carplay === 40, "totals");
  ok(s.per_day.length === 2 && s.per_day[0].day === "2026-10-16", "per_day oud -> nieuw");
  ok(s.platforms[0].key === "ios" && s.platforms[0].active_30d === 400, "platforms aflopend");
  ok(!("active_30d" in s.versions[0]) && s.countries[1].key === "", "versies/landen");
});

Deno.test("stats: leeg of kapot antwoord = nullen", () => {
  const s = cleanStats(null, new Date("2026-10-17T09:00:00.123Z"));
  ok(s.generated === "2026-10-17T09:00:00Z" && s.totals.installs === 0 && s.per_day.length === 0 && s.platforms.length === 0, "leeg");
  const t = cleanStats({ totals: { installs: -5, new_today: NaN }, platforms: "x", versions: Array(30).fill({ key: "v", installs: 1 }) });
  ok(t.totals.installs === 0 && t.totals.new_today === 0 && t.platforms.length === 0 && t.versions.length === 12, "opgeschoond");
});
