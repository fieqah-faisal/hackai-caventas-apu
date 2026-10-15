/* Act I/II: the cold open and the product introduction. Story beats use the
 * synthetic sc01 incident records (times are the scenario's +08:00 times). */
"use strict";

// Soft bokeh ambience (SOC room lights, out of focus).
function ambient(root, seed, { count = 46, hue = "104,160,255", alpha = 0.16 } = {}) {
  const c = el("canvas", "layer", root);
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const r = rng(seed);
  const pts = Array.from({ length: count }, () => ({
    x: r() * W, y: r() * H, rad: 6 + r() * 70, vx: (r() - 0.5) * 14, vy: (r() - 0.5) * 8,
    a: 0.25 + r() * 0.75, warm: r() < 0.12,
  }));
  return (t, amount = 1) => {
    x.clearRect(0, 0, W, H);
    for (const p of pts) {
      const px = (p.x + p.vx * t + W) % W, py = (p.y + p.vy * t + H) % H;
      const g = x.createRadialGradient(px, py, 0, px, py, p.rad);
      const col = p.warm ? "255,138,61" : hue;
      g.addColorStop(0, `rgba(${col},${alpha * p.a * amount})`);
      g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g;
      x.fillRect(px - p.rad, py - p.rad, p.rad * 2, p.rad * 2);
    }
  };
}

function floorGrid(root) {
  const g = el("div", "layer", root);
  css(g, { perspective: "900px", perspectiveOrigin: "50% 30%" });
  const plane = el("div", "", g);
  css(plane, { position: "absolute", left: "-50%", width: "200%", top: "56%", height: "120%", transformOrigin: "50% 0",
    transform: "rotateX(72deg)", opacity: "0.5",
    backgroundImage: "linear-gradient(rgba(104,160,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(104,160,255,0.16) 1px, transparent 1px)",
    backgroundSize: "80px 80px", maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 70%)",
    webkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 70%)" });
  return (t) => { plane.style.backgroundPosition = `0px ${t * 26}px`; };
}

const SRC_COLORS = { EDR: "#ff5d5d", ENDPOINT: "#ff8a3d", DNS: "#68a0ff", FIREWALL: "#f2b84b", NETWORK: "#f2b84b",
  IDENTITY: "#b48bff", IDP: "#b48bff", CRM: "#3fd0c9", NOTE: "#9ded00", MAIL: "#7788a4", SIEM: "#e46cd6" };

// ------------------------------------------------------------ S01 alert ---
scene({
  id: "s01", lines: ["n01"], pre: 1.0, post: 0.35, letterbox: 1, xfOut: 0.5,
  sfx: () => [{ type: "glitch", t: 1.25 }, { type: "alarm", t: 1.3 }, { type: "tick", t: 2.0 }, { type: "tick", t: 3.0 }, { type: "tick", t: 4.0 }, { type: "tick", t: 5.0 }],
  build(root) {
    this.amb = ambient(root, 11);
    this.floor = floorGrid(root);
    const g = this.group = el("div", "layer", root);
    this.date = el("div", "mono", g, "SUN · 04 OCT 2026 · UTC+08:00");
    css(this.date, { position: "absolute", left: "190px", top: "352px", font: "500 22px var(--mono)", letterSpacing: "0.22em", color: "#7788a4" });
    this.clock = el("div", "mono", g);
    css(this.clock, { position: "absolute", left: "182px", top: "386px", font: "300 150px/1 var(--mono)", letterSpacing: "-0.02em", color: "#ecedf0" });
    this.loc = el("div", "", g, `<span class="chip"><span class="dot" style="color:#ff5d5d"></span>SALES-LT-07</span>
      <span class="chip">farah · Sales</span><span class="chip">EDR</span>`);
    css(this.loc, { position: "absolute", left: "190px", top: "568px", display: "flex", gap: "12px" });
    const card = this.card = el("div", "", g, `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <span class="mono" style="font:600 16px var(--mono);letter-spacing:.2em;color:#ff5d5d">EDR ALERT</span>
        <span class="chip red"><span class="dot"></span>HIGH</span></div>
      <div style="font:600 34px/1.18 var(--sans);color:#ecedf0">Unsigned process read browser password and cookie stores</div>
      <div class="mono" style="margin-top:20px;font:500 18px/1.6 var(--mono);color:#bac5d7">
        process&nbsp;&nbsp;<span style="color:#ecedf0">svchost-update.exe</span><br>
        parent&nbsp;&nbsp;&nbsp;PDFEditorSetup.exe <span style="color:#7788a4">(unsigned)</span><br>
        files&nbsp;&nbsp;&nbsp;&nbsp;Chrome Login Data · Chrome Cookies</div>`);
    css(card, { position: "absolute", left: "1010px", top: "330px", width: "720px", padding: "30px 34px", borderRadius: "12px",
      background: "rgba(18,26,41,0.94)", border: "1px solid rgba(255,93,93,0.45)", borderLeft: "5px solid #ff5d5d",
      boxShadow: "0 30px 90px rgba(0,0,0,0.6), 0 0 60px rgba(255,93,93,0.12)" });
  },
  render(t, s) {
    this.amb(t, smooth(t, 0, 1.6));
    this.floor(t);
    const sec = 5 + Math.floor(Math.max(0, t - 1.0));
    const clockText = `21:41:${String(Math.min(sec, 59)).padStart(2, "0")}`;
    this.clock.textContent = typed(clockText, prog(t, 0.25, 1.0));
    this.date.style.opacity = smooth(t, 0.1, 0.8);
    this.clock.style.opacity = smooth(t, 0.2, 0.5);
    this.loc.style.opacity = smooth(t, 0.9, 1.5);
    const cin = smooth(t, 1.25, 1.85, ease.outExpo);
    this.card.dataset.baseTf = `translateX(${(1 - cin) * 120}px)`;
    this.card.style.opacity = cin;
    rgbSplit(this.card, glitchAmt(t, 1.25, 0.4, 3) + glitchAmt(t, 3.4, 0.18, 9));
    this.group.style.transform = `scale(${1 + 0.035 * prog(t, 0, s.dur)})`;
  },
});

