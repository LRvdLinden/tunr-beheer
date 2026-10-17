# BeheerTunr: werkafspraken

- Openbare repo met het beheer van Tunr: dashboard `web/` (https://beheer.tunr.online), Beheer-app `apple/` (BeheerTunr) en de backend `supabase/` (eigen Supabase-project **tunr**, los van Bingr). `docs/CONTRACT.md` is de bron van waarheid; wijzig het contract eerst, daarna de onderdelen.
- Openbaar betekent: geen geheimen, geen persoonsgegevens (ook niet als testdata of in screenshots) en geen logs met servergegevens (secrets, hostnamen, IP-adressen, FTP-mappen, serverantwoorden) in bestanden, commits of workflow-logs. Wel toegestaan: de publieke Supabase-URL en de publishable key (`web/config.js`, `apple/Shared/Config.swift`).
- Geheimen alleen als GitHub-secrets of Supabase function-secrets (zie README.md). Nooit loggen: wachtwoorden, tokens, `TUNR_TOKEN_SECRET`, `TUNR_BUILDS_KEY`, downloadlinks.
- Wijzigingen hier komen **nooit** in de changelog van Tunr (`docs/changelog.json` in int-radio-app), niet op tunr.online en niet in release-notities.
- Versie en build van BeheerTunr zijn een eigen reeks: `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in `apple/project.yml` (los van de buildnummers van Tunr). Het dashboard en de backend hebben geen buildnummer.
- Nieuwe functies van het dashboard ook in de app overnemen (en andersom), volgens het contract.
- Schema: alleen in `supabase/schema.sql`, altijd idempotent (`if not exists`, `create or replace`), toegepast door de workflow *Backend*. Tabellen houden RLS aan zonder policies; databasefuncties alleen voor `service_role`.
- Functies: pure logica in losse modules met Deno-tests (`*_test.ts`); de tests blokkeren de deploy. `ping` en `admin` hebben `verify_jwt = false` (eigen controle).
- Dashboard: geen externe scripts, styles of fonts; strikte CSP (`web/.htaccess` en de meta in `web/index.html`): geen inline scripts, styles of `style=`-attributen (breedtes via `element.style`). Houd `noindex` en `robots.txt` (`Disallow: /`).
- Buildpakketten nooit op GitHub (geen repo, release of artefact): alleen via `tools/beheer_upload.sh` in `builds/` op de server; ophalen alleen via `dl.php` met een kortgeldige link uit `admin`.
- FTPS altijd met certificaatcontrole (`tools/ftps.sh`), nooit gewone FTP. `web/builds/` bevat alleen `.htaccess`; de workflow *Dashboard* overschrijft of verwijdert nooit iets in `builds/` op de server.
- GitHub Actions vast op een commit-SHA (tag als commentaar), de Supabase CLI op een vaste versie.
- Commitberichten in het Nederlands.
