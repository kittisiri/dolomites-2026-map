/* Dolomites 2026 — แผนที่ทริป (Leaflet, ไม่มีการเรียก API ตอนรันไทม์) */
(function () {
  "use strict";

  var REG_BY_ID = {};
  REGS.forEach(function (r) { REG_BY_ID[r.id] = r; });

  var PLACE_BY_ID = {};
  PLACES.forEach(function (p) { PLACE_BY_ID[p.id] = p; });

  var HOFERHOF = PLACE_BY_ID.hoferhof;

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
    if (p.routeKey && ROUTES.from_hoferhof[p.routeKey]) {
      var r = ROUTES.from_hoferhof[p.routeKey];
      h += " · จากฐาน <b style='color:#e2e8f0'>" + r.km + " กม. / " + r.min + " นาที</b>";
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

  function drawAllRoutes() {
    routeLayer.clearLayers();
    allRouteLines = [];
    Object.keys(ROUTES.from_hoferhof).forEach(function (key) {
      var r = ROUTES.from_hoferhof[key];
      if (!r || !r.coords || !r.coords.length) return;
      var line = L.polyline(r.coords, {
        color: "#38bdf8", weight: 2.5, opacity: 0.42, className: "rt-" + key
      }).addTo(routeLayer);
      line.bindTooltip(routeLabel(key, r), { sticky: true });
      allRouteLines.push({ key: key, line: line });
    });
    /* เส้นทางเข้าทริป: Temblhof → Hofer Hof */
    var t = ROUTES.transit && ROUTES.transit.temblhof_to_hoferhof;
    if (t && t.coords) {
      var tl = L.polyline(t.coords, { color: "#c026d3", weight: 3, opacity: 0.65, dashArray: "7 6" }).addTo(routeLayer);
      tl.bindTooltip("7 ก.ย. — Temblhof → Hofer Hof · " + t.km + " กม. / " + t.min + " นาที", { sticky: true });
    }
  }

  function routeLabel(key, r) {
    var p = PLACES.filter(function (x) { return x.routeKey === key; })[0];
    return "Hofer Hof → " + (p ? p.name : key) + " · <b>" + r.km + " กม. / " + r.min + " นาที</b>";
  }

  function highlightRoute(place) {
    allRouteLines.forEach(function (o) {
      var on = place && o.key === place.routeKey;
      o.line.setStyle({ color: on ? "#f97316" : "#38bdf8", weight: on ? 5 : 2.5, opacity: on ? 0.95 : 0.22 });
      if (on) o.line.bringToFront();
    });
  }

  function clearHighlight() {
    allRouteLines.forEach(function (o) {
      o.line.setStyle({ color: "#38bdf8", weight: 2.5, opacity: 0.42 });
    });
  }

  drawAllRoutes();

  /* --------------------------------------------------------- map legend */
  var legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    var d = L.DomUtil.create("div", "maplegend");
    var rows = Object.keys(KIND_META).map(function (k) {
      return '<div class="row"><i style="background:' + KIND_META[k].color + '"></i>' + KIND_META[k].label + "</div>";
    }).join("");
    d.innerHTML = rows +
      "<hr>" +
      '<div class="row"><span style="color:#dc2626;font-weight:900">!</span> ต้องจองล่วงหน้า</div>' +
      '<div class="row"><i style="background:#38bdf8;border-radius:2px;height:3px"></i> เส้นทางจาก Hofer Hof</div>' +
      '<div class="row"><i style="background:#c026d3;border-radius:2px;height:3px"></i> Temblhof → Hofer Hof</div>';
    L.DomEvent.disableClickPropagation(d);
    return d;
  };
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

  function syncMarkers() {
    PLACES.forEach(function (p) {
      var m = markers[p.id];
      if (activeKinds[p.kind]) { if (!markerLayer.hasLayer(m)) markerLayer.addLayer(m); }
      else if (markerLayer.hasLayer(m)) markerLayer.removeLayer(m);
    });
  }

  function placeCard(p) {
    var meta = KIND_META[p.kind];
    var r = p.routeKey && ROUTES.from_hoferhof[p.routeKey];
    var h = '<div class="card' + (selectedId === p.id ? " sel" : "") + '" data-id="' + p.id + '">';
    h += '<div class="card-top"><span style="color:' + meta.color + '">' + meta.icon + "</span>" +
         '<span class="card-name">' + esc(p.name) + "</span>";
    if (p.alt) h += '<span class="card-alt">' + esc(p.alt) + "</span>";
    h += "</div>";

    h += '<div class="card-line">';
    if (p.kind === "base") {
      h += "<span><b>" + esc(p.dates) + "</b></span>";
    } else if (r) {
      h += "<span>🚗 <b>" + r.km + " กม.</b> / <b>" + r.min + " นาที</b> จากฐาน</span>";
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
      var group = PLACES.filter(function (p) { return p.kind === kind; });
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
    var r = p.routeKey && ROUTES.from_hoferhof[p.routeKey];
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
      h += "</dl>";
    }

    /* --- สถิติเส้นทางเดิน --- */
    if (p.stats) {
      h += "<h3>ข้อมูลเส้นทาง</h3><dl class=statgrid>";
      if (r) h += "<dt>ขับจากฐาน</dt><dd>" + r.km + " กม. · " + r.min + " นาที</dd>";
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

    var h = '<div class="cmp-intro">Hofer Hof จองแล้วแต่ <b>ยกเลิกฟรีได้ถึง 23 ส.ค. 2026</b> — ' +
      "ตารางนี้เทียบเวลาขับรถ (นาที) จากฐานที่จองไว้ กับฐานทางเลือกอีก 3 แห่ง " +
      "ตัวเลขคำนวณจากเส้นทางถนนจริงและบันทึกไว้ในหน้าเว็บแล้ว</div>";

    h += '<div style="overflow-x:auto"><table class="cmp"><thead><tr><th>จุดหมาย</th>';
    BASES.forEach(function (b) {
      h += '<th class="' + (b.booked ? "booked" : "") + '">' + esc(b.label.split(" (")[0]) +
           (b.booked ? "<br>★" : "") + "</th>";
    });
    h += "</tr></thead><tbody>";

    var totals = {};
    BASES.forEach(function (b) { totals[b.key] = 0; });

    COMPARE_KEYS.forEach(function (key) {
      var p = PLACES.filter(function (x) { return x.routeKey === key; })[0];
      if (!p) return;
      var vals = BASES.map(function (b) { return (m[b.key] && m[b.key][key]) ? m[b.key][key].min : null; });
      var valid = vals.filter(function (v) { return v !== null; });
      var mn = Math.min.apply(null, valid), mx = Math.max.apply(null, valid);
      h += "<tr><td>" + esc(p.name) + "</td>";
      vals.forEach(function (v, i) {
        totals[BASES[i].key] += (v || 0);
        var cls = v === mn ? "best" : (v === mx ? "worst" : "");
        var txt = v === null ? "–" : (v === 0 ? "เดินถึง" : v);
        h += '<td class="' + cls + '">' + txt + "</td>";
      });
      h += "</tr>";
    });

    h += "</tbody><tfoot><tr><td>รวมทั้งหมด</td>";
    var tvals = BASES.map(function (b) { return totals[b.key]; });
    var tmin = Math.min.apply(null, tvals);
    tvals.forEach(function (v) {
      h += '<td class="' + (v === tmin ? "best" : "") + '">' + v + "</td>";
    });
    h += "</tr></tfoot></table></div>";
    h += '<p style="font-size:11.5px;color:#94a3b8;margin-top:6px">หน่วยเป็นนาที (เที่ยวเดียว) · ' +
         '<span style="color:#86efac">เขียว = เร็วที่สุด</span> · <span style="color:#fca5a5">แดง = ช้าที่สุด</span> · ★ = ฐานที่จองไว้</p>';

    /* -------- คำตัดสิน -------- */
    var west = ["seceda", "alpe_di_siusi", "adolf_munkel", "val_di_funes", "passo_gardena"];
    var east = ["tre_cime", "braies", "sorapis", "cinque_torri", "falzarego"];
    function sum(base, keys) {
      return keys.reduce(function (a, k) { return a + ((m[base] && m[base][k]) ? m[base][k].min : 0); }, 0);
    }
    var W = {}, E = {};
    BASES.forEach(function (b) { W[b.key] = sum(b.key, west); E[b.key] = sum(b.key, east); });

    h += '<div class="verdict"><h4>สรุปให้ตัดสินใจ</h4>';
    h += "<p><b>ฝั่งตะวันตก</b> (Seceda, Alpe di Siusi, Adolf Munkel, Val di Funes, Passo Gardena) — " +
         "รวมเวลาขับเที่ยวเดียว: Hofer Hof <b>" + W.hoferhof + "</b> นาที · Ortisei <b>" + W.ortisei +
         "</b> · Cortina <b>" + W.cortina + "</b> · Dobbiaco <b>" + W.dobbiaco + "</b></p>";
    h += "<p><b>ฝั่งตะวันออก</b> (Tre Cime, Braies, Sorapis, Cinque Torri, Falzarego) — " +
         "Hofer Hof <b>" + E.hoferhof + "</b> นาที · Ortisei <b>" + E.ortisei +
         "</b> · Cortina <b>" + E.cortina + "</b> · Dobbiaco <b>" + E.dobbiaco + "</b></p>";

    var bestOverall = BASES.slice().sort(function (a, b) { return totals[a.key] - totals[b.key]; })[0];
    var gap = totals.hoferhof - totals[bestOverall.key];
    var perDay = Math.round(gap * 2 / 4);

    h += "<p>🔎 <b>อ่านตัวเลขยังไง:</b> ";
    if (bestOverall.key === "hoferhof") {
      h += "Hofer Hof รวมแล้วดีที่สุดในสี่ตัวเลือก — ฐานที่จองไว้ไม่ได้แพ้ใคร</p>";
    } else {
      h += "ฐานที่รวมเวลาน้อยที่สุดคือ <b>" + esc(bestOverall.label) + "</b> " +
           "เร็วกว่า Hofer Hof รวม <b>" + gap + " นาที</b> ต่อการไปครบทุกจุดหนึ่งรอบ " +
           "→ ถ้าเที่ยว 4 วันแบบไป-กลับ เฉลี่ยราว <b>" + perDay + " นาที/วัน</b></p>";
    }

    h += "<p>⚖️ <b>สิ่งที่ตัวเลขไม่บอก:</b></p><ul class=notes>";
    h += "<li>Hofer Hof อยู่<b>กลางทาง</b> — ไม่ชนะฝั่งไหนเลย แต่ก็ไม่แพ้ยับฝั่งไหน เหมาะถ้าจะเที่ยวทั้งสองฝั่ง</li>";
    h += "<li>🔴 <b>Ortisei / Val Gardena ได้สิทธิยกเว้น ZTL Passo Gardena</b> ในฐานะแขกค้างคืน — Feldthurns ไม่ได้ นี่เป็นข้อได้เปรียบที่ไม่โผล่ในตารางเวลา</li>";
    h += "<li>Ortisei มีกระเช้าอยู่กลางเมือง (Seceda, Alpe di Siusi) → <b>บางวันไม่ต้องใช้รถเลย</b></li>";
    h += "<li>Cortina/Dobbiaco ชนะขาดฝั่งตะวันออก (Tre Cime, Braies, Sorapis) แต่แพ้ยับฝั่งตะวันตก</li>";
    h += "<li>💰 Hofer Hof = €1,836.80 สำหรับ 8 คน 4 คืน (€229.60/คน) — ที่พัก 8 คนในหุบเขาหลักมักหายากและแพงกว่า</li>";
    h += "<li>⛽ ต้องคิดค่าน้ำมันและโควตาระยะทางรถเช่าด้วย (จำกัด 2,430 กม.)</li>";
    h += "</ul>";
    h += "<p style='margin-top:10px'>📅 <b>เดดไลน์: ยกเลิก Hofer Hof ฟรีได้ถึง 23 ส.ค. 2026 23:59</b> หลังจากนั้นเสียเต็มจำนวน</p>";
    h += "</div>";

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
    if (parts.tab && TAB_ALIAS[parts.tab]) showTab(TAB_ALIAS[parts.tab]);
    if (parts.place && PLACE_BY_ID[parts.place]) openDetail(parts.place);
  }
  window.addEventListener("hashchange", applyHash);

  /* -------------------------------------------------------------- mobile */
  function closeSidebarOnMobile() {
    if (window.innerWidth <= 900) document.getElementById("sidebar").classList.remove("open");
  }
  document.getElementById("menuBtn").addEventListener("click", function () {
    document.getElementById("sidebar").classList.toggle("open");
  });

  /* ---------------------------------------------------------------- init */
  renderFilters();
  renderPlaces();
  renderRegs();
  renderCompare();

  /* จัดกรอบแผนที่ให้เห็นทุกหมุด */
  var bounds = L.latLngBounds(PLACES.map(function (p) { return p.ll; }));
  map.fitBounds(bounds.pad(0.08));

  applyHash();

  window.__mapReady = true;
})();
