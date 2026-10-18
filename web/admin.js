// BeheerTunr dashboard: praat alleen met de Edge Function `admin` (docs/CONTRACT.md). Token (12 uur) in sessionStorage.
// Geen externe bibliotheken; grafieken als inline SVG. CSP: geen inline styles, breedtes via element.style.
(() => {
  "use strict";
  const CFG = window.BEHEER || {};
  const READY = typeof CFG.url === "string" && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(CFG.url) && !!CFG.key;
  const FN = READY ? `${CFG.url.replace(/\/+$/, "")}/functions/v1/admin` : "";
  const SKEY = "tunrBeheer.session", LKEY = "tunrBeheer.lang", RKEY = "tunrBeheer.range";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* privé-venster */ } },
  };

  // ---------- teksten (NL standaard, EN) ----------
  const T = {
    nl: {
      "brand.tag": "Beheer", "login.title": "Inloggen", "login.user": "Gebruikersnaam", "login.pass": "Wachtwoord", "login.submit": "Inloggen",
      "login.busy": "Bezig…", "login.missing": "Vul je gebruikersnaam en wachtwoord in.",
      "setup.title": "Nog niet ingericht",
      "setup.text": "Het Supabase-project van Tunr is nog niet gekoppeld. Zet de publieke URL en de publishable key in web/config.js en publiceer het dashboard opnieuw.",
      "tab.overview": "Overzicht", "tab.downloads": "Downloads", "tab.settings": "Instellingen",
      "ov.refresh": "Vernieuwen", "ov.updated": "Bijgewerkt om {t}", "ov.loading": "Laden…",
      "ins.title": "Gebruikers", "ins.week": "Week", "ins.month": "Maand", "ins.quarter": "Kwartaal", "ins.year": "Jaar",
      "ins.range": "Periode", "ins.series": "Reeksen", "ins.prev": "Vorige periode", "ins.next": "Volgende periode",
      "ins.expand": "Vergroten", "ins.close": "Verkleinen", "ins.active": "Actieve gebruikers", "ins.new": "Nieuwe gebruikers",
      "ins.min": "Min", "ins.max": "Max", "ins.avg": "Gem.", "ins.last": "Laatste", "ins.total": "Totaal", "ins.today": "vandaag",
      "ins.plot": "Grafiek {p}. Pijltjestoetsen: dag voor dag; Shift + pijltje: per week; Home/End: begin/eind.",
      "ins.oneOn": "Er moet minstens één reeks zichtbaar blijven.",
      "ov.platforms": "Per platform", "ov.devices": "Per type apparaat", "ov.versions": "App-versies", "ov.countries": "Landen", "ov.langs": "Talen",
      "ov.allInstalls": "alle installaties", "ov.active30": "actief, 30 dagen",
      "ov.note": "Anonieme tellingen: één willekeurige id per installatie, geen IP-adressen of persoonsgegevens. Alle tijden in UTC.",
      "k.installs": "Gebruikers totaal", "k.active_today": "Actief vandaag", "k.active_7d": "Actief 7 dagen", "k.active_30d": "Actief 30 dagen",
      "k.new_today": "Nieuw vandaag", "k.new_7d": "Nieuw 7 dagen", "k.carplay": "CarPlay / Android Auto",
      "k.ofTotal": "{p} van totaal", "k.plus7": "+{n} in de laatste 7 dagen", "k.yesterday": "gisteren {n}", "k.perDay": "gem. {n} per dag",
      "c.active": "actief", "c.new": "nieuw", "c.none": "Nog geen gegevens", "d.none": "Nog geen gegevens",
      "d.active30": "actief 30 dagen: {n}", "d.unknown": "Onbekend",
      "dl.sub": "Buildpakketten staan alleen op de server van beheer.tunr.online. Een downloadlink is 10 minuten geldig.",
      "dl.apple": "Apple", "dl.appleSub": "iPhone, iPad, Mac, Apple TV · Xcode-project",
      "dl.android": "Android", "dl.androidSub": "Telefoon, tablet, Android TV · APK",
      "dl.beheer": "BeheerTunr", "dl.beheerSub": "Beheer-app (iOS, iPadOS, macOS) · Xcode-project",
      "dl.latest": "Nieuwste", "dl.build": "build {n}", "dl.download": "Downloaden", "dl.older": "Eerdere builds", "dl.empty": "Nog geen builds aangeleverd.",
      "dl.notReady": "Downloads zijn nog niet ingericht: draai de workflow Backend (die maakt de sleutel voor de downloadlinks).",
      "dl.unreachable": "De server met de builds is nu niet bereikbaar. Probeer het later opnieuw.",
      "dl.started": "Download gestart: {f}", "dl.copied": "SHA-256 gekopieerd", "dl.shaTitle": "SHA-256 (klik om te kopiëren)",
      "set.session": "Sessie", "set.logout": "Uitloggen", "set.logoutAll": "Overal uitloggen",
      "set.logoutAllHint": "Overal uitloggen maakt alle sessies ongeldig, ook in de app BeheerTunr op andere apparaten.",
      "set.confirmAll": "Alle sessies op alle apparaten uitloggen?", "set.until": "Ingelogd tot {t} ({r} over).",
      "set.language": "Taal", "set.links": "Links", "set.site": "Website", "set.player": "Webspeler", "set.about": "Over",
      "set.backend": "Backend", "set.dashboard": "Dashboard",
      "msg.expired": "Je sessie is verlopen. Log opnieuw in.", "msg.loggedOut": "Je bent uitgelogd.", "msg.allOut": "Alle sessies zijn uitgelogd.",
      "e.network": "Geen verbinding met de server.", "e.server_error": "Er ging iets mis op de server.",
      "e.invalid_credentials": "Gebruikersnaam of wachtwoord klopt niet.", "e.locked": "Te veel mislukte pogingen. Probeer het over {m} min opnieuw.",
      "e.not_configured": "De beheerfunctie is nog niet ingericht (workflow Backend: TUNR_ADMIN_USER / TUNR_ADMIN_PASSWORD).",
      "e.rate_limited": "Te veel verzoeken. Wacht een minuut.", "e.build_not_found": "Deze build staat niet (meer) op de server. Vernieuw de lijst.",
      "e.builds_not_configured": "Downloads zijn nog niet ingericht.", "e.builds_unreachable": "De server met de builds is niet bereikbaar.",
      "e.unknown_action": "Onbekende actie: vernieuw de pagina.", "e.forbidden": "Geweigerd.", "e.bad_range": "Ongeldige periode.",
      "u.h": "{n} uur", "u.m": "{n} min",
      "pk.title": "PressKit", "pk.sub": "Downloads via de link PressKit onderaan tunr.online", "pk.download": "Download presskit",
      "pk.date": "Datum", "pk.size": "Grootte", "pk.files": "Bestanden", "pk.filesN": "{n} bestanden", "pk.total": "Downloads totaal",
      "pk.d30": "Laatste 30 dagen", "pk.perDay": "Downloads per dag", "pk.perVersion": "Per versie", "pk.current": "huidig",
      "pk.none": "Nog geen presskit online gevonden (workflow Website in int-radio-app).", "pk.noDl": "Nog geen downloads.",
      "pk.unknown": "Onbekende versie", "pk.days30": "30 dagen", "pk.today": "vandaag", "pk.chart": "Downloads per dag, laatste 30 dagen: {n} in totaal",
    },
    en: {
      "brand.tag": "Admin", "login.title": "Sign in", "login.user": "Username", "login.pass": "Password", "login.submit": "Sign in",
      "login.busy": "Signing in…", "login.missing": "Enter your username and password.",
      "setup.title": "Not set up yet",
      "setup.text": "Tunr's Supabase project isn't linked yet. Put the public URL and the publishable key in web/config.js and publish the dashboard again.",
      "tab.overview": "Overview", "tab.downloads": "Downloads", "tab.settings": "Settings",
      "ov.refresh": "Refresh", "ov.updated": "Updated at {t}", "ov.loading": "Loading…",
      "ins.title": "Users", "ins.week": "Week", "ins.month": "Month", "ins.quarter": "Quarter", "ins.year": "Year",
      "ins.range": "Period", "ins.series": "Series", "ins.prev": "Previous period", "ins.next": "Next period",
      "ins.expand": "Expand", "ins.close": "Collapse", "ins.active": "Active users", "ins.new": "New users",
      "ins.min": "Min", "ins.max": "Max", "ins.avg": "Avg.", "ins.last": "Last", "ins.total": "Total", "ins.today": "today",
      "ins.plot": "Chart {p}. Arrow keys: day by day; Shift + arrow: by week; Home/End: start/end.",
      "ins.oneOn": "At least one series has to stay visible.",
      "ov.platforms": "By platform", "ov.devices": "By device type", "ov.versions": "App versions", "ov.countries": "Countries", "ov.langs": "Languages",
      "ov.allInstalls": "all installs", "ov.active30": "active, 30 days",
      "ov.note": "Anonymous counts: one random id per install, no IP addresses or personal data. All times in UTC.",
      "k.installs": "Total users", "k.active_today": "Active today", "k.active_7d": "Active 7 days", "k.active_30d": "Active 30 days",
      "k.new_today": "New today", "k.new_7d": "New 7 days", "k.carplay": "CarPlay / Android Auto",
      "k.ofTotal": "{p} of total", "k.plus7": "+{n} in the last 7 days", "k.yesterday": "yesterday {n}", "k.perDay": "avg. {n} per day",
      "c.active": "active", "c.new": "new", "c.none": "No data yet", "d.none": "No data yet",
      "d.active30": "active 30 days: {n}", "d.unknown": "Unknown",
      "dl.sub": "Build packages live only on the beheer.tunr.online server. A download link is valid for 10 minutes.",
      "dl.apple": "Apple", "dl.appleSub": "iPhone, iPad, Mac, Apple TV · Xcode project",
      "dl.android": "Android", "dl.androidSub": "Phone, tablet, Android TV · APK",
      "dl.beheer": "BeheerTunr", "dl.beheerSub": "Admin app (iOS, iPadOS, macOS) · Xcode project",
      "dl.latest": "Latest", "dl.build": "build {n}", "dl.download": "Download", "dl.older": "Earlier builds", "dl.empty": "No builds delivered yet.",
      "dl.notReady": "Downloads aren't set up yet: run the Backend workflow (it creates the key for download links).",
      "dl.unreachable": "The build server can't be reached right now. Try again later.",
      "dl.started": "Download started: {f}", "dl.copied": "SHA-256 copied", "dl.shaTitle": "SHA-256 (click to copy)",
      "set.session": "Session", "set.logout": "Sign out", "set.logoutAll": "Sign out everywhere",
      "set.logoutAllHint": "Signing out everywhere invalidates every session, including the BeheerTunr app on other devices.",
      "set.confirmAll": "Sign out all sessions on all devices?", "set.until": "Signed in until {t} ({r} left).",
      "set.language": "Language", "set.links": "Links", "set.site": "Website", "set.player": "Web player", "set.about": "About",
      "set.backend": "Backend", "set.dashboard": "Dashboard",
      "msg.expired": "Your session has expired. Please sign in again.", "msg.loggedOut": "You're signed out.", "msg.allOut": "All sessions have been signed out.",
      "e.network": "Can't reach the server.", "e.server_error": "Something went wrong on the server.",
      "e.invalid_credentials": "Wrong username or password.", "e.locked": "Too many failed attempts. Try again in {m} min.",
      "e.not_configured": "The admin function isn't set up yet (Backend workflow: TUNR_ADMIN_USER / TUNR_ADMIN_PASSWORD).",
      "e.rate_limited": "Too many requests. Wait a minute.", "e.build_not_found": "This build is no longer on the server. Refresh the list.",
      "e.builds_not_configured": "Downloads aren't set up yet.", "e.builds_unreachable": "The build server can't be reached.",
      "e.unknown_action": "Unknown action: reload the page.", "e.forbidden": "Refused.", "e.bad_range": "Invalid period.",
      "u.h": "{n} h", "u.m": "{n} min",
      "pk.title": "PressKit", "pk.sub": "Downloads via the PressKit link at the bottom of tunr.online", "pk.download": "Download press kit",
      "pk.date": "Date", "pk.size": "Size", "pk.files": "Files", "pk.filesN": "{n} files", "pk.total": "Total downloads",
      "pk.d30": "Last 30 days", "pk.perDay": "Downloads per day", "pk.perVersion": "Per version", "pk.current": "current",
      "pk.none": "No press kit found online yet (Website workflow in int-radio-app).", "pk.noDl": "No downloads yet.",
      "pk.unknown": "Unknown version", "pk.days30": "30 days", "pk.today": "today", "pk.chart": "Downloads per day, last 30 days: {n} in total",
    },
  };
  let lang = store.get(LKEY) === "en" ? "en" : "nl";
  const t = (k, vars) => {
    let s = (T[lang] && T[lang][k]) ?? T.nl[k] ?? k;
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.split(`{${a}}`).join(String(b));
    return s;
  };
  const locale = () => (lang === "en" ? "en-GB" : "nl-NL");
  const nf = (n) => new Intl.NumberFormat(locale()).format(n);
  const pct = (part, total) => {
    if (!total) return "0%";
    const p = (part / total) * 100;
    if (p > 0 && p < 1) return "<1%";
    return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: p < 10 ? 1 : 0 }).format(p)}%`;
  };
  const time = (d) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const dateShort = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), { day: "numeric", month: "short", timeZone: "UTC" });
  const dateLong = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });
  function fmtWhen(v) {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    const hasTime = /T\d/.test(String(v));
    return d.toLocaleString(locale(), hasTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtSize(b) {
    if (!b) return "";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0, n = b;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: n < 10 && i > 0 ? 1 : 0 }).format(n)} ${u[i]}`;
  }

  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
    document.querySelectorAll("[data-lang]").forEach((b) => {
      b.classList.toggle("on", b.dataset.lang === lang);
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    });
    document.title = `${t("brand.tag")} · Tunr`;
    if (stats) renderStats();
    if (builds) renderBuilds();
    renderSession();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (!b) return;
    lang = b.dataset.lang === "en" ? "en" : "nl";
    store.set(LKEY, lang);
    applyLang();
  });

  // ---------- sessie en API ----------
  let mem = null;
  function session() {
    let s = mem;
    try { s = JSON.parse(sessionStorage.getItem(SKEY) || "null") || mem; } catch { /* privé-venster */ }
    return s && Date.parse(s.expires) > Date.now() ? s : null;
  }
  function setSession(s) {
    mem = s;
    try { s ? sessionStorage.setItem(SKEY, JSON.stringify(s)) : sessionStorage.removeItem(SKEY); } catch { /* privé-venster */ }
  }
  async function call(action, data = {}) {
    const s = session();
    let res;
    try {
      res = await fetch(FN, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: CFG.key, ...(s && action !== "login" ? { Authorization: `Bearer ${s.token}` } : {}) },
        body: JSON.stringify({ action, ...data }),
        cache: "no-store",
      });
    } catch { throw Object.assign(new Error("network"), { code: "network" }); }
    let body = {};
    try { body = await res.json(); } catch { /* leeg */ }
    if (res.status === 401 && action !== "login") { logout(t("msg.expired")); throw Object.assign(new Error("auth"), { code: "auth" }); }
    if (!res.ok) throw Object.assign(new Error(body.error || "server_error"), { code: body.error || "server_error", body });
    return body;
  }
  const errText = (e) => {
    const c = e && e.code;
    if (c === "locked") return t("e.locked", { m: Math.max(1, Math.ceil(((e.body && e.body.retry_after) || 900) / 60)) });
    return T.nl[`e.${c}`] ? t(`e.${c}`) : t("e.server_error");
  };

  // ---------- schermen ----------
  function showLogin(msg) {
    $("app").classList.add("hidden");
    $("login").classList.remove("hidden");
    $("loginForm").classList.toggle("hidden", !READY);
    $("setup").classList.toggle("hidden", READY);
    $("loginErr").textContent = msg || "";
    $("loginErr").classList.toggle("ok", msg === t("msg.loggedOut") || msg === t("msg.allOut"));
    if (READY) setTimeout(() => $("lu").focus(), 30);
  }
  function showApp() {
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("aboutBackend").textContent = CFG.url.replace(/^https:\/\//, "").replace(/\/+$/, "");
    const tab = (location.hash || "").slice(1);
    selectTab(["overview", "downloads", "settings"].includes(tab) ? tab : "overview", false);
  }
  function logout(msg) {
    setSession(null);
    stats = null; builds = null; lastPd0 = null;
    statsCache.clear();
    closeFull();
    clearInterval(timer);
    showLogin(msg);
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = $("lu").value.trim(), password = $("lp").value;
    if (!user || !password) { $("loginErr").textContent = t("login.missing"); return; }
    const btn = $("loginBtn");
    btn.disabled = true; btn.textContent = t("login.busy"); $("loginErr").textContent = "";
    try {
      const r = await call("login", { user, password });
      setSession({ token: r.token, expires: r.expires });
      $("lp").value = "";
      showApp();
    } catch (err) {
      $("loginErr").classList.remove("ok");
      $("loginErr").textContent = errText(err);
      $("lp").select();
    } finally { btn.disabled = false; btn.textContent = t("login.submit"); }
  });

  // tabs (ook met pijltjestoetsen)
  const TABS = ["overview", "downloads", "settings"];
  let current = "overview";
  function selectTab(name, focus) {
    current = name;
    for (const n of TABS) {
      const b = $(`tab-${n}`);
      b.setAttribute("aria-selected", String(n === name));
      b.tabIndex = n === name ? 0 : -1;
      $(`view-${n}`).classList.toggle("hidden", n !== name);
    }
    if (focus) $(`tab-${name}`).focus();
    history.replaceState(null, "", name === "overview" ? location.pathname : `#${name}`);
    if (name === "overview") { if (!stats) loadStats(); else renderInsights(); }
    if (name === "downloads" && !builds) loadBuilds();
    if (name === "settings") renderSession();
    window.scrollTo(0, 0);
  }
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) selectTab(b.dataset.tab, false);
  });
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    const i = TABS.indexOf(current);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      selectTab(TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length], true);
    }
  });

  // ---------- Overzicht ----------
  // stats {days, offset}: de kengetallen en verdelingen gaan over nu; per_day/summary over de gekozen periode.
  const RANGES = [7, 30, 90, 365];
  const RANGE_KEY = { 7: "ins.week", 30: "ins.month", 90: "ins.quarter", 365: "ins.year" };
  const RETENTION = 400;   // dagen (docs/CONTRACT.md): offset * days ≤ 400
  const range = { days: RANGES.includes(Number(store.get(RKEY))) ? Number(store.get(RKEY)) : 30, offset: 0 };
  const vis = { active: true, new: true };
  const statsCache = new Map();   // "days:offset" -> {at, data}; 5 minuten
  let stats = null, statsAt = null, timer = 0, lastPd0 = null, reqSeq = 0;

  async function loadStats(force) {
    const key = `${range.days}:${range.offset}`;
    const hit = statsCache.get(key);
    renderRangeControls();
    if (force !== true && hit && Date.now() - hit.at < 5 * 60_000) {
      setStats(hit.data, new Date(hit.at));
      return;
    }
    const btn = $("refresh"), plot = $("insPlot");
    const seq = ++reqSeq;
    btn.classList.add("busy"); btn.disabled = true;
    plot.classList.add("loading");
    if (!stats) { renderKpiSkeleton(); $("updated").textContent = t("ov.loading"); }
    try {
      const data = await call("stats", { days: range.days, offset: range.offset });
      if (seq !== reqSeq) return;   // intussen een andere periode gekozen
      statsCache.set(key, { at: Date.now(), data });
      $("ovErr").classList.add("hidden");
      setStats(data, new Date());
    } catch (e) {
      if (seq !== reqSeq || e.code === "auth") return;
      $("ovErr").textContent = errText(e);
      $("ovErr").classList.remove("hidden");
      if (!stats) $("updated").textContent = "";
    } finally {
      if (seq === reqSeq) { btn.classList.remove("busy"); btn.disabled = false; plot.classList.remove("loading"); }
    }
    clearInterval(timer);
    // elke 5 minuten vernieuwen zolang het overzicht zichtbaar is
    timer = setInterval(() => { if (current === "overview" && !document.hidden && session()) loadStats(true); }, 5 * 60_000);
  }
  function setStats(data, at) {
    const swap = !!stats && stats !== data;
    stats = data; statsAt = at;
    const r = data.range || {};
    if (!r.offset && Array.isArray(data.per_day)) lastPd0 = data.per_day;
    renderStats(swap);
  }
  $("refresh").addEventListener("click", () => { statsCache.clear(); loadStats(true); });

  const ICON = {
    users: '<path d="M16 19c0-2.8-2.2-5-5-5H8c-2.8 0-5 2.2-5 5"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M21 19c0-2.4-1.6-4.4-3.8-4.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/>',
    today: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    week: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    month: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    car: '<path d="M5 17h14M4 17v-4l2-5h12l2 5v4M4 13h16"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  };
  const ic = (k) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

  function renderKpiSkeleton() {
    $("kpis").innerHTML = Array.from({ length: 7 }, (_, i) => `<div class="kpi skel${i === 0 ? " hero" : ""}"><div class="l">&nbsp;</div><div class="v">0</div><div class="s">&nbsp;</div></div>`).join("");
  }

  function renderStats(swap) {
    if (!stats) return;
    const s = stats, tt = s.totals || {}, pd0 = lastPd0 || [];
    $("updated").textContent = t("ov.updated", { t: time(statsAt || new Date()) });
    const avg7 = Math.round(((tt.new_7d || 0) / 7) * 10) / 10;
    const yesterdayNew = pd0.length >= 2 ? pd0[pd0.length - 2].new : 0;
    const tiles = [
      { k: "installs", i: "users", v: tt.installs, s: t("k.plus7", { n: nf(tt.new_7d || 0) }), hero: true },
      { k: "active_today", i: "today", v: tt.active_today, s: t("k.ofTotal", { p: pct(tt.active_today, tt.installs) }) },
      { k: "active_7d", i: "week", v: tt.active_7d, s: t("k.ofTotal", { p: pct(tt.active_7d, tt.installs) }) },
      { k: "active_30d", i: "month", v: tt.active_30d, s: t("k.ofTotal", { p: pct(tt.active_30d, tt.installs) }) },
      { k: "new_today", i: "spark", v: tt.new_today, s: t("k.yesterday", { n: nf(yesterdayNew) }) },
      { k: "new_7d", i: "plus", v: tt.new_7d, s: t("k.perDay", { n: nf(avg7) }) },
      { k: "carplay", i: "car", v: tt.carplay, s: t("k.ofTotal", { p: pct(tt.carplay, tt.installs) }) },
    ];
    const box = $("kpis");
    box.removeAttribute("aria-busy");
    box.innerHTML = tiles.map((x) => `<div class="kpi${x.hero ? " hero" : ""}">
      <div class="l">${ic(x.i)}<span>${esc(t(`k.${x.k}`))}</span></div>
      <div class="v">${nf(x.v || 0)}</div><div class="s">${esc(x.s)}</div>${x.hero ? '<svg class="spark" aria-hidden="true"></svg>' : ""}</div>`).join("");
    sparkline(document.querySelector(".kpi.hero .spark"), pd0.slice(-30).map((d) => d.active));
    renderInsights(swap ? "swap" : "anim");
    renderDist("distPlatforms", s.platforms, tt.installs, "platform");
    renderDist("distDevices", s.devices, tt.installs, "device");
    renderDist("distVersions", s.versions, tt.active_30d, "version");
    renderDist("distCountries", s.countries, tt.active_30d, "country");
    renderDist("distLangs", s.langs, tt.active_30d, "lang");
    renderPresskit(s.presskit);
  }

  // ---------- PressKit (stats.presskit) ----------
  const PK_ZIP = "https://tunr.online/presskit/Tunr-PressKit.zip";
  function renderPresskit(pk) {
    const box = $("pkBody"), link = $("pkLink");
    const ok = pk && typeof pk === "object";
    const url = ok && typeof pk.url === "string" && pk.url.startsWith(PK_ZIP) ? pk.url : PK_ZIP;
    link.href = url;
    if (!ok) { box.innerHTML = `<p class="none">${esc(t("d.none"))}</p>`; return; }
    const perDay = Array.isArray(pk.per_day) ? pk.per_day.filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.day)) : [];
    const perVer = Array.isArray(pk.per_version) ? pk.per_version.filter((v) => v && (v.count || 0) > 0) : [];
    const sum30 = perDay.reduce((a, d) => a + (Number(d.count) || 0), 0);
    const max30 = Math.max(0, ...perDay.map((d) => Number(d.count) || 0));
    const facts = pk.available
      ? `<div class="pk-ver"><b>${esc(pk.version)}</b>${(pk.platforms || []).map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>
        <dl class="pk-dl">
          <dt>${esc(t("pk.date"))}</dt><dd>${esc(fmtWhen(pk.date) || "—")}</dd>
          <dt>${esc(t("pk.size"))}</dt><dd>${esc(fmtSize(pk.size) || "—")}</dd>
          <dt>${esc(t("pk.files"))}</dt><dd>${esc(t("pk.filesN", { n: nf(pk.files || 0) }))}</dd>
        </dl>`
      : `<p class="pk-none">${esc(t("pk.none"))}</p>`;
    const verRows = perVer.length
      ? perVer.map((v) => {
        const max = Math.max(...perVer.map((x) => x.count || 0), 1);
        const cur = pk.available && v.version === pk.version;
        return `<div class="drow">
          <div class="k"><span>${esc(v.version || t("pk.unknown"))}</span>${cur ? `<span class="chip">${esc(t("pk.current"))}</span>` : ""}</div>
          <div class="n">${nf(v.count || 0)}<small>${pct(v.count || 0, Math.max(pk.downloads_total || 0, 1))}</small></div>
          <div class="track"><div class="fill" data-w="${((v.count || 0) / max) * 100}"></div></div></div>`;
      }).join("")
      : `<p class="none">${esc(t("pk.noDl"))}</p>`;
    box.innerHTML = `<div class="pk-facts">${facts}
        <div class="pk-nums">
          <div class="pk-num"><span>${esc(t("pk.total"))}</span><b>${nf(pk.downloads_total || 0)}</b></div>
          <div class="pk-num"><span>${esc(t("pk.d30"))}</span><b>${nf(pk.downloads_30d || 0)}</b></div>
        </div></div>
      <div class="pk-chart"><h3>${esc(t("pk.perDay"))}<span class="muted">${esc(t("pk.days30"))}</span></h3>
        <div id="pkPlot" class="pk-plot" role="img" aria-label="${esc(t("pk.chart", { n: nf(sum30) }))}">${max30 ? `<span class="pk-max">${nf(max30)}</span>` : ""}</div>
        <div class="pk-axis"><span>${perDay.length ? esc(fmtDay(perDay[0].day, { day: "numeric", month: "short" })) : ""}</span><span>${esc(t("pk.today"))}</span></div></div>
      <div class="pk-vers"><h3>${esc(t("pk.perVersion"))}</h3><div class="dist">${verRows}</div></div>`;
    pkBars($("pkPlot"), perDay);
    requestAnimationFrame(() => box.querySelectorAll(".fill").forEach((f) => { f.style.width = `${f.dataset.w}%`; }));
  }
  /** Staafjes per dag (inline SVG, schaalt mee; titel per staaf als tooltip). */
  function pkBars(plot, data) {
    if (!plot) return;
    const n = data.length, W = 300, H = 100;
    const max = Math.max(1, ...data.map((d) => Number(d.count) || 0));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" }, plot);
    el("line", { x1: 0, x2: W, y1: H - 0.5, y2: H - 0.5, class: "base" }, svg);
    if (!n) return;
    const slot = W / n, bw = Math.max(1, slot * 0.68);
    data.forEach((d, i) => {
      const c = Number(d.count) || 0;
      const h = c ? Math.max(3, (c / max) * (H - 6)) : 1.5;
      const r = el("rect", { x: (i * slot + (slot - bw) / 2).toFixed(2), y: (H - h).toFixed(2), width: bw.toFixed(2), height: h.toFixed(2), rx: Math.min(2, bw / 2), class: c ? "bar" : "bar zero" }, svg);
      el("title", {}, r).textContent = `${fmtDay(d.day, { weekday: "short", day: "numeric", month: "short" })}: ${nf(c)}`;
    });
  }

  // ---------- grafiek in de stijl van Homey Insights (inline SVG, geen bibliotheken) ----------
  const NS = "http://www.w3.org/2000/svg";
  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (parent) parent.appendChild(n);
    return n;
  };
  const SERIES = [
    { key: "active", label: "ins.active", kind: "line" },
    { key: "new", label: "ins.new", kind: "bar" },
  ];
  const DAY = 86_400_000;
  const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
  const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
  const todayIso = () => isoDay(Date.now());

  /** "18 sep – 17 okt 2026" (formatRange; NL zonder punten na de maand). */
  function periodLabel(from, to) {
    const f = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const a = new Date(dayMs(from)), b = new Date(dayMs(to));
    let s;
    try { s = f.formatRange(a, b); } catch { s = `${f.format(a)} – ${f.format(b)}`; }
    return lang === "nl" ? s.replace(/\./g, "") : s;
  }
  const fmtDay = (iso, o) => {
    const s = new Date(dayMs(iso)).toLocaleDateString(locale(), { ...o, timeZone: "UTC" });
    return lang === "nl" ? s.replace(/\./g, "") : s;
  };

  /** Periode van het antwoord, of berekend uit de keuze (als de server nog geen range stuurt). */
  function currentRange() {
    const r = (stats && stats.range) || {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(r.from || "") && /^\d{4}-\d{2}-\d{2}$/.test(r.to || "")) return r;
    const to = dayMs(todayIso()) - range.offset * range.days * DAY;
    return { from: isoDay(to - (range.days - 1) * DAY), to: isoDay(to), days: range.days, offset: range.offset };
  }
  /** Dagreeks van de periode, aangevuld met nullen voor ontbrekende dagen. */
  function seriesData() {
    const r = currentRange();
    const by = new Map((stats && Array.isArray(stats.per_day) ? stats.per_day : []).map((d) => [d.day, d]));
    const out = [];
    for (let ms = dayMs(r.from); ms <= dayMs(r.to); ms += DAY) {
      const day = isoDay(ms), d = by.get(day) || {};
      out.push({ day, active: Math.max(0, Number(d.active) || 0), new: Math.max(0, Number(d.new) || 0) });
    }
    return out;
  }
  function summaryOf(key, data) {
    const srv = stats && stats.summary && stats.summary[key];
    if (srv && typeof srv.max === "number") return srv;
    const v = data.map((d) => d[key]);
    if (!v.length) return { min: 0, max: 0, avg: 0, last: 0, total: 0 };
    const total = v.reduce((a, b) => a + b, 0);
    return { min: Math.min(...v), max: Math.max(...v), avg: Math.round((total / v.length) * 10) / 10, last: v[v.length - 1], total };
  }

  function renderRangeControls() {
    document.querySelectorAll("#insSeg [data-days]").forEach((b) => {
      const on = Number(b.dataset.days) === range.days;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    $("insNext").disabled = range.offset <= 0;
    $("insPrev").disabled = (range.offset + 1) * range.days > RETENTION;
    const r = currentRange();
    $("insPeriod").textContent = periodLabel(r.from, r.to);
  }
  function setRange(days, offset) {
    if (days === range.days && offset === range.offset) return;
    range.days = days; range.offset = Math.max(0, offset);
    store.set(RKEY, String(days));
    cross = -1;
    loadStats();
  }
  $("insSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-days]");
    if (b) setRange(Number(b.dataset.days), 0);
  });
  $("insPrev").addEventListener("click", () => { if (!$("insPrev").disabled) setRange(range.days, range.offset + 1); });
  $("insNext").addEventListener("click", () => { if (range.offset > 0) setRange(range.days, range.offset - 1); });

  function renderChips() {
    $("insChips").innerHTML = SERIES.map((s) => `<button type="button" class="chip-s s-${s.key}${vis[s.key] ? " on" : ""}" data-series="${s.key}" aria-pressed="${vis[s.key]}">
      <i class="sw" aria-hidden="true"></i><span>${esc(t(s.label))}</span></button>`).join("");
  }
  $("insChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-series]");
    if (!b) return;
    const k = b.dataset.series;
    if (vis[k] && SERIES.filter((s) => vis[s.key]).length === 1) { toast(t("ins.oneOn")); return; }
    vis[k] = !vis[k];
    renderInsights("anim");
  });

  /** Mooie schaal: ronde stap (1-2-2,5-5 × 10ⁿ, heel getal) met 2 … maxTicks stappen; de laagste top wint. */
  function niceScale(max, maxTicks) {
    if (!(max > 0)) return { top: 4, step: 1 };
    let best = null;
    for (let e = 1; e <= max * 10; e *= 10) {
      for (const k of [1, 2, 2.5, 5]) {
        const step = k * e, n = Math.max(1, Math.ceil(max / step));
        if (!Number.isInteger(step) || n > maxTicks || (n < 2 && max > 1)) continue;
        if (!best || n * step < best.top || (n * step === best.top && step > best.step)) best = { top: n * step, step };
      }
    }
    return best || { top: Math.ceil(max), step: Math.ceil(max) };
  }

  /** Vloeiende lijn die niet doorschiet (monotone cubic, zoals d3.curveMonotoneX). */
  function monotonePath(p) {
    const n = p.length;
    if (!n) return "";
    if (n === 1) return `M${p[0][0]},${p[0][1]}`;
    const s = [], h = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = p[i + 1][0] - p[i][0]; s[i] = (p[i + 1][1] - p[i][1]) / (h[i] || 1); }
    m[0] = s[0]; m[n - 1] = s[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (s[i - 1] * s[i] <= 0) { m[i] = 0; continue; }
      const q = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
      m[i] = (Math.sign(s[i - 1]) + Math.sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(q));
    }
    const f = (v) => Math.round(v * 10) / 10;
    let d = `M${f(p[0][0])},${f(p[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const dx = h[i] / 3;
      d += `C${f(p[i][0] + dx)},${f(p[i][1] + m[i] * dx)} ${f(p[i + 1][0] - dx)},${f(p[i + 1][1] - m[i + 1] * dx)} ${f(p[i + 1][0])},${f(p[i + 1][1])}`;
    }
    return d;
  }

  /** Indexen met een datumlabel: dunner naarmate de periode langer en de grafiek smaller is. */
  function xTickIdx(data, pw) {
    const n = data.length, fit = Math.max(2, Math.floor(pw / 64));
    if (range.days >= 365) {
      const starts = data.map((d, i) => (d.day.endsWith("-01") ? i : -1)).filter((i) => i >= 0);
      const k = [1, 2, 3, 4, 6].find((x) => Math.ceil(starts.length / x) <= fit) || 6;
      return { idx: starts.filter((_, j) => j % k === 0), fmt: (iso) => (iso.slice(5, 7) === "01" ? iso.slice(0, 4) : fmtDay(iso, { month: "short" })) };
    }
    if (range.days >= 90) {
      const mondays = data.map((d, i) => (new Date(dayMs(d.day)).getUTCDay() === 1 ? i : -1)).filter((i) => i >= 0);
      const k = [1, 2, 3, 4].find((x) => Math.ceil(mondays.length / x) <= fit) || 4;
      return { idx: mondays.filter((_, j) => j % k === 0), fmt: (iso) => fmtDay(iso, { day: "numeric", month: "short" }) };
    }
    const step = [1, 2, 3, 5, 7, 10, 14].find((x) => Math.ceil(n / x) <= fit) || 14;
    const idx = [];
    for (let i = n - 1; i >= 0; i -= step) idx.unshift(i);
    return { idx, fmt: range.days === 7 && step === 1 ? (iso) => fmtDay(iso, { weekday: "short", day: "numeric" }) : (iso) => fmtDay(iso, { day: "numeric", month: "short" }) };
  }

  let chart = null;   // laatste tekening: {data, xs, panels, svg, …} voor de kruisdraad
  let cross = -1;     // index van de kruisdraad (-1 = verborgen)

  function renderInsights(mode) {
    if (!stats || current !== "overview") return;
    renderRangeControls();
    renderChips();
    const plot = $("insPlot");
    if (mode === "swap") {
      plot.classList.add("swap");
      setTimeout(() => { drawInsights(true); requestAnimationFrame(() => plot.classList.remove("swap")); }, 160);
    } else {
      drawInsights(mode === "anim");
      plot.classList.remove("swap");
    }
    renderSummary();
  }

  function drawInsights(animate) {
    const plot = $("insPlot"), tip = $("insTip");
    plot.querySelectorAll("svg").forEach((n) => n.remove());
    const data = seriesData(), n = data.length;
    const shown = SERIES.filter((s) => vis[s.key]);
    const W = Math.max(plot.clientWidth, 240), H = Math.max(plot.clientHeight, 160);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: animate ? "anim" : "", "aria-hidden": "true" });
    plot.insertBefore(svg, tip);
    if (!n) {
      el("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "empty" }, svg).textContent = t("c.none");
      chart = null;
      return;
    }

    // panelen onder elkaar (één schaal per paneel, gedeelde tijdas): actief boven, nieuw onder
    const capH = 20, gapH = 14, xAxisH = 26, top = 2;
    const both = shown.length === 2;
    const avail = H - top - xAxisH - capH * shown.length - (both ? gapH : 0);
    const heights = both ? [Math.round(avail * 0.64), avail - Math.round(avail * 0.64)] : [avail];
    const scales = shown.map((s, i) => {
      const mx = Math.max(0, ...data.map((d) => d[s.key])) * 1.05;
      return niceScale(mx, mx <= 12 ? 5 : Math.max(3, Math.min(5, Math.floor(heights[i] / 38))));
    });
    const labelW = Math.max(...scales.map((sc) => nf(sc.top).length)) * 7 + 14;
    const m = { l: Math.max(30, labelW), r: 10 };
    const pw = W - m.l - m.r, slot = pw / n;
    const xs = data.map((_, i) => m.l + slot * (i + 0.5));

    const defs = el("defs", {}, svg);
    const lg = el("linearGradient", { id: "insLine", gradientUnits: "userSpaceOnUse", x1: m.l, x2: W - m.r, y1: 0, y2: 0 }, defs);
    el("stop", { offset: 0, "stop-color": "#FF5A1F" }, lg);
    el("stop", { offset: 1, "stop-color": "#FFB020" }, lg);

    let y0 = top;
    const panels = shown.map((s, pi) => {
      const sc = scales[pi], h = heights[pi];
      const py = y0 + capH, base = py + h;
      const y = (v) => base - (v / sc.top) * h;
      const g = el("g", { class: `pnl p-${s.key}` }, svg);
      el("text", { x: m.l, y: y0 + 13, class: "cap" }, g).textContent = t(s.label);
      for (let v = 0; v <= sc.top + 1e-9; v += sc.step) {
        const yy = Math.round(y(v)) + 0.5;
        el("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: v === 0 ? "base" : "grid" }, g);
        el("text", { x: m.l - 10, y: yy + 3.5, "text-anchor": "end", class: "axis" }, g).textContent = nf(v);
      }
      const pts = data.map((d, i) => [xs[i], y(d[s.key])]);
      let bars = null;
      if (s.kind === "line") {
        const ag = el("linearGradient", { id: "insArea", gradientUnits: "userSpaceOnUse", x1: 0, x2: 0, y1: py, y2: base }, defs);
        el("stop", { offset: 0, "stop-color": "#FF7A1F", "stop-opacity": 0.28 }, ag);
        el("stop", { offset: 0.55, "stop-color": "#FF5A1F", "stop-opacity": 0.08 }, ag);
        el("stop", { offset: 1, "stop-color": "#FF5A1F", "stop-opacity": 0 }, ag);
        const line = monotonePath(pts);
        if (n > 1) el("path", { d: `${line}L${xs[n - 1].toFixed(1)},${base}L${xs[0].toFixed(1)},${base}Z`, class: "area" }, g);
        el("path", { d: line, class: "line", pathLength: 1 }, g);
        if (n <= 31) {
          // punten als er weinig dagen zijn (zoals Insights bij een week)
          const dots = el("g", { class: "pts" }, g);
          pts.forEach((p) => el("circle", { cx: p[0], cy: p[1], r: n <= 7 ? 3.5 : 2 }, dots));
        }
        el("circle", { cx: pts[n - 1][0], cy: pts[n - 1][1], r: 4, class: "endpt" }, g);
      } else {
        const gap = slot >= 4 ? Math.min(6, Math.max(1, slot * 0.3)) : 0;
        const bw = Math.min(40, Math.max(0.6, slot - gap));
        const bg = el("g", { class: "bars" }, g);
        bars = data.map((d, i) => {
          const bh = base - y(d[s.key]);
          if (bh <= 0) return null;
          const x = xs[i] - bw / 2, yt = base - bh, r = Math.min(3, bw / 2, bh);
          const dd = r >= 1
            ? `M${x},${base}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + bw - r}Q${x + bw},${yt} ${x + bw},${yt + r}V${base}Z`
            : `M${x},${base}V${yt}H${x + bw}V${base}Z`;
          return el("path", { d: dd, class: "bar" }, bg);
        });
      }
      y0 = base + gapH;
      return { s, y, py, base, pts, bars, g };
    });

    // tijdas
    const last = panels[panels.length - 1];
    const tk = xTickIdx(data, pw);
    tk.idx.forEach((i) => {
      const x = xs[i];
      const anchor = x - m.l < 22 ? "start" : W - m.r - x < 22 ? "end" : "middle";
      el("line", { x1: Math.round(x) + 0.5, x2: Math.round(x) + 0.5, y1: last.base, y2: last.base + 4, class: "tick" }, svg);
      el("text", { x, y: last.base + 18, "text-anchor": anchor, class: "axis" }, svg).textContent = tk.fmt(data[i].day);
    });

    // kruisdraad (verticale lijn, punt per reeks); vangvlak over de hele grafiek
    const ch = el("g", { class: "cross", visibility: "hidden" }, svg);
    const vline = el("line", { y1: panels[0].py - 4, y2: last.base, class: "vline" }, ch);
    const dots = panels.map((p) => el("circle", { r: p.s.kind === "line" ? 5.5 : 4, class: `cdot c-${p.s.key}` }, ch));
    chart = { data, xs, panels, svg, vline, dots, ch, m, pw, slot, W };
    el("rect", { x: m.l, y: 0, width: pw, height: last.base, class: "hit" }, svg);

    plot.setAttribute("aria-valuemax", String(n - 1));
    plot.setAttribute("aria-label", t("ins.plot", { p: periodLabel(data[0].day, data[n - 1].day) }));
    if (cross >= n) cross = n - 1;
    if (cross >= 0) showCross(cross); else hideCross();
  }

  function showCross(i) {
    const c = chart;
    if (!c) return;
    i = Math.max(0, Math.min(c.data.length - 1, i));
    cross = i;
    const x = c.xs[i], d = c.data[i];
    c.vline.setAttribute("x1", x); c.vline.setAttribute("x2", x);
    c.panels.forEach((p, j) => {
      c.dots[j].setAttribute("cx", x);
      c.dots[j].setAttribute("cy", p.pts[i][1]);
      c.dots[j].setAttribute("visibility", p.s.kind === "bar" && !d[p.s.key] ? "hidden" : "visible");
      if (p.bars) {
        p.g.classList.add("hovering");
        p.bars.forEach((b, k) => b && b.classList.toggle("on", k === i));
      }
    });
    c.ch.setAttribute("visibility", "visible");
    const tip = $("insTip");
    const today = d.day === todayIso() ? ` <em>${esc(t("ins.today"))}</em>` : "";
    tip.innerHTML = `<div class="tt-d">${esc(fmtDay(d.day, { weekday: "short", day: "numeric", month: "long", year: "numeric" }))}${today}</div>` +
      c.panels.map((p) => `<div class="tt-r s-${p.s.key}"><i class="sw"></i><span>${esc(t(p.s.label))}</span><b>${nf(d[p.s.key])}</b></div>`).join("");
    tip.classList.remove("hidden");
    const tw = tip.offsetWidth, plotW = $("insPlot").clientWidth;
    let left = x + 14;
    if (left + tw > plotW - 4) left = x - tw - 14;
    if (left < c.m.l) left = Math.min(plotW - tw - 4, x + 14);   // niet over de aslabels
    tip.style.left = `${Math.max(c.m.l, left)}px`;
    tip.style.top = `${Math.max(0, c.panels[0].py - 2)}px`;
    const plot = $("insPlot");
    plot.setAttribute("aria-valuenow", String(i));
    plot.setAttribute("aria-valuetext", `${fmtDay(d.day, { weekday: "long", day: "numeric", month: "long" })}: ${c.panels.map((p) => `${t(p.s.label)} ${nf(d[p.s.key])}`).join(", ")}`);
  }
  function hideCross() {
    cross = -1;
    $("insTip").classList.add("hidden");
    if (!chart) return;
    chart.ch.setAttribute("visibility", "hidden");
    chart.panels.forEach((p) => p.bars && p.g.classList.remove("hovering"));
  }

  // aanwijzen / slepen (muis, pen, touch). Touch: horizontaal slepen beweegt de kruisdraad, verticaal scrolt de pagina.
  const plotEl = $("insPlot");
  const idxAt = (ev) => {
    if (!chart) return -1;
    const r = chart.svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * chart.W;
    if (px < chart.m.l - 8 || px > chart.m.l + chart.pw + 8) return -2;
    return Math.max(0, Math.min(chart.data.length - 1, Math.floor((px - chart.m.l) / chart.slot)));
  };
  const onPoint = (ev) => {
    const i = idxAt(ev);
    if (i >= 0) { if (i !== cross) showCross(i); } else if (i === -2 && ev.pointerType === "mouse") hideCross();
  };
  plotEl.addEventListener("pointermove", onPoint);
  plotEl.addEventListener("pointerdown", onPoint);
  plotEl.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse" && document.activeElement !== plotEl) hideCross(); });
  document.addEventListener("pointerdown", (ev) => { if (ev.pointerType !== "mouse" && cross >= 0 && !plotEl.contains(ev.target)) hideCross(); });
  // toetsenbord: pijltjes per dag, Shift per week, Home/End, Esc verbergt
  plotEl.addEventListener("focus", () => { if (chart && cross < 0) showCross(chart.data.length - 1); });
  plotEl.addEventListener("blur", hideCross);
  plotEl.addEventListener("keydown", (e) => {
    if (!chart) return;
    const n = chart.data.length, i = cross < 0 ? n - 1 : cross, step = e.shiftKey ? 7 : 1;
    const to = { ArrowLeft: i - step, ArrowRight: i + step, ArrowDown: i - step, ArrowUp: i + step, Home: 0, End: n - 1, PageUp: i - 30, PageDown: i + 30 }[e.key];
    if (to !== undefined) { e.preventDefault(); showCross(to); } else if (e.key === "Escape" && cross >= 0 && !full) { e.preventDefault(); hideCross(); }
  });

  function renderSummary() {
    const data = seriesData();
    const cells = (k) => {
      const sm = summaryOf(k, data);
      const items = [["ins.min", sm.min], ["ins.max", sm.max], ["ins.avg", sm.avg], ["ins.last", sm.last]];
      if (k === "new") items.push(["ins.total", typeof sm.total === "number" ? sm.total : data.reduce((a, d) => a + d.new, 0)]);
      return items.map(([l, v]) => `<div class="sc"><dt>${esc(t(l))}</dt><dd>${nf(v)}</dd></div>`).join("");
    };
    $("insSum").innerHTML = SERIES.filter((s) => vis[s.key]).map((s) => `<section class="sum s-${s.key}">
      <h3><i class="sw" aria-hidden="true"></i>${esc(t(s.label))}</h3><dl>${cells(s.key)}</dl></section>`).join("");
  }

  // volledig scherm (vergroten); Esc of klik op de achtergrond sluit
  let full = false;
  function openFull() {
    full = true;
    $("ins").classList.add("full");
    $("insBackdrop").classList.remove("hidden");
    document.body.classList.add("noscroll");
    $("insExpand").setAttribute("aria-pressed", "true");
    $("insExpand").setAttribute("aria-label", t("ins.close"));
    renderInsights();
  }
  function closeFull() {
    if (!full) return;
    full = false;
    $("ins").classList.remove("full");
    $("insBackdrop").classList.add("hidden");
    document.body.classList.remove("noscroll");
    $("insExpand").setAttribute("aria-pressed", "false");
    $("insExpand").setAttribute("aria-label", t("ins.expand"));
    renderInsights();
    $("insExpand").focus();
  }
  $("insExpand").addEventListener("click", () => (full ? closeFull() : openFull()));
  $("insBackdrop").addEventListener("click", closeFull);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && full) { e.preventDefault(); closeFull(); } });

  function sparkline(svg, data) {
    if (!svg || data.length < 2) return;
    const W = svg.clientWidth || 160, H = svg.clientHeight || 48;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const max = Math.max(1, ...data);
    const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - 3 - (v / max) * (H - 6)]);
    const d = monotonePath(pts);
    const defs = el("defs", {}, svg);
    const g = el("linearGradient", { id: "sparkFill", x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": "#FFB020", "stop-opacity": 0.35 }, g);
    el("stop", { offset: 1, "stop-color": "#FFB020", "stop-opacity": 0 }, g);
    el("path", { d: `${d}L${W},${H}L0,${H}Z`, fill: "url(#sparkFill)" }, svg);
    el("path", { d, fill: "none", stroke: "#FFB020", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  }

  function renderCharts() {
    if (!stats || current !== "overview") return;
    drawInsights(false);
    const pd0 = lastPd0 || [];
    const sp = document.querySelector(".kpi.hero .spark");
    if (sp) { sp.textContent = ""; sparkline(sp, pd0.slice(-30).map((d) => d.active)); }
  }
  let rz = 0, lastW = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { if (window.innerWidth !== lastW || full) { lastW = window.innerWidth; renderCharts(); } }, 120);
  });

  // ---------- verdelingen ----------
  const PLATFORM = { ios: "iPhone", ipados: "iPad", macos: "Mac", tvos: "Apple TV", android: "Android", androidtv: "Android TV", web: "Web" };
  const DEVICE_EN = { "Android-telefoon": "Android phone", "Android-tablet": "Android tablet" };
  const flag = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "");
  function dn(type, code) {
    try { return new Intl.DisplayNames([locale()], { type }).of(code) || code; } catch { return code; }
  }
  function label(kind, key) {
    if (!key || key === "?") return { text: t("d.unknown") };
    if (kind === "platform") return { text: PLATFORM[key] || key };
    if (kind === "device") return { text: lang === "en" ? DEVICE_EN[key] || key : key };
    if (kind === "country") return { text: dn("region", key), flag: flag(key), chip: key };
    if (kind === "lang") return { text: dn("language", key), chip: key.toUpperCase() };
    return { text: key };
  }
  function renderDist(id, rows, total, kind) {
    const box = $(id);
    rows = Array.isArray(rows) ? rows : [];
    const sum = rows.reduce((a, r) => a + (r.installs || 0), 0);
    const denom = Math.max(total || 0, sum);
    if (!rows.length || !denom) { box.innerHTML = `<p class="none">${esc(t("d.none"))}</p>`; return; }
    const max = Math.max(...rows.map((r) => r.installs || 0), 1);
    box.innerHTML = rows.map((r) => {
      const l = label(kind, r.key);
      return `<div class="drow">
        <div class="k">${l.flag ? `<span class="flag" aria-hidden="true">${l.flag}</span>` : ""}<span>${esc(l.text)}</span>${l.chip ? `<span class="chip">${esc(l.chip)}</span>` : ""}</div>
        <div class="n">${nf(r.installs || 0)}<small>${pct(r.installs || 0, denom)}</small></div>
        <div class="track"><div class="fill" data-w="${((r.installs || 0) / max) * 100}"></div></div>
        ${typeof r.active_30d === "number" ? `<div class="sub">${esc(t("d.active30", { n: nf(r.active_30d) }))}</div>` : ""}
      </div>`;
    }).join("");
    requestAnimationFrame(() => box.querySelectorAll(".fill").forEach((f) => { f.style.width = `${f.dataset.w}%`; }));
  }

  // ---------- Downloads ----------
  let builds = null;
  async function loadBuilds() {
    const btn = $("dlRefresh");
    btn.classList.add("busy"); btn.disabled = true;
    try {
      builds = await call("builds");
      $("dlErr").classList.add("hidden");
      renderBuilds();
    } catch (e) {
      if (e.code === "auth") return;
      $("dlErr").textContent = errText(e);
      $("dlErr").classList.remove("hidden");
      $("builds").textContent = "";
    } finally { btn.classList.remove("busy"); btn.disabled = false; }
  }
  $("dlRefresh").addEventListener("click", loadBuilds);

  const PICON = {
    apple: '<path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8C7 7.4 5.6 8.3 4.8 9.7c-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6 0 0-2.5-1-2.5-3.7zM14.1 5.8c.6-.8 1.1-1.8 1-2.8-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2-.5 2.6-1.3z"/>',
    android: '<rect x="5" y="9" width="14" height="10" rx="2"/><path d="M8 9a4 4 0 0 1 8 0M8 5 6.5 3M16 5l1.5-2M3 11v5M21 11v5M9 19v2M15 19v2"/><circle cx="10" cy="7" r=".6"/><circle cx="14" cy="7" r=".6"/>',
    beheer: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  };
  const DL_ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M4 20h16"/></svg>';
  function notesHtml(md) {
    const lines = String(md || "").replace(/\r/g, "").split("\n");
    let html = "", inList = false;
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
    for (const raw of lines) {
      const l = raw.trim();
      const li = /^[-*•]\s+(.*)$/.exec(l);
      if (li) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
      if (inList) { html += "</ul>"; inList = false; }
      if (!l) continue;
      const h = /^#{1,6}\s+(.*)$/.exec(l);
      html += h ? `<h4>${inline(h[1])}</h4>` : `<p>${inline(l)}</p>`;
    }
    return inList ? `${html}</ul>` : html;
  }
  function renderBuilds() {
    const box = $("builds");
    box.removeAttribute("aria-busy");
    if (!builds) return;
    if (!builds.ready) {
      $("dlErr").textContent = t("dl.notReady");
      $("dlErr").classList.remove("hidden");
    } else if (builds.reason === "unreachable") {
      $("dlErr").textContent = t("dl.unreachable");
      $("dlErr").classList.remove("hidden");
    } else $("dlErr").classList.add("hidden");
    const P = builds.platforms || {};
    box.innerHTML = ["apple", "android", "beheer"].map((p) => {
      const list = Array.isArray(P[p]) ? P[p] : [];
      const head = `<div class="bh"><div class="bi"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${PICON[p]}</svg></div>
        <div><h2>${esc(t(`dl.${p}`))}</h2><p>${esc(t(`dl.${p}Sub`))}</p></div></div>`;
      if (!list.length) return `<article class="card bcard">${head}<div class="bempty">${esc(t("dl.empty"))}</div></article>`;
      const [b, ...older] = list;
      const meta = [fmtWhen(b.date), fmtSize(b.size)].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("");
      return `<article class="card bcard">${head}
        <div class="latest">
          <div class="ver"><b>${esc(b.version || "?")}</b><span class="muted">${esc(t("dl.build", { n: b.build }))}</span><span class="pill">${esc(t("dl.latest"))}</span></div>
          <div class="meta">${meta}</div>
          ${b.sha256 ? `<button class="sha" type="button" data-sha="${esc(b.sha256)}" title="${esc(t("dl.shaTitle"))}">sha256 ${esc(b.sha256.slice(0, 16))}…</button>` : ""}
          ${b.notes ? `<div class="notes">${notesHtml(b.notes)}</div>` : ""}
          <button class="btn" type="button" data-dl="${esc(p)}" data-file="${esc(b.file)}">${DL_ICON}<span>${esc(t("dl.download"))}</span></button>
        </div>
        ${older.length ? `<div class="older"><h3>${esc(t("dl.older"))}</h3><ul>${older.map((o) => `<li>
          <div class="o"><b>${esc(o.version || "?")} · ${esc(t("dl.build", { n: o.build }))}</b><small>${esc([fmtWhen(o.date), fmtSize(o.size)].filter(Boolean).join(" · "))}</small></div>
          <button class="linkbtn" type="button" data-dl="${esc(p)}" data-file="${esc(o.file)}" aria-label="${esc(`${t("dl.download")} ${o.file}`)}">${DL_ICON}<span>${esc(t("dl.download"))}</span></button>
        </li>`).join("")}</ul></div>` : ""}
      </article>`;
    }).join("");
  }
  $("builds").addEventListener("click", async (e) => {
    const sha = e.target.closest("[data-sha]");
    if (sha) {
      try { await navigator.clipboard.writeText(sha.dataset.sha); toast(t("dl.copied")); } catch { /* geen klembord */ }
      return;
    }
    const b = e.target.closest("[data-dl]");
    if (!b || b.disabled) return;
    b.disabled = true;
    try {
      const r = await call("build_link", { platform: b.dataset.dl, file: b.dataset.file });
      if (typeof r.url === "string" && r.url.startsWith("https://beheer.tunr.online/dl.php?")) {
        window.location.assign(r.url);
        toast(t("dl.started", { f: r.file || b.dataset.file }));
      }
    } catch (err) {
      if (err.code !== "auth") toast(errText(err));
    } finally { setTimeout(() => { b.disabled = false; }, 1200); }
  });

  // ---------- Instellingen ----------
  function renderSession() {
    const s = session();
    if (!s) return;
    const left = Math.max(0, Date.parse(s.expires) - Date.now());
    const h = Math.floor(left / 3600_000), m = Math.round((left % 3600_000) / 60_000);
    const r = h >= 1 ? t("u.h", { n: h }) : t("u.m", { n: m });
    $("sessionInfo").textContent = t("set.until", { t: time(new Date(s.expires)), r });
  }
  $("logout").addEventListener("click", () => logout(t("msg.loggedOut")));
  $("logoutAll").addEventListener("click", async () => {
    if (!window.confirm(t("set.confirmAll"))) return;
    const b = $("logoutAll");
    b.disabled = true;
    try {
      await call("logout_all");
      logout(t("msg.allOut"));
    } catch (e) {
      if (e.code !== "auth") $("setMsg").textContent = errText(e);
    } finally { b.disabled = false; }
  });

  let toastT = 0;
  function toast(msg) {
    const n = $("toast");
    n.textContent = msg;
    n.classList.remove("hidden");
    clearTimeout(toastT);
    toastT = setTimeout(() => n.classList.add("hidden"), 3200);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !session()) return;
    if (current === "overview" && statsAt && Date.now() - statsAt.getTime() > 5 * 60_000) loadStats();
  });

  // ---------- start ----------
  applyLang();
  if (READY && session()) showApp();
  else showLogin();
})();
