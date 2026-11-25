/* Body Care Scanner — phone-first PWA. Product data: Open Beauty Facts. Ratings computed on-device. */
(function () {
  "use strict";
  var B = window.BCS;
  var OBF = "https://world.openbeautyfacts.org", OBF_US = "https://us.openbeautyfacts.org";
  var SOURCES = [
    { id: "obf", host: "https://world.openbeautyfacts.org", name: "Open Beauty Facts" },
    { id: "opf", host: "https://world.openproductsfacts.org", name: "Open Products Facts" },
    { id: "off", host: "https://world.openfoodfacts.org", name: "Open Food Facts" }
  ];
  var FIELDS = "code,product_name,product_name_en,brands,quantity,ingredients_text,ingredients_text_en,image_front_small_url,categories_tags,countries_tags";
  var KEYS = { hist: "bcs-history", fav: "bcs-favorites", theme: "bcs-theme", cache: "bcs-cache", over: "bcs-over", hormOnly: "bcs-horm-only", usOnly: "bcs-us-only" };
  var VERSION = "bodycare-v6";
  var main = document.getElementById("main");
  var toastEl = document.getElementById("toast");
  var themeBtn = document.getElementById("themeBtn");
  var netPill = document.getElementById("netPill");
  var scanSession = 0, scanCtl = null, searchTimer = 0, selCat = "", routeToken = 0;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(m) { toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.classList.remove("show"); }, 2600); }
  function load(k, f) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("Storage is full. Clear some history."); } }
  function theme() { return document.documentElement.dataset.theme || "light"; }
  function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem(KEYS.theme, t); } catch (e) {} themeBtn.textContent = t === "dark" ? "Light mode" : "Dark mode"; themeBtn.setAttribute("aria-pressed", t === "dark"); }
  setTheme(theme());
  themeBtn.addEventListener("click", function () { setTheme(theme() === "dark" ? "light" : "dark"); });
  function setNet(on) { netPill.textContent = on ? "Online" : "Offline"; netPill.className = "pill " + (on ? "on" : "off"); }
  setNet(navigator.onLine);
  window.addEventListener("online", function () { setNet(true); });
  window.addEventListener("offline", function () { setNet(false); });
  /* Service worker: check for a new version on every open, and show a banner when one is ready. */
  var swReg = null;
  function showUpdateBanner() {
    if ($("#updBar")) return;
    var b = document.createElement("button"); b.type = "button"; b.id = "updBar"; b.className = "upd-bar";
    b.textContent = "Update available - tap to refresh";
    b.addEventListener("click", function () {
      b.textContent = "Updating…";
      try { if (swReg && swReg.waiting) swReg.waiting.postMessage({ type: "SKIP_WAITING" }); } catch (e) {}
      setTimeout(function () { location.reload(); }, 300);
    });
    document.body.appendChild(b);
  }
  function askSwVersion(sw) {
    return new Promise(function (res) {
      if (!sw) return res(null);
      var ch = new MessageChannel(), t = setTimeout(function () { res(null); }, 2000);
      ch.port1.onmessage = function (e) { clearTimeout(t); res(e.data && e.data.version); };
      try { sw.postMessage({ type: "VERSION" }, [ch.port2]); } catch (e) { clearTimeout(t); res(null); }
    });
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then(function (reg) {
      swReg = reg;
      function watch(w) { if (w) w.addEventListener("statechange", function () { if (w.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(); }); }
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
      reg.addEventListener("updatefound", function () { watch(reg.installing); });
      document.addEventListener("visibilitychange", function () { if (!document.hidden) reg.update().catch(function () {}); });
    }).catch(function () {});
    /* A new worker took over. If it belongs to a newer app than the code running on this page, offer a refresh. */
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      askSwVersion(navigator.serviceWorker.controller).then(function (v) { if (v && v !== VERSION) showUpdateBanner(); });
    });
    askSwVersion(navigator.serviceWorker.controller).then(function (v) { if (v && v !== VERSION) showUpdateBanner(); });
  }

  var VICON = { low: "✔", mod: "!", high: "✖" };
  var VERDICT_ICON = { GOOD: "✔", OK: "!", BAD: "✖" };
  function chip(level, extra) { return '<span class="chip ' + level + '">' + VICON[level] + " " + B.LABEL[level] + (extra || "") + "</span>"; }
  function vbadge(v) { return v ? '<span class="badge ' + v + '">' + VERDICT_ICON[v] + " " + v + "</span>" : '<span class="badge NA">NOT ENOUGH DATA</span>'; }
  var LVL_TXT = { limited: "Evidence: limited", mixed: "Evidence: mixed / debated", animal: "Evidence: mostly lab and animal studies", stronger: "Evidence: stronger (regulators have acted)" };
  var HIDDEN_LINE = "This is a possibility, not a finding: fragrance blends are not listed on US labels, so the app cannot tell whether hormone-active chemicals are in this product.";
  var HORM_LINE = "Hormone disruptor: may mimic estrogen or disrupt other hormones. Extra caution for children and boys.";

  /* ---------- storage ---------- */
  function histList() { return load(KEYS.hist, []); }
  function favList() { return load(KEYS.fav, []); }
  function isFav(c) { return favList().some(function (x) { return x.code === c; }); }
  function upsert(list, it, max) { return [it].concat(list.filter(function (x) { return x.code !== it.code; })).slice(0, max); }
  function summaryOf(p, an) {
    return { code: p.code, name: p.name, brands: p.brands, img: p.img, cat: p.cat, score: an.enough ? an.score : null, verdict: an.verdict, endo: an.endoDirect.length, ts: Date.now(), ing: p.pasted ? p.ing : undefined };
  }
  function remember(p, an) { save(KEYS.hist, upsert(histList(), summaryOf(p, an), 80)); }
  function toggleFav(p, an) {
    if (isFav(p.code)) { save(KEYS.fav, favList().filter(function (x) { return x.code !== p.code; })); toast("Removed from favorites"); }
    else { save(KEYS.fav, upsert(favList(), summaryOf(p, an), 80)); toast("Saved to favorites"); }
  }
  function overrides() { return load(KEYS.over, {}); }
  function setOverride(code, text) { var o = overrides(); o[code] = text; var ks = Object.keys(o); if (ks.length > 60) delete o[ks[0]]; save(KEYS.over, o); }
  function cacheGet(c) { var x = load(KEYS.cache, {})[c]; return x && Date.now() - x.t < 7 * 864e5 ? x.p : null; }
  function cachePut(c, p) { var o = load(KEYS.cache, {}); o[c] = { t: Date.now(), p: p }; var ks = Object.keys(o); if (ks.length > 40) { ks.sort(function (a, b) { return o[a].t - o[b].t; }).slice(0, ks.length - 40).forEach(function (k) { delete o[k]; }); } save(KEYS.cache, o); }

  /* ---------- My products (on this device only) ---------- */
  var MINE = null, idbP = null;
  function idbOpen() {
    if (idbP) return idbP;
    idbP = new Promise(function (res, rej) {
      if (!window.indexedDB) { idbP = null; return rej(new Error("no-idb")); }
      var r = indexedDB.open("bcs-mine", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("products", { keyPath: "code" }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { idbP = null; rej(r.error); };
      r.onblocked = function () { idbP = null; rej(new Error("idb-blocked")); };
      /* Never let a stuck database hold up a lookup: give up after 3 seconds and use the backup copy. */
      setTimeout(function () { idbP = null; rej(new Error("idb-timeout")); }, 3000);
    });
    return idbP;
  }
  function idbReq(req) { return new Promise(function (res, rej) { req.onsuccess = function () { res(req.result); }; req.onerror = function () { rej(req.error); }; }); }
  async function mineAll() {
    if (MINE) return MINE;
    try {
      var db = await idbOpen();
      MINE = (await idbReq(db.transaction("products").objectStore("products").getAll())) || [];
    } catch (e) {
      MINE = load("bcs-mine", []);
    }
    return MINE;
  }
  function mineProduct(r) {
    return { code: r.code, name: r.name, brands: r.brands || "", qty: r.qty || "", img: r.img || "", ing: r.ing || "", cat: r.cat || "", tags: [], us: true, srcName: "Added by you", srcUrl: "", mine: true, added: r.added, updated: r.updated };
  }
  function mineMatch(rec, raw) {
    if (rec.code === raw) return true;
    var a = candidates(rec.code), b = candidates(raw);
    return a.some(function (x) { return b.indexOf(x) >= 0; });
  }
  async function mineLookup(raw) {
    if (!raw) return null;
    var all = await mineAll(), i;
    for (i = 0; i < all.length; i++) if (mineMatch(all[i], raw)) return mineProduct(all[i]);
    return null;
  }
  async function mineByCat(cat) {
    return (await mineAll()).filter(function (r) { return !cat || r.cat === cat; }).map(mineProduct);
  }
  async function mineSearch(q, cat) {
    var qt = tokens(q), all = await mineAll(), out = [];
    if (!qt.length && !cat) return [];
    all.forEach(function (r) {
      if (cat && r.cat !== cat) return;
      if (!qt.length) { out.push({ r: r, s: 1 }); return; }
      var rt = tokens(r.brands + " " + r.name), hit = qt.filter(function (x) { return rt.indexOf(x) >= 0 || rt.some(function (y) { return y.length > 3 && x.length > 3 && (y.indexOf(x) === 0 || x.indexOf(y) === 0); }); }).length;
      if (hit === qt.length || (qt.length >= 3 && hit >= qt.length - 1) || (hit >= 1 && qt.length === 1)) out.push({ r: r, s: hit / Math.max(qt.length, 1) });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.map(function (o) { return mineProduct(o.r); });
  }
  async function minePut(rec) {
    rec.updated = Date.now();
    if (!rec.added) rec.added = rec.updated;
    try {
      var db = await idbOpen();
      await idbReq(db.transaction("products", "readwrite").objectStore("products").put(rec));
    } catch (e) {
      var list = load("bcs-mine", []).filter(function (x) { return x.code !== rec.code; });
      try { save("bcs-mine", [rec].concat(list)); } catch (err) { throw new Error("Could not save on this device. Storage may be full. Try a smaller photo, or export a backup and delete an older product."); }
    }
    MINE = null;
  }
  async function mineDel(code) {
    try {
      var db = await idbOpen(), rec = await mineLookup(code);
      if (rec) await idbReq(db.transaction("products", "readwrite").objectStore("products").delete(rec.code));
    } catch (e) {
      save("bcs-mine", load("bcs-mine", []).filter(function (x) { return !mineMatch(x, code); }));
    }
    MINE = null;
    save(KEYS.hist, histList().filter(function (x) { return x.code !== code; }));
    save(KEYS.fav, favList().filter(function (x) { return x.code !== code; }));
    var o = overrides(); if (o[code]) { delete o[code]; save(KEYS.over, o); }
  }
  function compressPhoto(file, maxSide, quality) {
    return new Promise(function (res, rej) {
      if (!file) return res("");
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var scale = Math.min(1, (maxSide || 900) / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", quality || 0.72));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("Could not read that photo.")); };
      img.src = url;
    });
  }
  function fmtWhen(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }
  function addThisBtn(p) {
    return '<a class="btn xl block" id="addThis" href="#/add/' + encodeURIComponent(p.code || "") + '">➕  Add this product</a><p class="small muted">Save the barcode and ingredient list on this device so the next scan finds it. Nothing is uploaded.</p>';
  }
  function stashDraft(p) {
    try { sessionStorage.setItem("bcs-add-draft", JSON.stringify({ code: p.code || "", name: p.name && p.name.indexOf("Barcode ") === 0 ? "" : (p.name || ""), brands: p.brands || "", cat: p.cat || "", qty: p.qty || "", ing: p.ing || "" })); } catch (e) {}
  }


  /* ---------- Open Beauty Facts ---------- */
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function upceToUpca(d) {
    if (d.length !== 8 || (d[0] !== "0" && d[0] !== "1")) return "";
    var n = d[0], m = d.slice(1, 7), c = d[7], x = m[5], body;
    if (x === "0" || x === "1" || x === "2") body = m.slice(0, 2) + x + "0000" + m.slice(2, 5);
    else if (x === "3") body = m.slice(0, 3) + "00000" + m.slice(3, 5);
    else if (x === "4") body = m.slice(0, 4) + "00000" + m[4];
    else body = m.slice(0, 5) + "0000" + x;
    return n + body + c;
  }
  function checkOK(d) {
    if (!/^\d+$/.test(d) || (d.length !== 8 && d.length !== 12 && d.length !== 13 && d.length !== 14)) return false;
    function gs1(x) { var sum = 0, k = 0; for (var i = x.length - 2; i >= 0; i--, k++) sum += +x[i] * (k % 2 === 0 ? 3 : 1); return (10 - (sum % 10)) % 10 === +x[x.length - 1]; }
    if (gs1(d)) return true;
    if (d.length === 8) { var u = upceToUpca(d); if (u && gs1(u)) return true; }
    return false;
  }
  function candidates(raw) {
    var d = digits(raw), out = [];
    function add(x) { if (x && out.indexOf(x) < 0) out.push(x); }
    add(d);
    var up = upceToUpca(d);
    if (up) { add(up); add("0" + up); }
    if (d.length === 12) add("0" + d);
    if (d.length === 13 && d.charAt(0) === "0") add(d.slice(1));
    if (d.length === 14 && d.charAt(0) === "0") { add(d.slice(1)); add(d.slice(2)); }
    if (d.length >= 8 && d.length < 13) add(d.padStart(13, "0"));
    return out;
  }
  function norm(p, src) {
    var ing = p.ingredients_text_en || p.ingredients_text || "";
    var name = p.product_name_en || p.product_name || "";
    var tags = p.categories_tags || [];
    var cat = B.guessCategory(name + " " + (p.brands || ""), tags);
    src = src || SOURCES[0];
    return { code: String(p.code), name: name || "Unnamed product", brands: p.brands || "", qty: p.quantity || "", img: p.image_front_small_url || "", ing: ing, cat: cat, tags: tags, us: (p.countries_tags || []).indexOf("en:united-states") >= 0, srcName: src.name, srcUrl: src.host + "/product/" + encodeURIComponent(p.code) };
  }
  async function getJSON(url, ms) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, ms || 20000);
    try {
      var res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctl ? ctl.signal : undefined });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("The database returned " + res.status);
      return await res.json();
    } catch (e) { if (e && e.name === "AbortError") throw new Error("The database took too long to answer"); throw e; }
    finally { if (t) clearTimeout(t); }
  }
  /* Look the barcode up in three free sister databases (same API), trying UPC-A and EAN-13 forms.
     Open Beauty Facts first; the other two only when it has no ingredient list. A failed request is retried once. */
  var lookupIssues = [], lookupLog = [];
  function askSource(src, c, retry) {
    return getJSON(src.host + "/api/v2/product/" + encodeURIComponent(c) + ".json?fields=" + FIELDS, 14000).then(function (d) {
      if (d && d.status === 1 && d.product) { d.product.code = d.product.code || d.code || c; return { src: src, p: norm(d.product, src) }; }
      return { src: src, p: null };
    }, function (e) {
      if (retry) return new Promise(function (r) { setTimeout(r, 900); }).then(function () { return askSource(src, c, false); });
      return { src: src, err: e };
    });
  }
  async function lookup(raw) {
    var list = candidates(raw);
    if (!list.length) throw new Error("Enter a barcode number.");
    lookupIssues = []; lookupLog = [];
    var fromMine = await mineLookup(raw);
    lookupLog.push({ n: "Your products on this device", s: fromMine ? "found" : "no" });
    if (fromMine) return fromMine;
    var fromLib = await libLookup(raw);
    lookupLog.push({ n: "Built-in US library" + (LIB ? " (" + LIB.d.rows.length.toLocaleString() + " products)" : ""), s: fromLib ? "found" : (LIB_ERR ? "err" : "no"), e: LIB_ERR });
    if (fromLib) return fromLib;
    var all = [];
    async function stage(srcs) {
      var res = await Promise.all([].concat.apply([], srcs.map(function (src) { return list.map(function (c) { return askSource(src, c, true); }); })));
      res.forEach(function (r) { if (r.err && lookupIssues.indexOf(r.src.name) < 0) lookupIssues.push(r.src.name); });
      srcs.forEach(function (src) {
        var mineR = res.filter(function (r) { return r.src === src; });
        var st = mineR.some(function (r) { return r.p && r.p.ing; }) ? "found" : mineR.some(function (r) { return r.p; }) ? "noing" : mineR.every(function (r) { return r.err; }) ? "err" : "no";
        lookupLog.push({ n: src.name, s: st });
      });
      all = all.concat(res);
      return res.filter(function (r) { return r.p && r.p.ing; });
    }
    var hit = await stage([SOURCES[0]]);
    if (!hit.length) hit = await stage([SOURCES[1], SOURCES[2]]);
    if (hit.length) return hit[0].p;
    var found = all.filter(function (r) { return r.p; });
    if (found.length) return found[0].p;
    if (all.length && all.every(function (r) { return r.err; })) throw all[0].err;
    return null;
  }
  function usOnly() { return load(KEYS.usOnly, true) !== false; }
  function usToggle(id) { return '<label class="switch"><input type="checkbox" id="' + id + '" ' + (usOnly() ? "checked" : "") + '> 🇺🇸 US products only <span class="muted small">(hides products sold only in Europe and elsewhere)</span></label>'; }
  function wireUs(id, fn) { var el = $("#" + id); if (el) el.addEventListener("change", function () { save(KEYS.usOnly, el.checked); fn(); }); }
  async function searchOBF(q, cat) {
    var us = usOnly();
    var u = (us ? OBF_US : OBF) + "/cgi/search.pl?search_terms=" + encodeURIComponent(q) + "&search_simple=1&action=process&json=1&page_size=24&fields=" + FIELDS;
    if (cat) u += "&tagtype_0=categories&tag_contains_0=contains&tag_0=" + encodeURIComponent(B.CAT_BY_ID[cat].tag.replace("en:", ""));
    var d = await getJSON(u, 25000);
    var res = ((d && d.products) || []).filter(function (p) { return p.code; }).map(function (p) { return norm(p); });
    return us ? res.filter(function (p) { return p.us; }) : res;
  }
  /* Built-in US library first, then Open Beauty Facts. */
  function unseen(seen, p) {
    var k = p.code.length === 13 && p.code[0] === "0" ? p.code.slice(1) : p.code;
    if (seen[k] || seen[p.code]) return false;
    seen[k] = seen[p.code] = 1; return true;
  }
  async function searchName(q, cat) {
    var mine = await mineSearch(q, cat).catch(function () { return []; });
    var lib = await libSearch(q, cat).catch(function () { return []; }), obf = [], err = null;
    try { obf = await searchOBF(q, cat); } catch (e) { err = e; }
    if (err && !lib.length && !mine.length) throw err;
    var seen = {};
    return mine.filter(function (p) { return unseen(seen, p); }).concat(lib.filter(function (p) { return unseen(seen, p); }), obf.filter(function (p) { return unseen(seen, p); }));
  }
  /* ---------- built-in US product library (data/us-products.json) ---------- */
  var LIB = null, LIBP = null;
  var LIB_ERR = "";
  function loadLib() {
    if (LIB) return Promise.resolve(LIB);
    if (!LIBP) LIBP = fetch("data/us-products.json?v=6").then(function (r) { if (!r.ok) throw new Error("US library " + r.status); return r.json(); }).then(function (d) {
      var by = {}; d.rows.forEach(function (r) { by[r[0]] = r; });
      LIB = { d: d, by: by, tok: null }; LIB_ERR = ""; return LIB;
    }).catch(function (e) { LIBP = null; LIB_ERR = (e && e.message) || "could not load"; throw e; });
    return LIBP;
  }
  function libProduct(r, d) {
    return { code: r[0], name: r[1], brands: r[2], qty: "", img: "", ing: d.ing[r[4]], cat: r[3], tags: [], us: true, srcName: d.sources[r[7]], srcUrl: r[6], lib: { active: r[5], updated: r[8], checked: d.checked } };
  }
  async function libLookup(raw) {
    var L; try { L = await loadLib(); } catch (e) { return null; }
    var list = candidates(raw);
    for (var i = 0; i < list.length; i++) { var c = list[i], k = c.length === 13 && c[0] === "0" ? c.slice(1) : c; if (L.by[k]) return libProduct(L.by[k], L.d); }
    return null;
  }
  async function libSearch(q, cat) {
    var L = await loadLib(), qt = tokens(q);
    if (!qt.length) return [];
    if (!L.tok) L.tok = L.d.rows.map(function (r) { return tokens(r[2] + " " + r[1]); });
    var out = [];
    L.d.rows.forEach(function (r, i) {
      if (cat && r[3] !== cat) return;
      var rt = L.tok[i], hit = qt.filter(function (x) { return rt.indexOf(x) >= 0 || rt.some(function (y) { return y.length > 4 && x.length > 4 && y.indexOf(x) === 0; }); }).length;
      if (hit === qt.length || (qt.length >= 3 && hit >= qt.length - 1)) out.push({ r: r, s: hit / qt.length });
    });
    out.sort(function (a, b) { return (b.s - a.s) || (a.r[1].length - b.r[1].length); });
    return out.slice(0, 30).map(function (o) { return libProduct(o.r, L.d); });
  }
  async function libByCat(cat) {
    var L = await loadLib();
    return L.d.rows.filter(function (r) { return r[3] === cat; }).map(function (r) { return libProduct(r, L.d); });
  }
  function dkey(p) { return ((p.brands || "") + " " + p.name).toLowerCase().replace(/,?\s*\(?[\d.]+\s*(fl\.?\s*oz|oz|ml|l|g|ct|count|pack|pk|ounce|fl)\b.*$/, "").replace(/\W+/g, " ").trim() + "|" + (p.ing || "").length; }
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ""); if (!m) return iso || "";
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1] + " " + (+m[3]) + ", " + m[1];
  }
  var STOPW = { the: 1, and: 1, for: 1, with: 1, of: 1, oz: 1, ml: 1, fl: 1, ct: 1, pack: 1, count: 1, size: 1, new: 1 };
  function tokens(s) {
    var t = String(s || "").toLowerCase().replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [];
    return t.filter(function (x) { return x.length > 1 && !STOPW[x] && !/^\d+(oz|ml|g|ct|l)?$/.test(x); }).filter(function (x, i, a) { return a.indexOf(x) === i; });
  }
  /* Same-name entries in Open Beauty Facts that DO have an ingredient list (never the same barcode). */
  async function matchesByName(name, brands, exclude) {
    var bt = tokens(brands).slice(0, 2), nt = tokens(name), qt = bt.concat(nt.filter(function (x) { return bt.indexOf(x) < 0; }));
    if (!qt.length) return [];
    var tries = [qt.join(" ")];
    if (qt.length > 3) tries.push(bt.slice(0, 1).concat(nt.slice(0, 2)).join(" "));
    for (var i = 0; i < tries.length; i++) {
      var res = await searchName(tries[i], ""), seen = {}, keep = [];
      res.forEach(function (r) {
        if (!r.ing || r.code === exclude || seen[r.code]) return; seen[r.code] = 1;
        var rt = tokens(r.brands + " " + r.name), hit = qt.filter(function (x) { return rt.indexOf(x) >= 0; }).length / qt.length;
        if (bt.length && rt.indexOf(bt[0]) < 0) return;
        if (hit >= 0.5) { r.match = hit; keep.push(r); }
      });
      keep.sort(function (a, b) { return (b.us - a.us) || (b.match - a.match); });
      if (keep.length) return keep.slice(0, 5);
    }
    return [];
  }
  async function browseCat(cat, us) {
    var u = OBF + "/api/v2/search?categories_tags=" + encodeURIComponent(B.CAT_BY_ID[cat].tag) + "&page_size=60&sort_by=unique_scans_n&fields=" + FIELDS;
    if (us) u += "&countries_tags=en:united-states";
    var d = await getJSON(u);
    return ((d && d.products) || []).filter(function (p) { return p.code; }).map(function (p) { return norm(p); });
  }
  function analyzeProduct(p) { return B.analyze(overrides()[p.code] || p.ing, p.cat); }

  /* ---------- camera ---------- */
  var FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "codabar"];
  /* html5-qrcode reports camera errors as plain text, the browser as Error objects: read both. */
  function errText(e) { return typeof e === "string" ? e : ((e && e.name) || "") + " " + ((e && e.message) || "") + " " + (e ? String(e) : ""); }
  function isDenied(e) { return /NotAllowed|Permission|denied|SecurityError/i.test(errText(e)); }
  /* Camera requests, best first. PCs usually have only a front webcam, so every request only *prefers* the back
     camera ("ideal"), and the last one takes any camera at all. */
  var CAM_TRIES = [
    { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { facingMode: { ideal: "environment" } },
    null
  ];
  async function nativeFormats() {
    if (typeof window.BarcodeDetector !== "function") return null;
    try {
      var sup = await BarcodeDetector.getSupportedFormats(), f = FORMATS.filter(function (x) { return sup.indexOf(x) >= 0; });
      return f.some(function (x) { return /ean|upc/.test(x); }) ? f : null;
    } catch (e) { return null; }
  }
  async function openStream() {
    var last;
    for (var i = 0; i < CAM_TRIES.length; i++) {
      try { return await navigator.mediaDevices.getUserMedia({ audio: false, video: CAM_TRIES[i] || true }); }
      catch (e) { last = e; if (isDenied(e)) throw e; }
    }
    throw last;
  }
  async function startNative(video, onCode, fmts) {
    var stream = await openStream();
    video.srcObject = stream; video.setAttribute("playsinline", "true"); video.muted = true; await video.play();
    try { var tr = stream.getVideoTracks()[0], caps = tr.getCapabilities && tr.getCapabilities(); if (caps && caps.focusMode && caps.focusMode.indexOf("continuous") >= 0) await tr.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch (e) {}
    var det = new BarcodeDetector({ formats: fmts }), stopped = false, last = 0;
    (function tick(now) {
      if (stopped) return;
      if (now - last < 90) { requestAnimationFrame(tick); return; }
      last = now;
      Promise.resolve(video.readyState >= 2 ? det.detect(video) : []).then(function (codes) {
        if (stopped) return;
        if (codes && codes.length && codes[0].rawValue) onCode(codes[0].rawValue);
        requestAnimationFrame(tick);
      }).catch(function () { if (!stopped) requestAnimationFrame(tick); });
    })(0);
    return { stop: function () { stopped = true; stream.getTracks().forEach(function (t) { t.stop(); }); video.srcObject = null; }, stream: stream };
  }
  function zxFormats() { var F = Html5QrcodeSupportedFormats; return [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF]; }
  /* ZXing (html5-qrcode) live scanner. Used right away when the browser has no built-in barcode reader
     (Edge and Chrome on Windows, Firefox, iPhone). */
  async function startZxing(id, onCode) {
    if (typeof Html5Qrcode === "undefined") throw new Error("The scanner add-on did not load. Refresh the page.");
    var h = new Html5Qrcode(id, { verbose: false, formatsToSupport: zxFormats(), experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
    var cfg = { fps: 12, qrbox: function (w, hh) { return { width: Math.max(60, Math.floor(w * 0.92)), height: Math.max(60, Math.floor(hh * 0.62)) }; } };
    var last, ok = false;
    for (var i = 0; i < CAM_TRIES.length && !ok; i++) {
      if (!CAM_TRIES[i]) break;
      try { await h.start({ facingMode: "environment" }, Object.assign({}, cfg, { videoConstraints: CAM_TRIES[i] }), function (t) { onCode(t); }, function () {}); ok = true; }
      catch (e) { last = e; if (isDenied(e)) throw e; try { await h.stop(); } catch (e2) {} }
    }
    if (!ok) {
      /* Last try: list the cameras and open one by its id (a back camera if there is one, otherwise the first). */
      var cams = [];
      try { cams = await Html5Qrcode.getCameras(); } catch (e) { if (isDenied(e)) throw e; last = last || e; }
      if (!cams.length) throw last || new Error("NotFoundError: no camera found");
      var pick = cams.filter(function (c) { return /back|rear|environment/i.test(c.label || ""); })[0] || cams[0];
      await h.start(pick.id, cfg, function (t) { onCode(t); }, function () {});
    }
    /* Booster: once a second, also read a sharpened, enlarged copy of the middle of the picture.
       Blurry webcams and phone cameras that cannot focus close are read far more often this way. */
    var stopped = false, busy = false, el = document.getElementById(id);
    var boost = setInterval(function () {
      if (stopped || busy) return;
      var v = el && el.querySelector("video"); if (!v || v.readyState < 2 || !v.videoWidth) return;
      busy = true;
      frameVariantDecode(v).then(function (t) { if (t && !stopped) onCode(t, "boost"); }).catch(function () {}).then(function () { busy = false; });
    }, 1000);
    return { stop: function () { stopped = true; clearInterval(boost); return h.stop().then(function () { h.clear(); }).catch(function () {}); }, stream: null };
  }
  async function stopScan() { scanSession++; if (scanCtl) { var c = scanCtl; scanCtl = null; try { await c.stop(); } catch (e) {} } }
  function beep() { try { if (navigator.vibrate) navigator.vibrate(80); var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = 0.06; o.connect(g); g.connect(c.destination); o.start(); setTimeout(function () { o.stop(); c.close(); }, 120); } catch (e) {} }

  /* ---------- reading a barcode from a still picture ---------- */
  function photoHost() { var d = document.getElementById("bcsPhotoHost"); if (!d) { d = document.createElement("div"); d.id = "bcsPhotoHost"; d.style.display = "none"; document.body.appendChild(d); } return d.id; }
  function drawVariant(src, W, H, v) {
    var sx = W * v[0], sy = H * v[1], sw = W * v[2], sh = H * v[3], sc = v[4], rot = v[5], w = Math.max(1, Math.round(sw * sc)), hh = Math.max(1, Math.round(sh * sc));
    var c = document.createElement("canvas"); c.width = rot ? hh : w; c.height = rot ? w : hh;
    var x = c.getContext("2d"); if (v[6]) x.filter = "grayscale(1) contrast(1.8)";
    if (rot) { x.translate(hh, 0); x.rotate(Math.PI / 2); }
    x.drawImage(src, sx, sy, sw, sh, 0, 0, w, hh); return c;
  }
  function canvasFile(c, type) { return new Promise(function (res) { c.toBlob(function (b) { res(b ? new File([b], "frame", { type: type }) : null); }, type, 0.92); }); }
  async function zxFile(file) {
    if (!file || typeof Html5Qrcode === "undefined") return null;
    try { var h = new Html5Qrcode(photoHost(), { verbose: false, formatsToSupport: zxFormats() }); var t = await h.scanFile(file, false); try { h.clear(); } catch (e) {} return t; } catch (e) { return null; }
  }
  async function decodeVariants(src, W, H, list, type) {
    for (var i = 0; i < list.length; i++) {
      var t = await zxFile(await canvasFile(drawVariant(src, W, H, list[i]), type));
      if (t && checkOK(digits(t))) return t;
    }
    return null;
  }
  async function frameVariantDecode(video) {
    var W = video.videoWidth, H = video.videoHeight, m = Math.max(W, H);
    return decodeVariants(video, W, H, [[0.12, 0.2, 0.76, 0.6, Math.min(2, 1400 / (m * 0.76)), 0, 1], [0.12, 0.2, 0.76, 0.6, 1, 0, 1]], "image/jpeg");
  }
  /* Photo of a barcode: try the built-in reader, then ZXing on several cleaned-up copies
     (whole picture, sharpened, middle enlarged, smaller, turned sideways). */
  async function decodePhoto(file) {
    var img;
    try { img = await createImageBitmap(file); } catch (e) {
      img = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error("That file is not a picture this browser can open.")); }; i.src = URL.createObjectURL(file); });
    }
    var W = img.width || img.naturalWidth, H = img.height || img.naturalHeight, m = Math.max(W, H), base = Math.min(1, 1600 / m);
    var fm = await nativeFormats();
    if (fm) { try { var r = await new BarcodeDetector({ formats: fm }).detect(img); var ok = (r || []).filter(function (x) { return checkOK(digits(x.rawValue)); })[0]; if (ok) return ok.rawValue; } catch (e) {} }
    return decodeVariants(img, W, H, [
      [0, 0, 1, 1, base, 0, 0], [0, 0, 1, 1, base, 0, 1], [0.15, 0.2, 0.7, 0.6, Math.min(2, 1600 / (m * 0.7)), 0, 1],
      [0, 0, 1, 1, Math.min(1, 800 / m), 0, 1], [0.25, 0.3, 0.5, 0.4, Math.min(2.5, 1600 / (m * 0.5)), 0, 1], [0, 0, 1, 1, base, 1, 1]
    ], "image/png");
  }

  /* ---------- the "type it or take a photo" box ---------- */
  function rescueHTML(px, title) {
    return '<div class="rescue" id="' + px + 'Box">' + (title ? "<p class=\"rescue-title\">" + title + "</p>" : "") +
      '<label for="' + px + 'Type" class="rescue-lbl">Type the barcode number</label>' +
      '<div class="rescue-row"><input id="' + px + 'Type" class="big-code" inputmode="numeric" autocomplete="off" enterkeyhint="search" placeholder="Numbers under the barcode"><button type="button" class="btn" id="' + px + 'Go">Look up</button></div>' +
      '<label class="btn ghost block photo-btn" for="' + px + 'Photo">📷  Take a photo of the barcode</label><input type="file" accept="image/*" capture="environment" id="' + px + 'Photo" class="visually-hidden">' +
      '<div class="small muted rescue-msg" id="' + px + 'Msg" aria-live="polite"></div></div>';
  }
  function wireRescue(px, onCode) {
    var inp = $("#" + px + "Type"), go = $("#" + px + "Go"), ph = $("#" + px + "Photo"), msg = $("#" + px + "Msg");
    if (!inp) return;
    function submit() {
      var d = digits(inp.value);
      if (d.length < 6) { msg.textContent = "Type all the numbers under the barcode (usually 12 or 13)."; inp.focus(); return; }
      onCode(d);
    }
    go.addEventListener("click", submit);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    ph.addEventListener("change", async function () {
      var f = ph.files && ph.files[0]; ph.value = ""; if (!f) return;
      msg.innerHTML = '<span class="spin"></span>Reading the barcode in your photo…';
      try {
        var t = await decodePhoto(f), d = digits(t);
        if (d && checkOK(d)) { msg.textContent = "Read " + d + " from the photo ✔"; onCode(d); }
        else msg.innerHTML = "<b>No barcode could be read in that photo.</b> Take it again closer, so the barcode fills most of the picture, keep it flat, sharp and well lit, or type the number above.";
      } catch (e) { msg.textContent = (e && e.message) || "That photo could not be read."; }
    });
  }
  function cameraHelp(err) {
    var n = errText(err);
    var h = '<div class="note cam-fail"><b>The camera could not start.</b>';
    if (!window.isSecureContext) h += "<p>The camera only works on a secure (https) page. Open the live app address: phillipalvaranga-arch.github.io/body-care-scanner</p>";
    else if (/NotAllowed|Permission|denied|SecurityError/i.test(n)) {
      h += "<p>Camera permission is blocked for this site.</p><ul class=\"small\"><li><b>Edge or Chrome on a computer:</b> click the camera or lock icon at the left of the address bar, set Camera to <b>Allow</b>, then reload. In Windows, also check Settings → Privacy &amp; security → Camera → let desktop apps and your browser use the camera.</li><li><b>Phone:</b> tap the lock icon next to the address, set Camera to Allow, then tap Scan again.</li></ul>";
      if (window.top !== window.self) h += '<p>This page is shown inside another page, which can block the camera. <a href="' + esc(location.href) + '" target="_blank" rel="noopener">Open the app in its own tab</a>.</p>';
    }
    else if (/NotFound|DevicesNotFound|Requested device|no camera/i.test(n)) h += "<p>No camera was found. On a computer without a webcam, take a photo of the barcode with your phone and open it here, or type the number.</p>";
    else if (/NotReadable|TrackStart|Could not start|in use/i.test(n)) h += "<p>Another app is using the camera (for example Teams, Zoom, Skype or the Camera app). Close it, then tap Scan again.</p>";
    else h += "<p>" + esc((typeof err === "string" ? err : err && err.message) || "Unknown camera error") + "</p>";
    return h + "<p>You can still look the product up: type the number or take a photo of the barcode below.</p></div>";
  }
  /* Shared scanner. Blurry webcams can misread a barcode as a different number that still passes the check digit,
     so a live read is double-checked on a sharpened, enlarged copy of the same picture before it is used.
     If that copy cannot be read, three matching live reads (and a clear lead over any other number) are needed. */
  async function runScanner(o) {
    var area = o.area, video = $("#scanVideo"), zx = $("#qr-reader"), vf = $("#vf"), torch = $("#torchBtn"), zoom = $("#zoomBtn"), msg = $("#scanMsg"), read = $("#scanRead"), rescue = $("#scanRescue");
    if (o.help) o.help.innerHTML = "";
    area.hidden = false; await stopScan();
    torch.hidden = true; zoom.hidden = true; read.textContent = ""; if (rescue) rescue.hidden = true; msg.textContent = "Starting the camera…";
    var done = false, timers = [], mine = ++scanSession, seen = {}, verifying = false, verifyMissed = 0;
    function clear() { timers.forEach(clearTimeout); timers = []; }
    function accept(d) { done = true; clear(); read.textContent = "Scanned " + d + " ✔"; beep(); stopScan(); o.onAccept(d); }
    function liveVideo() { return !video.hidden && video.srcObject ? video : zx.querySelector("video"); }
    function verify() {
      var v = liveVideo(); if (verifying || !v || v.readyState < 2 || !v.videoWidth) return;
      verifying = true;
      frameVariantDecode(v).then(function (t) { verifying = false; if (t) onCode(t, "boost"); else { verifyMissed++; recheck(); } }, function () { verifying = false; verifyMissed++; recheck(); });
    }
    function leader() { var best = null, b = 0, r = 0; Object.keys(seen).forEach(function (k) { if (seen[k] > b) { r = b; b = seen[k]; best = k; } else if (seen[k] > r) r = seen[k]; }); return { d: best, n: b, rival: r }; }
    function recheck() { if (done || mine !== scanSession || verifying) return; var L = leader(); if (L.d && verifyMissed > 0 && L.n >= 3 && L.n >= L.rival + 3) accept(L.d); }
    function onCode(raw, src) {
      if (done || mine !== scanSession) return;
      var d = digits(raw); if (!d || d.length < 6) return;
      if (!checkOK(d)) { read.textContent = "Read " + d + " but it does not look right. Hold steady…"; return; }
      if (src === "boost") return accept(d); /* the sharpened copy is the most reliable read */
      seen[d] = (seen[d] || 0) + 1;
      read.textContent = "Reading " + d + "… hold still";
      if (verifying) return;
      if (verifyMissed > 0) { recheck(); if (done) return; }
      verify();
    }
    function wireExtras() {
      try {
        var stream = (scanCtl && scanCtl.stream) || video.srcObject || (zx.querySelector("video") || {}).srcObject, track = stream && stream.getVideoTracks()[0], caps = track && track.getCapabilities && track.getCapabilities();
        if (caps && caps.torch) { torch.hidden = false; var on = false; torch.onclick = function () { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }).catch(function () {}); torch.textContent = on ? "Light off" : "Light"; }; }
        if (caps && caps.zoom && caps.zoom.max > caps.zoom.min) { zoom.hidden = false; var z2 = false; zoom.onclick = function () { z2 = !z2; var v = z2 ? Math.min(caps.zoom.max, Math.max(caps.zoom.min * 2, 2)) : caps.zoom.min; track.applyConstraints({ advanced: [{ zoom: v }] }).catch(function () {}); zoom.textContent = z2 ? "Zoom out" : "Zoom"; }; }
      } catch (e) {}
    }
    async function useZxing() {
      video.hidden = true; vf.hidden = true; zx.hidden = false; msg.textContent = "Point the camera at the barcode";
      var c = await startZxing("qr-reader", onCode);
      if (mine !== scanSession) { c.stop(); return; }
      scanCtl = c; wireExtras();
    }
    function fail(err) { clear(); if (mine === scanSession) stopScan(); area.hidden = true; o.onFail(err); }
    try {
      if (!window.isSecureContext) throw new Error("Camera needs HTTPS.");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This browser cannot open the camera.");
      var fm = await nativeFormats(), native = false;
      if (fm) {
        try { video.hidden = false; zx.hidden = true; vf.hidden = false; var c0 = await startNative(video, onCode, fm); if (mine !== scanSession) { c0.stop(); return; } scanCtl = c0; native = true; }
        catch (e) { if (isDenied(e)) throw e; }
      }
      if (mine !== scanSession) return;
      if (native) {
        msg.textContent = "Point the camera at the barcode"; wireExtras();
        timers.push(setTimeout(async function () {
          if (done || mine !== scanSession) return;
          msg.textContent = "Trying a second scanner…"; var c1 = scanCtl; scanCtl = null; try { await c1.stop(); } catch (e) {}
          try { await useZxing(); } catch (e) { fail(e); }
        }, 4000));
      } else { await useZxing(); }
      timers.push(setTimeout(function () { if (!done && mine === scanSession) msg.textContent = "Hold the barcode 4 to 8 inches away, flat and well lit. Tap Light if it is dark."; }, 5000));
      timers.push(setTimeout(function () { if (!done && mine === scanSession) { msg.textContent = "Not reading? Type the number or take a photo below."; if (rescue) rescue.hidden = false; } }, 8000));
    } catch (err) { fail(err); }
  }

  /* ---------- routing ---------- */
  function route() {
    routeToken++;
    var parts = (location.hash || "#/scan").replace(/^#\/?/, "").split("/").filter(Boolean);
    var page = parts[0] || "scan";
    var tab = page === "product" || page === "browse" ? "scan" : (page === "add" || page === "edit" || page === "mine" ? "mine" : page);
    $$(".tabs button").forEach(function (b) { var on = b.getAttribute("data-go") === tab; if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    stopScan();
    window.scrollTo(0, 0);
    if (page === "product" && parts[1]) return renderProduct(decodeURIComponent(parts[1]));
    if (page === "browse" && parts[1]) return renderBrowse(parts[1]);
    if (page === "add") return renderAdd(parts[1] ? decodeURIComponent(parts[1]) : "", false);
    if (page === "edit" && parts[1]) return renderAdd(decodeURIComponent(parts[1]), true);
    if (page === "mine") return renderMine();
    if (page === "check") return renderCheck();
    if (page === "history") return renderList("history");
    if (page === "favorites") return renderList("favorites");
    if (page === "hormones") return renderHormones();
    if (page === "learn") return renderLearn();
    return renderScan();
  }
  $$(".tabs button").forEach(function (b) { b.addEventListener("click", function () { location.hash = "#/" + b.getAttribute("data-go"); }); });
  window.addEventListener("hashchange", route);

  /* ---------- shared pieces ---------- */
  function catChips(sel, id) {
    return '<div class="chips" id="' + id + '" role="group" aria-label="Product type">' +
      B.CATS.map(function (c) { return '<button type="button" class="cat" data-cat="' + c.id + '" aria-pressed="' + (sel === c.id) + '">' + c.icon + " " + c.label + "</button>"; }).join("") + "</div>";
  }
  function wireChips(id, onPick) {
    var box = $("#" + id);
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]"); if (!b) return;
      var v = b.getAttribute("data-cat"); var was = b.getAttribute("aria-pressed") === "true";
      $$("[data-cat]", box).forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      if (!was) b.setAttribute("aria-pressed", "true");
      onPick(was ? "" : v);
    });
  }
  function srcLinks(entry) {
    var seen = {};
    return (entry.src || []).map(function (s) {
      var pair = typeof s === "string" ? B.src[s] : s; if (!pair || seen[pair[1]]) return ""; seen[pair[1]] = 1;
      return '<a href="' + esc(pair[1]) + '" target="_blank" rel="noopener">' + esc(pair[0]) + "</a>";
    }).join("");
  }
  function hormDetail(entry) {
    var x = entry.endo; if (!x) return "";
    return '<div class="hbox"><b>⚠ ' + (x.kind === "hidden" ? "Possible hidden hormone disruptors" : "Hormone disruptor (possible)") + "</b><br>" + esc(x.how) +
      '<br><span class="small"><b>' + LVL_TXT[x.lvl] + ".</b> " + esc(x.evid) + '</span><br><span class="small"><b>' + esc(x.kind === "hidden" ? HIDDEN_LINE : HORM_LINE) + "</b></span></div>";
  }
  function ingRow(it) {
    if (!it.rated) {
      var g = it.generic;
      return '<details class="ing na" data-lv="na"><summary><span class="nm">' + esc(it.raw) + '<small>#' + it.pos + '</small></span><span class="chip na">? Not rated</span>' +
        '<span class="why">' + (g ? esc(g.what) : "This name is not in the app\u2019s ingredient database yet, so it has no rating. It is not counted in the score.") + '</span></summary>' +
        '<div class="body"><div class="src"><h4>Look it up</h4><a href="https://pubmed.ncbi.nlm.nih.gov/?term=' + encodeURIComponent(it.raw) + '" target="_blank" rel="noopener">PubMed search: ' + esc(it.raw) + '</a><a href="https://ec.europa.eu/growth/tools-databases/cosing/" target="_blank" rel="noopener">EU CosIng ingredient database</a></div></div></details>';
    }
    var e = it.entry, lv = it.level, hor = e.endo ? ' <span class="chip hor">⚠ Hormone</span>' : "";
    var help = e.good ? ' <span class="chip help">★ Helpful</span>' : "";
    var reason = (e.why || "").replace(/^Considered safe as used\.?$/, "No known concern at normal use.");
    var extra = "";
    if (it.approx) extra += '<div class="info small">Spelling was a close match for \u201C' + esc(it.approx) + "\u201D. Check the package.</div>";
    return '<details class="ing ' + lv + '" data-lv="' + lv + '" data-h="' + (e.endo ? 1 : 0) + '"><summary><span class="nm">' + esc(it.raw) + (it.raw.toLowerCase() !== e.name.toLowerCase() ? "<small>" + esc(e.name) + "</small>" : "") + '</span>' + chip(lv) + hor + help +
      '<span class="why">' + esc(reason) + '</span></summary><div class="body">' + extra +
      "<h4>What it is and what it does</h4><div>" + esc(e.what) + (e.role ? " <i>(" + esc(e.role) + ")</i>" : "") + "</div>" +
      "<h4>Safety notes</h4><div>" + esc(e.note) + "</div>" + hormDetail(e) +
      (it.dup ? '<div class="small muted">Counted once in the score with similar ingredients.</div>' : "") +
      '<div class="src"><h4>Sources</h4>' + (srcLinks(e) || '<span class="small muted">Generic rule</span>') + "</div></div></details>";
  }
  function verdictHTML(an, sub) {
    if (!an.verdict) {
      return '<div class="verdict NA"><div class="big">?<small>NOT ENOUGH DATA</small></div><p>' + (an.total < 3 ? "Fewer than 3 ingredients were found." : "Fewer than half of the ingredients are in the app\u2019s database (" + an.rated + " of " + an.total + "), so an overall rating would be a guess.") + " Paste the full ingredient list from the package to get a rating.</p></div>";
    }
    var line = { GOOD: "Good choice overall", OK: "Okay, with some things to know", BAD: "Not a good choice" }[an.verdict];
    return '<div class="verdict ' + an.verdict + '" role="status"><div class="big">' + VERDICT_ICON[an.verdict] + " " + an.verdict + "<small>" + line + '</small></div>' +
      '<div class="scoreline">Score ' + an.score + " / 100</div>" +
      '<div class="bar" aria-hidden="true"><div class="knob" data-left="' + an.score + '"></div></div><div class="bar-lbl" aria-hidden="true"><span>BAD (0–54)</span><span>OK (55–79)</span><span>GOOD (80+)</span></div>' +
      "<p>Rated " + an.verdict + " because " + esc(an.why.join(" and ")) + ".</p>" + (sub || "") + "</div>";
  }
  function hormoneBox(an) {
    var direct = an.endoDirect, hidden = an.endo.filter(function (i) { return i.entry.endo.kind === "hidden"; });
    var seen = {}, rows = "";
    an.endo.forEach(function (i) {
      if (seen[i.entry.id]) return; seen[i.entry.id] = 1;
      var x = i.entry.endo;
      rows += '<div class="hrow"><b>' + esc(i.raw) + "</b> — " + (x.kind === "hidden" ? "possible hidden phthalates" : "possible hormone disruptor") + "<br>" + esc(x.how) + '<br><span class="small"><b>' + LVL_TXT[x.lvl] + ".</b> " + esc(x.evid) + "</span></div>";
    });
    if (!an.endo.length) {
      return '<div class="hormone-box clear"><h2>✔ Hormone-disruptor check: no flags</h2><p>None of the ' + an.rated + ' ingredients the app recognized is on its hormone-disruptor watch list.</p><p class="small muted" style="margin-bottom:0">This only covers ingredients named on the label and in the app\u2019s database' + (an.total > an.rated ? " (" + (an.total - an.rated) + " were not rated)" : "") + '. Evidence about hormone effects is still developing, and in the US a product\u2019s fragrance blend does not have to be listed.</p></div>';
    }
    return '<div class="hormone-box"><h2>⚠ Hormone-disruptor check: ' + (direct.length ? direct.length + " flag" + (direct.length > 1 ? "s" : "") : "possible hidden ingredients") + "</h2><p><b>" + esc(direct.length ? HORM_LINE : HIDDEN_LINE) + "</b></p>" + rows +
      '<p class="small muted" style="margin-bottom:0">Honest context: evidence comes mostly from lab and animal studies; human studies are limited or mixed. Regulators such as the EU SCCS and the FDA generally judge these ingredients safe at the allowed levels, but a few have been restricted or banned. Dose, product type and age matter, and children and pregnancy are the times scientists are most careful. <a href="#/hormones">Learn more</a></p></div>';
  }
  function disclaimer() {
    return '<p class="disc"><b>Informational only.</b> This app is not medical advice and does not replace your doctor, dentist or pharmacist. Ingredient ratings summarize what regulators and scientific bodies say; many are dose-dependent or debated. Product data comes from the crowd-sourced Open Beauty Facts database, which can be incomplete or out of date, so check the package. See <a href="#/learn">how ratings work</a>.</p>';
  }
  function animateBars() {
    requestAnimationFrame(function () { setTimeout(function () { $$(".knob[data-left]").forEach(function (k) { k.style.left = Math.max(2, Math.min(98, +k.getAttribute("data-left"))) + "%"; }); }, 60); });
  }
  function listRow(p, an, href) {
    return '<a class="item" href="' + href + '">' + (p.img ? '<img loading="lazy" src="' + esc(p.img) + '" alt="">' : '<div class="ph" aria-hidden="true">🧴</div>') +
      '<div class="meta"><b>' + esc(p.name) + '</b><div class="sub">' + esc(p.brands || "Unknown brand") + (p.score != null ? " · Score " + p.score : "") + (p.lib ? " · 🇺🇸 maker label" : "") + (p.mine ? " · Added by you" : "") + "</div></div>" +
      '<div class="row" style="justify-content:flex-end;flex:none;max-width:110px">' + vbadge(an ? an.verdict : p.verdict) + ((an ? an.endoDirect.length : p.endo) ? '<span class="badge hor" title="Hormone-disruptor flag">⚠ Hormone</span>' : "") + "</div></a>";
  }

  /* ---------- scan (home) ---------- */
  function renderScan() {
    main.innerHTML =
      '<div class="hero"><h1>What is really in your body-care products?</h1>' +
      '<p class="lead">Scan toothpaste, mouthwash, shampoo, conditioner, soap, body wash, deodorant or lotion. Every ingredient is explained in plain English and rated <b>Good for you</b>, <b>OK</b> or <b>Bad for you</b>, with hormone-disruptor flags and sources.</p>' +
      '<button type="button" class="btn xl block" id="startScan">📷  Scan barcode</button>' +
      '<label class="btn ghost block photo-home" for="homePhoto">🖼️  Use a photo of the barcode instead</label><input type="file" accept="image/*" id="homePhoto" class="visually-hidden"><div class="small muted" id="homePhotoMsg" aria-live="polite"></div></div>' +
      '<div id="scanArea" hidden><div class="scan-stage"><video id="scanVideo" playsinline muted autoplay></video><div id="qr-reader" hidden></div>' +
      '<div class="viewfinder" id="vf"><div class="vf-box"></div></div><div class="scan-msg" id="scanMsg">Point the camera at the barcode</div><div class="scan-read" id="scanRead" aria-live="polite"></div>' +
      '<div class="scan-actions"><button type="button" class="btn ghost small" id="torchBtn" hidden style="background:#fff">Light</button><button type="button" class="btn ghost small" id="zoomBtn" hidden style="background:#fff">Zoom</button><button type="button" class="btn small" id="stopScan">Cancel</button></div></div><div id="scanRescue" hidden>' + rescueHTML("sr", "") + '</div></div>' +
      '<div id="scanHelp"></div>' +
      '<div class="or">or type the barcode</div>' +
      '<form class="card" id="codeForm"><div class="field"><label for="codeIn">Barcode number</label><input id="codeIn" inputmode="numeric" autocomplete="off" placeholder="For example 7891024133545"></div><button type="submit" class="btn block">Look up barcode</button></form>' +
      '<div class="or">or search by name</div>' +
      '<form class="card" id="nameForm"><div class="field"><label for="nameIn">Product name or brand</label><input id="nameIn" autocomplete="off" placeholder="For example Colgate, Listerine, Dove"></div>' +
      '<div class="small muted">Optional: pick a type to narrow the search, or to see the best-rated products of that type.</div>' + catChips(selCat, "chips") +
      ''+ usToggle("usOnlyHome") + '<button type="submit" class="btn block ghost">Search</button><div id="browseLink"></div><div id="searchOut" class="search-res"></div></form>' +
      '<div class="or">or add a product yourself</div>' +
      '<a class="btn xl block" href="#/add">➕  Add a product</a>' +
      '<p class="small muted" style="margin-top:8px">Save a barcode and ingredient list on this phone. The next time you scan it, the app will find <b>your</b> copy. Nothing is sent off this device. <a href="#/mine">See my products</a>.</p>' +
      '<div class="or">or use the ingredient list</div><a class="btn ghost block" href="#/check">📝 Paste or photograph the ingredient list</a>' +
      recentStrip() + disclaimer() +
      '<p class="small muted ver-line">App version ' + esc(VERSION.replace("bodycare-", "")) + ' · <span id="libInfo">US library loading…</span></p>';
    $("#startScan").addEventListener("click", beginScan);
    loadLib().then(function (L) { var e = $("#libInfo"); if (e) e.textContent = "US library: " + L.d.rows.length.toLocaleString() + " products"; }, function (er) { var e = $("#libInfo"); if (e) e.textContent = "US library could not load (" + (er && er.message) + "). Check your connection."; });
    $("#homePhoto").addEventListener("change", async function () {
      var f = this.files && this.files[0], m = $("#homePhotoMsg"); this.value = ""; if (!f) return;
      m.innerHTML = '<span class="spin"></span>Reading the barcode in your photo…';
      try { var d = digits(await decodePhoto(f)); if (d && checkOK(d)) { m.textContent = "Read " + d + " ✔"; goProduct(d); } else m.innerHTML = "<b>No barcode could be read in that photo.</b> Take it closer so the barcode fills most of the picture, sharp and flat, or type the number below."; }
      catch (e) { m.textContent = (e && e.message) || "That photo could not be read."; }
    });
    wireRescue("sr", goProduct);
    $("#stopScan").addEventListener("click", function () { stopScan(); $("#scanArea").hidden = true; });
    $("#codeForm").addEventListener("submit", function (e) { e.preventDefault(); var d = digits($("#codeIn").value); if (d.length < 6) return toast("Enter at least 6 digits."); location.hash = "#/product/" + d; });
    $("#nameForm").addEventListener("submit", function (e) { e.preventDefault(); runSearch($("#nameIn").value.trim()); });
    wireChips("chips", function (v) { selCat = v; browseLink(); });
    wireUs("usOnlyHome", function () { var q = $("#nameIn").value.trim(); if (q.length >= 2) runSearch(q); });
    browseLink();
  }
  function browseLink() {
    var el = $("#browseLink"); if (!el) return;
    el.innerHTML = selCat ? '<p><a class="btn small" href="#/browse/' + selCat + '">⭐ See best-rated ' + esc(B.CAT_BY_ID[selCat].label.toLowerCase()) + " products</a></p>" : "";
  }
  function recentStrip() {
    var h = histList().slice(0, 4); if (!h.length) return "";
    return "<h2>Recently checked</h2><div class=\"list\">" + h.map(function (it) { return listRow(it, null, "#/product/" + encodeURIComponent(it.code)); }).join("") + "</div>";
  }
  async function runSearch(q) {
    var out = $("#searchOut");
    if (q.length < 2 && !selCat) { out.innerHTML = '<div class="note">Type at least 2 letters.</div>'; return; }
    if (q.length < 2) { location.hash = "#/browse/" + selCat; return; }
    out.innerHTML = '<div class="muted"><span class="spin"></span>Searching…</div>';
    try {
      var res = await searchName(q, selCat);
      if (!res.length) { out.innerHTML = '<div class="note">Nothing found for \u201C' + esc(q) + '\u201D' + (selCat ? " in that type" : "") + ". Try the brand alone, a shorter name, or <a href=\"#/check\">paste the ingredient list</a>.</div>"; return; }
      out.innerHTML = res.map(function (p) {
        var an = p.ing ? B.analyze(p.ing, p.cat) : null;
        var q2 = { code: p.code, name: p.name, brands: p.brands, img: p.img, lib: !!p.lib, mine: !!p.mine, score: an && an.enough ? an.score : null };
        return listRow(q2, an || { verdict: null, endoDirect: [] }, "#/product/" + encodeURIComponent(p.code));
      }).join("");
    } catch (e) { out.innerHTML = '<div class="note">Search is not available right now (' + esc(e.message) + "). Check your connection or type the barcode.</div>"; }
  }
  function goProduct(d) { setTimeout(function () { location.hash = "#/product/" + d; }, 300); }
  function beginScan() {
    runScanner({ area: $("#scanArea"), help: $("#scanHelp"), onAccept: goProduct,
      onFail: function (err) { $("#scanHelp").innerHTML = cameraHelp(err) + rescueHTML("cf", ""); wireRescue("cf", goProduct); var t = $("#cfType"); if (t) t.focus(); } });
  }

  /* ---------- product ---------- */
  async function renderProduct(code) {
    var tok = routeToken;
    var p = await mineLookup(code);
    if (p) { if (tok === routeToken) showProduct(p); return; }
    if (/^m\d+$/.test(code)) { main.innerHTML = '<div class="card">That saved product was not found. It may have been deleted. <a href="#/mine">My products</a> · <a href="#/add">Add a product</a>.</div>'; return; }
    if (/^p\d+$/.test(code)) {
      var h = histList().concat(favList()).filter(function (x) { return x.code === code; })[0];
      if (!h || !h.ing) { main.innerHTML = '<div class="card">That saved list was not found. <a href="#/check">Check a new list</a>.</div>'; return; }
      p = { code: code, name: h.name, brands: h.brands || "Pasted ingredient list", img: "", ing: h.ing, cat: h.cat, pasted: true };
    } else {
      p = cacheGet(code);
      if (!p) {
        main.innerHTML = '<div class="card scanned-card"><p class="scanned">Scanned: <b>' + esc(code) + '</b></p><p><span class="spin"></span>Checking your products, the built-in US library, then Open Beauty Facts, Open Products Facts and Open Food Facts…</p></div>';
        try { p = await lookup(code); } catch (e) {
          var c2 = cacheGet(code);
          if (!c2) { if (tok === routeToken) main.innerHTML = '<div class="note"><b>Could not reach the product databases.</b><br>' + esc(e.message) + '. Check your connection and try again, or <a href="#/check">paste the ingredient list</a>.</div>'; return; }
          p = c2;
        }
        if (tok !== routeToken) return;
        if (!p) { notFound(code); return; }
        if (p.ing) cachePut(code, p);
      }
    }
    if (tok !== routeToken) return;
    showProduct(p);
  }
  function webLinks(q) {
    var e = encodeURIComponent(q);
    return '<a class="btn small ghost" target="_blank" rel="noopener" href="https://duckduckgo.com/?q=' + e + '">🔎 DuckDuckGo</a><a class="btn small ghost" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + e + '">🔎 Google</a>';
  }
  var MATCH_NOTE = '<p class="small muted" style="margin:0 0 8px">These are <b>different database entries with similar names, not your exact barcode</b>. Formulas can differ by country, size and version, so compare the ingredient list on your package before trusting a rating.</p>';
  function matchRows(list) {
    return list.map(function (m) {
      var an = B.analyze(m.ing, m.cat), q = { code: m.code, name: m.name, brands: m.brands, img: m.img, lib: !!m.lib, mine: !!m.mine, score: an.enough ? an.score : null };
      return listRow(q, an, "#/product/" + encodeURIComponent(m.code));
    }).join("");
  }
  async function showNameMatches(box, name, brands, code) {
    var tok = routeToken;
    box.innerHTML = '<h2>Similar products that do have ingredients</h2><div class="muted"><span class="spin"></span>Searching Open Beauty Facts for “' + esc(((brands ? brands.split(",")[0] + " " : "") + name).trim()) + "”…</div>";
    try {
      var list = await matchesByName(name, brands, code);
      if (tok !== routeToken) return;
      box.innerHTML = list.length ? "<h2>Similar products that do have ingredients</h2>" + MATCH_NOTE + '<div class="list">' + matchRows(list) + "</div>" : '<div class="info">No similar product with an ingredient list turned up in Open Beauty Facts.</div>';
    } catch (e) { if (tok === routeToken) box.innerHTML = '<div class="info">The name search is not available right now (' + esc(e.message) + ").</div>"; }
  }
  function notFound(code) {
    var ICON = { found: "✔ found", no: "not there", noing: "known, but no ingredient list", err: "did not answer" };
    var checked = lookupLog.length ? '<ul class="checked-list">' + lookupLog.map(function (x) { return "<li><b>" + esc(x.n) + ":</b> " + esc(ICON[x.s] || x.s) + (x.s === "err" && x.e ? " (" + esc(x.e) + ")" : "") + "</li>"; }).join("") + "</ul>" : "";
    main.innerHTML = '<h1>Not in the free databases yet</h1>' +
      '<div class="card scanned-card"><p class="scanned">Scanned: <b>' + esc(code) + '</b></p><p class="small"><b>Is this the number printed under the barcode?</b> If not, the camera misread it: <a href="#/scan">scan again</a> or fix the number here.</p>' +
      '<div class="rescue-row"><input id="nfFix" class="big-code" inputmode="numeric" autocomplete="off" value="' + esc(code) + '"><button type="button" class="btn" id="nfFixGo">Look up</button></div>' +
      '<p class="small" style="margin-top:10px"><b>Places checked:</b></p>' + checked + '</div>' +
      '<div class="card">' + addThisBtn({ code: code }) + '</div>' +
      '<div class="card"><p>The barcode <b>' + esc(code) + "</b> was read, but it is not in the built-in US library (" + (LIB ? LIB.d.rows.length.toLocaleString() : "2,000+") + " products), Open Beauty Facts, Open Products Facts or Open Food Facts (both the 12-digit UPC and 13-digit forms were tried)." + (lookupIssues.length ? " <b>" + esc(lookupIssues.join(" and ")) + " did not answer, so <a href=\"#\" id=\"retryLook\">try again</a> in a moment.</b>" : "") + " These databases are built by volunteers and many US products are still missing. The app never guesses, so nothing is shown for it.</p>" +
      "<p><b>Other ways to still get a rating:</b></p></div>" +
      '<div class="card"><h3>1. Search by name</h3><form id="nfForm"><div class="field"><label for="nfName">What is the product called? (brand and name)</label><input id="nfName" autocomplete="off" placeholder="For example Crest Cavity Protection"></div>'+ usToggle("usOnlyNf") + '<button type="submit" class="btn block">Find by name</button></form><div id="nfOut" class="search-res" style="margin-top:10px"></div>' +
      '<div class="row" style="margin-top:8px" id="nfWeb">' + webLinks(code + " barcode") + "</div></div>" +
      '<div class="card"><h3>2. Read the package</h3><p class="small muted">Photograph or paste the ingredient list from the back of the package, or find the ingredients on the brand’s website with the search links above.</p></div>' +
      pasteForm("nf", code, "") + '<div id="pasteOut"></div>' +
      '<div class="card"><h3>3. Help everyone</h3><p class="small">Add the product to the free database: <a href="https://world.openbeautyfacts.org/cgi/product.pl?type=search_or_add&code=' + encodeURIComponent(code) + '" target="_blank" rel="noopener">Open Beauty Facts</a>.</p></div>' + disclaimer();
    stashDraft({ code: code });
    (function () { var fi = $("#nfFix"), fg = $("#nfFixGo"); function go() { var d = digits(fi.value); if (d.length < 6) return toast("Type at least 6 digits."); if (d === code) renderProduct(code); else location.hash = "#/product/" + d; } fg.addEventListener("click", go); fi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } }); })();
    var at0 = $("#addThis"); if (at0) at0.addEventListener("click", function () { stashDraft({ code: code }); });
    wirePaste("nf", { code: code, name: "Barcode " + code, brands: "", img: "", cat: "" });
    wireUs("usOnlyNf", function () { if ($("#nfName").value.trim().length >= 2) $("#nfForm").requestSubmit(); });
    var rl = $("#retryLook"); if (rl) rl.addEventListener("click", function (e) { e.preventDefault(); renderProduct(code); });
    $("#nfForm").addEventListener("submit", async function (e) {
      e.preventDefault(); var q = $("#nfName").value.trim(), out = $("#nfOut"), tok = routeToken;
      if (q.length < 2) return toast("Type at least 2 letters.");
      $("#nfWeb").innerHTML = webLinks(q + " ingredients");
      out.innerHTML = '<div class="muted"><span class="spin"></span>Searching…</div>';
      try {
        var res = (await searchName(q, "")).filter(function (r) { return r.ing; });
        if (tok !== routeToken) return;
        out.innerHTML = res.length ? MATCH_NOTE + matchRows(res.slice(0, 8)) : '<div class="note">Nothing with an ingredient list matched \u201C' + esc(q) + "”. Try the brand alone or fewer words, or use the search links for “" + esc(q) + " ingredients”.</div>";
      } catch (er) { out.innerHTML = '<div class="note">Search is not available right now (' + esc(er.message) + ").</div>"; }
    });
  }
  async function libImage(p) {
    var tok = routeToken;
    try {
      var d = await getJSON(OBF + "/api/v2/product/0" + encodeURIComponent(p.code) + ".json?fields=image_front_small_url", 8000);
      var img = d && d.product && d.product.image_front_small_url;
      if (!img || tok !== routeToken) return;
      var ph = $(".prodhead .ph"); if (ph) { var im = document.createElement("img"); im.src = img; im.alt = ""; ph.replaceWith(im); }
    } catch (e) {}
  }
  function showProduct(p) {
    var override = overrides()[p.code];
    var an = analyzeProduct(p);
    remember(p, an);
    var cat = p.cat ? B.CAT_BY_ID[p.cat] : null;
    var fav = isFav(p.code);
    var srcLine = p.mine ? '<div class="srcline">Added by you' + (p.updated ? " on " + esc(fmtWhen(p.updated)) : "") + '. Saved only on this device. <a href="#/edit/' + encodeURIComponent(p.code) + '">Edit</a>.</div>'
      : p.lib ? '<div class="srcline">Ingredients from <a href="' + esc(p.srcUrl) + '" target="_blank" rel="noopener">' + esc(p.srcName) + "</a>, checked " + esc(fmtDate(p.lib.checked)) + (p.lib.updated ? " (source updated " + esc(fmtDate(p.lib.updated)) + ")" : "") + "." + (p.lib.active ? "<br>Active ingredient (drug facts): " + esc(p.lib.active.replace(/^\s*active ingredients?\s*(\([^)]*\))?\s*[:\-]?\s*/i, "").replace(/\s*purposes?\b.*$/i, "")) : "") + "</div>" : "";
    var where = p.mine ? "your products on this device" : p.lib ? "the built-in US library" : p.pasted ? "" : (p.srcName || "Open Beauty Facts");
    var scannedLine = /^\d{6,14}$/.test(p.code) ? '<p class="scanned small">Barcode <b>' + esc(p.code) + "</b>" + (where ? " · found in " + esc(where) : "") + "</p>" : "";
    var head = '<div class="card">' + scannedLine + '<div class="prodhead">' + (p.img ? '<img src="' + esc(p.img) + '" alt="">' : '<div class="ph" style="width:84px;height:84px;display:flex;align-items:center;justify-content:center;font-size:2.4rem" aria-hidden="true">🧴</div>') +
      '<div><h1>' + esc(p.name) + '</h1><div class="muted">' + esc(p.brands || "Unknown brand") + (p.qty ? " · " + esc(p.qty) : "") + '</div><div class="row" style="margin-top:6px">' +
      (cat ? '<span class="chip help">' + cat.icon + " " + esc(cat.label) + "</span>" : '<span class="chip na">Type unknown</span>') + (p.mine ? '<span class="chip low">Added by you</span>' : "") + (p.lib ? '<span class="chip low">🇺🇸 US maker label</span>' : "") + (p.pasted ? '<span class="chip na">Your list</span>' : "") + (override ? '<span class="chip na">Your edited list</span>' : "") + "</div></div></div>" +
      '<div class="row" style="margin-top:10px"><button class="btn small ' + (fav ? "" : "ghost") + '" id="favBtn">' + (fav ? "★ Saved" : "☆ Save to favorites") + '</button>' +
      (p.mine ? '<a class="btn small" href="#/edit/' + encodeURIComponent(p.code) + '">✏️ Edit product</a><button type="button" class="btn small danger" id="delMine">Delete</button>' :
        ((p.pasted ? "" : '<a class="btn small ghost" target="_blank" rel="noopener" href="' + esc(p.srcUrl || ("https://world.openbeautyfacts.org/product/" + encodeURIComponent(p.code))) + '">' + (p.lib ? "Maker label source" : esc(p.srcName || "Open Beauty Facts") + " page") + "</a>") +
        '<button class="btn small ghost" id="editBtn">✏️ Edit ingredient list</button>')) +
      (p.mine && !/^m\d+$/.test(p.code) ? '<a class="btn small ghost" target="_blank" rel="noopener" href="https://world.openbeautyfacts.org/cgi/product.pl?type=search_or_add&code=' + encodeURIComponent(p.code) + '">Also share it to Open Beauty Facts</a>' : "") +
      '</div>' + srcLine + '</div>';
    var body;
    if (!an.total) {
      body = '<div class="verdict NA"><div class="big">?<small>NO INGREDIENTS LISTED</small></div><p>' + esc(p.srcName || "Open Beauty Facts") + ' knows this barcode' + (p.name === "Unnamed product" ? " (only a photo, no name)" : " and its name") + ', but nobody has entered the ingredient list yet, so it cannot be rated. The app does not guess. Add it yourself, check the similar products below, or read the list off the package.</p></div>' +
        (p.mine || p.pasted ? "" : '<div class="card">' + addThisBtn(p) + "</div>") +
        (p.pasted ? "" : '<div id="nameBox"></div><div class="card"><h3>Find the ingredients online</h3><div class="row">' + webLinks((p.brands ? p.brands.split(",")[0] + " " : "") + p.name + " ingredients") + "</div></div>") +
        pasteForm("pp", p.code, "");
    } else {
      var pct = an.rated + " of " + an.total + " ingredients recognized" + (an.noise ? "; " + an.noise + " unreadable label text fragment" + (an.noise > 1 ? "s" : "") + " ignored" : "");
      body = verdictHTML(an, '<p class="small" style="opacity:.9">' + esc(pct) + ".</p>") +
        '<div class="counts"><div class="count g">' + an.counts.low + "<small>Good for you</small></div><div class=\"count o\">" + an.counts.mod + "<small>OK</small></div><div class=\"count b\">" + an.counts.high + "<small>Bad for you</small></div><div class=\"count u\">" + an.counts.unrated + "<small>Not rated</small></div></div>" +
        hormoneBox(an) +
        '<h2>All ingredients, in label order</h2><p class="muted small" style="margin-top:-6px">Tap an ingredient for what it is, why it is rated that way, and the sources. Labels list the biggest amounts first.</p>' +
        '<div class="filters" id="ingFilters" role="group" aria-label="Filter ingredients">' +
        '<button type="button" data-f="all" aria-pressed="true">All (' + an.total + ')</button><button type="button" data-f="high" aria-pressed="false">Bad for you (' + an.counts.high + ')</button><button type="button" data-f="mod" aria-pressed="false">OK (' + an.counts.mod + ')</button><button type="button" data-f="low" aria-pressed="false">Good for you (' + an.counts.low + ')</button><button type="button" data-f="h" aria-pressed="false">⚠ Hormone (' + an.endo.length + ')</button></div>' +
        '<div id="ingList">' + an.items.map(ingRow).join("") + "</div>" +
        '<div id="altBox"></div>' +
        '<details class="faq"><summary>Is something missing or wrong?</summary><p class="small">The ingredient list comes from Open Beauty Facts, where volunteers type it in. If it does not match the package, edit it here (it stays on your device) or fix it on Open Beauty Facts for everyone.</p>' + pasteForm("pp2", p.code, p.ing) + "</details>";
    }
    main.innerHTML = head + body + '<div id="pasteOut"></div>' + disclaimer();
    var favB = $("#favBtn"); if (favB) favB.addEventListener("click", function () { toggleFav(p, an); showProduct(p); });
    var edB = $("#editBtn"); if (edB) edB.addEventListener("click", function () { var f = $("#pf-pp2") || $("#pf-pp"); if (f) { var d = f.closest("details"); if (d) d.open = true; f.scrollIntoView({ behavior: "smooth", block: "center" }); f.focus(); } });
    var at = $("#addThis"); if (at) at.addEventListener("click", function () { stashDraft(p); });
    var delB = $("#delMine"); if (delB) delB.addEventListener("click", async function () {
      if (!confirm("Remove “" + p.name + "” from this device? This cannot be undone unless you have a backup file.")) return;
      await mineDel(p.code); toast("Removed from this device"); location.hash = "#/mine";
    });
    if (an.total && !an.enough && !p.mine && !p.pasted && $("#ingList")) {
      var more = document.createElement("div"); more.className = "card"; more.innerHTML = "<p><b>Not enough data to rate this confidently.</b> You can add your own copy with a fuller ingredient list from the package.</p>" + addThisBtn(p);
      var listEl = $("#ingList"); if (listEl && listEl.parentNode) listEl.parentNode.insertBefore(more, listEl);
      var at2 = $("#addThis"); if (at2) at2.addEventListener("click", function () { stashDraft(p); });
    }
    ["pp", "pp2"].forEach(function (id) { if ($("#pf-" + id)) wirePaste(id, p); });
    var flt = $("#ingFilters");
    if (flt) flt.addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]"); if (!b) return; var f = b.getAttribute("data-f");
      $$("#ingFilters button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      $$("#ingList .ing").forEach(function (r) { r.hidden = !(f === "all" || (f === "h" ? r.getAttribute("data-h") === "1" : r.getAttribute("data-lv") === f)); });
    });
    animateBars();
    if (p.lib && !p.img) libImage(p);
    if (!an.total && !p.pasted && $("#nameBox")) showNameMatches($("#nameBox"), p.name, p.brands, p.code);
    if (an.enough && p.cat && !p.pasted) loadAlternatives(p, an);
  }
  async function loadAlternatives(p, an) {
    var box = $("#altBox"); if (!box) return; var tok = routeToken;
    box.innerHTML = '<h2>Cleaner picks in the same category</h2><div class="muted"><span class="spin"></span>Looking for better-rated products in Open Beauty Facts…</div>';
    try {
      var mine = await mineByCat(p.cat).catch(function () { return []; }), lib = await libByCat(p.cat).catch(function () { return []; }), list = [];
      try { list = await browseCat(p.cat, true); if (!usOnly() && list.length < 8) list = list.concat(await browseCat(p.cat, false)); } catch (e) { if (!lib.length && !mine.length) throw e; }
      list = mine.concat(lib, list);
      if (tok !== routeToken) return;
      var seen = {}, scored = [];
      list.forEach(function (q) {
        var dk = dkey(q); if (q.code === p.code || seen[q.code] || seen[dk] || !q.ing || dk === dkey(p)) return; seen[q.code] = 1; seen[dk] = 1;
        var a = B.analyze(q.ing, q.cat || p.cat);
        if (!a.enough || a.total < 5) return;
        scored.push({ p: q, a: a });
      });
      var rank = { GOOD: 3, OK: 2, BAD: 1 };
      var hasF = function (a) { return a.items.some(function (i) { return i.rated && i.entry.id === "fluoride"; }); };
      var curF = hasF(an);
      var better = scored.filter(function (s) { return (!(p.cat === "toothpaste" && curF) || hasF(s.a)) && s.a.score >= an.score + 5 && rank[s.a.verdict] >= rank[an.verdict] && s.a.endoDirect.length <= an.endoDirect.length; })
        .sort(function (x, y) { return y.a.score - x.a.score; }).slice(0, 4);
      var html = "<h2>Cleaner picks in the same category</h2>";
      if (!better.length) html += '<div class="info">No clearly better-rated product turned up among the most-scanned ' + esc(B.CAT_BY_ID[p.cat].label.toLowerCase()) + " products in Open Beauty Facts. <a href=\"#/browse/" + p.cat + '">Browse the best-rated ones</a>.</div>';
      else html += '<p class="muted small" style="margin-top:-6px">Real products from Open Beauty Facts in the same category with a higher score from this app and no extra hormone flags' + (p.cat === "toothpaste" && curF ? " (and still containing fluoride, which the ADA and CDC recommend for cavity protection)" : "") + '. Ratings are computed from each listed ingredient list; check the package.</p><div class="alt">' +
        better.map(function (s) { var q = { code: s.p.code, name: s.p.name, brands: s.p.brands, img: s.p.img, lib: !!s.p.lib, mine: !!s.p.mine, score: s.a.score }; return listRow(q, s.a, "#/product/" + encodeURIComponent(s.p.code)); }).join("") + "</div>";
      box.innerHTML = html;
    } catch (e) { if (tok === routeToken) box.innerHTML = ""; }
  }

  /* ---------- paste / photo ---------- */
  function pasteForm(id, code, text) {
    return '<div class="card"><h3>Paste the ingredient list</h3><div class="field"><label for="pf-' + id + '">Ingredients (copy from the package or type them, separated by commas)</label>' +
      '<textarea id="pf-' + id + '" placeholder="Aqua, Sodium Laureth Sulfate, Glycerin, Parfum…">' + esc(text) + "</textarea></div>" +
      '<div class="row"><button class="btn" id="pgo-' + id + '">Analyze list</button><label class="btn ghost" for="pho-' + id + '" style="cursor:pointer">📷 Read from a photo</label><input id="pho-' + id + '" type="file" accept="image/*" capture="environment" hidden></div>' +
      '<div id="ocr-' + id + '" class="small muted" style="margin-top:8px"></div></div>';
  }
  function wirePaste(id, p) {
    var ta = $("#pf-" + id), go = $("#pgo-" + id), file = $("#pho-" + id);
    go.addEventListener("click", function () {
      var t = ta.value.trim(); if (t.length < 3) return toast("Paste some ingredients first.");
      if (p.code && !/^p\d+$/.test(p.code)) { setOverride(p.code, t); if (p.name || true) { var pr = Object.assign({}, p); showProduct(pr); toast("Analyzed your list"); } }
      else showProduct(Object.assign({}, p, { ing: t }));
    });
    file.addEventListener("change", function () { if (file.files && file.files[0]) runOCR(file.files[0], ta, $("#ocr-" + id)); });
  }
  var tessLoading = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (tessLoading) return tessLoading;
    tessLoading = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"; s.onload = res; s.onerror = function () { tessLoading = null; rej(new Error("Could not download the text-reading library. Check your connection.")); }; document.head.appendChild(s);
    });
    return tessLoading;
  }
  async function runOCR(file, ta, msg) {
    msg.innerHTML = '<span class="spin"></span>Loading the on-device text reader (about 10 MB the first time)…';
    try {
      await loadTesseract();
      var r = await window.Tesseract.recognize(file, "eng", { logger: function (m) { if (m.status === "recognizing text") msg.innerHTML = '<span class="spin"></span>Reading the photo… ' + Math.round((m.progress || 0) * 100) + "%"; } });
      var text = (r.data.text || "").replace(/\s*\n\s*/g, " ").trim();
      var m = text.match(/ingredients?\s*[:\-]?\s*(.*)$/i); if (m && m[1].length > 15) text = m[1];
      ta.value = text;
      msg.innerHTML = "✔ Text read on your device (the photo was not uploaded anywhere). <b>Check it against the package and fix any mistakes before tapping Analyze.</b> Photo reading can misread letters.";
    } catch (e) { msg.innerHTML = '<span style="color:var(--bad)">' + esc(e.message || "Could not read the photo.") + "</span> You can still type or paste the list."; }
  }
  function renderCheck() {
    main.innerHTML = '<h1>Check an ingredient list</h1><p class="lead">Use this for products that are not in the database, or to check a list you read off a package. Nothing is uploaded; the analysis runs on your device.</p>' +
      '<div class="card"><div class="field"><label for="cname">Product name (optional)</label><input id="cname" autocomplete="off" placeholder="For example My shampoo"></div><div class="small muted">Product type (helps the rating, for example alcohol in a mouthwash):</div>' + catChips("", "cchips") + "</div>" +
      pasteForm("ck", "", "") + '<div id="pasteOut"></div>' + disclaimer();
    var cat = "";
    wireChips("cchips", function (v) { cat = v; });
    var ta = $("#pf-ck"), file = $("#pho-ck");
    $("#pgo-ck").addEventListener("click", function () {
      var t = ta.value.trim(); if (t.length < 3) return toast("Paste some ingredients first.");
      var p = { code: "p" + Date.now(), name: $("#cname").value.trim() || "My ingredient list", brands: "Pasted ingredient list", img: "", ing: t, cat: cat || B.guessCategory($("#cname").value, []), pasted: true };
      var an = B.analyze(t, p.cat); remember(p, an);
      location.hash = "#/product/" + p.code;
    });
    file.addEventListener("change", function () { if (file.files && file.files[0]) runOCR(file.files[0], ta, $("#ocr-ck")); });
  }

  /* ---------- history / favorites ---------- */
  function renderList(kind) {
    var list = kind === "history" ? histList() : favList();
    var only = !!load(KEYS.hormOnly, false);
    var shown = only ? list.filter(function (x) { return !x.endo && x.verdict; }) : list;
    main.innerHTML = "<h1>" + (kind === "history" ? "Scan history" : "Favorites") + "</h1><p class=\"lead\">Saved only on this device. To keep a product that is not in the app, <a href=\"#/add\">add it</a> or open <a href=\"#/mine\">My products</a>.</p>" +
      (list.length ? '<label class="switch"><input type="checkbox" id="hOnly" ' + (only ? "checked" : "") + '> Only show products with no hormone-disruptor flags</label>' : "") +
      (shown.length ? '<div class="list">' + shown.map(function (it) { return listRow(it, null, "#/product/" + encodeURIComponent(it.code)); }).join("") + "</div>" :
        '<div class="card">' + (list.length ? "No saved products without hormone flags." : kind === "history" ? "Nothing scanned yet. <a href=\"#/scan\">Scan a product</a>." : "No favorites yet. Open a product and tap Save to favorites.") + "</div>") +
      (list.length ? '<button class="btn danger small" id="clr" style="margin-top:14px">Clear ' + (kind === "history" ? "history" : "favorites") + "</button>" : "") + disclaimer();
    var c = $("#clr"); if (c) c.addEventListener("click", function () { if (confirm("Clear this list?")) { save(kind === "history" ? KEYS.hist : KEYS.fav, []); renderList(kind); } });
    var h = $("#hOnly"); if (h) h.addEventListener("change", function () { save(KEYS.hormOnly, h.checked); renderList(kind); });
  }

  /* ---------- browse best-rated ---------- */
  async function renderBrowse(cat) {
    var tok = routeToken, c = B.CAT_BY_ID[cat]; if (!c) { location.hash = "#/scan"; return; }
    var only = !!load(KEYS.hormOnly, false);
    main.innerHTML = "<h1>" + c.icon + " Best-rated " + esc(c.label.toLowerCase()) + "</h1><p class=\"lead\">Real products from the built-in US library (ingredient lists from the makers’ own labels) and Open Beauty Facts, re-rated by this app from their listed ingredients. Only products with an ingredient list are shown.</p>" +
      '<label class="switch"><input type="checkbox" id="bh" ' + (only ? "checked" : "") + '> Hide products with hormone-disruptor flags</label>' + usToggle("busOnly") + (cat === "toothpaste" ? '<label class="switch"><input type="checkbox" id="bf" checked> Only toothpastes with fluoride (the ADA and CDC recommend fluoride for cavity protection; this rating does not reward it)</label>' : "") + '<div id="bout"><span class="spin"></span>Loading…</div>' + disclaimer();
    try {
      var mine = await mineByCat(cat).catch(function () { return []; }), lib = await libByCat(cat).catch(function () { return []; }), list = [];
      try { list = await browseCat(cat, true); if (!usOnly() && list.length < 15) list = list.concat(await browseCat(cat, false)); } catch (e) { if (!lib.length && !mine.length) throw e; }
      list = mine.concat(lib, list);
      if (tok !== routeToken) return;
      var seen = {}, rows = [];
      list.forEach(function (q) { var dk = dkey(q); if (seen[q.code] || seen[dk] || !q.ing) return; seen[q.code] = 1; seen[dk] = 1; var a = B.analyze(q.ing, cat); if (a.enough && a.total >= 5) rows.push({ p: q, a: a }); });
      rows.sort(function (x, y) { return y.a.score - x.a.score; });
      function draw() {
        var hide = $("#bh").checked; save(KEYS.hormOnly, hide);
        var r = hide ? rows.filter(function (x) { return !x.a.endoDirect.length; }) : rows;
        if ($("#bf") && $("#bf").checked) r = r.filter(function (x) { return x.a.items.some(function (i) { return i.rated && i.entry.id === "fluoride"; }); });
        $("#bout").innerHTML = r.length ? '<div class="list">' + r.slice(0, 30).map(function (s) { return listRow({ code: s.p.code, name: s.p.name, brands: s.p.brands, img: s.p.img, lib: !!s.p.lib, mine: !!s.p.mine, score: s.a.score }, s.a, "#/product/" + encodeURIComponent(s.p.code)); }).join("") + "</div><p class=\"fine\">" + rows.length + " products with readable ingredient lists were rated. Open Beauty Facts does not have every product.</p>" : '<div class="card">No products to show with that filter.</div>';
      }
      wireUs("busOnly", function () { renderBrowse(cat); });
      $("#bh").addEventListener("change", draw); if ($("#bf")) $("#bf").addEventListener("change", draw); draw();
    } catch (e) { if (tok === routeToken) $("#bout").innerHTML = '<div class="note">Could not load products (' + esc(e.message) + "). Check your connection.</div>"; }
  }

  /* ---------- hormones ---------- */
  function renderHormones() {
    var ents = B.entries.filter(function (e) { return e.endo; });
    main.innerHTML = '<h1>⚠ Hormone disruptors</h1><p class="lead">Some chemicals in body-care products can interfere with the body\u2019s hormones. Xenoestrogens are chemicals that can mimic estrogen. This page lists the ingredients the app flags, with an honest look at the evidence.</p>' +
      '<div class="hormone-box"><h2>What the science says</h2><ul><li><b>The concern is real but the evidence is uneven.</b> The U.S. National Institute of Environmental Health Sciences (NIEHS) lists parabens, phthalates and triclosan among chemicals that may disrupt hormones, and says even low doses may matter because hormones act in tiny amounts.</li><li><b>Human proof is limited.</b> For many cosmetic ingredients the effects come from lab and animal studies. The EU\u2019s expert panel (SCCS) judged evidence for propylparaben, oxybenzone and homosalate as inconclusive or insufficient to call them endocrine disruptors, yet still set low limits for them.</li><li><b>Dose and age matter.</b> Regulators set maximum levels, and scientists are most careful with pregnancy, babies, children and puberty. For boys, the strongest evidence is for certain phthalates (animal studies show reduced male hormone activity; the EU bans DBP, DEHP and BBP in cosmetics). An NIEHS-funded study found earlier puberty in daughters, not in boys, after higher prenatal diethyl phthalate and triclosan exposure.</li><li><b>Hidden phthalates:</b> in the US, fragrance ingredients do not have to be listed, so phthalates can hide behind the word \u201Cfragrance\u201D or \u201Cparfum\u201D. \u201CFragrance-free\u201D products avoid that uncertainty.</li></ul>' +
      '<p class="small"><a href="https://www.niehs.nih.gov/health/topics/agents/endocrine" target="_blank" rel="noopener">NIEHS: Endocrine disruptors</a> · <a href="https://www.niehs.nih.gov/sites/default/files/Cosmetics_and_Your_Health_fact_sheet_Jan2024_508.pdf" target="_blank" rel="noopener">NIEHS: Cosmetics and your health</a></p></div>' +
      '<h2>Find products without hormone flags</h2><p class="muted small" style="margin-top:-6px">Pick a type to see the best-rated real products, with hormone-flagged ones hidden.</p><div class="chips">' + B.CATS.map(function (c) { return '<a class="cat" style="text-decoration:none" href="#/browse/' + c.id + '" onclick="try{localStorage.setItem(\'bcs-horm-only\',\'true\')}catch(e){}">' + c.icon + " " + c.label + "</a>"; }).join("") + "</div>" +
      "<h2>Flagged ingredients (" + ents.length + ")</h2>" + ents.map(function (e) {
        var x = e.endo;
        return '<div class="dict-row"><div class="row"><b>' + esc(e.name) + '</b>' + chip(e.level) + '<span class="chip hor">⚠ ' + (x.kind === "hidden" ? "Possible, hidden" : "Hormone") + "</span></div><div class=\"small\">" + esc(x.how) + '</div><div class="small"><b>' + LVL_TXT[x.lvl] + ".</b> " + esc(x.evid) + '</div><div class="small"><b>' + esc(x.kind === "hidden" ? HIDDEN_LINE : HORM_LINE) + '</b></div><div class="src"><h4 style="margin:.6em 0 .2em" class="small">Sources</h4>' + srcLinks(e) + "</div></div>";
      }).join("") + disclaimer();
  }

  /* ---------- learn ---------- */
  function renderLearn() {
    main.innerHTML = '<h1>How ratings work</h1>' +
      '<div class="card"><h3>The big label: GOOD, OK or BAD</h3><ul><li><b>GOOD (green)</b>: score 80 or higher, no ingredient rated Bad for you, and no hormone-disruptor flags.</li><li><b>OK (yellow)</b>: score 55 to 79, or the product has a possible hormone disruptor.</li><li><b>BAD (red)</b>: any ingredient rated Bad for you, or a score under 55.</li><li><b>Not enough data</b>: fewer than 3 ingredients, or fewer than half are in the app\u2019s database. The app does not guess.</li></ul></div>' +
      '<div class="card"><h3>Each ingredient: Good for you, OK or Bad for you</h3><ul><li><span class="chip low">✔ Good for you</span> No meaningful concern at normal use as judged by regulators and safety panels. Some also get a ★ Helpful tag (for example fluoride against cavities).</li><li><span class="chip mod">! OK</span> Mild or debated concern, or it matters for some people or in some products (irritant, allergen, possible hormone effects, dose-dependent).</li><li><span class="chip high">✖ Bad for you</span> Banned or tightly restricted by the FDA or EU for this use, or a strong evidence-based concern (for example formaldehyde, triclosan).</li></ul>' +
      '<p>The same ingredient can rate differently by product type. Example: alcohol is OK in a mouthwash but a minor concern elsewhere, and the preservative MI is rated Bad for you in a leave-on lotion or deodorant (the EU bans it there).</p>' +
      "<p><b>Score:</b> starts at 100. Each ingredient group takes off points (OK about 6, Bad about 18, or an amount set for that ingredient). Ingredients beyond the first 10 on the label count at 75%, since they are in smaller amounts. Similar ingredients count once. Unrecognized ingredients are not counted.</p></div>" +
      '<div class="card"><h3>Where the facts come from</h3><p>Products and ingredient lists: <a href="https://world.openbeautyfacts.org" target="_blank" rel="noopener">Open Beauty Facts</a>, a free crowd-sourced database. It does not have every product, and entries can be wrong or incomplete. Ingredient notes: FDA, EU Cosmetics Regulation and the EU\u2019s SCCS scientific opinions, NIH/NIEHS, CDC, ADA, National Cancer Institute, IARC, the Cosmetic Ingredient Review, PubMed and, as a secondary source only, EWG Skin Deep. Every ingredient lists its sources.</p><p>Fluoride is explained honestly: the ADA and CDC support it for preventing cavities; the concern is children swallowing too much.</p></div>' +
      '<h2>Ingredient dictionary</h2><div class="field"><input type="search" id="dq" placeholder="Search ingredients, for example paraben or fluoride" autocomplete="off"></div><label class="switch"><input type="checkbox" id="dh"> Hormone-flagged only</label><div id="dout"></div>' +
      '<div class="card"><h3>Add a product and back it up</h3><p>If a scan finds nothing, you can <a href="#/add">add the product yourself</a>. The barcode, name and ingredient list stay on this device and are checked first the next time you scan that barcode. Use <a href="#/mine">My products</a> to edit, delete, or export a backup file you can import later (for example after switching phones). Nothing is sent to us. Sharing to Open Beauty Facts is optional and opens their site — this app never uploads for you.</p></div>' +
      disclaimer() + '<p class="fine">Body Care Scanner · ' + VERSION + "</p>";
    function draw() {
      var q = B.norm($("#dq").value), h = $("#dh").checked;
      var r = B.entries.filter(function (e) {
        if (h && !e.endo) return false;
        if (!q) return true;
        return B.norm(e.name).indexOf(q) >= 0 || (e.al || []).some(function (a) { return B.norm(a).indexOf(q) >= 0; });
      });
      $("#dout").innerHTML = r.map(function (e) {
        return '<details class="ing ' + e.level + '"><summary><span class="nm">' + esc(e.name) + '</span>' + chip(e.level) + (e.endo ? ' <span class="chip hor">⚠ Hormone</span>' : "") + (e.good ? ' <span class="chip help">★ Helpful</span>' : "") + '<span class="why">' + esc(e.why) + '</span></summary><div class="body"><h4>What it is</h4><div>' + esc(e.what) + "</div><h4>Safety notes</h4><div>" + esc(e.note) + "</div>" + hormDetail(e) + '<div class="src"><h4>Sources</h4>' + srcLinks(e) + "</div></div></details>";
      }).join("") || '<div class="card">No match.</div>';
    }
    $("#dq").addEventListener("input", draw); $("#dh").addEventListener("change", draw); draw();
  }

  /* ---------- add / edit / my products ---------- */
  function previewBox(text, cat) {
    var t = (text || "").trim();
    if (t.length < 3) return '<div class="info">Add the ingredient list to see a live rating. The app does not guess missing ingredients.</div>';
    var an = B.analyze(t, cat);
    if (!an.total) return '<div class="info">No ingredients could be read from that text yet. Separate them with commas.</div>';
    var pct = an.rated + " of " + an.total + " ingredients recognized";
    return verdictHTML(an, '<p class="small" style="opacity:.9">' + esc(pct) + ".</p>") +
      '<div class="counts"><div class="count g">' + an.counts.low + "<small>Good for you</small></div><div class=\"count o\">" + an.counts.mod + "<small>OK</small></div><div class=\"count b\">" + an.counts.high + "<small>Bad for you</small></div><div class=\"count u\">" + an.counts.unrated + "<small>Not rated</small></div></div>" +
      hormoneBox(an) +
      '<h3>Ingredients, in the order you entered them</h3><div id="ingList">' + an.items.map(ingRow).join("") + "</div>";
  }
  async function renderAdd(code, isEdit) {
    var draft = {};
    try { draft = JSON.parse(sessionStorage.getItem("bcs-add-draft") || "{}"); } catch (e) { draft = {}; }
    var existing = code ? await mineLookup(code) : null;
    if (isEdit && !existing) { main.innerHTML = '<div class="card">That product is not in My products. <a href="#/add">Add it</a> or <a href="#/mine">go back</a>.</div>'; return; }
    var known = null;
    if (!existing && code) {
      try { known = cacheGet(code) || await libLookup(code); } catch (e) { known = cacheGet(code); }
    }
    var rec = existing || {};
    var val = {
      code: rec.code || code || draft.code || "",
      name: rec.name || (known && known.name && known.name !== "Unnamed product" ? known.name : "") || draft.name || "",
      brands: rec.brands || (known && known.brands) || draft.brands || "",
      cat: rec.cat || (known && known.cat) || draft.cat || "",
      qty: rec.qty || (known && known.qty) || draft.qty || "",
      ing: rec.ing || draft.ing || (known && known.ing) || "",
      img: rec.img || ""
    };
    var already = known && !existing;
    main.innerHTML =
      "<h1>" + (existing ? "Edit this product" : "Add a product") + "</h1>" +
      '<p class="lead">Saved only on this device. The app never invents a barcode or an ingredient list — type what is on the package, or photograph it and fix any mistakes.</p>' +
      (already ? '<div class="note">This barcode is already in the app' + (known.name ? " as “" + esc(known.name) + "”" : "") + ". If you save your own copy, <b>your</b> name and ingredient list will be shown when you scan it.</div>" : "") +
      '<form class="card" id="addForm">' +
      '<div class="field"><label for="addCode">Barcode number</label><input id="addCode" inputmode="numeric" autocomplete="off" value="' + esc(val.code) + '" placeholder="The number under the barcode"></div>' +
      '<div class="row"><button type="button" class="btn ghost" id="addScanBtn">📷 Scan barcode</button></div>' +
      '<div id="addScanArea" hidden><div class="scan-stage"><video id="scanVideo" playsinline muted autoplay></video><div id="qr-reader" hidden></div>' +
      '<div class="viewfinder" id="vf"><div class="vf-box"></div></div><div class="scan-msg" id="scanMsg">Point the camera at the barcode</div><div class="scan-read" id="scanRead" aria-live="polite"></div>' +
      '<div class="scan-actions"><button type="button" class="btn ghost small" id="torchBtn" hidden style="background:#fff">Light</button><button type="button" class="btn ghost small" id="zoomBtn" hidden style="background:#fff">Zoom</button><button type="button" class="btn small" id="stopScan">Cancel</button></div></div><div id="scanRescue" hidden>' + rescueHTML("sr", "") + '</div></div>' +
      '<div class="field"><label for="addName">Product name</label><input id="addName" autocomplete="off" required value="' + esc(val.name) + '" placeholder="For example Cool Mint Antiseptic"></div>' +
      '<div class="field"><label for="addBrand">Brand</label><input id="addBrand" autocomplete="off" value="' + esc(val.brands) + '" placeholder="For example Listerine"></div>' +
      '<div class="small muted">Product type (helps the rating, for example alcohol in a mouthwash):</div>' + catChips(val.cat, "addChips") +
      '<div class="field"><label for="addQty">Size (optional)</label><input id="addQty" autocomplete="off" value="' + esc(val.qty) + '" placeholder="For example 16.9 fl oz"></div>' +
      '<div class="field"><span id="addPhotoLab" style="display:block;font-weight:650;margin-bottom:4px">Front photo (optional)</span>' +
      '<div class="photo-prev" id="addPhotoPrev">' + (val.img ? '<img src="' + esc(val.img) + '" alt="Front of the product">' : "") + "</div>" +
      '<div class="row"><label class="btn ghost" for="addPhoto" style="cursor:pointer">📷 Take or choose a photo</label><input id="addPhoto" type="file" accept="image/*" capture="environment" hidden>' +
      '<button type="button" class="btn ghost small" id="addPhotoClr"' + (val.img ? "" : " hidden") + ">Remove photo</button></div>" +
      '<p class="small muted">The photo is shrunk and stored on this device only.</p></div>' +
      '<div class="field"><label for="addIng">Ingredients</label><textarea id="addIng" placeholder="Aqua, Sodium Laureth Sulfate, Glycerin, Parfum…">' + esc(val.ing) + "</textarea></div>" +
      '<div class="row"><label class="btn ghost" for="addOcr" style="cursor:pointer">📷 Take photo of ingredient label</label><input id="addOcr" type="file" accept="image/*" capture="environment" hidden></div>' +
      '<div id="addOcrMsg" class="small muted" style="margin-top:8px"></div>' +
      "</form>" +
      '<h2>Live rating preview</h2><div id="livePrev"></div>' +
      '<div class="add-actions"><button type="button" class="btn xl block" id="addSave">' + (existing ? "Save changes" : "Save to this device") + "</button>" +
      (val.code && !/^m\d+$/.test(val.code) ? '<p class="small" style="margin:10px 0 0"><a target="_blank" rel="noopener" href="https://world.openbeautyfacts.org/cgi/product.pl?type=search_or_add&code=' + encodeURIComponent(val.code) + '">Also share it to Open Beauty Facts</a> (opens their add-product page; this app does not upload anything).</p>' : '<p class="small muted">If you add a barcode, you can also share the product to Open Beauty Facts after saving.</p>') +
      (existing ? '<p><button type="button" class="btn danger" id="addDel">Delete from this device</button></p>' : "") +
      '<p class="small muted"><a href="#/mine">Back to My products</a></p></div>' + disclaimer();
    var cat = val.cat, photo = val.img || "";
    wireChips("addChips", function (v) { cat = v; drawPrev(); });
    function drawPrev() { var box = $("#livePrev"); if (!box) return; box.innerHTML = previewBox($("#addIng").value, cat); animateBars(); }
    $("#addIng").addEventListener("input", function () { clearTimeout(drawPrev.t); drawPrev.t = setTimeout(drawPrev, 180); });
    drawPrev();
    $("#addPhoto").addEventListener("change", async function () {
      var f = this.files && this.files[0]; if (!f) return;
      try {
        photo = await compressPhoto(f, 900, 0.72);
        $("#addPhotoPrev").innerHTML = '<img src="' + esc(photo) + '" alt="Front of the product">';
        $("#addPhotoClr").hidden = false;
      } catch (e) { toast(e.message || "Could not use that photo."); }
    });
    $("#addPhotoClr").addEventListener("click", function () { photo = ""; $("#addPhotoPrev").innerHTML = ""; this.hidden = true; $("#addPhoto").value = ""; });
    $("#addOcr").addEventListener("change", function () { if (this.files && this.files[0]) runOCR(this.files[0], $("#addIng"), $("#addOcrMsg")).then(drawPrev); });
    $("#addScanBtn").addEventListener("click", function () { $("#addScanArea").hidden = false; beginScanToField($("#addCode")); });
    wireRescue("sr", function (d) { var ac = $("#addCode"); ac.value = d; try { ac.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {} stopScan(); $("#addScanArea").hidden = true; });
    $("#addSave").addEventListener("click", async function () {
      var c = digits($("#addCode").value) || (existing ? existing.code : "");
      var name = $("#addName").value.trim(), brands = $("#addBrand").value.trim(), qty = $("#addQty").value.trim(), ing = $("#addIng").value.trim();
      if (name.length < 2) return toast("Enter the product name.");
      if (ing.length < 3) return toast("Enter the ingredient list from the package.");
      if (c && c.length < 6 && !/^m\d+$/.test(c)) return toast("That barcode looks too short. Enter the number under the barcode, or leave it blank.");
      if (!c) c = existing && /^m\d+$/.test(existing.code) ? existing.code : "m" + Date.now();
      if (c && !/^m\d+$/.test(c) && !checkOK(c)) { if (!confirm("The barcode " + c + " does not have a valid check digit, so it may have been mistyped. Save it anyway?")) return; }
      var clash = await mineLookup(c);
      if (clash && (!existing || clash.code !== existing.code)) { toast("You already saved a product with that barcode: “" + clash.name + "”. Open it to edit."); return; }
      if (existing && existing.code !== c) await mineDel(existing.code);
      try {
        await minePut({ code: c, name: name, brands: brands, qty: qty, cat: cat, ing: ing, img: photo, added: existing && existing.added });
        try { sessionStorage.removeItem("bcs-add-draft"); } catch (e) {}
        toast(existing ? "Saved changes" : "Saved on this device");
        location.hash = "#/product/" + encodeURIComponent(c);
      } catch (e) { toast(e.message || "Could not save."); }
    });
    var del = $("#addDel");
    if (del) del.addEventListener("click", async function () {
      if (!confirm("Remove “" + val.name + "” from this device? This cannot be undone unless you have a backup file.")) return;
      await mineDel(existing.code); toast("Removed from this device"); location.hash = "#/mine";
    });
  }
  function beginScanToField(input) {
    var area = $("#addScanArea"); if (!area) return;
    function put(d) { input.value = d; try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {} setTimeout(function () { area.hidden = true; }, 400); }
    runScanner({ area: area, help: null, onAccept: put, onFail: function (err) { toast(((err && err.message) || "The camera could not start") + ". Type the number or use Take a photo."); } });
    var st = $("#stopScan"); if (st) st.onclick = function () { stopScan(); area.hidden = true; };
  }
  async function renderMine() {
    var list = await mineAll();
    list = list.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    main.innerHTML = '<h1>My products</h1><p class="lead">Products you added on this device. They are checked first when you scan, and they show up in name search and best-rated lists, tagged “Added by you.” Nothing here is sent off this phone.</p>' +
      '<a class="btn xl block" href="#/add">➕  Add a product</a>' +
      (list.length ? '<div class="list" style="margin-top:16px">' + list.map(function (r) {
        var p = mineProduct(r), an = p.ing ? B.analyze(p.ing, p.cat) : { verdict: null, endoDirect: [] };
        var q = { code: p.code, name: p.name, brands: p.brands, img: p.img, mine: true, score: an.enough ? an.score : null };
        return listRow(q, an, "#/product/" + encodeURIComponent(p.code));
      }).join("") + "</div>" : '<div class="card"><p>You have not added a product yet. If a scan comes back empty, add the barcode and the ingredient list from the package.</p></div>') +
      '<div class="card"><h3>Backup</h3><p class="small muted">Download a file of your products (including photos) so you can bring them back later, for example on a new phone. The file stays in your downloads until you choose to import it. It does not include your scan history or favorites.</p>' +
      '<div class="row"><button type="button" class="btn" id="expBtn">⬇️ Export backup file</button>' +
      '<label class="btn ghost" for="impFile" style="cursor:pointer">⬆️ Import backup file</label><input id="impFile" type="file" accept="application/json,.json" hidden></div>' +
      '<div id="impMsg" class="small muted" style="margin-top:8px"></div></div>' + disclaimer();
    $("#expBtn").addEventListener("click", function () { exportMine(list); });
    $("#impFile").addEventListener("change", function () { if (this.files && this.files[0]) importMine(this.files[0], $("#impMsg")); });
  }
  function exportMine(list) {
    var data = { app: "Body Care Scanner", kind: "my-products", version: VERSION, exported: new Date().toISOString(), products: list.map(function (r) { return { code: r.code, name: r.name, brands: r.brands || "", qty: r.qty || "", cat: r.cat || "", ing: r.ing || "", img: r.img || "", added: r.added, updated: r.updated }; }) };
    var blob = new Blob([JSON.stringify(data)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "body-care-scanner-my-products.json"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("Backup file downloaded");
  }
  async function importMine(file, msg) {
    msg.textContent = "Reading the file…";
    try {
      var data = JSON.parse(await file.text()), rows = (data && data.products) || (Array.isArray(data) ? data : null);
      if (!rows) throw new Error("This file is not a Body Care Scanner backup.");
      var ok = 0, skip = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r || !r.name || !(r.ing || "").trim()) { skip++; continue; }
        var c = String(r.code || ("m" + Date.now() + i));
        await minePut({ code: c, name: String(r.name), brands: r.brands || "", qty: r.qty || "", cat: r.cat || "", ing: String(r.ing), img: r.img || "", added: r.added, updated: r.updated });
        ok++;
      }
      msg.innerHTML = "✔ Imported " + ok + " product" + (ok === 1 ? "" : "s") + (skip ? ". Skipped " + skip + " incomplete " + (skip === 1 ? "row" : "rows") + "." : ".");
      toast("Imported " + ok + " product" + (ok === 1 ? "" : "s"));
      setTimeout(function () { renderMine(); }, 600);
    } catch (e) { msg.innerHTML = '<span style="color:var(--bad)">' + esc(e.message || "Could not import that file.") + "</span>"; }
  }


  window.BCS_APP = { route: route, version: VERSION };
  route();
})();
