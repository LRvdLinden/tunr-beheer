// deno test supabase/functions/presskit/presskit_test.ts
import { clientIp, CountLimiter, isBot, MetaCache, parseMeta, redirectUrl, shouldCount, ZIP_URL } from "./logic.ts";

const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const META = { version: "2026.10.18-8140c4", date: "2026-10-18", size: 50796528, files: 50, platforms: ["Apple"] };
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

Deno.test("presskit.json uit make_presskit.py", () => {
  const m = parseMeta(META);
  ok(m && JSON.stringify(m) === JSON.stringify(META), JSON.stringify(m));
});

Deno.test("presskit.json: ongeldige versie = null, rare velden worden 0/leeg", () => {
  for (const v of ["", "1.0.0", "2026.10.18-8140C4", "2026.10.18-8140c", "2026-10-18-8140c4", "x 2026.10.18-8140c4", null, 5]) {
    ok(parseMeta({ ...META, version: v }) === null, String(v));
  }
  for (const raw of [null, [], "x", 1]) ok(parseMeta(raw) === null, String(raw));
  const m = parseMeta({ version: " 2026.10.18-8140c4 ", size: -1, files: 2.5, date: 7, platforms: ["Apple", "<b>", 3, "Android TV"] });
  ok(m && m.version === "2026.10.18-8140c4" && m.size === 0 && m.files === 0 && m.date === "", JSON.stringify(m));
  ok(m && JSON.stringify(m.platforms) === '["Apple","Android TV"]', JSON.stringify(m?.platforms));
});

Deno.test("redirect: altijd naar de zip op tunr.online, ?v= alleen bij een geldige versie", () => {
  ok(redirectUrl("2026.10.18-8140c4") === "https://tunr.online/presskit/Tunr-PressKit.zip?v=2026.10.18-8140c4", redirectUrl("2026.10.18-8140c4"));
  for (const v of [null, undefined, "", "evil&x=1", "https://example.com"]) ok(redirectUrl(v) === ZIP_URL, String(v));
  ok(ZIP_URL.startsWith("https://tunr.online/"), "eigen domein");
});

Deno.test("tellen: alleen GET van een browser", () => {
  ok(shouldCount("GET", CHROME), "browser");
  ok(!shouldCount("HEAD", CHROME), "HEAD");
  for (const ua of ["", null, "Googlebot/2.1", "curl/8.4.0", "facebookexternalhit/1.1", "WhatsApp/2.23", "python-requests/2.31", "Slackbot-LinkExpanding 1.0", "HeadlessChrome/120"]) {
    ok(isBot(ua) && !shouldCount("GET", ua), String(ua));
  }
});

Deno.test("limiet: 5 tellingen per IP per uur, daarna niet meer (wel doorsturen)", () => {
  const l = new CountLimiter(5, 3600_000);
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) ok(l.hit("1.2.3.4", t0 + i), `hit ${i}`);
  ok(!l.hit("1.2.3.4", t0 + 10), "6e telt niet");
  ok(l.hit("5.6.7.8", t0 + 10), "ander IP telt");
  ok(l.hit("1.2.3.4", t0 + 3600_000), "na een uur weer");
});

Deno.test("limiet: groeit niet onbeperkt", () => {
  const l = new CountLimiter(5, 1000, 100);
  for (let i = 0; i < 250; i++) l.hit(`ip${i}`, 0);
  ok(l.size <= 100, `size ${l.size}`);
});

Deno.test("cache: 10 min bij succes, na een fout de laatste goede versie houden", async () => {
  let calls = 0, fail = false;
  const c = new MetaCache(() => { calls++; return fail ? Promise.reject(new Error("x")) : Promise.resolve(parseMeta(META)); }, 1000, 100);
  const a = await c.get(0);
  ok(a?.version === META.version && calls === 1, "eerste keer laden");
  await c.get(1);
  ok(calls === 1, "uit de cache");
  fail = true;
  const b = await c.get(Date.now() + 5000);
  ok(b?.version === META.version && calls === 2, "fout: laatste goede waarde");
});

Deno.test("cache: zonder ooit een goede waarde = null (redirect zonder ?v=)", async () => {
  const c = new MetaCache(() => Promise.resolve(null));
  ok((await c.get()) === null, "null");
  ok(redirectUrl((await c.get())?.version) === ZIP_URL, "zonder versie");
});

Deno.test("clientIp: laatste X-Forwarded-For-waarde", () => {
  ok(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })) === "2.2.2.2", "xff");
  ok(clientIp(new Headers({ "cf-connecting-ip": "3.3.3.3", "x-forwarded-for": "1.1.1.1" })) === "3.3.3.3", "cf");
  ok(clientIp(new Headers()) === "?", "leeg");
});
