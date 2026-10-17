// Tunr: anonieme gebruiksping (openbaar, verify_jwt = false). Vorm en regels: docs/CONTRACT.md.
// POST /functions/v1/ping  {id, platform, device, model, os, version, build, country, lang, carplay} -> {ok:true}
// Slaat geen IP-adres op; limiet 30 pings per IP per uur in het geheugen (best effort).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { clientIp, MAX_BODY, RateLimiter, rpcArgs, validatePing } from "./logic.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const limiter = new RateLimiter(30, 3600_000);

const CORS = {
  "Access-Control-Allow-Origin": "https://tunr.online",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, ...extra, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ip = clientIp(req.headers);
  if (!limiter.hit(ip)) {
    const ra = limiter.retryAfter(ip);
    return json({ error: "rate_limited", retry_after: ra }, 429, { "Retry-After": String(ra) });
  }

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: "too_large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const r = validatePing(body);
  if (!r.ok) return json({ error: r.error }, 400);

  const { error } = await db.rpc("tunr_ping", rpcArgs(r.value));
  if (error) {
    // alleen de foutmelding van de database, nooit het verzoek of het IP
    console.error("ping", error.message);
    return json({ error: "server_error" }, 500);
  }
  return json({ ok: true });
});
