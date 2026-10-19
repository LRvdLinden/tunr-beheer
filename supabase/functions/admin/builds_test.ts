// deno test supabase/functions/admin/builds_test.ts   (de sleutel hieronder is een testwaarde)
import { b64url, buildUrl, cleanManifest, findBuild, isValidBuildFile, isValidBuildPath, MAX_TTL, signBuildToken } from "./builds.ts";

const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const KEY = "0123456789abcdef".repeat(4);
const NOW = Date.parse("2026-10-16T12:00:00Z"); // 1792152000 s
const rejects = async (f: () => Promise<unknown>, m: string) => {
  try { await f(); } catch { return; }
  throw new Error(m);
};

Deno.test("token: gelijk aan python hmac (zelfde berekening als dl.php)", async () => {
  const a = await signBuildToken(KEY, "android/Tunr-1.0.0-build14.apk", 60, NOW);
  ok(a.exp === 1792152060, `exp ${a.exp}`);
  ok(a.token === "eyJmIjoiYW5kcm9pZC9UdW5yLTEuMC4wLWJ1aWxkMTQuYXBrIiwiZSI6MTc5MjE1MjA2MH0.woCPrAd9OsN9Y3HPGAI4QAqjtmiCEV1IJN3WyQoS1qE", a.token);
  const m = await signBuildToken(KEY, "manifest.json", 60, NOW);
  ok(m.token === "eyJmIjoibWFuaWZlc3QuanNvbiIsImUiOjE3OTIxNTIwNjB9.mS69WWgMEdU-Cwcn0y9c0LM_q5XQVSgKIoAPAiwdSKM", m.token);
});

Deno.test("token: base64url zonder =", async () => {
  for (const ttl of [1, 600, MAX_TTL]) {
    const { token, exp } = await signBuildToken(KEY, "beheer/BeheerTunr-1.0.0-build3-Xcode.zip", ttl, NOW);
    ok(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token) && exp === 1792152000 + ttl, token);
  }
  ok(b64url(new Uint8Array([251, 255])) === "-_8" && b64url(new Uint8Array([1])) === "AQ", "base64url");
});

Deno.test("token: weigert korte sleutel, ongeldig pad, rare geldigheid", async () => {
  await rejects(() => signBuildToken("", "manifest.json", 60, NOW), "lege sleutel");
  await rejects(() => signBuildToken("kort", "manifest.json", 60, NOW), "korte sleutel");
  await rejects(() => signBuildToken(KEY, "../key.php", 60, NOW), "buiten builds");
  await rejects(() => signBuildToken(KEY, "key.php", 60, NOW), "key.php");
  await rejects(() => signBuildToken(KEY, "manifest.json", MAX_TTL + 1, NOW), "te lang");
  await rejects(() => signBuildToken(KEY, "manifest.json", 0, NOW), "0 s");
});

Deno.test("pad: zelfde regels als dl.php", () => {
  for (const p of ["manifest.json", "apple/Tunr-1.0.0-build14-Xcode.zip", "android/Tunr-1.0.0-build14.apk", "play/Tunr-1.0.0-build14.aab", "beheer/BeheerTunr-1.0.0-build3-Xcode.zip"]) {
    ok(isValidBuildPath(p), `geldig: ${p}`);
  }
  for (const p of ["", "key.php", ".htaccess", "tizen/x.wgt", "android/", "android/../key.php", "android/.htaccess",
    "android/a/b.apk", "/android/x.apk", "Android/x.apk", "android/x y.apk", `android/${"a".repeat(152)}`, null, 5]) {
    ok(!isValidBuildPath(p), `ongeldig: ${String(p)}`);
  }
  ok(isValidBuildFile("Tunr-1.0.0-build14.apk") && !isValidBuildFile("-x") && !isValidBuildFile("a..b"), "bestandsnaam");
});

const RAW = {
  apple: [
    { version: "1.0.0", build: 15, file: "Tunr-1.0.0-build15-Xcode.zip", size: 1234, sha256: "a".repeat(64), date: "2026-10-17T08:00:00Z", notes: "- nieuw" },
    { version: "1.0.0", build: "14", file: "Tunr-1.0.0-build14-Xcode.zip", size: -5, sha256: "geen-hash" },
    { version: "1.0.0", build: 13, file: "../key.php" },
    { version: "1.0.0", build: 15, file: "Tunr-1.0.0-build15-Xcode.zip" },
    "rommel",
  ],
  android: Array.from({ length: 14 }, (_, i) => ({ version: "1.0.0", build: 30 - i, file: `Tunr-1.0.0-build${30 - i}.apk` })),
  tizen: [{ file: "x.wgt" }],
};

Deno.test("manifest: opschonen volgens het contract", () => {
  const m = cleanManifest(RAW)!;
  ok(Object.keys(m).join() === "apple,android,play,beheer", Object.keys(m).join());
  ok(m.apple.length === 2, `apple ${m.apple.length}`);
  ok(m.apple[0].build === 15 && m.apple[0].sha256.length === 64 && m.apple[0].notes === "- nieuw" && m.apple[0].size === 1234, "eerste");
  ok(m.apple[1].build === 14 && m.apple[1].size === 0 && m.apple[1].sha256 === "" && m.apple[1].notes === "", "tweede");
  ok(m.android.length === 10 && m.android[0].build === 30, "hoogstens 10");
  ok(m.beheer.length === 0, "beheer leeg");
  ok(cleanManifest(null) === null && cleanManifest([]) === null, "geen manifest");
  ok(JSON.stringify(cleanManifest({})) === JSON.stringify({ apple: [], android: [], play: [], beheer: [] }), "leeg");
});

Deno.test("manifest: build zoeken", () => {
  const m = cleanManifest(RAW);
  ok(findBuild(m, "apple")?.build === 15, "nieuwste");
  ok(findBuild(m, "apple", "Tunr-1.0.0-build14-Xcode.zip")?.build === 14, "oudere");
  ok(findBuild(m, "apple", "Tunr-1.0.0-build1-Xcode.zip") === null, "staat er niet in");
  ok(findBuild(m, "apple", "../key.php") === null, "ongeldig");
  ok(findBuild(m, "beheer") === null && findBuild(m, "tizen") === null && findBuild(null, "apple") === null, "niets");
});

Deno.test("downloadadres", () => {
  ok(buildUrl("a.b") === "https://beheer.tunr.online/dl.php?t=a.b", "url");
});