// ------------------------------------------------------------ S02 exfil ---
function worldCanvas(root) {
  const m = FILM.worldmap;
  const c = el("canvas", "", root);
  const cell = 15;
  c.width = m.cols * cell; c.height = m.rows * cell;
  const x = c.getContext("2d");
  for (const [cx, cy] of m.dots) {
    const k = ((cx * 7 + cy * 13) % 17) / 17;
    x.fillStyle = `rgba(${k > 0.9 ? "157,237,0" : "119,146,184"},${0.38 + 0.3 * k})`;
    x.beginPath(); x.arc(cx * cell + cell / 2, cy * cell + cell / 2, 2.8, 0, Math.PI * 2); x.fill();
  }
  css(c, { position: "absolute", left: "0", top: "0", transformOrigin: "0 0" });
  c.geo = (lon, lat) => [((lon + 180) / 360) * c.width, ((90 - lat) / 180) * c.height];
  return c;
}

scene({
  id: "s02", lines: ["n02"], pre: 0.25, post: 0.35, letterbox: 1, xfIn: 0.5, xfOut: 0.5,
  sfx: () => [{ type: "whoosh", t: 0.6 }, ...[0, 1, 2, 3, 4].map((i) => ({ type: "blip", t: 0.55 + i * 0.55 }))],
  build(root) {
    this.amb = ambient(root, 21, { count: 24, alpha: 0.1 });
    this.mapWrap = el("div", "layer", root);
    this.map = worldCanvas(this.mapWrap);
    this.svg = svg("svg", { width: W, height: H, style: "position:absolute;inset:0" }, root);
    this.feed = el("div", "", root);
    css(this.feed, { position: "absolute", left: "120px", top: "250px", width: "640px", padding: "26px 28px", borderRadius: "12px",
      background: "rgba(10,16,27,0.88)", border: "1px solid #2b374a", font: "500 17px/1.9 var(--mono)", color: "#bac5d7" });
    this.rows = [
      ["21:42:00", "dns_query", "cdn-sync-update.example → 203.0.113.45", "#68a0ff"],
      ["21:42:30", "network_upload", "2,457,600 B → 203.0.113.45:443", "#ff8a3d"],
      ["21:43:10", "registry_set", "HKCU\\…\\Run\\SyncUpdate", "#ff5d5d"],
      ["22:12:00", "network_conn", "beacon → 203.0.113.45:443", "#f2b84b"],
      ["22:42:00", "network_conn", "beacon → 203.0.113.45:443", "#f2b84b"],
    ];
    this.feed.innerHTML = `<div style="font:600 14px var(--mono);letter-spacing:.2em;color:#7788a4;margin-bottom:10px">SALES-LT-07 · OUTBOUND</div>` +
      this.rows.map((r) => `<div class="row" style="display:grid;grid-template-columns:96px 170px 1fr;white-space:nowrap"><span style="color:#7788a4">${r[0]}</span><span style="color:${r[3]}">${r[1]}</span><span>${esc(r[2])}</span></div>`).join("");
    this.counter = el("div", "", root);
    css(this.counter, { position: "absolute", font: "600 46px var(--mono)", color: "#ff8a3d", textShadow: "0 0 30px rgba(255,138,61,0.45)" });
  },
  render(t, s) {
    this.amb(t);
    const z = lerp(1.0, 1.12, ease.inOutSine(prog(t, 0, s.dur)));
    const [ox, oy] = this.map.geo(101.7, 3.1);
    // Place the org node at stage (1290, 640)
    const sx = 1290 - ox * z, sy = 640 - oy * z;
    this.map.style.transform = `translate(${sx}px, ${sy}px) scale(${z})`;
    this.mapWrap.style.opacity = smooth(t, 0, 0.6);
    this.svg.innerHTML = "";
    const src = [1290, 640];
    const dst = [180, -80];
    const mid = [(src[0] + dst[0]) / 2 + 60, Math.min(src[1], dst[1]) - 180];
    const arcP = smooth(t, 0.5, 1.8, ease.out);
    const d = `M${src[0]} ${src[1]} Q${mid[0]} ${mid[1]} ${dst[0]} ${dst[1]}`;
    const len = 1700;
    svg("path", { d, fill: "none", stroke: "#ff8a3d", "stroke-width": 2.4, "stroke-dasharray": len, "stroke-dashoffset": len * (1 - arcP), opacity: 0.9 }, this.svg);
    svg("path", { d, fill: "none", stroke: "#ff8a3d", "stroke-width": 10, "stroke-dasharray": len, "stroke-dashoffset": len * (1 - arcP), opacity: 0.15 }, this.svg);
    // packets along the quadratic curve
    const qp = (u) => [(1 - u) ** 2 * src[0] + 2 * (1 - u) * u * mid[0] + u * u * dst[0], (1 - u) ** 2 * src[1] + 2 * (1 - u) * u * mid[1] + u * u * dst[1]];
    if (t > 1.2) for (let k = 0; k < 6; k++) {
      const u = ((t - 1.2) * 0.45 + k / 6) % 1;
      const [px, py] = qp(u);
      svg("circle", { cx: px, cy: py, r: 4.5, fill: "#ffd0a8", opacity: 0.9 * Math.sin(Math.PI * u) }, this.svg);
    }
    // org node
    const pulse = (((t * 0.9) % 1) + 1) % 1;
    svg("circle", { cx: src[0], cy: src[1], r: 10 + 40 * pulse, fill: "none", stroke: "#ff5d5d", "stroke-width": 2, opacity: 1 - pulse }, this.svg);
    svg("circle", { cx: src[0], cy: src[1], r: 9, fill: "#ff5d5d" }, this.svg);
    const lbl = svg("text", { x: src[0] + 22, y: src[1] + 6, fill: "#ecedf0", "font-family": "Plex Mono", "font-size": 20, "font-weight": 500 }, this.svg);
    lbl.textContent = "SALES-LT-07";
    const dl = svg("text", { x: 300, y: 90, fill: "#ff8a3d", "font-family": "Plex Mono", "font-size": 19, "font-weight": 500, opacity: smooth(t, 1.4, 2) }, this.svg);
    dl.textContent = "→ cdn-sync-update.example · 203.0.113.45";
    // feed rows
    [...this.feed.querySelectorAll(".row")].forEach((row, i) => { row.style.opacity = smooth(t, 0.5 + i * 0.55, 0.8 + i * 0.55); });
    this.feed.style.opacity = smooth(t, 0.2, 0.7);
    const mb = 2.4 * smooth(t, 1.2, 3.2, ease.out);
    this.counter.textContent = `↑ ${mb.toFixed(1)} MB`;
    css(this.counter, { left: `${src[0] - 40}px`, top: `${src[1] + 28}px`, opacity: smooth(t, 1.2, 1.6) });
  },
});

