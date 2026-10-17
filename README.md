# BeheerTunr

Het beheer van **Tunr**, de wereldwijde radio-app: anonieme gebruiksstatistieken en de downloads van de buildpakketten.

- **Dashboard**: https://beheer.tunr.online (map `web/`, statisch, geen build-stap)
- **Beheer-app BeheerTunr**: map `apple/` (SwiftUI, iPhone, iPad en Mac)
- **Backend**: eigen Supabase-project **tunr** (map `supabase/`): tabellen + de Edge Functions `ping` (openbaar, voor de Tunr-apps) en `admin` (beheer)

De afspraken tussen alle onderdelen staan in [`docs/CONTRACT.md`](docs/CONTRACT.md).

**Deze repo is openbaar.** Geen geheimen, geen persoonsgegevens en geen logs met servergegevens in bestanden, commits of workflow-logs. De publieke Supabase-URL en de publishable key mogen er wel in (`web/config.js`, `apple/Shared/Config.swift`).

## Wat het doet

| Onderdeel | Wat |
|---|---|
| `supabase/schema.sql` | tabellen `installs`, `install_days`, `admin_token_state`, `admin_audit` (RLS aan, geen policies) en de functies `tunr_ping`, `tunr_stats`, `tunr_cleanup`, `tunr_admin_logout_all` (alleen service role) |
| `supabase/functions/ping` | anonieme ping van de apps en de webspeler: strenge controle, geen IP-adres opgeslagen, max. 30 per IP per uur |
| `supabase/functions/admin` | inloggen (eigen HMAC-token, 12 uur), overal uitloggen, statistieken, downloads (`builds`, `build_link`) |
| `web/` | dashboard: Overzicht, Downloads, Instellingen (NL/EN), `dl.php` en de afgesloten map `builds/` |
| `tools/ftps.sh` | FTPS met certificaatcontrole, ook als het certificaat op naam van de hoster staat (`*.zxcs.nl`) |
| `tools/beheer_upload.sh` | zet een pakket in `builds/` en werkt `builds/manifest.json` bij (ook gebruikt door int-radio-app) |

## Workflows

| Workflow | Wanneer | Wat |
|---|---|---|
| *Backend* (`backend.yml`) | push op `supabase/**`, of met de hand | tests (Deno), schema via de Management API, function-secrets, deploy van `ping` en `admin`, rooktest |
| *Dashboard* (`site.yml`) | push op `web/**`, of met de hand | `web/` via FTPS naar beheer.tunr.online (de inhoud van `builds/` blijft staan), daarna controle van de site |
| *Beheer-app* (`beheer-app.yml`) | push op `apple/**` | bouwt BeheerTunr en zet de Xcode-zip in `builds/beheer/` |

Ontbreekt een secret, dan geeft de workflow een waarschuwing en slaat hij die stap over.

## GitHub-secrets

*Settings → Secrets and variables → Actions → New repository secret*

| Secret | Wat |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | persoonlijk token van supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | optioneel; anders uit de URL in `web/config.js` |
| `TUNR_ADMIN_USER` | gebruikersnaam voor het beheer |
| `TUNR_ADMIN_PASSWORD` | wachtwoord voor het beheer (minstens 12 tekens) |
| `FTP_SERVER` | FTP-server (bv. `ftp.dotenterprises.nl`; het certificaat staat op `*.zxcs.nl`, de workflow vindt zelf `cpanel04.zxcs.nl`) |
| `FTP_USERNAME`, `FTP_PASSWORD` | het **eigen** FTP-account van beheer.tunr.online (komt direct uit in de map van het subdomein) |
| `FTP_DIR` | optioneel, alleen als de FTP-login niet direct in de map van beheer.tunr.online uitkomt |

Zelf aangemaakt door *Backend* (function-secrets in Supabase, nooit in GitHub): `TUNR_TOKEN_SECRET` (HMAC voor inlogtokens) en `TUNR_BUILDS_KEY` (downloadlinks, ook als `builds/key.php` op de server). Met *Run workflow → Nieuwe sleutel voor de downloadlinks* maak je een nieuwe downloadsleutel.

In **int-radio-app** komen er twee secrets bij: `BEHEER_FTP_USERNAME` en `BEHEER_FTP_PASSWORD` (hetzelfde FTP-account; `FTP_SERVER` staat daar al).

## Inrichten (eenmalig)

1. **Supabase**: maak op supabase.com een nieuw project **tunr** (regio EU). Kopieer bij *Project Settings → API* de project-URL en de **publishable key** (`sb_publishable_…`).
2. Zet ze in `web/config.js` (`window.BEHEER = { url, key }`) en in `apple/Shared/Config.swift`, en in int-radio-app in `Brand.swift`, `Brand.kt` en `brand.js` (zie het contract). Zolang de URL leeg is, toont het dashboard *Nog niet ingericht* en sturen de apps geen ping.
3. Maak een **access token** op supabase.com/dashboard/account/tokens en zet het als `SUPABASE_ACCESS_TOKEN`.
4. **cPanel** (hoster van tunr.online): maak het subdomein `beheer.tunr.online` met een eigen map, zet AutoSSL aan, en maak een FTP-account dat in die map uitkomt. PHP moet aan staan (voor `dl.php`).
5. Zet de overige **GitHub-secrets** (tabel hierboven) en draai *Backend* en daarna *Dashboard* (*Actions → Run workflow*).
6. Log in op https://beheer.tunr.online met `TUNR_ADMIN_USER` / `TUNR_ADMIN_PASSWORD`.

## Downloads

De buildpakketten (Xcode-zips van Tunr en BeheerTunr, de APK) staan **alleen** in de afgesloten map `builds/` op de server van beheer.tunr.online, nooit op GitHub (geen repo, release of artefact).

- Aanleveren: `tools/beheer_upload.sh <apple|android|beheer> <bestand> <versie> <build> [notities.md]` (FTPS met certificaatcontrole). Per platform blijven de laatste 10 builds staan; oudere bestanden worden verwijderd.
- Ophalen: in het dashboard of de app op **Downloaden**. De functie `admin` maakt een link naar `dl.php` die 10 minuten geldig is (HMAC met `TUNR_BUILDS_KEY`). `builds/` zelf is via de webserver niet bereikbaar.

## Beveiliging

- Inloggen: constant-time controle, na 5 mislukte pogingen per IP 15 minuten blokkade (en een noodrem bij meer dan 60 per uur in totaal); IP's alleen gehasht in `admin_audit`.
- Tokens bevatten alleen een versie en een verloop; **Overal uitloggen** verhoogt de versie, waarna alle sessies (web en app) vervallen.
- Het dashboard heeft een strikte Content-Security-Policy (geen inline scripts of styles, alleen verbinding met `*.supabase.co`), `noindex` en `robots.txt` met `Disallow: /`.
- Statistieken zijn anoniem: een willekeurige id per installatie, geen IP-adres, account of naam. Gegevens ouder dan 400 dagen worden automatisch verwijderd.
- GitHub Actions staan vast op een commit-SHA, de Supabase CLI op een vaste versie; de tests blokkeren de deploy.

## Lokaal testen

```sh
deno test supabase/functions          # unittests (ping, tokens, statistieken, downloads)
php -l web/dl.php
cd web && python3 -m http.server 8000 # dashboard op http://localhost:8000 (de functie admin staat localhost toe)
BEHEER_LOCAL_DIR=/tmp/beheer tools/beheer_upload.sh android Tunr-1.0.0-build1.apk 1.0.0 1   # upload zonder server
```
