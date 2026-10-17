// BeheerTunr dashboard: praat alleen met de Edge Function `admin` (docs/CONTRACT.md). Token (12 uur) in sessionStorage.
// Geen externe bibliotheken; grafieken als inline SVG. CSP: geen inline styles, breedtes via element.style.
(() => {
  "use strict";
  const CFG = window.BEHEER || {};
  const READY = typeof CFG.url === "string" && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(CFG.url) && !!CFG.key;
  const FN = READY ? `${CFG.url.replace(/\/+$/, "")}/functions/v1/admin` : "";
  const SKEY = "tunrBeheer.session", LKEY = "tunrBeheer.lang";
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
      "ov.activePerDay": "Actief per dag", "ov.newPerDay": "Nieuw per dag", "ov.last30": "laatste 30 dagen",
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
      "e.unknown_action": "Onbekende actie: vernieuw de pagina.", "e.forbidden": "Geweigerd.",
      "u.h": "{n} uur", "u.m": "{n} min",
    },
    en: {
      "brand.tag": "Admin", "login.title": "Sign in", "login.user": "Username", "login.pass": "Password", "login.submit": "Sign in",
      "login.busy": "Signing in…", "login.missing": "Enter your username and password.",
      "setup.title": "Not set up yet",
      "setup.text": "Tunr's Supabase project isn't linked yet. Put the public URL and the publishable key in web/config.js and publish the dashboard again.",
      "tab.overview": "Overview", "tab.downloads": "Downloads", "tab.settings": "Settings",
      "ov.refresh": "Refresh", "ov.updated": "Updated at {t}", "ov.loading": "Loading…",
      "ov.activePerDay": "Active per day", "ov.newPerDay": "New per day", "ov.last30": "last 30 days",
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
      "e.unknown_action": "Unknown action: reload the page.", "e.forbidden": "Refused.",
      "u.h": "{n} h", "u.m": "{n} min",
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
    stats = null; builds = null;
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
    if (name === "overview") { if (!stats) loadStats(); else renderCharts(); }
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
  let stats = null, statsAt = null, timer = 0;
  async function loadStats() {
    const btn = $("refresh");
    btn.classList.add("busy"); btn.disabled = true;
    if (!stats) { renderKpiSkeleton(); $("updated").textContent = t("ov.loading"); }
    try {
      stats = await call("stats", { days: 30 });
      statsAt = new Date();
      $("ovErr").classList.add("hidden");
      renderStats();
    } catch (e) {
      if (e.code === "auth") return;
      $("ovErr").textContent = errText(e);
      $("ovErr").classList.remove("hidden");
      if (!stats) $("updated").textContent = "";
    } finally { btn.classList.remove("busy"); btn.disabled = false; }
    clearInterval(timer);
    // elke 5 minuten vernieuwen zolang het overzicht zichtbaar is
    timer = setInterval(() => { if (current === "overview" && !document.hidden && session()) loadStats(); }, 5 * 60_000);
  }
  $("refresh").addEventListener("click", loadStats);

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

  function renderStats() {
    if (!stats) return;
    const s = stats, tt = s.totals || {}, pd = s.per_day || [];
    $("updated").textContent = t("ov.updated", { t: time(statsAt || new Date()) });
    const avg7 = Math.round(((tt.new_7d || 0) / 7) * 10) / 10;
    const yesterdayNew = pd.length >= 2 ? pd[pd.length - 2].new : 0;
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
    renderCharts();
    renderDist("distPlatforms", s.platforms, tt.installs, "platform");
    renderDist("distDevices", s.devices, tt.installs, "device");
    renderDist("distVersions", s.versions, tt.active_30d, "version");
    renderDist("distCountries", s.countries, tt.active_30d, "country");
    renderDist("distLangs", s.langs, tt.active_30d, "lang");
  }

  // ---------- grafieken (inline SVG) ----------
  const NS = "http://www.w3.org/2000/svg";
  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (parent) parent.appendChild(n);
    return n;
  };
  function niceMax(v) {
    if (v <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  function frame(box, data, key) {
    box.textContent = "";
    const W = Math.max(box.clientWidth, 200), H = Math.max(box.clientHeight, 120);
    const max = niceMax(Math.max(0, ...data.map((d) => d[key])));
    const yLabelW = Math.max(22, String(nf(max)).length * 7 + 6);
    const m = { l: yLabelW + 6, r: 6, t: 10, b: 24 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, box);
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const y = (v) => m.t + ph - (v / max) * ph;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = Math.round(y(v)) + 0.5;
      el("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: i === 0 ? "base" : "grid" }, svg);
      const tx = el("text", { x: m.l - 8, y: yy + 3.5, "text-anchor": "end", class: "axis" }, svg);
      tx.textContent = nf(Math.round(v * 10) / 10);
    }
    return { svg, W, H, m, pw, ph, y, max };
  }
  function xLabels(f, data, xAt) {
    const n = data.length;
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(f.pw / 70))));
    for (let i = n - 1; i >= 0; i -= every) {
      const tx = el("text", { x: xAt(i), y: f.H - 6, "text-anchor": i === n - 1 ? "end" : "middle", class: "axis" }, f.svg);
      tx.textContent = dateShort(data[i].day);
    }
  }
  const tip = $("tip");
  function showTip(ev, day, value, label) {
    tip.innerHTML = `<span>${esc(dateLong(day))}</span><b>${nf(value)}</b><span>${esc(label)}</span>`;
    tip.classList.remove("hidden");
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, yy = ev.clientY - r.height - 12;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (yy < 8) yy = ev.clientY + 16;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${yy}px`;
  }
  const hideTip = () => tip.classList.add("hidden");
  function emptyChart(box) {
    box.textContent = "";
    const svg = el("svg", { viewBox: "0 0 300 120" }, box);
    const tx = el("text", { x: 150, y: 64, "text-anchor": "middle", class: "empty" }, svg);
    tx.textContent = t("c.none");
  }

  function areaChart(box, data, key, label) {
    if (!data.length) return emptyChart(box);
    const f = frame(box, data, key);
    const n = data.length;
    const xAt = (i) => f.m.l + (n === 1 ? f.pw / 2 : (i / (n - 1)) * f.pw);
    const defs = el("defs", {}, f.svg);
    const g = el("linearGradient", { id: "areaFill", x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": "#FF5A1F", "stop-opacity": 0.32 }, g);
    el("stop", { offset: 1, "stop-color": "#FF5A1F", "stop-opacity": 0 }, g);
    const pts = data.map((d, i) => [xAt(i), f.y(d[key])]);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    el("path", { d: `${line}L${pts[n - 1][0].toFixed(1)},${f.y(0)}L${pts[0][0].toFixed(1)},${f.y(0)}Z`, class: "area" }, f.svg);
    el("path", { d: line, class: "line" }, f.svg);
    xLabels(f, data, xAt);
    // laatste punt altijd gemarkeerd
    el("circle", { cx: pts[n - 1][0], cy: pts[n - 1][1], r: 4, class: "dot" }, f.svg);
    const cross = el("line", { y1: f.m.t, y2: f.y(0), class: "cross", visibility: "hidden" }, f.svg);
    const dot = el("circle", { r: 5, class: "dot", visibility: "hidden" }, f.svg);
    const hit = el("rect", { x: f.m.l, y: f.m.t, width: f.pw, height: f.ph, class: "hit" }, f.svg);
    const move = (ev) => {
      const r = f.svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * f.W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - f.m.l) / f.pw) * (n - 1))));
      cross.setAttribute("x1", pts[i][0]); cross.setAttribute("x2", pts[i][0]); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", pts[i][0]); dot.setAttribute("cy", pts[i][1]); dot.setAttribute("visibility", "visible");
      showTip(ev, data[i].day, data[i][key], label);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip(); });
    box.setAttribute("aria-label", `${label}: ${data.map((d) => `${d.day} ${d[key]}`).join(", ")}`);
  }

  function barChart(box, data, key, label) {
    if (!data.length) return emptyChart(box);
    const f = frame(box, data, key);
    const n = data.length, slot = f.pw / n, gap = Math.min(4, Math.max(2, slot * 0.25)), bw = Math.max(2, slot - gap);
    const xAt = (i) => f.m.l + slot * i + slot / 2;
    const bars = [];
    data.forEach((d, i) => {
      const h = f.y(0) - f.y(d[key]);
      const x = f.m.l + slot * i + gap / 2;
      if (h > 0) {
        const r = Math.min(4, bw / 2, h), y0 = f.y(0), yt = y0 - h;
        bars.push(el("path", { d: `M${x},${y0}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + bw - r}Q${x + bw},${yt} ${x + bw},${yt + r}V${y0}Z`, class: "bar" }, f.svg));
      } else bars.push(null);
    });
    xLabels(f, data, xAt);
    data.forEach((d, i) => {
      const hit = el("rect", { x: f.m.l + slot * i, y: f.m.t, width: slot, height: f.ph, class: "hit" }, f.svg);
      const on = (ev) => { bars.forEach((b, j) => b && b.classList.toggle("dim", j !== i)); showTip(ev, d.day, d[key], label); };
      hit.addEventListener("pointermove", on);
      hit.addEventListener("pointerdown", on);
      hit.addEventListener("pointerleave", () => { bars.forEach((b) => b && b.classList.remove("dim")); hideTip(); });
    });
    box.setAttribute("aria-label", `${label}: ${data.map((d) => `${d.day} ${d[key]}`).join(", ")}`);
  }

  function sparkline(svg, data) {
    if (!svg || data.length < 2) return;
    const W = svg.clientWidth || 160, H = svg.clientHeight || 48;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const max = Math.max(1, ...data);
    const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - 3 - (v / max) * (H - 6)]);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    const defs = el("defs", {}, svg);
    const g = el("linearGradient", { id: "sparkFill", x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": "#FFB020", "stop-opacity": 0.35 }, g);
    el("stop", { offset: 1, "stop-color": "#FFB020", "stop-opacity": 0 }, g);
    el("path", { d: `${d}L${W},${H}L0,${H}Z`, fill: "url(#sparkFill)" }, svg);
    el("path", { d, fill: "none", stroke: "#FFB020", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  }

  function renderCharts() {
    if (!stats || current !== "overview") return;
    const pd = stats.per_day || [];
    areaChart($("chartActive"), pd, "active", t("c.active"));
    barChart($("chartNew"), pd, "new", t("c.new"));
    sparkline(document.querySelector(".kpi.hero .spark"), pd.map((d) => d.active));
  }
  let rz = 0;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(renderCharts, 120); });

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