// ----------------------------------------------------------- S03 replay ---
scene({
  id: "s03", lines: ["n03"], pre: 0.3, post: 0.45, letterbox: 1, xfIn: 0.5, xfOut: 0.45,
  sfx: () => [{ type: "zoom", t: 0.1, dur: 1.4 }, { type: "glitch", t: 1.8 }],
  build(root) {
    this.amb = ambient(root, 31, { hue: "180,139,255" });
    this.floor = floorGrid(root);
    this.date = el("div", "mono", root);
    css(this.date, { position: "absolute", left: "0", right: "0", top: "250px", textAlign: "center", font: "500 22px var(--mono)", letterSpacing: "0.22em", color: "#7788a4" });
    this.clock = el("div", "mono", root);
    css(this.clock, { position: "absolute", left: "0", right: "0", top: "282px", textAlign: "center", font: "300 120px/1 var(--mono)", color: "#ecedf0" });
    const mk = (html, styles) => { const n = el("div", "", root, html); css(n, { position: "absolute", padding: "24px 28px", borderRadius: "12px", background: "rgba(18,26,41,0.95)", boxShadow: "0 30px 80px rgba(0,0,0,0.55)", ...styles }); return n; };
    this.token = mk(`<div class="mono" style="font:600 14px var(--mono);letter-spacing:.2em;color:#3fd0c9">CRM SESSION</div>
      <div class="mono" style="margin-top:10px;font:500 34px var(--mono)">crm-s-7731</div>
      <div style="margin-top:8px;font:400 18px var(--sans);color:#bac5d7">issued to farah · SALES-LT-07</div>`,
      { left: "330px", top: "520px", width: "420px", border: "1px solid rgba(63,208,201,0.5)" });
    this.ghost = mk(`<div class="mono" style="font:600 14px var(--mono);letter-spacing:.2em;color:#ff5d5d">SESSION REPLAY · 10:20</div>
      <div class="mono" style="margin-top:10px;font:500 34px var(--mono)">crm-s-7731</div>
      <div class="mono" style="margin-top:10px;font:400 17px/1.7 var(--mono);color:#bac5d7">src 198.51.100.23<br>unregistered Windows / Chrome<br>auth: existing session token</div>`,
      { left: "1150px", top: "470px", width: "460px", border: "1px solid rgba(255,93,93,0.6)", borderLeft: "5px solid #ff5d5d" });
    this.svg = svg("svg", { width: W, height: H, style: "position:absolute;inset:0" }, root);
  },
  render(t, s) {
    this.amb(t);
    this.floor(t);
    // clock rolls from 21:43 to 10:20 next morning
    const p = smooth(t, 0.1, 1.5, ease.inOut);
    const mins = Math.round(lerp(21 * 60 + 43, (24 + 10) * 60 + 20, p));
    const hh = Math.floor(mins / 60) % 24, mm = mins % 60;
    this.clock.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    this.date.textContent = p > 0.35 ? "MON · 05 OCT 2026" : "SUN · 04 OCT 2026";
    this.clock.style.opacity = this.date.style.opacity = smooth(t, 0, 0.4);
    this.token.style.opacity = smooth(t, 0.9, 1.3);
    this.token.style.transform = `translateY(${(1 - smooth(t, 0.9, 1.5, ease.out)) * 30}px)`;
    const g = smooth(t, 1.8, 2.6, ease.outExpo);
    this.ghost.style.opacity = g;
    this.ghost.dataset.baseTf = `translateX(${(1 - g) * -380}px)`;
    rgbSplit(this.ghost, glitchAmt(t, 1.8, 0.45, 5));
    this.svg.innerHTML = "";
    if (g > 0.05) {
      const p2 = smooth(t, 2.2, 3.0);
      svg("path", { d: "M750 600 C 900 600, 1000 560, 1150 560", fill: "none", stroke: "#ff5d5d", "stroke-width": 2.5, "stroke-dasharray": "8 8", opacity: p2 }, this.svg);
    }
  },
});

