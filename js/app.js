/* Body Care Scanner — phone-first PWA. Product data: Open Beauty Facts. Ratings computed on-device. */
(function () {
  "use strict";
  var B = window.BCS;
  var OBF = "https://world.openbeautyfacts.org";
  var FIELDS = "code,product_name,product_name_en,brands,quantity,ingredients_text,ingredients_text_en,image_front_small_url,categories_tags,countries_tags";
  var KEYS = { hist: "bcs-history", fav: "bcs-favorites", theme: "bcs-theme", cache: "bcs-cache", over: "bcs-over", hormOnly: "bcs-horm-only" };
  var VERSION = "bodycare-v1";
  var main = document.getElementById("main");
  var toastEl = document.getElementById("toast");
  var themeBtn = document.getElementById("themeBtn");
  var netPill = document.getElementById("netPill");
  var scanCtl = null, searchTimer = 0, selCat = "", routeToken = 0;

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
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(function () {});

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

  /* ---------- Open Beauty Facts ---------- */
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function candidates(raw) {
    var d = digits(raw), out = [];
    function add(x) { if (x && out.indexOf(x) < 0) out.push(x); }
    add(d);
    if (d.length === 12) add("0" + d);
    if (d.length === 13 && d.charAt(0) === "0") add(d.slice(1));
    if (d.length >= 8 && d.length < 13) add(d.padStart(13, "0"));
    return out;
  }
  function norm(p) {
    var ing = p.ingredients_text_en || p.ingredients_text || "";
    var name = p.product_name_en || p.product_name || "";
    var tags = p.categories_tags || [];
    var cat = B.guessCategory(name + " " + (p.brands || ""), tags);
    return { code: String(p.code), name: name || "Unnamed product", brands: p.brands || "", qty: p.quantity || "", img: p.image_front_small_url || "", ing: ing, cat: cat, tags: tags };
  }
  async function getJSON(url) {
    var res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Open Beauty Facts returned " + res.status);
    return res.json();
  }
  async function lookup(raw) {
    var list = candidates(raw);
    if (!list.length) throw new Error("Enter a barcode number.");
    for (var i = 0; i < list.length; i++) {
      var d = await getJSON(OBF + "/api/v2/product/" + encodeURIComponent(list[i]) + ".json?fields=" + FIELDS);
      if (d && d.status === 1 && d.product) { d.product.code = d.product.code || d.code || list[i]; return norm(d.product); }
    }
    return null;
  }
  async function searchName(q, cat) {
    var u = OBF + "/cgi/search.pl?search_terms=" + encodeURIComponent(q) + "&search_simple=1&action=process&json=1&page_size=24&fields=" + FIELDS;
    if (cat) u += "&tagtype_0=categories&tag_contains_0=contains&tag_0=" + encodeURIComponent(B.CAT_BY_ID[cat].tag.replace("en:", ""));
    var d = await getJSON(u);
    return ((d && d.products) || []).filter(function (p) { return p.code; }).map(norm);
  }
  async function browseCat(cat, us) {
    var u = OBF + "/api/v2/search?categories_tags=" + encodeURIComponent(B.CAT_BY_ID[cat].tag) + "&page_size=60&sort_by=unique_scans_n&fields=" + FIELDS;
    if (us) u += "&countries_tags=en:united-states";
    var d = await getJSON(u);
    return ((d && d.products) || []).filter(function (p) { return p.code; }).map(norm);
  }
  function analyzeProduct(p) { return B.analyze(overrides()[p.code] || p.ing, p.cat); }

  /* ---------- camera ---------- */
  var FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "codabar"];
  async function startNative(video, onCode) {
    var stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = stream; video.setAttribute("playsinline", "true"); video.muted = true; await video.play();
    var det = new BarcodeDetector({ formats: FORMATS }), stopped = false;
    (function tick() {
      if (stopped) return;
      Promise.resolve(video.readyState >= 2 ? det.detect(video) : []).then(function (codes) {
        if (codes && codes.length && codes[0].rawValue) { onCode(codes[0].rawValue); return; }
        if (!stopped) requestAnimationFrame(tick);
      }).catch(function () { if (!stopped) requestAnimationFrame(tick); });
    })();
    return { stop: function () { stopped = true; stream.getTracks().forEach(function (t) { t.stop(); }); video.srcObject = null; }, stream: stream };
  }
  async function startZxing(id, onCode) {
    if (typeof Html5Qrcode === "undefined") throw new Error("Scanner library failed to load.");
    var h = new Html5Qrcode(id, { verbose: false });
    var F = Html5QrcodeSupportedFormats;
    await h.start({ facingMode: "environment" }, { fps: 8, qrbox: { width: 260, height: 140 }, formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF] }, function (t) { onCode(t); }, function () {});
    return { stop: function () { return h.stop().then(function () { h.clear(); }).catch(function () {}); }, stream: null };
  }
  async function stopScan() { if (scanCtl) { try { await scanCtl.stop(); } catch (e) {} scanCtl = null; } }
  function beep() { try { if (navigator.vibrate) navigator.vibrate(80); var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = 0.06; o.connect(g); g.connect(c.destination); o.start(); setTimeout(function () { o.stop(); c.close(); }, 120); } catch (e) {} }
  function cameraHelp(err) {
    var n = (err && (err.name || err.message)) || "";
    var h = '<div class="note"><b>The camera could not start.</b>';
    if (!window.isSecureContext) h += "<p>The camera only works on a secure (https) page. Open the live app address.</p>";
    else if (/NotAllowed|Permission|denied/i.test(n)) h += "<p>Camera permission is blocked. In Chrome, tap the lock icon in the address bar, set Camera to Allow, then tap Scan again. You can also type the barcode or search by name.</p>";
    else if (/NotFound|DevicesNotFound|Requested device/i.test(n)) h += "<p>No camera was found on this device. Type the barcode or search by name instead.</p>";
    else h += "<p>" + esc(err && err.message ? err.message : "Unknown camera error") + ". You can type the barcode or search by name instead.</p>";
    return h + "</div>";
  }

  /* ---------- routing ---------- */
  function route() {
    routeToken++;
    var parts = (location.hash || "#/scan").replace(/^#\/?/, "").split("/").filter(Boolean);
    var page = parts[0] || "scan";
    $$(".tabs button").forEach(function (b) { var on = b.getAttribute("data-go") === (page === "product" || page === "browse" ? "scan" : page); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    stopScan();
    window.scrollTo(0, 0);
    if (page === "product" && parts[1]) return renderProduct(decodeURIComponent(parts[1]));
    if (page === "browse" && parts[1]) return renderBrowse(parts[1]);
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
      '<div class="meta"><b>' + esc(p.name) + '</b><div class="sub">' + esc(p.brands || "Unknown brand") + (p.score != null ? " · Score " + p.score : "") + "</div></div>" +
      '<div class="row" style="justify-content:flex-end;flex:none;max-width:110px">' + vbadge(an ? an.verdict : p.verdict) + ((an ? an.endoDirect.length : p.endo) ? '<span class="badge hor" title="Hormone-disruptor flag">⚠ Hormone</span>' : "") + "</div></a>";
  }

  /* ---------- scan (home) ---------- */
  function renderScan() {
    main.innerHTML =
      '<div class="hero"><h1>What is really in your body-care products?</h1>' +
      '<p class="lead">Scan toothpaste, mouthwash, shampoo, conditioner, soap, body wash, deodorant or lotion. Every ingredient is explained in plain English and rated <b>Good for you</b>, <b>OK</b> or <b>Bad for you</b>, with hormone-disruptor flags and sources.</p>' +
      '<button type="button" class="btn xl block" id="startScan">📷  Scan barcode</button></div>' +
      '<div id="scanArea" hidden><div class="scan-stage"><video id="scanVideo" playsinline muted autoplay></video><div id="qr-reader" hidden></div>' +
      '<div class="viewfinder" id="vf"><div class="vf-box"></div></div><div class="scan-msg">Point the camera at the barcode</div>' +
      '<div class="scan-actions"><button type="button" class="btn ghost small" id="torchBtn" hidden style="background:#fff">Light</button><button type="button" class="btn small" id="stopScan">Cancel</button></div></div></div>' +
      '<div id="scanHelp"></div>' +
      '<div class="or">or type the barcode</div>' +
      '<form class="card" id="codeForm"><div class="field"><label for="codeIn">Barcode number</label><input id="codeIn" inputmode="numeric" autocomplete="off" placeholder="For example 7891024133545"></div><button type="submit" class="btn block">Look up barcode</button></form>' +
      '<div class="or">or search by name</div>' +
      '<form class="card" id="nameForm"><div class="field"><label for="nameIn">Product name or brand</label><input id="nameIn" autocomplete="off" placeholder="For example Colgate, Listerine, Dove"></div>' +
      '<div class="small muted">Optional: pick a type to narrow the search, or to see the best-rated products of that type.</div>' + catChips(selCat, "chips") +
      '<button type="submit" class="btn block ghost">Search Open Beauty Facts</button><div id="browseLink"></div><div id="searchOut" class="search-res"></div></form>' +
      '<div class="or">or use the ingredient list</div><a class="btn ghost block" href="#/check">📝 Paste or photograph the ingredient list</a>' +
      recentStrip() + disclaimer();
    $("#startScan").addEventListener("click", beginScan);
    $("#stopScan").addEventListener("click", function () { stopScan(); $("#scanArea").hidden = true; });
    $("#codeForm").addEventListener("submit", function (e) { e.preventDefault(); var d = digits($("#codeIn").value); if (d.length < 6) return toast("Enter at least 6 digits."); location.hash = "#/product/" + d; });
    $("#nameForm").addEventListener("submit", function (e) { e.preventDefault(); runSearch($("#nameIn").value.trim()); });
    wireChips("chips", function (v) { selCat = v; browseLink(); });
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
        var q2 = { code: p.code, name: p.name, brands: p.brands, img: p.img, score: an && an.enough ? an.score : null };
        return listRow(q2, an || { verdict: null, endoDirect: [] }, "#/product/" + encodeURIComponent(p.code));
      }).join("");
    } catch (e) { out.innerHTML = '<div class="note">Search is not available right now (' + esc(e.message) + "). Check your connection or type the barcode.</div>"; }
  }
  async function beginScan() {
    var area = $("#scanArea"), help = $("#scanHelp"); help.innerHTML = ""; area.hidden = false; await stopScan();
    var video = $("#scanVideo"), zx = $("#qr-reader"), vf = $("#vf"), torch = $("#torchBtn"); torch.hidden = true;
    var onCode = function (raw) { var d = digits(raw); if (!d || d.length < 6) return; beep(); stopScan(); location.hash = "#/product/" + d; };
    try {
      if (!window.isSecureContext) throw new Error("Camera needs HTTPS.");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This browser cannot open the camera.");
      if (typeof window.BarcodeDetector === "function") {
        try { video.hidden = false; zx.hidden = true; vf.hidden = false; scanCtl = await startNative(video, onCode); }
        catch (e) { video.hidden = true; zx.hidden = false; vf.hidden = true; scanCtl = await startZxing("qr-reader", onCode); }
      } else { video.hidden = true; zx.hidden = false; vf.hidden = true; scanCtl = await startZxing("qr-reader", onCode); }
      try {
        var stream = scanCtl.stream || video.srcObject, track = stream && stream.getVideoTracks()[0], caps = track && track.getCapabilities && track.getCapabilities();
        if (caps && caps.torch) { torch.hidden = false; var on = false; torch.onclick = function () { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }).catch(function () {}); torch.textContent = on ? "Light off" : "Light"; }; }
      } catch (e) {}
    } catch (err) { area.hidden = true; help.innerHTML = cameraHelp(err); }
  }

  /* ---------- product ---------- */
  async function renderProduct(code) {
    var tok = routeToken;
    var p = null;
    if (/^p\d+$/.test(code)) {
      var h = histList().concat(favList()).filter(function (x) { return x.code === code; })[0];
      if (!h || !h.ing) { main.innerHTML = '<div class="card">That saved list was not found. <a href="#/check">Check a new list</a>.</div>'; return; }
      p = { code: code, name: h.name, brands: h.brands || "Pasted ingredient list", img: "", ing: h.ing, cat: h.cat, pasted: true };
    } else {
      p = cacheGet(code);
      if (!p) {
        main.innerHTML = '<div class="card"><span class="spin"></span>Looking up ' + esc(code) + " in Open Beauty Facts…</div>";
        try { p = await lookup(code); } catch (e) {
          var c2 = cacheGet(code);
          if (!c2) { if (tok === routeToken) main.innerHTML = '<div class="note"><b>Could not reach Open Beauty Facts.</b><br>' + esc(e.message) + '. Check your connection and try again, or <a href="#/check">paste the ingredient list</a>.</div>'; return; }
          p = c2;
        }
        if (tok !== routeToken) return;
        if (!p) { notFound(code); return; }
        cachePut(code, p);
      }
    }
    if (tok !== routeToken) return;
    showProduct(p);
  }
  function notFound(code) {
    main.innerHTML = '<h1>Product not found</h1><div class="card"><p>Barcode <b>' + esc(code) + "</b> is not in the Open Beauty Facts database yet. The app never guesses at products, so nothing is shown for it.</p>" +
      "<p><b>What you can do:</b></p><ul><li>Type the product name in the search box on the Scan page.</li><li>Paste or photograph the ingredient list from the package below to rate it.</li><li>Add the product to the free database so everyone can find it: <a href=\"https://world.openbeautyfacts.org/cgi/product.pl?type=search_or_add&code=" + encodeURIComponent(code) + '" target="_blank" rel="noopener">Open Beauty Facts</a>.</li></ul></div>' +
      pasteForm("nf", code, "") + '<div id="pasteOut"></div>' + disclaimer();
    wirePaste("nf", { code: code, name: "Barcode " + code, brands: "", img: "", cat: "" });
  }
  function showProduct(p) {
    var override = overrides()[p.code];
    var an = analyzeProduct(p);
    remember(p, an);
    var cat = p.cat ? B.CAT_BY_ID[p.cat] : null;
    var fav = isFav(p.code);
    var head = '<div class="card"><div class="prodhead">' + (p.img ? '<img src="' + esc(p.img) + '" alt="">' : '<div class="ph" style="width:84px;height:84px;display:flex;align-items:center;justify-content:center;font-size:2.4rem" aria-hidden="true">🧴</div>') +
      '<div><h1>' + esc(p.name) + '</h1><div class="muted">' + esc(p.brands || "Unknown brand") + (p.qty ? " · " + esc(p.qty) : "") + '</div><div class="row" style="margin-top:6px">' +
      (cat ? '<span class="chip help">' + cat.icon + " " + esc(cat.label) + "</span>" : '<span class="chip na">Type unknown</span>') + (p.pasted ? '<span class="chip na">Your list</span>' : "") + (override ? '<span class="chip na">Your edited list</span>' : "") + "</div></div></div>" +
      '<div class="row" style="margin-top:10px"><button class="btn small ' + (fav ? "" : "ghost") + '" id="favBtn">' + (fav ? "★ Saved" : "☆ Save to favorites") + '</button>' +
      (p.pasted ? "" : '<a class="btn small ghost" target="_blank" rel="noopener" href="https://world.openbeautyfacts.org/product/' + encodeURIComponent(p.code) + '">Open Beauty Facts page</a>') +
      '<button class="btn small ghost" id="editBtn">✏️ Edit ingredient list</button></div></div>';
    var body;
    if (!an.total) {
      body = '<div class="verdict NA"><div class="big">?<small>NO INGREDIENTS LISTED</small></div><p>Open Beauty Facts has this product but nobody has entered its ingredient list yet, so it cannot be rated. The app does not guess. Read the list off the package and paste it below, or photograph it.</p></div>' +
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
    $("#favBtn").addEventListener("click", function () { toggleFav(p, an); showProduct(p); });
    $("#editBtn").addEventListener("click", function () { var f = $("#pf-pp2") || $("#pf-pp"); if (f) { var d = f.closest("details"); if (d) d.open = true; f.scrollIntoView({ behavior: "smooth", block: "center" }); f.focus(); } });
    ["pp", "pp2"].forEach(function (id) { if ($("#pf-" + id)) wirePaste(id, p); });
    var flt = $("#ingFilters");
    if (flt) flt.addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]"); if (!b) return; var f = b.getAttribute("data-f");
      $$("#ingFilters button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      $$("#ingList .ing").forEach(function (r) { r.hidden = !(f === "all" || (f === "h" ? r.getAttribute("data-h") === "1" : r.getAttribute("data-lv") === f)); });
    });
    animateBars();
    if (an.enough && p.cat && !p.pasted) loadAlternatives(p, an);
  }
  async function loadAlternatives(p, an) {
    var box = $("#altBox"); if (!box) return; var tok = routeToken;
    box.innerHTML = '<h2>Cleaner picks in the same category</h2><div class="muted"><span class="spin"></span>Looking for better-rated products in Open Beauty Facts…</div>';
    try {
      var list = await browseCat(p.cat, true);
      if (list.length < 8) list = list.concat(await browseCat(p.cat, false));
      if (tok !== routeToken) return;
      var seen = {}, scored = [];
      list.forEach(function (q) {
        if (q.code === p.code || seen[q.code] || !q.ing) return; seen[q.code] = 1;
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
        better.map(function (s) { var q = { code: s.p.code, name: s.p.name, brands: s.p.brands, img: s.p.img, score: s.a.score }; return listRow(q, s.a, "#/product/" + encodeURIComponent(s.p.code)); }).join("") + "</div>";
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
    main.innerHTML = "<h1>" + (kind === "history" ? "Scan history" : "Favorites") + "</h1><p class=\"lead\">Saved only on this device.</p>" +
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
    main.innerHTML = "<h1>" + c.icon + " Best-rated " + esc(c.label.toLowerCase()) + "</h1><p class=\"lead\">Real products from Open Beauty Facts (most-scanned, US first), re-rated by this app from their listed ingredients. Only products with an ingredient list are shown.</p>" +
      '<label class="switch"><input type="checkbox" id="bh" ' + (only ? "checked" : "") + '> Hide products with hormone-disruptor flags</label>' + (cat === "toothpaste" ? '<label class="switch"><input type="checkbox" id="bf" checked> Only toothpastes with fluoride (the ADA and CDC recommend fluoride for cavity protection; this rating does not reward it)</label>' : "") + '<div id="bout"><span class="spin"></span>Loading…</div>' + disclaimer();
    try {
      var list = await browseCat(cat, true); if (list.length < 15) list = list.concat(await browseCat(cat, false));
      if (tok !== routeToken) return;
      var seen = {}, rows = [];
      list.forEach(function (q) { if (seen[q.code] || !q.ing) return; seen[q.code] = 1; var a = B.analyze(q.ing, cat); if (a.enough && a.total >= 5) rows.push({ p: q, a: a }); });
      rows.sort(function (x, y) { return y.a.score - x.a.score; });
      function draw() {
        var hide = $("#bh").checked; save(KEYS.hormOnly, hide);
        var r = hide ? rows.filter(function (x) { return !x.a.endoDirect.length; }) : rows;
        if ($("#bf") && $("#bf").checked) r = r.filter(function (x) { return x.a.items.some(function (i) { return i.rated && i.entry.id === "fluoride"; }); });
        $("#bout").innerHTML = r.length ? '<div class="list">' + r.slice(0, 30).map(function (s) { return listRow({ code: s.p.code, name: s.p.name, brands: s.p.brands, img: s.p.img, score: s.a.score }, s.a, "#/product/" + encodeURIComponent(s.p.code)); }).join("") + "</div><p class=\"fine\">" + rows.length + " products with readable ingredient lists were rated. Open Beauty Facts does not have every product.</p>" : '<div class="card">No products to show with that filter.</div>';
      }
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

  window.BCS_APP = { route: route, version: VERSION };
  route();
})();
