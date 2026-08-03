/* Dolomites 2026 — แผนที่ทริป (Leaflet, ไม่มีการเรียก API ตอนรันไทม์) */
(function () {
  "use strict";

  var REG_BY_ID = {};
  REGS.forEach(function (r) { REG_BY_ID[r.id] = r; });

  var PLACE_BY_ID = {};
  PLACES.forEach(function (p) { PLACE_BY_ID[p.id] = p; });

  var BASE_BY_KEY = {};
  BASES.forEach(function (b) { BASE_BY_KEY[b.key] = b; });

  /* ------------------------------------------------------------ แผน A / B */
  var activePlan = DEFAULT_PLAN;

  function plan() { return PLANS[activePlan]; }
  function planBaseKeys() { return plan().bases; }

  /* เวลาขับจากแผนปัจจุบันไปจุดหนึ่ง — คืนค่าที่ดีที่สุดและรายละเอียดรายฐาน */
  function driveFromPlan(routeKey) {
    if (!routeKey) return null;
    var per = planBaseKeys().map(function (bk) {
      var r = ROUTES.from_base[bk] && ROUTES.from_base[bk][routeKey];
      return r ? { base: bk, km: r.km, min: r.min } : null;
    }).filter(Boolean);
    if (!per.length) return null;
    var best = per.reduce(function (a, b) { return b.min < a.min ? b : a; });
    var worst = per.reduce(function (a, b) { return b.min > a.min ? b : a; });
    return { per: per, best: best, worst: worst, multi: per.length > 1 };
  }

  /* ------------------------------------------------------------------ map */
  var map = L.map("map", { zoomControl: true, attributionControl: true })
    .setView([46.62, 11.85], 10);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, minZoom: 7,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · เส้นทางขับรถจาก OSRM (บันทึกไว้ล่วงหน้า)'
  }).addTo(map);

  var routeLayer   = L.layerGroup().addTo(map);
  var markerLayer  = L.layerGroup().addTo(map);
  var markers      = {};

  /* ------------------------------------------------------------- helpers */
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function gmapsDir(ll) { return "https://www.google.com/maps/dir/?api=1&destination=" + ll[0] + "," + ll[1]; }
  function gmapsPin(ll) { return "https://www.google.com/maps/search/?api=1&query=" + ll[0] + "," + ll[1]; }

  /* ระดับกฎที่รุนแรงที่สุดของสถานที่นี้ */
  function topSeverity(place) {
    var best = null;
    (place.regs || []).forEach(function (id) {
      var r = REG_BY_ID[id]; if (!r) return;
      if (r.severity === "high") best = "high";
      else if (r.severity === "med" && best !== "high") best = "med";
      else if (!best) best = "low";
    });
    return best;
  }

  function needsBooking(place) {
    return (place.regs || []).some(function (id) {
      var r = REG_BY_ID[id];
      return r && r.severity === "high";
    });
  }

  function vpill(v) {
    var m = V[v] || V.unknown;
    return '<span class="vp vp-' + v + '" title="' + esc(m.title) + '">' + esc(m.label) + "</span>";
  }

  /* --------------------------------------------------------- map markers */
  function makeIcon(place) {
    var meta = KIND_META[place.kind];
    var flag = needsBooking(place) ? " flag" : "";
    var isBase = place.kind === "base";
    return L.divIcon({
      className: "pin-wrap" + (isBase ? " base-pin" : ""),
      html: '<div class="pin' + flag + '" style="background:' + meta.color + '">' +
            "<span>" + meta.icon + "</span></div>",
      iconSize: isBase ? [34, 34] : [28, 28],
      iconAnchor: isBase ? [17, 32] : [14, 26],
      popupAnchor: [0, -24]
    });
  }

  function popupHtml(p) {
    var meta = KIND_META[p.kind];
    var sev = topSeverity(p);
    var h = "<b>" + esc(p.name) + "</b>";
    if (p.alt) h += '<br><span style="color:#94a3b8;font-size:12px">' + esc(p.alt) + "</span>";
    h += '<div style="margin-top:6px;font-size:12px;color:#94a3b8">' + meta.icon + " " + meta.label;
    var dr = driveFromPlan(p.routeKey);
    if (dr) {
      h += " · ใกล้สุด <b style='color:#e2e8f0'>" + dr.best.min + " นาที</b>" +
           (dr.multi ? " (จาก " + esc(BASE_BY_KEY[dr.best.base].town) + ")" : "");
    }
    h += "</div>";
    if (sev === "high") {
      h += '<div style="margin-top:6px;font-size:12px;color:#fca5a5">⚠️ ต้องจองล่วงหน้า — ดูรายละเอียดในแผงข้อมูล</div>';
    }
    h += '<a class="pop-btn" href="' + gmapsDir(p.driveTo || p.ll) + '" target="_blank" rel="noopener">เปิดใน Google Maps</a>';
    h += ' <a class="pop-btn" style="background:#334155;color:#e2e8f0" href="#" data-open="' + p.id + '">รายละเอียด</a>';
    return h;
  }

  PLACES.forEach(function (p) {
    var m = L.marker(p.ll, { icon: makeIcon(p), title: p.name })
      .bindPopup(popupHtml(p), { maxWidth: 280 })
      .addTo(markerLayer);
    m.on("click", function () { highlightRoute(p); });
    markers[p.id] = m;
  });

  map.on("popupopen", function (e) {
    var link = e.popup.getElement().querySelector("[data-open]");
    if (link) {
      link.addEventListener("click", function (ev) {
        ev.preventDefault();
        openDetail(link.getAttribute("data-open"));
      });
    }
  });

  /* ---------------------------------------------------------- route lines */
  var allRouteLines = [];
  var BASE_COLOR = { margherita: "#22c55e", tyrolian: "#eab308", hoferhof: "#38bdf8" };

  function drawAllRoutes() {
    routeLayer.clearLayers();
    allRouteLines = [];
    planBaseKeys().forEach(function (bk) {
      var set = ROUTES.from_base[bk] || {};
      Object.keys(set).forEach(function (key) {
        var r = set[key];
        if (!r || !r.coords || !r.coords.length) return;
        var line = L.polyline(r.coords, {
          color: BASE_COLOR[bk] || "#38bdf8", weight: 2.5, opacity: 0.38
        }).addTo(routeLayer);
        line.bindTooltip(routeLabel(bk, key, r), { sticky: true });
        allRouteLines.push({ key: key, base: bk, line: line });
      });
    });
    /* ขาเข้าทริปจาก Temblhof + ขาย้ายฐานกลางทริป (แผน A) */
    var t = ROUTES.transit && ROUTES.transit[plan().transit];
    if (t && t.coords) {
      L.polyline(t.coords, { color: "#c026d3", weight: 3, opacity: 0.7, dashArray: "7 6" })
        .addTo(routeLayer)
        .bindTooltip("7 ก.ย. — Temblhof → " + esc(BASE_BY_KEY[plan().primary].label) +
                     " · " + t.km + " กม. / " + t.min + " นาที", { sticky: true });
    }
    if (activePlan === "A") {
      var mv = ROUTES.transit && ROUTES.transit.margherita_to_tyrolian;
      if (mv && mv.coords) {
        L.polyline(mv.coords, { color: "#f472b6", weight: 3.5, opacity: 0.8, dashArray: "3 7" })
          .addTo(routeLayer)
          .bindTooltip("9 ก.ย. — ย้ายฐาน S. Cristina → Valdaora · <b>" +
                       mv.km + " กม. / " + mv.min + " นาที</b>", { sticky: true });
      }
    }
  }

  function routeLabel(baseKey, key, r) {
    var p = PLACES.filter(function (x) { return x.routeKey === key; })[0];
    return esc(BASE_BY_KEY[baseKey].town) + " → " + (p ? esc(p.name) : key) +
           " · <b>" + r.km + " กม. / " + r.min + " นาที</b>";
  }

  function highlightRoute(place) {
    allRouteLines.forEach(function (o) {
      var on = place && o.key === place.routeKey;
      o.line.setStyle({
        color: on ? "#f97316" : (BASE_COLOR[o.base] || "#38bdf8"),
        weight: on ? 5 : 2.5, opacity: on ? 0.95 : 0.18
      });
      if (on) o.line.bringToFront();
    });
  }

  function clearHighlight() {
    allRouteLines.forEach(function (o) {
      o.line.setStyle({ color: BASE_COLOR[o.base] || "#38bdf8", weight: 2.5, opacity: 0.38 });
    });
  }

  drawAllRoutes();

  /* --------------------------------------------------------- map legend */
  var legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    var d = L.DomUtil.create("div", "maplegend");
    d.innerHTML = legendHtml();
    L.DomEvent.disableClickPropagation(d);
    legendEl = d;
    return d;
  };
  var legendEl = null;

  function legendHtml() {
    var rows = Object.keys(KIND_META).map(function (k) {
      return '<div class="row"><i style="background:' + KIND_META[k].color + '"></i>' + KIND_META[k].label + "</div>";
    }).join("");
    var h = rows + "<hr>" +
      '<div class="row"><span style="color:#dc2626;font-weight:900">!</span> ต้องจองล่วงหน้า</div>';
    planBaseKeys().forEach(function (bk) {
      h += '<div class="row"><i style="background:' + (BASE_COLOR[bk] || "#38bdf8") +
           ';border-radius:2px;height:3px"></i> จาก ' + esc(BASE_BY_KEY[bk].town) + "</div>";
    });
    h += '<div class="row"><i style="background:#c026d3;border-radius:2px;height:3px"></i> Temblhof → ฐานแรก</div>';
    if (activePlan === "A") {
      h += '<div class="row"><i style="background:#f472b6;border-radius:2px;height:3px"></i> ย้ายฐาน 9 ก.ย.</div>';
    }
    return h;
  }
  legend.addTo(map);

  /* ------------------------------------------------------- sidebar: places */
  var activeKinds = Object.keys(KIND_META).reduce(function (a, k) { a[k] = true; return a; }, {});
  var selectedId = null;

  function renderFilters() {
    var el = document.getElementById("filters");
    el.innerHTML = Object.keys(KIND_META).map(function (k) {
      var m = KIND_META[k];
      return '<button class="chip' + (activeKinds[k] ? " on" : "") + '" data-kind="' + k + '" ' +
             'style="' + (activeKinds[k] ? "color:" + m.color : "") + '">' +
             '<span class="dot" style="background:' + m.color + '"></span>' + m.label + "</button>";
    }).join("");
    el.querySelectorAll(".chip").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-kind");
        activeKinds[k] = !activeKinds[k];
        renderFilters(); renderPlaces(); syncMarkers();
      });
    });
  }

  /* ที่พักของอีกแผนหนึ่งไม่ต้องโชว์ */
  function inActivePlan(p) {
    if (p.kind !== "base") return true;
    return !p.plan || p.plan === "both" || p.plan === activePlan;
  }

  function syncMarkers() {
    PLACES.forEach(function (p) {
      var m = markers[p.id];
      var show = activeKinds[p.kind] && inActivePlan(p);
      if (show) { if (!markerLayer.hasLayer(m)) markerLayer.addLayer(m); }
      else if (markerLayer.hasLayer(m)) markerLayer.removeLayer(m);
    });
  }

  function placeCard(p) {
    var meta = KIND_META[p.kind];
    var dr = driveFromPlan(p.routeKey);
    var h = '<div class="card' + (selectedId === p.id ? " sel" : "") + '" data-id="' + p.id + '">';
    h += '<div class="card-top"><span style="color:' + meta.color + '">' + meta.icon + "</span>" +
         '<span class="card-name">' + esc(p.name) + "</span>";
    if (p.alt) h += '<span class="card-alt">' + esc(p.alt) + "</span>";
    h += "</div>";

    h += '<div class="card-line">';
    if (p.kind === "base") {
      h += "<span><b>" + esc(p.dates) + "</b></span>";
    } else if (dr) {
      if (dr.multi && dr.worst.min - dr.best.min > 5) {
        h += "<span>🚗 <b>" + dr.best.min + " นาที</b> จาก " + esc(BASE_BY_KEY[dr.best.base].town) +
             ' <span style="opacity:.65">· ' + dr.worst.min + " นาที จาก " + esc(BASE_BY_KEY[dr.worst.base].town) + "</span></span>";
      } else {
        h += "<span>🚗 <b>" + dr.best.km + " กม.</b> / <b>" + dr.best.min + " นาที</b> จากฐาน</span>";
      }
    }
    if (p.stats && p.stats.dur) h += "<span>⏱ " + esc(p.stats.dur) + "</span>";
    if (p.stats && p.stats.diff) h += "<span>📈 " + esc(p.stats.diff) + "</span>";
    h += "</div>";

    var badges = [];
    (p.regs || []).forEach(function (id) {
      var reg = REG_BY_ID[id];
      if (!reg || reg.severity === "low") return;
      badges.push('<span class="badge ' + reg.severity + '">' + esc(reg.title.split("—")[0].trim()) + "</span>");
    });
    if (p.unverified) badges.push('<span class="badge unv">ยังไม่ตรวจสอบกฎ 2026</span>');
    if (badges.length) h += '<div class="badges">' + badges.join("") + "</div>";

    h += "</div>";
    return h;
  }

  function renderPlaces() {
    var list = document.getElementById("placeList");
    var order = ["base", "hike", "lake", "view", "pass", "town"];
    var html = "";
    order.forEach(function (kind) {
      if (!activeKinds[kind]) return;
      var group = PLACES.filter(function (p) { return p.kind === kind && inActivePlan(p); });
      if (!group.length) return;
      html += '<div style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:' +
              KIND_META[kind].color + ';font-weight:700;margin:14px 0 7px">' +
              KIND_META[kind].icon + " " + KIND_META[kind].label + "</div>";
      html += group.map(placeCard).join("");
    });
    list.innerHTML = html || '<p style="color:#94a3b8">ไม่มีสถานที่ในหมวดที่เลือก</p>';
    list.querySelectorAll(".card").forEach(function (c) {
      c.addEventListener("click", function () { openDetail(c.getAttribute("data-id")); });
    });
  }

  /* ------------------------------------------------------- detail panel */
  function regBlockHtml(reg, idx) {
    var h = '<div class="reg sev-' + reg.severity + '" data-reg="' + reg.id + '">';
    h += '<div class="reg-head"><div style="flex:1">' +
         '<div class="reg-title">' + reg.title + "</div>" +
         '<div class="reg-scope">' + esc(reg.scope) + " · " + SEV_META[reg.severity].label + "</div>" +
         "</div>" + '<div class="reg-caret">▾</div></div>';
    h += '<div class="reg-body">';
    h += '<div class="reg-summary">' + reg.summary + "</div>";
    h += '<ul class="facts">' + reg.facts.map(function (f) {
      return "<li>" + vpill(f.v) + f.t + "</li>";
    }).join("") + "</ul>";
    if (reg.cost && reg.cost !== "—") h += '<div class="reg-cost">💶 ' + esc(reg.cost) + "</div>";
    if (reg.book)  h += '<div><a class="btn book" href="' + reg.book.url + '" target="_blank" rel="noopener">🔗 ' + esc(reg.book.label) + "</a></div>";
    if (reg.book2) h += '<div><a class="btn book" href="' + reg.book2.url + '" target="_blank" rel="noopener">🔗 ' + esc(reg.book2.label) + "</a></div>";
    if (reg.note)    h += '<div class="reg-note">' + reg.note + "</div>";
    if (reg.recheck) h += '<div class="reg-recheck">🔁 <b>ต้องเช็กซ้ำ:</b> ' + reg.recheck + "</div>";
    if (reg.sources && reg.sources.length) {
      h += '<div class="reg-src"><b style="color:#94a3b8">แหล่งอ้างอิง</b>' +
           reg.sources.map(function (s) {
             return '<a href="' + s.url + '" target="_blank" rel="noopener">↗ ' + esc(s.label) + "</a>";
           }).join("") + "</div>";
    }
    h += "</div></div>";
    return h;
  }

  function bindRegToggles(root) {
    root.querySelectorAll(".reg-head").forEach(function (head) {
      head.addEventListener("click", function () {
        head.parentElement.classList.toggle("open");
      });
    });
  }

  function openDetail(id) {
    var p = PLACE_BY_ID[id];
    if (!p) return;
    selectedId = id;
    renderPlaces();

    var meta = KIND_META[p.kind];
    var dr = driveFromPlan(p.routeKey);
    var h = "";

    h += "<h2>" + esc(p.name) + "</h2>";
    h += '<div class="sub">' + meta.icon + " " + meta.label + (p.alt ? " · " + esc(p.alt) : "") + "</div>";

    if (p.unverified) {
      h += '<div class="notice"><b>⚠️ ยังไม่ได้ตรวจสอบกฎและค่าใช้จ่ายปี 2026 ของจุดนี้</b><br>' +
           "ใส่ไว้เป็นตัวเลือกเสริม — อย่าถือว่าข้อมูลค่าใช้จ่ายและข้อจำกัดครบถ้วน</div>";
    }

    h += "<p>" + p.blurb + "</p>";

    /* --- ที่พัก --- */
    if (p.kind === "base") {
      h += "<h3>ข้อมูลที่พัก</h3><dl class=statgrid>";
      h += "<dt>วันที่</dt><dd>" + esc(p.dates) + "</dd>";
      h += "<dt>เวลาเช็กอิน/เอาต์</dt><dd>" + esc(p.checkin) + "</dd>";
      h += "<dt>ที่อยู่</dt><dd>" + esc(p.address) + "</dd>";
      h += "<dt>โทรศัพท์</dt><dd><a href='tel:" + p.phone.replace(/\s/g, "") + "' style='color:#38bdf8'>" + esc(p.phone) + "</a></dd>";
      if (p.web) h += "<dt>เว็บไซต์</dt><dd><a href='" + p.web + "' target='_blank' rel='noopener' style='color:#38bdf8'>" + esc(p.web.replace(/^https?:\/\//, "")) + "</a></dd>";
      h += "</dl>";
    }

    /* --- เวลาขับจากแต่ละฐานของแผนนี้ --- */
    if (dr && dr.multi) {
      h += "<h3>ขับจากฐานไหนใกล้กว่า</h3><dl class=statgrid>";
      dr.per.forEach(function (x) {
        var isBest = x.base === dr.best.base;
        h += "<dt>" + esc(BASE_BY_KEY[x.base].town) + "</dt><dd" +
             (isBest ? ' style="color:#86efac"' : ' style="opacity:.7"') + ">" +
             x.km + " กม. · " + x.min + " นาที" + (isBest ? "  ← ใกล้กว่า" : "") + "</dd>";
      });
      h += "</dl>";
      h += '<p style="font-size:12.5px;color:#94a3b8;margin-top:8px">จัดวันให้ตรงกับฐานที่ใกล้กว่า จะประหยัดเวลาขับได้มาก</p>';
    }

    /* --- สถิติเส้นทางเดิน --- */
    if (p.stats) {
      h += "<h3>ข้อมูลเส้นทาง</h3><dl class=statgrid>";
      if (dr && !dr.multi) h += "<dt>ขับจากฐาน</dt><dd>" + dr.best.km + " กม. · " + dr.best.min + " นาที</dd>";
      if (p.stats.dist) h += "<dt>ระยะทางเดิน</dt><dd>" + esc(p.stats.dist) + "</dd>";
      if (p.stats.gain) h += "<dt>ความสูงที่ไต่</dt><dd>" + esc(p.stats.gain) + "</dd>";
      if (p.stats.diff) h += "<dt>ความยาก</dt><dd>" + esc(p.stats.diff) + "</dd>";
      if (p.stats.dur)  h += "<dt>ใช้เวลา</dt><dd>" + esc(p.stats.dur) + "</dd>";
      if (p.stats.best) h += "<dt>ช่วงเวลาที่ดีที่สุด</dt><dd>" + esc(p.stats.best) + "</dd>";
      h += "</dl>";
      if (p.stats2) h += '<div class="reg-note" style="margin-top:10px">' + p.stats2 + "</div>";
    }

    /* --- ปุ่มนำทาง --- */
    h += "<h3>นำทาง</h3>";
    if (p.driveLabel) h += '<p style="font-size:13.3px;color:#94a3b8">🅿️ ' + esc(p.driveLabel) + "</p>";
    h += '<a class="btn" href="' + gmapsDir(p.driveTo || p.ll) + '" target="_blank" rel="noopener">🧭 เปิดเส้นทางใน Google Maps</a>';
    h += '<a class="btn alt" href="' + gmapsPin(p.ll) + '" target="_blank" rel="noopener">📍 ดูหมุดใน Google Maps</a>';
    h += '<button class="btn alt" id="shareBtn" data-id="' + p.id + '">🔗 คัดลอกลิงก์หน้านี้</button>';

    /* --- คำอธิบายเส้นทางเดิน --- */
    if (p.route) h += "<h3>เดินยังไง</h3><p>" + p.route + "</p>";

    /* --- ข้อสังเกต --- */
    if (p.notes && p.notes.length) {
      h += "<h3>ข้อสังเกต</h3><ul class=notes>" +
           p.notes.map(function (n) { return "<li>" + n + "</li>"; }).join("") + "</ul>";
    }

    /* --- กฎ --- */
    var regs = (p.regs || []).map(function (id) { return REG_BY_ID[id]; }).filter(Boolean);
    if (regs.length) {
      var rank = { high: 0, med: 1, low: 2 };
      regs.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });
      h += "<h3>กฎการเข้าถึงปี 2026 (" + regs.length + " ข้อ)</h3>";
      h += '<p style="font-size:12.5px;color:#94a3b8;margin-top:-4px">คลิกที่หัวข้อเพื่อดูรายละเอียด · แต่ละบรรทัดมีป้ายบอกว่ายืนยันแล้วหรือยัง</p>';
      h += regs.map(regBlockHtml).join("");
    }

    var d = document.getElementById("detail");
    d.querySelector(".inner").innerHTML = h;
    bindRegToggles(d);

    var share = d.querySelector("#shareBtn");
    if (share) {
      share.addEventListener("click", function () {
        var url = location.origin + location.pathname + "#place=" + p.id;
        var done = function () { share.textContent = "✅ คัดลอกแล้ว"; setTimeout(function () { share.textContent = "🔗 คัดลอกลิงก์หน้านี้"; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () { prompt("คัดลอกลิงก์นี้:", url); });
        } else { prompt("คัดลอกลิงก์นี้:", url); }
      });
    }
    /* เปิดกฎที่รุนแรงที่สุดไว้ให้เลย */
    var firstHigh = d.querySelector(".reg.sev-high");
    if (firstHigh) firstHigh.classList.add("open");
    d.classList.add("open");
    d.scrollTop = 0;

    /* อัปเดต URL ให้แชร์ต่อได้ — บางเบราว์เซอร์/แซนด์บ็อกซ์บล็อก ไม่ให้พังทั้งหน้า */
    try { if (history.replaceState) history.replaceState(null, "", "#place=" + p.id); } catch (e) { /* ไม่เป็นไร */ }

    highlightRoute(p);
    map.closePopup();
    map.setView(p.ll, Math.max(map.getZoom(), 12), { animate: false });
    /* จอกว้าง: แผงรายละเอียดทับแผนที่ฝั่งขวา → เลื่อนหมุดมาอยู่ในส่วนที่มองเห็น */
    if (window.innerWidth > 900) {
      var hidden = Math.max(0, (map.getContainer().getBoundingClientRect().right) - d.getBoundingClientRect().left);
      if (hidden > 40) map.panBy([hidden / 2, 0], { animate: false });
    }
    closeSidebarOnMobile();
  }

  document.getElementById("closeDetail").addEventListener("click", function () {
    document.getElementById("detail").classList.remove("open");
    selectedId = null; clearHighlight(); renderPlaces();
  });

  /* ------------------------------------------------------ pane: กฎทั้งหมด */
  function renderRegs() {
    var el = document.getElementById("regList");
    var rank = { high: 0, med: 1, low: 2 };
    var sorted = REGS.slice().sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });

    var counts = { high: 0, med: 0, low: 0 };
    REGS.forEach(function (r) { counts[r.severity]++; });

    var unverified = 0;
    REGS.forEach(function (r) { r.facts.forEach(function (f) { if (f.v === "unknown") unverified++; }); });

    var h = '<div class="notice"><b>อ่านตรงนี้ก่อน</b><br>' +
      "ตรวจสอบกับแหล่งทางการเมื่อ <b>" + VERIFIED_ON + "</b> · ทุกบรรทัดมีป้ายบอกสถานะ " +
      vpill("ok") + vpill("partial") + vpill("fixed") + vpill("unknown") +
      "<br>มีข้อที่ <b>ยังยืนยันไม่ได้ " + unverified + " ข้อ</b> — อย่าเอาไปวางแผนแบบตายตัว</div>";

    h += '<div class="notice info">' +
      "🔴 <b>ต้องจองล่วงหน้า " + counts.high + " เรื่อง</b> · " +
      "🟠 มีข้อจำกัด " + counts.med + " เรื่อง · " +
      "🔵 กฎทั่วไป " + counts.low + " เรื่อง</div>";

    h += sorted.map(regBlockHtml).join("");
    el.innerHTML = h;
    bindRegToggles(el);
    /* กางข้อที่ต้องจองไว้ทั้งหมด */
    el.querySelectorAll(".reg.sev-high").forEach(function (n) { n.classList.add("open"); });
  }

  /* ------------------------------------------------ pane: เทียบฐานที่พัก */
  function renderCompare() {
    var el = document.getElementById("cmpPane");
    var m = ROUTES.matrix;

    function best(bases, key) {
      var vals = bases.map(function (b) { return (m[b] && m[b][key]) ? m[b][key].min : null; })
                      .filter(function (v) { return v !== null; });
      return vals.length ? Math.min.apply(null, vals) : null;
    }
    var A = PLANS.A.bases, B = PLANS.B.bases;

    var h = '<div class="cmp-intro"><b>แผน A</b> ย้ายฐาน 2 ที่ (S. Cristina 7–9 ก.ย. → Valdaora 9–11 ก.ย.) · ' +
      "<b>แผน B</b> อยู่ Hofer Hof ที่เดียว 4 คืน (จองแล้ว ยกเลิกฟรีถึง 23 ส.ค. 2026)<br>" +
      "ตารางเทียบ<b>เวลาขับเที่ยวเดียว (นาที)</b> ไปแต่ละจุด — แผน A ใช้ฐานที่ใกล้กว่าในสองฐาน " +
      "เพราะจัดวันให้ตรงกับฐานได้</div>";

    h += '<div style="overflow-x:auto"><table class="cmp"><thead><tr><th>จุดหมาย</th>' +
      '<th class="booked">แผน A<br>ใกล้สุด</th><th style="font-weight:400">S.Cristina</th>' +
      '<th style="font-weight:400">Valdaora</th><th class="booked">แผน B<br>Hofer Hof</th>' +
      '<th style="font-weight:400">ต่าง</th></tr></thead><tbody>';

    var totA = 0, totB = 0, winA = 0, winB = 0;

    COMPARE_KEYS.forEach(function (key) {
      var p = PLACES.filter(function (x) { return x.routeKey === key; })[0];
      if (!p) return;
      var a = best(A, key), b = best(B, key);
      var mg = (m.margherita && m.margherita[key]) ? m.margherita[key].min : null;
      var ty = (m.tyrolian && m.tyrolian[key]) ? m.tyrolian[key].min : null;
      totA += a || 0; totB += b || 0;
      var diff = (a !== null && b !== null) ? b - a : null;
      if (diff > 0) winA++; else if (diff < 0) winB++;
      h += "<tr><td>" + esc(p.name) + "</td>";
      h += '<td class="' + (a <= b ? "best" : "") + '">' + (a === 0 ? "เดินถึง" : a) + "</td>";
      h += '<td style="opacity:.6">' + (mg === 0 ? "เดินถึง" : mg) + "</td>";
      h += '<td style="opacity:.6">' + ty + "</td>";
      h += '<td class="' + (b < a ? "best" : "") + '">' + b + "</td>";
      h += '<td style="' + (diff > 0 ? "color:#86efac" : diff < 0 ? "color:#fca5a5" : "opacity:.5") + '">' +
           (diff === null ? "–" : (diff > 0 ? "−" + diff : diff === 0 ? "0" : "+" + (-diff))) + "</td>";
      h += "</tr>";
    });

    h += "</tbody><tfoot><tr><td>รวมทั้งหมด</td>" +
      '<td class="' + (totA <= totB ? "best" : "") + '">' + totA + "</td>" +
      '<td colspan="2" style="opacity:.4">—</td>' +
      '<td class="' + (totB < totA ? "best" : "") + '">' + totB + "</td>" +
      '<td style="color:#86efac">−' + (totB - totA) + "</td></tr></tfoot></table></div>";

    h += '<p style="font-size:11.5px;color:#94a3b8;margin-top:6px">' +
      'คอลัมน์ “ต่าง” = แผน A ประหยัดกว่ากี่นาที (<span style="color:#86efac">เขียว = แผน A เร็วกว่า</span>, ' +
      '<span style="color:#fca5a5">แดง = แผน B เร็วกว่า</span>)</p>';

    /* -------- คำตัดสิน -------- */
    var west = ["seceda", "alpe_di_siusi", "adolf_munkel", "val_di_funes", "passo_gardena"];
    var east = ["tre_cime", "braies", "sorapis", "cinque_torri", "falzarego"];
    function sum(bases, keys) { return keys.reduce(function (a, k) { return a + (best(bases, k) || 0); }, 0); }

    h += '<div class="verdict"><h4>สรุปให้ตัดสินใจ</h4>';
    h += "<p>📊 <b>แผน A ชนะ " + winA + " จาก " + COMPARE_KEYS.length + " จุด</b> " +
         "และรวมเวลาขับน้อยกว่า <b>" + (totB - totA) + " นาที</b> (แผน A " + totA + " นาที · แผน B " + totB + " นาที) " +
         "— ต่างกันราว <b>" + (((totB - totA) / 60).toFixed(1)) + " ชั่วโมง</b> ต่อการเก็บครบทุกจุดหนึ่งรอบ</p>";

    h += "<p>🧭 <b>ทำไมแผน A ถึงชนะ:</b> การย้ายฐานทำให้ไม่ต้องขับสวนหุบเขาทุกวัน — " +
         "สองคืนแรกอยู่ฝั่งตะวันตกเก็บ <b>Seceda (8 นาที) · Alpe di Siusi (24 นาที) · Passo Sella/Gardena</b> " +
         "แล้วสองคืนหลังย้ายไปฝั่งเหนือ-ตะวันออกเก็บ <b>Lago di Braies (20 นาที) · Tre Cime (55 นาที) · Sorapis (43 นาที)</b> " +
         "ส่วนแผน B ต้องขับไป-กลับจากจุดกลางทุกวัน</p>";

    h += "<p>ฝั่งตะวันตก: แผน A <b>" + sum(A, west) + "</b> นาที · แผน B <b>" + sum(B, west) + "</b><br>" +
         "ฝั่งตะวันออก/เหนือ: แผน A <b>" + sum(A, east) + "</b> นาที · แผน B <b>" + sum(B, east) + "</b></p>";

    h += "<p>⚖️ <b>สิ่งที่ตัวเลขไม่บอก:</b></p><ul class=notes>";
    h += "<li>🟢 <b>แผน A ได้สิทธิยกเว้น ZTL Passo Gardena</b> ตอนพักที่ Santa Cristina (7–9 ก.ย.) — แผน B ไม่ได้เลยทั้งทริป " +
         "<b>แต่สิทธินี้หายไปหลังย้ายไป Valdaora</b> ให้ขึ้นพาสในสองคืนแรก</li>";
    h += "<li>🟢 แผน A: Col Raiser ห่างที่พักแรกแค่ 2 นาที → ขึ้น Seceda ราคา €34 แทน €74 <b>ประหยัด €320 สำหรับ 8 คน</b></li>";
    h += "<li>🔴 <b>แผน A ต้องเก็บของย้ายกลางทริป</b> — 79 กม. / 77 นาที วันที่ 9 ก.ย. เสียเวลาไปครึ่งวัน (หรือแวะเที่ยวระหว่างทางให้คุ้ม)</li>";
    h += "<li>🔴 <b>แผน A ต้องจอง 2 ยูนิตในแต่ละที่</b> เพราะยูนิตเดียวไม่พอ 8 คน — แผน B นอนรวมหลังเดียวได้</li>";
    h += "<li>🔴 <b>แผน A ยังไม่รู้เวลาเช็กอิน/เช็กเอาต์ของทั้งสองที่</b> — สำคัญมากเพราะ 7 ก.ย. ต้องเช็กเอาต์ Temblhof 09:00–10:00</li>";
    h += "<li>💰 แผน B = €1,836.80 สำหรับ 8 คน 4 คืน (€229.60/คน) · ยังไม่ได้เทียบราคาแผน A</li>";
    h += "<li>⛽ แผน A ขับน้อยกว่า → ประหยัดน้ำมันและโควตาระยะทางรถเช่า (จำกัด 2,430 กม.)</li>";
    h += "</ul>";
    h += "<p style='margin-top:10px'>📅 <b>เดดไลน์: ยกเลิก Hofer Hof ฟรีได้ถึง 23 ส.ค. 2026 23:59</b> หลังจากนั้นเสียเต็มจำนวน</p>";
    h += "</div>";

    /* -------- ตารางอ้างอิงฐานอื่น -------- */
    var refs = BASES.filter(function (b) { return b.ref; });
    h += '<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#38bdf8;margin:20px 0 8px">ฐานอ้างอิงอื่น ๆ</h3>';
    h += '<p style="font-size:12.5px;color:#94a3b8;margin-top:-4px">ถ้าจะเทียบกับการพักในหุบเขาหลักแบบฐานเดียว</p>';
    h += '<div style="overflow-x:auto"><table class="cmp"><thead><tr><th>จุดหมาย</th>' +
      refs.map(function (b) { return "<th>" + esc(b.label) + "</th>"; }).join("") + "</tr></thead><tbody>";
    var refTot = {}; refs.forEach(function (b) { refTot[b.key] = 0; });
    COMPARE_KEYS.forEach(function (key) {
      var p = PLACES.filter(function (x) { return x.routeKey === key; })[0];
      if (!p) return;
      h += "<tr><td>" + esc(p.name) + "</td>";
      refs.forEach(function (b) {
        var v = (m[b.key] && m[b.key][key]) ? m[b.key][key].min : null;
        refTot[b.key] += v || 0;
        h += "<td>" + (v === 0 ? "เดินถึง" : v) + "</td>";
      });
      h += "</tr>";
    });
    h += "</tbody><tfoot><tr><td>รวมทั้งหมด</td>" +
      refs.map(function (b) { return "<td>" + refTot[b.key] + "</td>"; }).join("") +
      "</tr></tfoot></table></div>";

    h += '<div class="footnote">ระยะทางและเวลาคำนวณจาก OSRM บนข้อมูลถนน OpenStreetMap ' +
         "ตอนสร้างหน้าเว็บ (ไม่ได้เรียก API ตอนเปิดหน้า) · เป็นเวลาขับล้วน ไม่รวมจอดพัก เติมน้ำมัน หรือรถติด · " +
         "ถนนบนเขามีทางโค้งเยอะ เวลาจริงมักนานกว่านี้ 10–20%</div>";

    el.innerHTML = h;
  }

  /* ---------------------------------------------------------------- tabs */
  function showTab(paneId) {
    document.querySelectorAll("#tabs button").forEach(function (x) {
      x.classList.toggle("on", x.getAttribute("data-pane") === paneId);
    });
    document.querySelectorAll(".pane").forEach(function (x) {
      x.classList.toggle("on", x.id === paneId);
    });
  }
  document.querySelectorAll("#tabs button").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.getAttribute("data-pane")); });
  });

  /* ------------------------------------------------ ลิงก์ตรง (แชร์ให้กลุ่ม) */
  var TAB_ALIAS = { places: "placesPane", regs: "regsPane", cmp: "cmpPane" };

  function applyHash() {
    var h = "";
    try { h = (location.hash || "").replace(/^#/, ""); } catch (e) { return; }
    if (!h) return;
    var parts = {};
    h.split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i > 0) parts[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    if (parts.plan && PLANS[parts.plan]) setPlan(parts.plan);
    if (parts.tab && TAB_ALIAS[parts.tab]) showTab(TAB_ALIAS[parts.tab]);
    if (parts.place && PLACE_BY_ID[parts.place]) {
      /* ถ้าลิงก์ชี้ไปที่พักของอีกแผน ให้สลับแผนให้อัตโนมัติ */
      var tp = PLACE_BY_ID[parts.place];
      if (tp.kind === "base" && tp.plan && tp.plan !== "both" && tp.plan !== activePlan) setPlan(tp.plan);
      openDetail(parts.place);
    }
  }
  window.addEventListener("hashchange", applyHash);

  /* -------------------------------------------------------- ปุ่มสลับแผน */
  function renderPlanSwitch() {
    var el = document.getElementById("planSwitch");
    el.innerHTML = Object.keys(PLANS).map(function (k) {
      var pl = PLANS[k], on = k === activePlan;
      return '<button class="planbtn' + (on ? " on" : "") + '" data-plan="' + k + '" ' +
             (on ? 'style="border-color:' + pl.color + ';color:' + pl.color + '"' : "") + ">" +
             "<b>" + esc(pl.short) + "</b><span>" + esc(pl.sub) + "</span></button>";
    }).join("");
    el.querySelectorAll(".planbtn").forEach(function (b) {
      b.addEventListener("click", function () { setPlan(b.getAttribute("data-plan")); });
    });
  }

  function setPlan(k) {
    if (!PLANS[k] || k === activePlan) return;
    activePlan = k;
    document.getElementById("detail").classList.remove("open");
    selectedId = null;
    renderPlanSwitch();
    drawAllRoutes();
    syncMarkers();
    renderPlaces();
    renderRegs();
    renderCompare();
    if (legendEl) legendEl.innerHTML = legendHtml();
    /* รีเฟรช popup ให้ตัวเลขตรงกับแผนใหม่ */
    PLACES.forEach(function (p) { if (markers[p.id]) markers[p.id].setPopupContent(popupHtml(p)); });
    var vis = PLACES.filter(inActivePlan).map(function (p) { return p.ll; });
    map.fitBounds(L.latLngBounds(vis).pad(0.08), { animate: false });
  }

  /* -------------------------------------------------------------- mobile */
  function closeSidebarOnMobile() {
    if (window.innerWidth <= 900) document.getElementById("sidebar").classList.remove("open");
  }
  document.getElementById("menuBtn").addEventListener("click", function () {
    document.getElementById("sidebar").classList.toggle("open");
  });

  /* ---------------------------------------------------------------- init */
  renderPlanSwitch();
  renderFilters();
  syncMarkers();
  renderPlaces();
  renderRegs();
  renderCompare();

  /* จัดกรอบแผนที่ให้เห็นทุกหมุดของแผนที่เลือกอยู่ */
  var bounds = L.latLngBounds(PLACES.filter(inActivePlan).map(function (p) { return p.ll; }));
  map.fitBounds(bounds.pad(0.08));

  applyHash();

  window.__mapReady = true;
})();