// ------------------------------------------------------------ S04 storm ---
const ALERT_POOL = [
  ["EDR", "Unsigned process read browser password and cookie stores", "SALES-LT-07"],
  ["DNS", "cdn-sync-update.example → 203.0.113.45", "SALES-LT-07"],
  ["FIREWALL", "network_upload 2.4 MB → 203.0.113.45:443", "SALES-LT-07"],
  ["ENDPOINT", "process_start PDFEditorSetup.exe (unsigned)", "SALES-LT-07"],
  ["IDP", "sign-in farah · push approved", "SSO portal"],
  ["ENDPOINT", "process_start Teams.exe (signed)", "MKT-LT-11"],
  ["ENDPOINT", "process_start OneDrive.exe (signed)", "HR-LT-02"],
  ["IDP", "sign-in aina · push approved", "SSO portal"],
  ["DNS", "update.vendor-os.example → 198.51.100.140", "SALES-LT-07"],
  ["FIREWALL", "beacon → 203.0.113.45:443", "SALES-LT-07"],
  ["CRM", "crm_signin existing session token", "198.51.100.23"],
  ["CRM", "crm_export 1,200 records", "198.51.100.23"],
  ["MAIL", "inbound message quarantined", "mail gateway"],
  ["SIEM", "outbound volume above baseline", "FS-01"],
  ["ENDPOINT", "registry_set Run\\SyncUpdate", "SALES-LT-07"],
  ["IDP", "sign-in failure · session revoked", "198.51.100.23"],
  ["DNS", "pdf-editor-free.example → 203.0.113.10", "SALES-LT-07"],
  ["FIREWALL", "http_download PDFEditorSetup.exe", "SALES-LT-07"],
  ["MAIL", "MFA prompt reported by user", "FIN-LT-03"],
  ["SIEM", "scheduled task created by admin", "FS-01"],
];
const CHAIN = [
  ["21:38", "FIREWALL", "http_download", "PDFEditorSetup.exe"],
  ["21:40", "ENDPOINT", "process_start", "unsigned installer runs"],
  ["21:41", "EDR", "edr_alert", "browser credential stores read"],
  ["21:42", "FIREWALL", "network_upload", "2.4 MB → 203.0.113.45"],
];
scene({
  id: "s04", lines: ["n04"], pre: 0.2, post: 0.5, letterbox: 1, xfIn: 0.45,
  build(root) {
    this.amb = ambient(root, 41, { count: 30, alpha: 0.08 });
    const wall = this.wall = el("div", "layer", root);
    css(wall, { perspective: "1500px", perspectiveOrigin: "50% 45%" });
    const plane = this.plane = el("div", "", wall);
    css(plane, { position: "absolute", left: "-60px", top: "-260px", width: "2040px", height: "1600px", transformOrigin: "50% 50%" });
    const r = rng(404);
    this.cols = [];
    for (let c = 0; c < 3; c++) {
      const col = el("div", "", plane);
      css(col, { position: "absolute", left: `${30 + c * 680}px`, top: "0", width: "650px" });
      for (let i = 0; i < 56; i++) {
        const a = ALERT_POOL[Math.floor(r() * ALERT_POOL.length)];
        const hh = 21 + Math.floor(r() * 3), mm = Math.floor(r() * 60), ss = Math.floor(r() * 60);
        const row = el("div", "", col, `<span style="color:#5f6f88">${String(hh % 24).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}</span>  <span style="color:${SRC_COLORS[a[0]]};font-weight:600">${a[0].padEnd(8, " ")}</span> <span style="color:#aab6c9">${esc(a[1])}</span>`);
        css(row, { height: "34px", font: "500 17px/34px var(--mono)", whiteSpace: "pre", overflow: "hidden",
          borderBottom: "1px solid rgba(43,55,74,0.5)", padding: "0 12px", background: i % 7 === 3 ? "rgba(255,93,93,0.06)" : "transparent" });
      }
      this.cols.push({ col, speed: 70 + c * 26 });
    }
    this.title = el("div", "", root, "Hundreds of alerts.");
    css(this.title, { position: "absolute", left: "0", right: "0", top: "440px", textAlign: "center", font: "700 108px/1 var(--sans)",
      letterSpacing: "-0.02em", color: "#ecedf0", textShadow: "0 10px 60px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.8)" });
    this.cards = CHAIN.map(([time, src, type, text], k) => {
      const card = el("div", "", root, `<div class="mono" style="display:flex;justify-content:space-between;font:600 14px var(--mono);letter-spacing:.14em"><span style="color:${SRC_COLORS[src]}">${src}</span><span style="color:#7788a4">${time}</span></div>
        <div class="mono" style="margin-top:10px;font:600 20px var(--mono);color:#ecedf0">${type}</div>
        <div style="margin-top:6px;font:400 18px/1.3 var(--sans);color:#bac5d7">${esc(text)}</div>`);
      css(card, { position: "absolute", left: `${150 + k * 420}px`, top: "430px", width: "360px", padding: "18px 20px", borderRadius: "10px",
        background: "rgba(16,24,39,0.97)", border: "1px solid #394558", boxShadow: "0 30px 80px rgba(0,0,0,0.7)" });
      return card;
    });
    this.svg = svg("svg", { width: W, height: H, style: "position:absolute;inset:0" }, root);
  },
  render(t, s) {
    this.amb(t);
    const n04 = s.lineAt.n04, dn = FILM.durations.n04;
    const connectAt = n04 + dn * 0.5;
    const freeze = smooth(t, connectAt - 0.8, connectAt);
    for (const { col, speed } of this.cols) col.style.transform = `translateY(${-((t * speed * (1 - 0.8 * freeze)) % 700)}px)`;
    this.plane.style.opacity = smooth(t, 0, 0.5) * (1 - 0.72 * freeze);
    this.plane.style.filter = freeze > 0.01 ? `blur(${2.5 * freeze}px)` : "";
    this.plane.style.transform = `rotateY(-16deg) rotateX(10deg) translateZ(${-120 + 90 * prog(t, 0, s.dur)}px)`;
    this.title.style.opacity = window_(t, 0.3, connectAt - 0.6, 0.45);
    this.title.style.transform = `scale(${1 + 0.06 * prog(t, 0.3, connectAt)})`;
    rgbSplit(this.title, glitchAmt(t, 0.3, 0.3, 2) * 0.6);
    this.svg.innerHTML = "";
    this.cards.forEach((card, k) => {
      const a = connectAt - 0.35 + k * 0.28;
      const p = smooth(t, a, a + 0.45, ease.outBack);
      card.style.opacity = clamp(p * 1.5);
      card.style.transform = `translateY(${(1 - clamp(p)) * 70}px) scale(${lerp(0.8, 1, clamp(p))})`;
      card.style.borderColor = p > 0.9 ? "rgba(157,237,0,0.6)" : "#394558";
      if (k > 0) {
        const lp = smooth(t, a + 0.15, a + 0.5, ease.out);
        const x1 = 150 + (k - 1) * 420 + 360, x2 = 150 + k * 420, y = 500;
        if (lp > 0) {
          svg("line", { x1, y1: y, x2: lerp(x1, x2, lp), y2: y, stroke: "#9ded00", "stroke-width": 3 }, this.svg);
          svg("line", { x1, y1: y, x2: lerp(x1, x2, lp), y2: y, stroke: "#9ded00", "stroke-width": 12, opacity: 0.15 }, this.svg);
          if (lp > 0.9) svg("path", { d: `M${x2 - 12} ${y - 8} L${x2 - 1} ${y} L${x2 - 12} ${y + 8}`, fill: "none", stroke: "#9ded00", "stroke-width": 3 }, this.svg);
        }
      }
    });
  },
  sfx: (s) => [{ type: "glitch", t: 0.3 }, ...CHAIN.map((_, k) => ({ type: "blip", t: s.lineAt.n04 + FILM.durations.n04 * 0.5 - 0.35 + k * 0.28 }))],
});

