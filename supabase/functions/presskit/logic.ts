// Functie presskit: pure logica (geen netwerk of database), getest in presskit_test.ts. Vorm: docs/CONTRACT.md.
// Wie op tunr.online op "PressKit" klikt, komt hier; de functie telt de download (alleen tijdstip + versie, geen IP)
// en stuurt altijd door naar de zip op tunr.online, ook als tellen of de versie ophalen mislukt.

export const SITE = "https://tunr.online";
export const META_URL = `${SITE}/presskit/presskit.json`;
export const ZIP_URL = `${SITE}/presskit/Tunr-PressKit.zip`;
/** Hoe lang de versie uit presskit.json in het geheugen blijft (en na een fout: korter, zodat het herstelt). */
export const META_TTL_MS = 10 * 60_000;
export const META_FAIL_TTL_MS = 60_000;
/** Tellen: hoogstens zoveel downloads per IP per uur (daarna nog wel doorsturen, niet tellen). */
export const COUNT_MAX = 5;
export const COUNT_WINDOW_MS = 3600_000;

/** Versie zoals tools/make_presskit.py (int-radio-app) hem maakt: `YYYY.MM.DD-<6 hex>`. */
export const VERSION_RE = /^\d{4}\.\d{2}\.\d{2}-[0-9a-f]{6}$/;

export type PresskitMeta = { version: string; date: string; size: number; files: number; platforms: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e12 ? v : 0);

/** presskit.json → nette vorm, of null als de versie niet klopt (dan doorsturen zonder ?v=). */
export function parseMeta(raw: unknown): PresskitMeta | null {
  if (!isObj(raw)) return null;
  const version = typeof raw.version === "string" ? raw.version.trim() : "";
  if (!VERSION_RE.test(version)) return null;
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw.date) ? raw.date.slice(0, 10) : "";
  const platforms = Array.isArray(raw.platforms)
    ? raw.platforms.filter((p): p is string => typeof p === "string" && /^[A-Za-z][A-Za-z0-9 ]{0,23}$/.test(p)).slice(0, 12)
    : [];
  return { version, date, size: count(raw.size), files: count(raw.files), platforms };
}

/** Doel van de redirect: de zip op tunr.online, met ?v=<versie> (cache-buster) als die bekend is. */
export function redirectUrl(version: string | null | undefined): string {
  return version && VERSION_RE.test(version) ? `${ZIP_URL}?v=${encodeURIComponent(version)}` : ZIP_URL;
}

/** Geen telling voor robots, linkvoorbeelden en scripts (ze worden wel doorgestuurd). */
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|httpclient|okhttp|go-http|java\/|headless|lighthouse|monitor/i;
export function isBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return ua === "" || BOT_RE.test(ua);
}

/** Alleen een GET van een gewone browser telt (HEAD, robots en voorbeelden niet). */
export function shouldCount(method: string, userAgent: string | null | undefined): boolean {
  return method === "GET" && !isBot(userAgent);
}

/**
 * Limiet in het geheugen (best effort, per functie-instantie): hoogstens `max` tellingen per sleutel per venster.
 * De sleutel (het IP) staat alleen in het geheugen en verdwijnt na het venster; er wordt niets opgeslagen.
 */
export class CountLimiter {
  private hits = new Map<string, { start: number; n: number }>();
  constructor(readonly max = COUNT_MAX, readonly windowMs = COUNT_WINDOW_MS, readonly maxKeys = 20000) {}
  /** true = deze download telt mee. */
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
  sweep(now = Date.now()) {
    for (const [k, h] of this.hits) if (now - h.start >= this.windowMs) this.hits.delete(k);
    if (this.hits.size >= this.maxKeys) this.hits.clear();
  }
  get size() { return this.hits.size; }
}

/** Cache van presskit.json: 10 minuten bij succes, 1 minuut na een fout (dan null). */
export class MetaCache {
  private value: PresskitMeta | null = null;
  private until = 0;
  private pending: Promise<PresskitMeta | null> | null = null;
  constructor(readonly load: () => Promise<PresskitMeta | null>, readonly ttl = META_TTL_MS, readonly failTtl = META_FAIL_TTL_MS) {}
  async get(now = Date.now()): Promise<PresskitMeta | null> {
    if (now < this.until) return this.value;
    if (!this.pending) {
      this.pending = (async () => {
        let v: PresskitMeta | null = null;
        try { v = await this.load(); } catch { v = null; }
        // na een fout de laatste goede waarde houden (beter een iets oudere versie dan geen)
        if (v) this.value = v;
        this.until = Date.now() + (v ? this.ttl : this.failTtl);
        return this.value;
      })().finally(() => { this.pending = null; });
    }
    return await this.pending;
  }
}

/** IP voor de limiet: cf-connecting-ip, x-real-ip, anders de LAATSTE waarde van X-Forwarded-For. */
export function clientIp(h: Headers): string {
  const g = (k: string) => (h.get(k) ?? "").trim();
  const xff = g("x-forwarded-for").split(",").map((s) => s.trim()).filter(Boolean);
  return (g("cf-connecting-ip") || g("x-real-ip") || xff[xff.length - 1] || "?").slice(0, 64);
}
