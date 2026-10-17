// Functie ping: pure validatie en limiet (geen netwerk of database), getest in ping_test.ts.
// Vorm van de ping: docs/CONTRACT.md. Er wordt geen IP-adres opgeslagen; de limiet staat alleen in het geheugen.

export const PLATFORMS = ["ios", "ipados", "macos", "tvos", "android", "androidtv", "web"] as const;
export type Platform = typeof PLATFORMS[number];
export const LANGS = ["nl", "en"] as const;
export const MAX_BODY = 4096;

export type Ping = {
  id: string; platform: Platform; device: string; model: string; os: string; version: string;
  build: number; country: string; lang: string; carplay: boolean;
};
export type Result = { ok: true; value: Ping } | { ok: false; error: string };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Tekst opschonen: geen stuurtekens, witruimte samengevoegd, ingekort tot `max` tekens. Geen string = "". */
export function cleanText(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" && typeof v !== "number") return null;
  // deno-lint-ignore no-control-regex
  const s = String(v).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, " ")
    .replace(/\s+/g, " ").trim();
  return [...s].slice(0, max).join("");
}

/** Controleert een ping streng. Fout = {ok:false, error:"bad_<veld>"}. */
export function validatePing(body: unknown): Result {
  if (!isObj(body)) return { ok: false, error: "bad_body" };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_V4.test(id)) return { ok: false, error: "bad_id" };
  const platform = body.platform;
  if (typeof platform !== "string" || !(PLATFORMS as readonly string[]).includes(platform)) return { ok: false, error: "bad_platform" };

  const fields: [keyof Ping, number][] = [["device", 30], ["model", 60], ["os", 20], ["version", 20]];
  const text: Record<string, string> = {};
  for (const [k, max] of fields) {
    const v = cleanText(body[k], max);
    if (v === null) return { ok: false, error: `bad_${k}` };
    text[k] = v;
  }

  let build = 0;
  if (body.build !== undefined && body.build !== null) {
    if (typeof body.build !== "number" || !Number.isInteger(body.build) || body.build < 0 || body.build > 99999) {
      return { ok: false, error: "bad_build" };
    }
    build = body.build;
  }

  let country = "";
  if (body.country !== undefined && body.country !== null && body.country !== "") {
    if (typeof body.country !== "string") return { ok: false, error: "bad_country" };
    country = body.country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return { ok: false, error: "bad_country" };
  }

  let lang = "";
  if (body.lang !== undefined && body.lang !== null && body.lang !== "") {
    if (typeof body.lang !== "string" || !(LANGS as readonly string[]).includes(body.lang.trim().toLowerCase())) {
      return { ok: false, error: "bad_lang" };
    }
    lang = body.lang.trim().toLowerCase();
  }

  let carplay = false;
  if (body.carplay !== undefined && body.carplay !== null) {
    if (typeof body.carplay !== "boolean") return { ok: false, error: "bad_carplay" };
    carplay = body.carplay;
  }

  return {
    ok: true,
    value: {
      id: id.toLowerCase(), platform: platform as Platform, device: text.device, model: text.model, os: text.os,
      version: text.version, build, country, lang, carplay,
    },
  };
}

/** Parameters voor de databasefunctie public.tunr_ping (supabase/schema.sql). */
export const rpcArgs = (p: Ping) => ({
  p_id: p.id, p_platform: p.platform, p_device: p.device, p_model: p.model, p_os: p.os, p_version: p.version,
  p_build: p.build, p_country: p.country, p_lang: p.lang, p_carplay: p.carplay,
});

/**
 * Eenvoudige limiet in het geheugen (best effort, per functie-instantie): hoogstens `max` treffers per sleutel per
 * venster van `windowMs`. De sleutel (het IP) blijft alleen in het geheugen en verdwijnt na het venster.
 */
export class RateLimiter {
  private hits = new Map<string, { start: number; n: number }>();
  constructor(readonly max: number, readonly windowMs: number, readonly maxKeys = 20000) {}
  /** true = toegestaan. */
  hit(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      if (this.hits.size >= this.maxKeys) this.sweep(now);
      this.hits.set(key, { start: now, n: 1 });
      return true;
    }
    h.n++;
    return h.n <= this.max;
  }
  /** Seconden tot de sleutel weer mag (0 = nu). */
  retryAfter(key: string, now = Date.now()): number {
    const h = this.hits.get(key);
    if (!h || h.n <= this.max) return 0;
    return Math.max(1, Math.ceil((h.start + this.windowMs - now) / 1000));
  }
  sweep(now = Date.now()) {
    for (const [k, h] of this.hits) if (now - h.start >= this.windowMs) this.hits.delete(k);
    // nog steeds vol (aanval met veel adressen): alles wissen in plaats van onbeperkt groeien
    if (this.hits.size >= this.maxKeys) this.hits.clear();
  }
  get size() { return this.hits.size; }
}

/** IP voor de limiet: cf-connecting-ip, x-real-ip, anders de LAATSTE waarde van X-Forwarded-For (gezet door de proxy). */
export function clientIp(h: Headers): string {
  const g = (k: string) => (h.get(k) ?? "").trim();
  const xff = g("x-forwarded-for").split(",").map((s) => s.trim()).filter(Boolean);
  return (g("cf-connecting-ip") || g("x-real-ip") || xff[xff.length - 1] || "?").slice(0, 64);
}