// -------------------------------------------------------- S05 fragments ---
scene({
  id: "s05", lines: ["n05"], pre: 0.2, post: 0.5, letterbox: 1, xfIn: 0.5, xfOut: 0.6,
  sfx: (s) => { const a = s.lineAt.n05 + FILM.durations.n05 * 0.52; return [{ type: "blip", t: 1.45 }, { type: "blip", t: 2.35 }, { type: "blip", t: 3.25 }, { type: "whoosh", t: a + 0.1 }, { type: "glitch", t: a + 0.5 }, { type: "alarm", t: a + 0.55 }]; },
  build(root) {
    this.amb = ambient(root, 51, { count: 30 });
    const cols = [
      ["IDENTITY", "#b48bff", ["idp_signin farah\nSSO portal · push approved", "crm_signin farah\nsession crm-s-7731", "idp_signin aina\n192.0.2.61"]],
      ["ENDPOINT", "#ff8a3d", ["process_start\nPDFEditorSetup.exe · unsigned", "edr_alert · high\nbrowser credential stores", "registry_set\nRun\\SyncUpdate"]],
      ["DNS", "#68a0ff", ["dns_query\npdf-editor-free.example", "dns_query\ncdn-sync-update.example", "dns_query\nupdate.vendor-os.example"]],
      ["NETWORK", "#f2b84b", ["http_download\nPDFEditorSetup.exe · 4.5 MB", "network_upload\n2.4 MB → 203.0.113.45", "network_connection\nbeacon :443"]],
      ["USER ACTIVITY", "#9ded00", ["analyst_note\ntriage requested", "process_start\nTeams.exe · MKT-LT-11", "process_start\nOneDrive.exe · HR-LT-02"]],
    ];
    this.cards = [];
    const r = rng(55);
    cols.forEach(([name, color, items], c) => {
      const x = 110 + c * 340;
      const head = el("div", "mono", root, name);
      css(head, { position: "absolute", left: `${x}px`, top: "318px", font: "600 17px var(--mono)", letterSpacing: "0.2em", color });
      this.cards.push({ node: head, x, y: 318, head: true, c, r: r() });
      items.forEach((txt, i) => {
        const [a, b] = txt.split("\n");
        const card = el("div", "", root, `<div class="mono" style="font:600 17px var(--mono);color:#ecedf0">${esc(a)}</div><div class="mono" style="margin-top:7px;font:400 15px var(--mono);color:#8d9bb3">${esc(b)}</div>`);
        css(card, { position: "absolute", left: `${x}px`, top: `${362 + i * 124}px`, width: "305px", padding: "18px 20px", borderRadius: "9px",
          background: "rgba(20,30,45,0.92)", border: "1px solid #2b374a", borderTop: `3px solid ${color}` });
        this.cards.push({ node: card, x, y: 362 + i * 124, c, i, r: r() });
      });
    });
    this.plan = el("div", "", root, `<div class="mono" style="font:600 14px var(--mono);letter-spacing:.2em;color:#7788a4">RESPONSE PLAN</div>
      <div style="margin-top:8px;font:600 30px var(--sans)">Plan v1</div><div class="mono" style="margin-top:6px;font:400 15px var(--mono);color:#7788a4">based on state v5</div>
      <div class="stale mono" style="margin-top:14px;font:600 15px var(--mono);letter-spacing:.14em;color:#f2b84b">● STALE · STATE CHANGED</div>`);
    css(this.plan, { position: "absolute", left: "1560px", top: "570px", width: "270px", padding: "20px 22px", borderRadius: "10px", background: "rgba(20,30,45,0.95)", border: "1px solid #394558" });
    this.newEv = el("div", "", root, `<div class="mono" style="font:600 14px var(--mono);letter-spacing:.2em;color:#ff8a3d">NEW EVIDENCE</div>
      <div class="mono" style="margin-top:8px;font:500 16px var(--mono)">crm_export · 1,200 records</div>`);
    css(this.newEv, { position: "absolute", left: "1545px", top: "380px", width: "300px", padding: "16px 18px", borderRadius: "9px",
      background: "rgba(30,22,18,0.95)", border: "1px solid rgba(255,138,61,0.7)", boxShadow: "0 0 50px rgba(255,138,61,0.25)" });
    this.svg = svg("svg", { width: W, height: H, style: "position:absolute;inset:0" }, root);
  },
  render(t, s) {
    this.amb(t);
    const dn = FILM.durations.n05, n05 = s.lineAt.n05;
    const arrive = n05 + dn * 0.52;
    for (const card of this.cards) {
      const p = smooth(t, 0.1 + card.c * 0.12 + (card.i || 0) * 0.08, 0.6 + card.c * 0.12 + (card.i || 0) * 0.08, ease.out);
      const drift = card.head ? 0 : Math.sin(t * 0.7 + card.r * 6) * 10;
      const spread = card.head ? 0 : (card.c - 2) * 18 * smooth(t, 0.5, s.dur);
      const hide = card.c === 4 ? smooth(t, arrive - 1.4, arrive - 0.9) : 0;
      css(card.node, { opacity: p * (1 - 0.35 * smooth(t, arrive, arrive + 0.5)) * (1 - hide), transform: `translate(${spread}px, ${(1 - p) * 30 + drift}px)` });
    }
    // failed connection attempts
    this.svg.innerHTML = "";
    const tries = [[1, 0, 3, 1], [2, 1, 1, 1], [4, 0, 0, 1]];
    tries.forEach(([c1, i1, c2, i2], k) => {
      const at = 1.0 + k * 0.9;
      const p = window_(t, at, at + 0.9, 0.25);
      if (p <= 0) return;
      const a = this.cards.find((c) => c.c === c1 && c.i === i1), b = this.cards.find((c) => c.c === c2 && c.i === i2);
      const ax = a.x + 305, ay = a.y + 44, bx = b.x, by = b.y + 44;
      const reach = smooth(t, at, at + 0.5) * 0.62;
      svg("line", { x1: ax, y1: ay, x2: lerp(ax, bx, reach), y2: lerp(ay, by, reach), stroke: "#f2b84b", "stroke-width": 2, "stroke-dasharray": "6 7", opacity: p * 0.8 }, this.svg);
      svg("text", { x: lerp(ax, bx, reach) + 8, y: lerp(ay, by, reach) + 5, fill: "#f2b84b", "font-family": "Plex Mono", "font-size": 18, opacity: p * smooth(t, at + 0.45, at + 0.55) }).textContent = "?";
    });
    this.plan.style.opacity = smooth(t, arrive - 1.2, arrive - 0.8);
    const stale = this.plan.querySelector(".stale");
    stale.style.opacity = smooth(t, arrive + 0.5, arrive + 0.6);
    this.plan.style.borderColor = t > arrive + 0.5 ? "rgba(242,184,75,0.8)" : "#394558";
    rgbSplit(this.plan, glitchAmt(t, arrive + 0.5, 0.35, 4));
    const drop = smooth(t, arrive, arrive + 0.5, ease.outBack);
    this.newEv.style.opacity = smooth(t, arrive, arrive + 0.2);
    this.newEv.style.transform = `translateY(${(1 - drop) * -120}px)`;
  },
});

