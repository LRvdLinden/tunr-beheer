// BeheerTunr: functie admin (verify_jwt = false, eigen tokens). Openbare repo LRvdLinden/tunr-beheer; geheimen alleen
// als function-secrets: TUNR_ADMIN_USER, TUNR_ADMIN_PASSWORD, TUNR_TOKEN_SECRET, TUNR_BUILDS_KEY. Vorm: docs/CONTRACT.md.
//
// POST /functions/v1/admin  {action, ...}; header apikey; na inloggen Authorization: Bearer <token>
//   login       {user, password}     -> {token, expires}            (expires = ISO 8601; 5 fouten per IP = 15 min dicht: 429 {error:"locked", retry_after})
//   logout_all  {}                   -> {ok, v}                     (tokenversie + 1: alle tokens vervallen)
//   stats       {days?: 30, offset?: 0} -> {generated, totals, range, per_day, summary, platforms, devices, versions, countries, langs, presskit}
//                                    (days ∈ 7|30|90|365, offset = periodes terug, offset*days ≤ 400; anders 400 {error:"bad_range"})
//   builds      {}                   -> {ready, platforms: {apple, android, play, windows, beheer}, reason?}
//   build_link  {platform, file?}    -> {url, expires, file, size}  (10 minuten geldig; expires = ISO 8601)
//   Fouten: 401 {error:"unauthorized"}, 400/429/500/502/503 {error}.
// Logboek (admin_audit): login, login_failed, login_locked, logout_all, build_link (platform/bestand), cleanup; IP alleen gehasht.
// Nooit loggen: wachtwoorden, tokens, sleutels, downloadlinks.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearer, FailureLog, GLOBAL_MAX, hashIp, LOCK_MAX, LOCK_WINDOW_S, lockRetryAfter, readToken, sameSecret, signToken } from "./auth.ts";
import { cleanStats, parseRange } from "./stats.ts";
import { cleanPresskit, parsePresskitMeta, PRESSKIT_META_URL, type PresskitMeta } from "./presskit.ts";
import { buildUrl, cleanManifest, emptyManifest, findBuild, isBuildPlatform, isValidBuildFile, LINK_TTL, type Manifest, MIN_KEY, signBuildToken } from "./builds.ts";

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const tokenSecret = () => env("TUNR_TOKEN_SECRET");
const configured = () => !!(env("TUNR_ADMIN_USER") && Deno.env.get("TUNR_ADMIN_PASSWORD") && tokenSecret().length >= 32);

