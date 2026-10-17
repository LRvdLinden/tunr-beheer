// deno test supabase/functions/ping/ping_test.ts
import { cleanText, clientIp, RateLimiter, rpcArgs, validatePing } from "./logic.ts";

const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const ID = "3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d";
const GOOD = { id: ID, platform: "ios", device: "iPhone", model: "iPhone16,2", os: "18.1", version: "1.0.0", build: 14, country: "NL", lang: "nl", carplay: false };
const err = (b: unknown) => { const r = validatePing(b); return r.ok ? null : r.error; };

Deno.test("geldige ping uit het contract", () => {
  const r = validatePing(GOOD);
  ok(r.ok, "ok");
  if (!r.ok) return;
  ok(JSON.stringify(r.value) === JSON.stringify(GOOD), JSON.stringify(r.value));
  const a = rpcArgs(r.value);
  ok(a.p_id === ID && a.p_platform === "ios" && a.p_build === 14 && a.p_carplay === false && a.p_country === "NL", "rpc-argumenten");
});

Deno.test("minimale ping: standaardwaarden", () => {
  const r = validatePing({ id: ID.toUpperCase(), platform: "web" });
  ok(r.ok, "ok");
  if (!r.ok) return;
  ok(r.value.id === ID && r.value.build === 0 && r.value.country === "" && r.value.lang === "" && !r.value.carplay && r.value.device === "", "standaard");
});

Deno.test("alle platforms uit de lijst, verder niets", () => {
  for (const p of ["ios", "ipados", "macos", "tvos", "android", "androidtv", "web"]) ok(err({ ...GOOD, platform: p }) === null, p);
  for (const p of ["iOS", "windows", "", null, 1, "carplay"]) ok(err({ ...GOOD, platform: p }) === "bad_platform", String(p));
});

Deno.test("id moet een uuid v4 zijn", () => {
  for (const id of ["", "x", "3f2b8c1e-9a4d-1e7b-8c21-5d6f7a8b9c0d", "3f2b8c1e9a4d4e7b8c215d6f7a8b9c0d", `${ID}0`, 5, null]) {
    ok(err({ ...GOOD, id }) === "bad_id", `id ${id}`);
  }
});

Deno.test("build 0..99999 als geheel getal", () => {
  ok(err({ ...GOOD, build: 0 }) === null && err({ ...GOOD, build: 99999 }) === null, "grenzen");
  for (const b of [-1, 100000, 1.5, "14", true]) ok(err({ ...GOOD, build: b }) === "bad_build", `build ${b}`);
});

Deno.test("land: 2 letters (hoofdletters gemaakt) of leeg", () => {
  const r = validatePing({ ...GOOD, country: "be" });
  ok(r.ok && r.value.country === "BE", "be -> BE");
  ok(err({ ...GOOD, country: "" }) === null, "leeg");
  for (const c of ["NLD", "N", "1A", 31, "N L"]) ok(err({ ...GOOD, country: c }) === "bad_country", `land ${c}`);
});

Deno.test("taal: nl, en of leeg", () => {
  ok(err({ ...GOOD, lang: "en" }) === null && err({ ...GOOD, lang: "" }) === null, "en/leeg");
  for (const l of ["de", "nl-NL", 1]) ok(err({ ...GOOD, lang: l }) === "bad_lang", `taal ${l}`);
});

Deno.test("carplay: alleen boolean", () => {
  ok(err({ ...GOOD, carplay: true }) === null, "true");
  for (const c of ["true", 1, {}]) ok(err({ ...GOOD, carplay: c }) === "bad_carplay", `carplay ${c}`);
});

Deno.test("teksten ingekort en opgeschoond", () => {
  const r = validatePing({ ...GOOD, model: "M".repeat(200), device: "  Apple\nTV\u0000 ", os: "1".repeat(50), version: 1.5 });
  ok(r.ok, "ok");
  if (!r.ok) return;
  ok(r.value.model.length === 60, `model ${r.value.model.length}`);
  ok(r.value.device === "Apple TV", `device '${r.value.device}'`);
  ok(r.value.os.length === 20 && r.value.version === "1.5", "os/versie");
  ok(err({ ...GOOD, model: { x: 1 } }) === "bad_model", "object als model");
  ok(cleanText("a\u202eb", 10) === "a b", "bidi-teken weg");
  ok(cleanText("😀😀😀", 2) === "😀😀", "tekens, geen code-units");
});

Deno.test("geen object = fout", () => {
  for (const b of [null, [], "x", 1]) ok(err(b) === "bad_body", String(b));
});

Deno.test("limiet: 30 per uur per sleutel, daarna weer vrij", () => {
  const l = new RateLimiter(30, 3600_000);
  const t = 1_000_000;
  for (let i = 0; i < 30; i++) ok(l.hit("a", t + i), `hit ${i}`);
  ok(!l.hit("a", t + 31), "31e geweigerd");
  ok(l.retryAfter("a", t + 31) > 3500, "retry-after");
  ok(l.hit("b", t + 31), "ander IP mag");
  ok(l.hit("a", t + 3600_000), "na een uur weer vrij");
});

Deno.test("limiet: groeit niet onbeperkt", () => {
  const l = new RateLimiter(1, 1000, 100);
  for (let i = 0; i < 1000; i++) l.hit(`k${i}`, 5);
  ok(l.size <= 100, `grootte ${l.size}`);
});

Deno.test("client-IP: niet de eerste (zelfgekozen) X-Forwarded-For", () => {
  ok(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" })) === "9.9.9.9", "laatste");
  ok(clientIp(new Headers({ "cf-connecting-ip": "2.2.2.2", "x-forwarded-for": "1.1.1.1" })) === "2.2.2.2", "cf");
  ok(clientIp(new Headers()) === "?", "onbekend");
});