// ------------------------------------------------------------- S06 logo ---
scene({
  id: "s06", lines: ["n06"], pre: 1.9, post: 0.5, letterbox: (lt) => 1 - smooth(lt, 2.6, 4.2), xfIn: 0.6,
  build(root) {
    this.amb = ambient(root, 61, { count: 34, hue: "157,237,0", alpha: 0.07 });
    const L = FILM.logo;
    const scale = this.scale = 0.36;
    const ox = this.ox = 960 - (L.word.x + L.word.w / 2) * scale;
    const oy = this.oy = 360 - (789 + (1933 - 789) / 2) * scale + 40;
    const box = this.box = el("div", "layer", root);
    this.parts = L.icon.map((p) => {
      const img = el("img", "", box);
      img.src = `assets/logo/${p.src}`;
      css(img, { position: "absolute", left: `${ox + p.x * scale}px`, top: `${oy + p.y * scale}px`, width: `${p.w * scale}px`, height: `${p.h * scale}px` });
      return { img, p };
    });
    const word = L.word;
    this.wordClip = el("div", "", box);
    css(this.wordClip, { position: "absolute", left: `${ox + word.x * scale}px`, top: `${oy + word.y * scale}px`, width: `${word.w * scale}px`, height: `${word.h * scale}px`, overflow: "hidden" });
    this.word = el("img", "", this.wordClip);
    this.word.src = `assets/logo/${word.src}`;
    css(this.word, { width: "100%", height: "100%" });
    this.tag = el("img", "", box);
    this.tag.src = `assets/logo/${L.tag.src}`;
    css(this.tag, { position: "absolute", left: `${ox + L.tag.x * scale}px`, top: `${oy + L.tag.y * scale}px`, width: `${L.tag.w * scale}px` });
    this.desc = el("div", "mono", root);
    css(this.desc, { position: "absolute", left: "0", right: "0", top: `${oy + 2010 * scale}px`, textAlign: "center", font: "500 24px var(--mono)", letterSpacing: "0.32em", color: "#9ded00" });
    this.glow = el("div", "", root);
    const icx = ox + (1100 + 1660) / 2 * scale, icy = oy + (789 + 1310) / 2 * scale;
    this.icon = [icx, icy];
    css(this.glow, { position: "absolute", left: `${icx - 260}px`, top: `${icy - 260}px`, width: "520px", height: "520px", borderRadius: "50%",
      background: "radial-gradient(circle, rgba(157,237,0,0.30) 0%, rgba(157,237,0,0.06) 40%, rgba(157,237,0,0) 70%)" });
    this.svg = svg("svg", { width: W, height: H, style: "position:absolute;inset:0" }, root);
    const r = rng(66);
    this.sparks = Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * H, k: Math.floor(r() * L.icon.length), d: r() * 0.5 }));
  },
  render(t, s) {
    this.amb(t);
    const L = FILM.logo, sc = this.scale;
    this.svg.innerHTML = "";
    // sparks converge into the icon parts
    for (const sp of this.sparks) {
      const p = smooth(t, 0.1 + sp.d, 1.25 + sp.d, ease.inOut);
      if (p >= 1) continue;
      const part = L.icon[sp.k];
      const tx = this.ox + (part.x + part.w / 2) * sc, ty = this.oy + (part.y + part.h / 2) * sc;
      const x = lerp(sp.x, tx, p), y = lerp(sp.y, ty, p);
      svg("circle", { cx: x, cy: y, r: 3 + 2 * (1 - p), fill: p > 0.6 ? "#9ded00" : "#7788a4", opacity: 0.85 * Math.sin(Math.PI * Math.min(1, p * 1.1 + 0.05)) }, this.svg);
    }
    this.parts.forEach(({ img, p }, k) => {
      const big = p.w > 200;
      const a = smooth(t, 0.9 + k * 0.06, 1.4 + k * 0.06, ease.outBack);
      img.style.opacity = clamp(a);
      img.style.transform = `scale(${lerp(0.4, 1, clamp(a))})`;
      if (big) img.style.clipPath = `inset(0 ${100 - 100 * smooth(t, 1.0, 1.6)}% 0 0)`;
    });
    const pulse = smooth(t, 1.45, 1.8, ease.out) * (1 - smooth(t, 1.9, 3.4));
    this.glow.style.opacity = 0.25 + 0.75 * pulse;
    this.glow.style.transform = `scale(${0.8 + 0.4 * smooth(t, 1.45, 2.4, ease.out)})`;
    // wordmark: open from the centre outwards
    const w = smooth(t, 1.5, 2.3, ease.inOut);
    this.wordClip.style.clipPath = `inset(0 ${50 - 50 * w}% 0 ${50 - 50 * w}%)`;
    this.tag.style.opacity = smooth(t, 2.2, 2.8);
    this.desc.textContent = typed("AGENTIC INCIDENT RESPONSE PLANNING", prog(t, 2.6, 3.6));
    this.box.style.transform = `scale(${1.04 - 0.04 * smooth(t, 0, s.dur, ease.out)})`;
    this.box.style.opacity = 1 - smooth(t, s.dur - 0.5, s.dur);
  },
});