// ---- CORS: het dashboard op https://beheer.tunr.online (en localhost om te testen); de Beheer-app stuurt geen Origin ----
const ORIGIN_OK = /^https:\/\/beheer\.tunr\.online$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    ...(ORIGIN_OK.test(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function clientIp(req: Request) {
  const h = (k: string) => (req.headers.get(k) ?? "").trim();
  const xff = h("x-forwarded-for").split(",").map((s) => s.trim()).filter(Boolean);
  return (h("cf-connecting-ip") || h("x-real-ip") || xff[xff.length - 1] || "?").slice(0, 64);
}

// ---- logboek en limieten ----
async function audit(action: string, ipHash: string, detail = "") {
  try {
    const { error } = await db.from("admin_audit").insert({ action, ip_hash: ipHash, detail: detail.slice(0, 500) });
    if (error) console.error("admin", "audit", action, error.message);
  } catch (e) { console.error("admin", "audit", action, e instanceof Error ? e.name : "?"); }
}
const memFailures = new FailureLog();
let memGlobal: number[] = [];
/** Seconden blokkade voor dit (gehashte) IP, of 0. Uit admin_audit, aangevuld met het geheugen van deze instantie. */
async function lockedFor(ipHash: string): Promise<number> {
  const now = Date.now();
  let times = memFailures.get(ipHash);
  let global = memGlobal.filter((t) => t > now - 3600_000).length;
  try {
    const since = new Date(now - LOCK_WINDOW_S * 1000).toISOString();
    const { data, error } = await db.from("admin_audit").select("at").eq("action", "login_failed").eq("ip_hash", ipHash)
      .gt("at", since).order("at", { ascending: false }).limit(LOCK_MAX);
    if (error) throw new Error(error.message);
    times = times.concat((data ?? []).map((r) => Date.parse(r.at)));
    const { count, error: ge } = await db.from("admin_audit").select("id", { count: "exact", head: true })
      .eq("action", "login_failed").gt("at", new Date(now - 3600_000).toISOString());
    if (!ge && typeof count === "number") global = Math.max(global, count);
  } catch (e) { console.error("admin", "lock", e instanceof Error ? e.message : "?"); }
  const own = lockRetryAfter(times, now);
  return global > GLOBAL_MAX ? Math.max(own, LOCK_WINDOW_S) : own;
}
// na inloggen: max. 300 verzoeken per minuut per IP (geheugen, best effort)
const authedHits = new Map<string, { start: number; n: number }>();
function authedOk(ipHash: string): boolean {
  const now = Date.now(), h = authedHits.get(ipHash);
  if (!h || now - h.start > 60_000) {
    if (authedHits.size > 5000) authedHits.clear();
    authedHits.set(ipHash, { start: now, n: 1 });
    return true;
  }
  return ++h.n <= 300;
}

// ---- tokens ----
async function tokenVersion(): Promise<number> {
  const { data, error } = await db.from("admin_token_state").select("v").eq("id", 1).maybeSingle();
  if (error) throw new Error(`token_version: ${error.message}`);
  return Number(data?.v ?? 1);
}
async function validToken(token: string | null): Promise<boolean> {
  const p = await readToken(tokenSecret(), token);
  // pas na een geldige handtekening naar de database
  return p !== null && p.v === await tokenVersion();
}

// ---- opschonen: hoogstens 1x per dag (database houdt het bij; dit voorkomt onnodige aanroepen per instantie) ----
let lastCleanup = 0;
async function maybeCleanup() {
  if (Date.now() - lastCleanup < 6 * 3600_000) return;
  lastCleanup = Date.now();
  const { error } = await db.rpc("tunr_cleanup");
  if (error) console.error("admin", "cleanup", error.message);
}

// ---- presskit: presskit.json van tunr.online (10 min in het geheugen; na een fout 1 min) + tellingen uit SQL ----
let pkMeta: PresskitMeta | null = null, pkUntil = 0;
async function presskitMeta(): Promise<PresskitMeta | null> {
  if (Date.now() < pkUntil) return pkMeta;
  let m: PresskitMeta | null = null;
  try {
    const res = await fetch(PRESSKIT_META_URL, { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } });
    if (res.ok) {
      const text = await res.text();
      if (text.length <= 20_000) m = parsePresskitMeta(JSON.parse(text));
    } else await res.body?.cancel().catch(() => {});
  } catch (e) { console.error("admin", "presskit", e instanceof Error ? e.name : "?"); }
  if (m) pkMeta = m;
  pkUntil = Date.now() + (m ? 600_000 : 60_000);
  return pkMeta;
}
/** Blok presskit voor stats; mag nooit de hele actie laten mislukken. */
async function presskitBlock() {
  const [meta, counts] = await Promise.all([
    presskitMeta(),
    (async () => {
      try {
        const { data, error } = await db.rpc("tunr_presskit_stats");
        if (error) throw new Error(error.message);
        return data as unknown;
      } catch (e) { console.error("admin", "presskit_stats", e instanceof Error ? e.message : "?"); return null; }
    })(),
  ]);
  return cleanPresskit(meta, counts);
}

// ---- downloads: builds/manifest.json via dl.php (token van 60 s) ----
const buildsKey = () => env("TUNR_BUILDS_KEY");
type Fetched = { ok: true; manifest: Manifest } | { ok: false; reason: "not_configured" | "no_builds" | "unreachable" };
async function fetchManifest(): Promise<Fetched> {
  if (buildsKey().length < MIN_KEY) return { ok: false, reason: "not_configured" };
  const { token } = await signBuildToken(buildsKey(), "manifest.json", 60);
  const fail = (reason: "not_configured" | "no_builds" | "unreachable", why: string): Fetched => {
    console.error("admin", "builds", why); // nooit de URL (bevat het token)
    return { ok: false, reason };
  };
  let res: Response;
  try {
    res = await fetch(buildUrl(token), { redirect: "error", signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
  } catch (e) {
    return fail("unreachable", e instanceof Error ? e.name : "fetch");
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    if (res.status === 404) return fail("no_builds", "HTTP 404");
    if (res.status === 503 || res.status === 403) return fail("not_configured", `HTTP ${res.status}`);
    return fail("unreachable", `HTTP ${res.status}`);
  }
  try {
    const text = await res.text();
    if (text.length > 1_000_000) return fail("unreachable", "te groot");
    const m = cleanManifest(JSON.parse(text));
    return m ? { ok: true, manifest: m } : fail("unreachable", "geen manifest");
  } catch (e) {
    return fail("unreachable", e instanceof Error ? e.name : "json");
  }
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, ...extra, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // een browser van een ander domein krijgt niets (de app en curl sturen geen Origin)
  const origin = req.headers.get("Origin");
  if (origin && !ORIGIN_OK.test(origin)) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 8192) return json({ error: "too_large" }, 413);
    const b = JSON.parse(text || "{}");
    if (!b || typeof b !== "object" || Array.isArray(b)) return json({ error: "bad_json" }, 400);
    body = b;
  } catch { return json({ error: "bad_json" }, 400); }
  const action = typeof body.action === "string" ? body.action : "";
  if (!configured()) return json({ error: "not_configured" }, 503);
  const ipHash = await hashIp(clientIp(req), tokenSecret());

  try {
    if (action === "login") {
      const wait = await lockedFor(ipHash);
      if (wait > 0) {
        await audit("login_locked", ipHash, `retry_after=${wait}`);
        return json({ error: "locked", retry_after: wait }, 429, { "Retry-After": String(wait) });
      }
      const key = tokenSecret();
      const [u, p] = await Promise.all([
        sameSecret(body.user, env("TUNR_ADMIN_USER"), key),
        sameSecret(body.password, Deno.env.get("TUNR_ADMIN_PASSWORD") ?? "", key),
      ]);
      if (!(u && p)) {
        memFailures.add(ipHash);
        memGlobal = memGlobal.filter((t) => t > Date.now() - 3600_000).concat(Date.now()).slice(-500);
        await audit("login_failed", ipHash);
        return json({ error: "invalid_credentials" }, 401);
      }
      memFailures.clear(ipHash);
      const { token, e } = await signToken(key, await tokenVersion());
      await audit("login", ipHash);
      return json({ token, expires: new Date(e * 1000).toISOString() });
    }

    if (!(await validToken(bearer(req.headers)))) return json({ error: "unauthorized" }, 401);
    if (!authedOk(ipHash)) return json({ error: "rate_limited", retry_after: 60 }, 429, { "Retry-After": "60" });

    switch (action) {
      case "logout_all": {
        const { data, error } = await db.rpc("tunr_admin_logout_all");
        if (error) throw new Error(error.message);
        await audit("logout_all", ipHash, `v=${data}`);
        return json({ ok: true, v: Number(data) });
      }
      case "stats": {
        const q = parseRange(body.days, body.offset);
        if (!q) return json({ error: "bad_range" }, 400);
        await maybeCleanup();
        const [{ data, error }, presskit] = await Promise.all([
          db.rpc("tunr_stats", { p_days: q.days, p_offset: q.offset }),
          presskitBlock(),
        ]);
        if (error) throw new Error(error.message);
        return json({ ...cleanStats(data, new Date(), q), presskit });
      }
      case "builds": {
        const r = await fetchManifest();
        if (r.ok) return json({ ready: true, platforms: r.manifest });
        if (r.reason === "not_configured") return json({ ready: false, platforms: emptyManifest(), reason: r.reason });
        return json({ ready: true, platforms: emptyManifest(), reason: r.reason });
      }
      case "build_link": {
        if (!isBuildPlatform(body.platform)) return json({ error: "bad_platform" }, 400);
        if (body.file !== undefined && body.file !== null && body.file !== "" && !isValidBuildFile(body.file)) return json({ error: "bad_file" }, 400);
        const r = await fetchManifest();
        if (!r.ok) {
          if (r.reason === "not_configured") return json({ error: "builds_not_configured" }, 503);
          if (r.reason === "no_builds") return json({ error: "build_not_found" }, 404);
          return json({ error: "builds_unreachable" }, 502);
        }
        const b = findBuild(r.manifest, body.platform, body.file);
        if (!b) return json({ error: "build_not_found" }, 404);
        const { token, exp } = await signBuildToken(buildsKey(), `${body.platform}/${b.file}`, LINK_TTL);
        await audit("build_link", ipHash, `${body.platform}/${b.file}`);
        return json({ url: buildUrl(token), expires: new Date(exp * 1000).toISOString(), file: b.file, size: b.size });
      }
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error("admin", action || "?", e instanceof Error ? e.message : "?");
    return json({ error: "server_error" }, 500);
  }
});
