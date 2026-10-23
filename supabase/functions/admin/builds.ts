// Functie admin, acties builds en build_link: pure hulpjes zonder netwerk of database, getest in builds_test.ts.
// De buildpakketten (Xcode-zips, APK's) staan niet op GitHub maar in de afgesloten map builds/ op de server van
// beheer.tunr.online (tools/beheer_upload.sh). Ophalen alleen via https://beheer.tunr.online/dl.php?t=<token> (web/dl.php).
// Token = "<payload>.<sig>": payload = base64url (zonder =) van JSON {"f": "<pad>", "e": <unix-seconden verloop>},
// sig = base64url(HMAC-SHA256(sleutel, payload)), sleutel = de string uit het function-secret TUNR_BUILDS_KEY
// (dl.php gebruikt dezelfde string uit builds/key.php). dl.php weigert e > nu + 900.

export const DL_URL = "https://beheer.tunr.online/dl.php";
/** Platforms in builds/manifest.json, tevens de mappen in builds/. */
export const BUILD_PLATFORMS = ["apple", "android", "play", "windows", "beheer"] as const;
export type BuildPlatform = typeof BUILD_PLATFORMS[number];
export const MAX_TTL = 900;
export const LINK_TTL = 600;
export const MIN_KEY = 32;
export const KEEP = 10;

const enc = new TextEncoder();
export const b64url = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export function isValidBuildFile(name: unknown): name is string {
  return typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(name) && !name.includes("..");
}
export const isBuildPlatform = (p: unknown): p is BuildPlatform =>
  typeof p === "string" && (BUILD_PLATFORMS as readonly string[]).includes(p);

/** Zelfde regels als dl.php: "manifest.json" of "<apple|android|play|windows|beheer>/<bestandsnaam>". */
export function isValidBuildPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (path === "manifest.json") return true;
  const i = path.indexOf("/");
  return i > 0 && isBuildPlatform(path.slice(0, i)) && isValidBuildFile(path.slice(i + 1));
}

/** Downloadtoken voor dl.php. `ttlSeconds` 1..900, `now` in ms. */
export async function signBuildToken(key: string, path: string, ttlSeconds: number, now = Date.now()): Promise<{ token: string; exp: number }> {
  if (typeof key !== "string" || key.length < MIN_KEY) throw new Error("builds_key_missing");
  if (!isValidBuildPath(path)) throw new Error("bad_build_path");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL) throw new Error("bad_ttl");
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const payload = b64url(enc.encode(JSON.stringify({ f: path, e: exp })));
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(payload))));
  return { token: `${payload}.${sig}`, exp };
}

export const buildUrl = (token: string) => `${DL_URL}?t=${encodeURIComponent(token)}`;

// ---- manifest: { "apple": [build…], "android": [...], "play": [...] (Google Play, .aab), "windows": [...] (Windows-installer, .exe), "beheer": [...] }, nieuwste eerst ----
export type Build = { version: string; build: number; file: string; size: number; sha256: string; date: string; notes: string };
export type Manifest = Record<BuildPlatform, Build[]>;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export const emptyManifest = (): Manifest => ({ apple: [], android: [], play: [], windows: [], beheer: [] });

function entry(v: unknown): Build | null {
  if (!isObj(v) || !isValidBuildFile(v.file)) return null;
  const build = typeof v.build === "number" ? v.build : typeof v.build === "string" && /^\d{1,7}$/.test(v.build) ? Number(v.build) : 0;
  const size = typeof v.size === "number" && Number.isFinite(v.size) && v.size >= 0 ? Math.floor(v.size) : 0;
  return {
    version: str(v.version, 20), build: Number.isInteger(build) && build >= 0 ? build : 0, file: v.file, size,
    sha256: /^[0-9a-f]{64}$/.test(String(v.sha256 ?? "")) ? String(v.sha256) : "",
    date: str(v.date, 40), notes: str(v.notes, 4000),
  };
}

/** Manifest van de server opschonen: alleen bekende platforms, geldige bestandsnamen, hoogstens 10 per platform. */
export function cleanManifest(raw: unknown): Manifest | null {
  if (!isObj(raw)) return null;
  const m = emptyManifest();
  for (const p of BUILD_PLATFORMS) {
    const list = Array.isArray(raw[p]) ? raw[p] as unknown[] : [];
    const seen = new Set<string>();
    for (const x of list) {
      const e = entry(x);
      if (!e || seen.has(e.file)) continue;
      seen.add(e.file);
      m[p].push(e);
      if (m[p].length >= KEEP) break;
    }
  }
  return m;
}

/** Een build uit het manifest: zonder `file` de nieuwste, anders alleen een bestand dat erin staat. */
export function findBuild(m: Manifest | null, platform: unknown, file?: unknown): Build | null {
  if (!m || !isBuildPlatform(platform)) return null;
  const list = m[platform];
  if (file === undefined || file === null || file === "") return list[0] ?? null;
  if (!isValidBuildFile(file)) return null;
  return list.find((b) => b.file === file) ?? null;
}