// ---------------------------------------------------------- S07 promise ---
const ICONS = {
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13v1M15 13v1M9 17h6"/>',
  user: '<circle cx="10" cy="8" r="4"/><path d="M3 21c0-4 3-6 7-6s7 2 7 6"/><path d="m16 11 2 2 4-4"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>',
};
const icon = (name, color, size = 44) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

scene({
  id: "s07", lines: ["n07"], pre: 0.25, post: 0.75, letterbox: 0, xfIn: 0.6, xfOut: 0.5,
  sfx: () => [0, 1, 2, 3, 4].map((i) => ({ type: "blip", t: 0.2 + i * 0.16 })),
  build(root) {
    this.amb = ambient(root, 71, { count: 26, alpha: 0.08 });
    el("div", "backdrop", root).appendChild(el("div", "grid"));
    this.head = el("div", "", root, `<div class="mono" style="font:600 20px var(--mono);letter-spacing:.24em;color:#8d9bb3">BUILT FOR TIER 1 &amp; JUNIOR TIER 2 SOC ANALYSTS</div>`);
    css(this.head, { position: "absolute", left: "0", right: "0", top: "240px", textAlign: "center" });
    const nodes = [
      ["file", "Evidence", "logs · alerts · notes", "#bac5d7"],
      ["bot", "Caventas agent", "recommends", "#68a0ff"],
      ["user", "Analyst", "decides", "#9ded00"],
      ["box", "Bounded simulator", "simulated execution", "#bac5d7"],
      ["doc", "Report", "accountable record", "#bac5d7"],
    ];
    this.nodes = nodes.map(([ic, name, sub, color], i) => {
      const n = el("div", "", root, `<div style="display:grid;place-items:center;width:132px;height:132px;margin:0 auto;border-radius:26px;border:1.5px solid ${color === "#9ded00" ? "rgba(157,237,0,0.75)" : "#394558"};background:rgba(20,30,45,0.95)">${icon(ic, color, 60)}</div>
        <div style="margin-top:22px;font:600 31px var(--sans);color:#ecedf0">${name}</div><div class="mono" style="margin-top:9px;font:500 18px var(--mono);letter-spacing:.08em;color:${color}">${sub}</div>`);
      css(n, { position: "absolute", left: `${280 + i * 340 - 130}px`, top: "380px", width: "260px", textAlign: "center" });
      return n;
    });
    this.svg = svg("svg", { width: W, height: H, style: "position:absolute;inset:0" }, root);
    this.lock = el("div", "chip lime", root, "HUMAN APPROVAL REQUIRED");
    css(this.lock, { position: "absolute", left: "960px", top: "680px", transform: "translateX(-50%)", fontSize: "18px", padding: "9px 16px" });
  },
  render(t, s) {
    this.amb(t);
    this.head.style.opacity = smooth(t, 0.1, 0.6);
    const dn = FILM.durations.n07, n07 = s.lineAt.n07;
    const recommendAt = n07 + dn * 0.55, decideAt = n07 + dn * 0.78;
    this.nodes.forEach((n, i) => {
      const p = smooth(t, 0.15 + i * 0.16, 0.65 + i * 0.16, ease.out);
      n.style.opacity = p;
      n.style.transform = `translateY(${(1 - p) * 24}px)`;
    });
    this.nodes[1].style.transform += ` scale(${1 + 0.06 * window_(t, recommendAt, recommendAt + 1.2, 0.3)})`;
    this.nodes[2].style.transform += ` scale(${1 + 0.08 * smooth(t, decideAt, decideAt + 0.3)})`;
    this.svg.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const p = smooth(t, 0.55 + i * 0.18, 0.95 + i * 0.18, ease.out);
      const x1 = 280 + i * 340 + 82, x2 = 280 + (i + 1) * 340 - 82, y = 446;
      const hot = i === 1 && t > decideAt;
      svg("line", { x1, y1: y, x2: lerp(x1, x2, p), y2: y, stroke: hot ? "#9ded00" : "#394558", "stroke-width": 2.5 }, this.svg);
      if (p > 0.95) svg("path", { d: `M${x2 - 10} ${y - 7} L${x2} ${y} L${x2 - 10} ${y + 7}`, fill: "none", stroke: hot ? "#9ded00" : "#5b6a82", "stroke-width": 2.5 }, this.svg);
    }
    // the agent cannot reach the simulator directly
    const byp = smooth(t, recommendAt + 0.2, recommendAt + 0.9);
    if (byp > 0) {
      const d = "M620 384 C 780 290, 1140 290, 1300 384";
      svg("path", { d, fill: "none", stroke: "#ff5d5d", "stroke-width": 2, "stroke-dasharray": "7 8", opacity: 0.85 * byp }, this.svg);
      const xp = smooth(t, recommendAt + 0.7, recommendAt + 1.0);
      svg("path", { d: "M946 298 l28 28 M974 298 l-28 28", stroke: "#ff5d5d", "stroke-width": 4, opacity: xp, "stroke-linecap": "round" }, this.svg);
    }
    this.lock.style.opacity = smooth(t, decideAt, decideAt + 0.3);
  },
});
