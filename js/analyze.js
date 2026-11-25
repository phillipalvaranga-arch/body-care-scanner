/* Body Care Scanner — ingredient parsing, matching and scoring. */
(function () {
  "use strict";
  var DB = window.BCS_DB;

  var CATS = [
    { id: "toothpaste", label: "Toothpaste", icon: "🦷", tag: "en:toothpastes", words: /tooth ?paste|dentifrice|dentrifice|toothgel|tooth gel/i, rinse: true },
    { id: "mouthwash", label: "Mouthwash", icon: "🫧", tag: "en:mouthwashes", words: /mouth ?wash|listerine|scope\b|colgate plax|act (anticavity|total)|mouth ?rinse|bain de bouche|oral rinse/i, rinse: true },
    { id: "shampoo", label: "Shampoo", icon: "🧴", tag: "en:shampoos", words: /shampoo|shampoing/i, rinse: true },
    { id: "hair", label: "Conditioner / Hair", icon: "💇", tag: "en:hair-conditioners", words: /conditioner|hair (mask|oil|gel|spray|cream|dye|colou?r|treatment)|après-shampoing|hair ?care/i, rinse: true },
    { id: "soap", label: "Soap", icon: "🧼", tag: "en:soaps", words: /\bsoap\b|savon/i, rinse: true },
    { id: "bodywash", label: "Body wash / Bath gel", icon: "🚿", tag: "en:shower-gels", words: /body ?wash|shower ?gel|bath ?gel|gel douche|bubble bath/i, rinse: true },
    { id: "deodorant", label: "Deodorant", icon: "🌬️", tag: "en:deodorants", words: /deodorant|antiperspirant|déodorant/i, rinse: false },
    { id: "lotion", label: "Lotion", icon: "🧴", tag: "en:body-milks", words: /lotion|body ?milk|moisturi[sz]er|cream|crème|body butter/i, rinse: false }
  ];
  var CAT_BY_ID = {};
  CATS.forEach(function (c) { CAT_BY_ID[c.id] = c; });

  function guessCategory(name, tags) {
    var t = (tags || []).join(" ").toLowerCase();
    var map = [
      ["toothpaste", /toothpaste|dentifrice/], ["mouthwash", /mouthwash|mouth-rinse|mouthrinse|bain-de-bouche/],
      ["shampoo", /shampoo/], ["hair", /conditioner|hair-mask|hair-oil|hair-styl|hair-care|hair-treat|hair-dye|hair-colou?r/],
      ["bodywash", /shower-gel|bath-gel|body-wash|bubble-bath|bath/], ["soap", /\bsoaps?\b|en:soap/],
      ["deodorant", /deodorant|antiperspirant/], ["lotion", /lotion|body-milk|hand-cream|moisturi|creams/]
    ];
    for (var i = 0; i < map.length; i++) if (map[i][1].test(t)) return map[i][0];
    for (var j = 0; j < CATS.length; j++) if (CATS[j].words.test(name || "")) return CATS[j].id;
    return null;
  }

  /* ---------- normalising ---------- */
  function norm(s) {
    s = String(s || "").toLowerCase();
    try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    s = s.replace(/[\u2018\u2019\u00b4`']/g, "").replace(/[\u2013\u2014]/g, "-");
    s = s.replace(/sulphate/g, "sulfate").replace(/sulphonate/g, "sulfonate").replace(/aluminium/g, "aluminum").replace(/colour/g, "color").replace(/flavour/g, "flavor");
    s = s.replace(/\b\d+([.,]\d+)?\s*%/g, " ").replace(/\bw\/[vw]\b/g, " ");
    s = s.replace(/[*†‡§]+/g, " ").replace(/\bci\s*0*(\d{5})\b/g, "ci $1").replace(/\bc\.i\.\s*(\d{5})/g, "ci $1");
    s = s.replace(/[^a-z0-9&,.:\/\- +]/g, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/^[-.: ]+|[-.: ,]+$/g, "");
    return s;
  }

  /* index */
  var INDEX = {}; var KEYS = [];
  DB.entries.forEach(function (e) {
    var names = (e.al || []).concat([e.name]);
    names.forEach(function (n) {
      var k = norm(n);
      if (k && !INDEX[k]) { INDEX[k] = e; KEYS.push(k); }
      var noPar = norm(String(n).replace(/\([^)]*\)/g, " "));
      if (noPar && !INDEX[noPar]) { INDEX[noPar] = e; KEYS.push(noPar); }
    });
  });
  var MAXW = 7;

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  /* ---------- generic rules (when an exact entry is not found) ---------- */
  var GEN = [
    { re: /^ci \d{5}/, name: "Color additive (CI number)", unrated: true, what: "A color additive identified by its Colour Index (CI) number. This specific number is not in the app's list, so it is not rated.", note: "Colors must be approved (FDA in the US, Annex IV in the EU) before they can be used in cosmetics." },
    { re: /^(peg|ppg)[- ]?\d+|polyethylene glycol|polyoxyethylene|oxynol|^[a-z]+eth-\d+|^polysorbate|^laureth|^ceteareth|^steareth|^oleth|^ceteth|^trideceth|^deceth|^pareth/, name: "Ethoxylated ingredient (PEG-type)", level: "low", pen: 2, what: "A softener, emulsifier or foaming agent made by adding ethylene oxide units (names with PEG, -eth-, polysorbate or -oxynol-).", why: "Considered safe as used, but ethoxylated ingredients can carry trace 1,4-dioxane.", note: "Considered safe as used. The manufacturing process can leave trace amounts of 1,4-dioxane, a potential human carcinogen at higher exposure. The FDA monitors it, notes levels have declined over time, and cites an EU scientific panel (SCCS) that considers trace levels of 10 ppm or less safe. You cannot see the amount on the label.", src: ["fda_dioxane", "cir"] },
    { re: /^(isopropyl|ethylhexyl|cetyl|octyl|decyl|caprylyl|myristyl|c\d+-\d+ alkyl|stearyl|lauryl) (myristate|palmitate|stearate|benzoate|laurate|oleate|isononanoate|esters?|cocoate|adipate|citrate|lactate)$/, name: "Emollient ester", level: "low", pen: 0, what: "A light, silky oil made from fatty acids that softens skin and helps creams spread.", note: "Considered safe as used.", src: ["cir"] },
    { re: /^polyquaternium-\d+/, name: "Polyquaternium polymer", level: "low", pen: 1, what: "A conditioning polymer that coats hair and reduces tangles.", note: "Considered safe as used.", src: ["cir"] },
    { re: /^hydrolyzed [a-z ]+(protein|keratin|silk|collagen|wheat|soy|oat|rice)|^hydrolyzed /, name: "Hydrolyzed protein", level: "low", pen: 0, what: "A protein broken into small pieces that helps hair or skin hold moisture.", note: "Considered safe as used. Rarely causes allergy (for example, hydrolyzed wheat protein in people with wheat allergy).", src: ["cir"] },
    { re: /(^| )(oil|butter|extract|juice|leaf|flower|seed|fruit|root|peel|bark|wax|essential oil|water)( |$)|^[a-z]+ [a-z]+ (leaf|flower|seed|fruit|root|peel|bark|kernel|nut) /, not: /sodium|potassium|ammonium|peg|mineral|petrol|paraffin|silic|^purified|^deionized|parfum|fragrance|aroma/, name: "Plant oil, butter or extract", level: "low", pen: 0.5, what: "An ingredient taken from a plant (oil, butter, extract or flower/leaf water) for scent, softening or soothing.", note: "Usually low concern. Plant extracts and essential oils can contain natural fragrance allergens (for example limonene or linalool), and a few people are sensitive to particular plants.", src: ["cir", "eu_1223"] }
  ];

  var LEVEL_PEN = { low: 0, mod: 6, high: 18 };
  var LABEL = { low: "Good for you", mod: "OK", high: "Bad for you" };

  function entryFor(e, key, cat) {
    var level = (e.by && cat && e.by[cat]) || e.level;
    var pen = e.pen != null ? e.pen : LEVEL_PEN[level];
    if (cat && e.penBy && e.penBy[cat] != null) pen = e.penBy[cat];
    if (e.perName && e.perName[key]) { level = e.perName[key][0]; pen = e.perName[key][1]; }
    return { entry: e, level: level, pen: pen };
  }

  function lookup(piece, cat, allowFuzzy) {
    var k = norm(piece);
    if (!k) return null;
    var e = INDEX[k];
    if (e) return Object.assign({ key: k }, entryFor(e, k, cat));
    var k2 = norm(String(piece).replace(/\([^)]*\)|\[[^\]]*\]/g, " "));
    if (k2 && INDEX[k2]) return Object.assign({ key: k2 }, entryFor(INDEX[k2], k2, cat));
    var inner = String(piece).match(/[(\[]([^()\[\]]+)[)\]]/);
    if (inner) {
      var k3 = norm(inner[1]);
      if (INDEX[k3]) return Object.assign({ key: k3 }, entryFor(INDEX[k3], k3, cat));
    }
    var base = k2 || k;
    /* strip a trailing "(and)" style leftovers */
    base = base.replace(/ \(?and\)?$/, "");
    if (INDEX[base]) return Object.assign({ key: base }, entryFor(INDEX[base], base, cat));
    for (var i = 0; i < GEN.length; i++) {
      var g = GEN[i];
      if (g.re.test(base) && !(g.not && g.not.test(base))) {
        if (g.unrated) return { generic: g, unrated: true, key: base };
        return {
          key: base, generic: g,
          entry: { id: "gen-" + i, name: g.name, role: "Matched by type", what: g.what, level: g.level, note: g.note, why: g.why || g.note.split(/\.\s/)[0].replace(/\.+$/, "") + ".", src: g.src || [], pen: g.pen },
          level: g.level, pen: g.pen
        };
      }
    }
    if (allowFuzzy && base.length >= 8) {
      var best = null, bestD = 99, tie = false, max = base.length >= 14 ? 2 : 1;
      for (var j = 0; j < KEYS.length; j++) {
        var kk = KEYS[j];
        if (kk.length < 8) continue;
        var d = lev(base, kk, max);
        if (d <= max) {
          if (d < bestD) { bestD = d; best = kk; tie = false; }
          else if (d === bestD && INDEX[kk] !== INDEX[best]) tie = true;
        }
      }
      if (best && !tie) return Object.assign({ key: best, approx: best }, entryFor(INDEX[best], best, cat));
    }
    return null;
  }

  /* word-run segmentation for lists missing commas: "Sodium Lauryl Sulfate Cellulose Gum" */
  function segment(piece, cat) {
    var words = norm(piece).split(" ");
    if (words.length < 2) return null;
    var out = [];
    if (words.length <= 14) (function rec(i, acc) {
      if (out.length) return;
      if (i >= words.length) { out = acc.slice(); return; }
      for (var n = Math.min(MAXW, words.length - i); n >= 1; n--) {
        var chunk = words.slice(i, i + n).join(" ");
        if (INDEX[chunk]) { acc.push(chunk); rec(i + n, acc); if (out.length) return; acc.pop(); }
      }
    })(0, []);
    if (out.length >= 2) return out;
    /* Long runs (a maker page that lost its commas): take the longest known names left to right and keep
       unknown words together as one unrated piece. Used only when most of the words are recognised. */
    if (words.length < 6 || words.length > 60) return null;
    var res = [], unk = [], known = 0, i = 0;
    while (i < words.length) {
      var got = 0;
      for (var n = Math.min(MAXW, words.length - i); n >= 1; n--) { if (INDEX[words.slice(i, i + n).join(" ")]) { got = n; break; } }
      if (got) { if (unk.length) { res.push({ unk: unk.join(" ") }); unk = []; } res.push(words.slice(i, i + got).join(" ")); known += got; i += got; }
      else { unk.push(words[i]); i++; }
    }
    if (unk.length) res.push({ unk: unk.join(" ") });
    return known / words.length >= 0.5 && res.length >= 3 ? res : null;
  }

  /* ---------- parsing ---------- */
  function topSplit(text) {
    var out = [], depth = 0, cur = "";
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
      if (depth === 0 && (c === "," || c === ";" || c === "\u00b7" || c === "\u2022" || c === "|" || c === "\u2027")) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function cleanText(raw) {
    var t = String(raw || "").replace(/\r/g, "\n");
    t = t.replace(/<[^>]+>/g, " ").replace(/_/g, " ");
    t = t.replace(/\b(active|inactive|other|key)?\s*ingredients?\s*(\(s\))?\s*[:\-–]/ig, ", ");
    t = t.replace(/\bpurposes?\s*[:\-–][^,;\n]*/ig, " ");
    t = t.replace(/\b(may contain|\+\/-|\+\/\u2212|peut contenir)\s*[:\-]?/ig, ", ");
    t = t.replace(/\bdirections?\s*:.*$/is, " ").replace(/\bwarnings?\s*:.*$/is, " ");
    if (t.indexOf(",") < 0 && t.indexOf(";") < 0) t = t.replace(/\n+/g, ", ");
    else t = t.replace(/\n+/g, " ");
    return t.replace(/\s+/g, " ").trim();
  }

  function parseList(raw) {
    var t = cleanText(raw);
    var pieces = [];
    topSplit(t).forEach(function (p) {
      p = p.trim();
      if (!p) return;
      var m = p.match(/^([^()\[\]]*)[(\[]([^()\[\]]*,[^()\[\]]*)[)\]]\s*\.?$/);
      if (m && !INDEX[norm(m[1])]) {
        topSplit(m[2]).forEach(function (q) { if (q.trim()) pieces.push(q.trim()); });
      } else pieces.push(p);
    });
    return pieces.map(function (p) { return p.replace(/\.+$/, "").trim(); }).filter(function (p) { return p && norm(p).length > 1; });
  }

  /* ---------- analysis ---------- */
  function analyze(raw, cat) {
    var pieces = parseList(raw);
    var items = [];
    var noise = 0;
    pieces.forEach(function (p) {
      var hit = lookup(p, cat, true);
      if (!hit) {
        var seg = segment(p, cat);
        if (seg) {
          seg.forEach(function (k) {
            if (typeof k === "object") { items.push({ raw: k.unk, rated: false }); return; }
            var h = lookup(k, cat, false);
            items.push(make(p, h, true));
          });
          return;
        }
      }
      if (!hit && norm(p).split(" ").length > 7) { noise++; return; }
      items.push(make(p, hit, false));
    });

    function make(label, hit, split) {
      if (!hit) return { raw: label, rated: false };
      if (hit.unrated) return { raw: label, rated: false, generic: hit.generic };
      return { raw: split ? hit.entry.name : label, entry: hit.entry, level: hit.level, pen: hit.pen, rated: true, approx: hit.approx || null, split: !!split, generic: hit.generic || null, key: hit.key };
    }

    var pen = 0, uniq = {};
    items.forEach(function (it, idx) {
      it.pos = idx + 1;
      if (!it.rated) return;
      var id = it.entry.id + "|" + it.level;
      if (uniq[id]) { it.dup = true; return; }
      uniq[id] = true;
      var w = idx < 10 ? 1 : 0.75;
      it.applied = it.pen * w;
      pen += it.applied;
    });
    var rated = items.filter(function (i) { return i.rated; }).length;
    var counts = { low: 0, mod: 0, high: 0, unrated: 0 };
    items.forEach(function (i) { if (i.rated) counts[i.level]++; else counts.unrated++; });
    var endo = items.filter(function (i) { return i.rated && i.entry.endo; });
    var endoDirect = endo.filter(function (i) { return i.entry.endo.kind === "direct"; });
    var score = Math.max(0, Math.round(100 - pen));
    var total = items.length;
    var coverage = total ? rated / total : 0;
    var enough = total >= 3 && coverage >= 0.5;

    /* overall GOOD / OK / BAD */
    var verdict, why = [];
    if (!enough) {
      verdict = null;
    } else if (counts.high > 0 || score < 55) {
      verdict = "BAD";
      if (counts.high > 0) why.push("it contains " + counts.high + " ingredient" + (counts.high > 1 ? "s" : "") + " rated Bad for you");
      if (score < 55) why.push("its score is below 55");
    } else if (score < 80 || endoDirect.length > 0) {
      verdict = "OK";
      if (score < 80) why.push("its score is between 55 and 79");
      if (endoDirect.length > 0 && score >= 80) why.push("it contains a possible hormone disruptor, which keeps it from rating GOOD");
    } else {
      verdict = "GOOD";
      why.push("no ingredient is rated Bad for you, no hormone-disruptor flags, and its score is 80 or higher");
    }
    var grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 65 ? "C" : score >= 50 ? "D" : "F";
    return { noise: noise, items: items, score: score, grade: grade, verdict: verdict, why: why, counts: counts, total: total, rated: rated, coverage: coverage, enough: enough, endo: endo, endoDirect: endoDirect, cat: cat };
  }

  window.BCS = { analyze: analyze, CATS: CATS, CAT_BY_ID: CAT_BY_ID, guessCategory: guessCategory, LABEL: LABEL, norm: norm, parseList: parseList, entries: DB.entries, src: DB.src, lookup: lookup };
})();
