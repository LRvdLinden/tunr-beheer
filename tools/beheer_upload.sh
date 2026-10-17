#!/usr/bin/env bash
# Zet een buildpakket in de afgesloten map builds/ van beheer.tunr.online en werkt builds/manifest.json bij.
#
#   tools/beheer_upload.sh <apple|android|beheer> <bestand> <versie> <build> [notities.md]
#
# Omgeving: FTP_SERVER, FTP_USERNAME, FTP_PASSWORD, optioneel FTP_DIR (het eigen FTP-account van beheer.tunr.online).
# Ook los te gebruiken vanuit andere repo's (int-radio-app):
#   curl -fsSL https://raw.githubusercontent.com/LRvdLinden/tunr-beheer/main/tools/beheer_upload.sh -o /tmp/beheer_upload.sh
#   bash /tmp/beheer_upload.sh android Tunr-1.0.0-build14.apk 1.0.0 14 notes.md
# Staat tools/ftps.sh niet naast dit script, dan wordt die van dezelfde plek gehaald (BEHEER_RAW).
# Test zonder server: BEHEER_LOCAL_DIR=<map> gebruikt die map als de map van beheer.tunr.online.
#
# 1. haalt het manifest op (of begint leeg), zet het nieuwe item vooraan (zelfde build of bestand vervangt), houdt per
#    platform de laatste 10 builds en verwijdert de bestanden die eruit vallen;
# 2. uploadt eerst het bestand (als .part, dan hernoemd), daarna het manifest; controleert of het manifest klopt
#    (anders opnieuw: twee workflows tegelijk).
# Er komt nooit een pakket op GitHub. Het log is openbaar: geen sleutels, mappen, servernamen of serverantwoorden.
set -euo pipefail

