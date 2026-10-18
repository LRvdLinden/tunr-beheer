// Tunr: presskit-download tellen (openbaar, verify_jwt = false). Vorm en regels: docs/CONTRACT.md.
// GET /functions/v1/presskit -> 302 naar https://tunr.online/presskit/Tunr-PressKit.zip?v=<versie>
// Telt één download (tijdstip + versie; geen IP). Hoogstens 5 tellingen per IP per uur (geheugen, best effort);
// robots en HEAD tellen niet. Gaat er iets mis, dan toch doorsturen: de download mag nooit breken.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { clientIp, CountLimiter, META_URL, MetaCache, parseMeta, redirectUrl, shouldCount, ZIP_URL } from "./logic.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const limiter = new CountLimiter();
const meta = new MetaCache(async () => {
  const res = await fetch(META_URL, { signal: AbortSignal.timeout(2500), headers: { Accept: "application/json" } });
  if (!res.ok) { await res.body?.cancel().catch(() => {}); return null; }
  const text = await res.text();
  return text.length > 20_000 ? null : parseMeta(JSON.parse(text));
});

const redirect = (to: string) =>
  new Response(null, {
    status: 302,
    headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" },
  });

/** Werk na het antwoord afmaken als de runtime dat kan (EdgeRuntime.waitUntil), anders er even op wachten. */
async function later(p: Promise<unknown>) {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else await p;
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  let target = ZIP_URL;
  try {
    const m = await meta.get();
    target = redirectUrl(m?.version);
    if (shouldCount(req.method, req.headers.get("user-agent")) && limiter.hit(clientIp(req.headers))) {
      await later((async () => {
        const { error } = await db.rpc("tunr_presskit_hit", { p_version: m?.version ?? "" });
        // alleen de foutmelding van de database, nooit het verzoek of het IP
        if (error) console.error("presskit", error.message);
      })().catch((e) => console.error("presskit", e instanceof Error ? e.name : "?")));
    }
  } catch (e) {
    console.error("presskit", e instanceof Error ? e.name : "?");
  }
  return redirect(target);
});