usage(){ echo "Gebruik: $0 <apple|android|beheer> <bestand> <versie> <build> [notities.md]" >&2; exit 2; }
[ $# -ge 4 ] || usage
PLAT="$1"; FILE="$2"; VERSION="$3"; BUILD="$4"; NOTES="${5:-}"
case "$PLAT" in apple|android|beheer) ;; *) echo "::error::Onbekend platform (apple, android of beheer)."; exit 2 ;; esac
[ -f "$FILE" ] || { echo "::error::Bestand niet gevonden."; exit 2; }
[[ "$VERSION" =~ ^[0-9][0-9A-Za-z.-]{0,19}$ ]] || { echo "::error::Ongeldige versie."; exit 2; }
[[ "$BUILD" =~ ^[0-9]{1,7}$ ]] || { echo "::error::Ongeldig buildnummer."; exit 2; }
NAME=$(basename "$FILE")
[[ "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$ && "$NAME" != *..* ]] || { echo "::error::Ongeldige bestandsnaam (alleen letters, cijfers, . _ -)."; exit 2; }
[ -z "$NOTES" ] || [ -f "$NOTES" ] || { echo "::warning::Notitiebestand niet gevonden; zonder notities."; NOTES=""; }
command -v python3 >/dev/null || { echo "::error::python3 ontbreekt."; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
export FTPS_TMP="$WORK/ftps"; mkdir -p "$FTPS_TMP"

# ---- server (FTPS) of lokale testmap ----
if [ -n "${BEHEER_LOCAL_DIR:-}" ]; then
  srv_get(){ [ -s "$BEHEER_LOCAL_DIR/builds/$1" ] && cp "$BEHEER_LOCAL_DIR/builds/$1" "$2"; }
  srv_put(){ mkdir -p "$(dirname "$BEHEER_LOCAL_DIR/builds/$2")"; cp "$1" "$BEHEER_LOCAL_DIR/builds/$2.part" && mv -f "$BEHEER_LOCAL_DIR/builds/$2.part" "$BEHEER_LOCAL_DIR/builds/$2" && chmod "${3:-644}" "$BEHEER_LOCAL_DIR/builds/$2"; }
  srv_rm(){ rm -f "$BEHEER_LOCAL_DIR/builds/$1"; }
  srv_has(){ [ -e "$BEHEER_LOCAL_DIR/builds/$1" ]; }
else
  if ! command -v lftp >/dev/null; then
    if command -v brew >/dev/null; then HOMEBREW_NO_AUTO_UPDATE=1 brew install lftp >/dev/null 2>&1 || true
    elif command -v apt-get >/dev/null; then (sudo apt-get update -qq && sudo apt-get install -y -qq lftp) >/dev/null 2>&1 || true; fi
  fi
  command -v lftp >/dev/null || { echo "::error::lftp ontbreekt (sudo apt-get install -y lftp / brew install lftp)."; exit 1; }
  HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  if [ -f "$HERE/ftps.sh" ]; then
    # shellcheck source=tools/ftps.sh
    source "$HERE/ftps.sh"
  else
    curl -fsSL --max-time 30 "${BEHEER_RAW:-https://raw.githubusercontent.com/LRvdLinden/tunr-beheer/main}/tools/ftps.sh" -o "$WORK/ftps.sh" \
      || { echo "::error::tools/ftps.sh niet op te halen."; exit 1; }
    # shellcheck source=/dev/null
    source "$WORK/ftps.sh"
  fi
  ftps_connect
  B="$FTPS_TARGET/builds"
  srv_get(){ ftps_try "get \"$B/$1\" -o \"$2\"" >/dev/null 2>&1; [ -s "$2" ]; }
  srv_put(){
    ftps_run "mkdir -p -f \"$(dirname "$B/$2")\"; put \"$1\" -o \"$B/$2.part\"; rm -f \"$B/$2\"; mv \"$B/$2.part\" \"$B/$2\"; chmod ${3:-644} \"$B/$2\"" >/dev/null 2>&1
  }
  srv_rm(){ ftps_try "rm -f \"$B/$1\"" >/dev/null 2>&1 || true; }
  srv_has(){ ftps_try "cls -1 -a \"$B/\"" 2>/dev/null | sed 's#.*/##' | grep -qx "$1"; }
fi

# map builds/ altijd afgesloten (ook als het dashboard nog niet is geüpload)
if ! srv_has .htaccess; then
  printf '# Buildpakketten van Tunr: alleen via dl.php.\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\nOptions -Indexes\n' > "$WORK/htaccess"
  srv_put "$WORK/htaccess" .htaccess 644 || { echo "::error::builds/.htaccess niet gezet."; exit 1; }
fi

# ---- 1. bestand uploaden ----
srv_put "$FILE" "$PLAT/$NAME" 644 || { echo "::error::$PLAT: uploaden van het pakket mislukt."; exit 1; }

# ---- 2. manifest bijwerken (met controle; opnieuw als een andere workflow tegelijk schreef) ----
SHA=$(python3 -c 'import hashlib,sys
h=hashlib.sha256()
with open(sys.argv[1],"rb") as f:
    for b in iter(lambda: f.read(1<<20), b""): h.update(b)
print(h.hexdigest())' "$FILE")
SIZE=$(wc -c < "$FILE" | tr -d ' ')
ok=0
for attempt in 1 2 3 4; do
  if [ "$attempt" -gt 1 ]; then sleep $(( (RANDOM % 15) + 5 )); fi
  rm -f "$WORK/manifest.json"
  srv_get manifest.json "$WORK/manifest.json" || echo '{}' > "$WORK/manifest.json"
  python3 - "$WORK/manifest.json" "$PLAT" "$NAME" "$VERSION" "$BUILD" "$SHA" "$SIZE" "$NOTES" > "$WORK/drop.txt" <<'PY'
import datetime, json, re, sys
mp, plat, name, version, build, sha, size, notes = sys.argv[1:9]
try:
    m = json.load(open(mp, encoding="utf-8"))
    if not isinstance(m, dict): m = {}
except Exception:
    m = {}
for p in ("apple", "android", "beheer"):
    if not isinstance(m.get(p), list): m[p] = []
txt = ""
if notes:
    txt = open(notes, encoding="utf-8", errors="replace").read().strip()[:4000]
item = {"version": version, "build": int(build), "file": name, "size": int(size), "sha256": sha,
        "date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "notes": txt}
ok = lambda f: isinstance(f, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,150}", f) and ".." not in f
old = [x for x in m[plat] if isinstance(x, dict) and ok(x.get("file"))]
same = [x for x in old if x.get("file") == name or x.get("build") == int(build)]
rest = [x for x in old if x not in same]
lst = [item] + rest
keep, drop = lst[:10], lst[10:]
m[plat] = keep
# bestanden die niet meer in het manifest staan (vervangen build met een andere naam, of ouder dan de laatste 10)
kept = {x["file"] for x in keep}
gone = {x["file"] for x in same + drop if x.get("file") not in kept}
json.dump(m, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\n".join(sorted(gone)))
PY
  srv_put "$WORK/manifest.json" manifest.json 600 || { echo "::warning::Manifest niet geüpload (poging $attempt)."; continue; }
  rm -f "$WORK/check.json"
  if srv_get manifest.json "$WORK/check.json" && python3 -c 'import json,sys
m=json.load(open(sys.argv[1])); sys.exit(0 if any(x.get("file")==sys.argv[3] and x.get("sha256")==sys.argv[4] for x in m.get(sys.argv[2],[])) else 1)' \
      "$WORK/check.json" "$PLAT" "$NAME" "$SHA"; then ok=1; break; fi
  echo "::warning::Manifest klopte niet na het schrijven (poging $attempt); opnieuw."
done
[ "$ok" = 1 ] || { echo "::error::$PLAT: manifest niet bijgewerkt."; exit 1; }

while IFS= read -r f; do
  if [ -n "$f" ] && [ "$f" != "$NAME" ]; then srv_rm "$PLAT/$f"; fi
done < "$WORK/drop.txt"
echo "::notice::$PLAT build $BUILD ($VERSION) staat in builds/ van beheer.tunr.online ($(awk -v b="$SIZE" 'BEGIN{printf "%.1f", b/1048576}') MB)."
