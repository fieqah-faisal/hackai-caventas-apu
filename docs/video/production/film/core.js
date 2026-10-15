/* Core of the frame-by-frame compositor: math, scene registry, the product
 * "monitor" (Screen), callouts, cursor, captions and global effects. Every
 * visual is a pure function of time so frames render deterministically. */
"use strict";

const FILM = window.FILM;
const W = 1920, H = 1080, FPS = 30;
const VW = 1536, VH = 864;

// ---------------------------------------------------------------- math ----
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const ease = {
  linear: (p) => p,
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  out: (p) => 1 - Math.pow(1 - p, 3),
  in: (p) => p * p * p,
  outExpo: (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
  outBack: (p) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
};
const smooth = (t, a, b, fn = ease.inOut) => fn(prog(t, a, b));
// fade in over [a, a+d] and out over [b-d, b]
const window_ = (t, a, b, d = 0.4) => Math.min(smooth(t, a, a + d), 1 - smooth(t, b - d, b));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Keyframed values: keys = [[t, value(s)...], ...]
function keyed(t, keys, fn = ease.inOut) {
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      const p = fn(prog(t, a[0], b[0]));
      return a.slice(1).map((v, k) => lerp(v, b[k + 1], p));
    }
  }
  return keys[keys.length - 1].slice(1);
}

// ----------------------------------------------------------------- dom ----
function el(tag, cls, parent, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  if (parent) parent.appendChild(node);
  return node;
}
const css = (node, styles) => { Object.assign(node.style, styles); return node; };
const SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs, parent) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ------------------------------------------------------------ registry ----
const SCENES = [];
function scene(def) { SCENES.push(def); return def; }

// Image decode tracking so the driver waits before each screenshot.
const pendingDecodes = new Set();
function setSrc(img, src) {
  if (img.dataset.src === src) return;
  img.dataset.src = src;
  img.src = src;
  const p = img.decode().catch(() => {}).finally(() => pendingDecodes.delete(p));
  pendingDecodes.add(p);
}

// --------------------------------------------------------------- capture --
const SHOTS = FILM.capture.shots;
const shot = (name) => {
  const s = SHOTS[name];
  if (!s) throw new Error(`missing shot ${name}`);
  return s;
};
const frameOf = (name, i = 0) => {
  const f = shot(name).frames;
  return f[i < 0 ? f.length + i : Math.min(i, f.length - 1)];
};
// Find a UI element in a frame's index by text (string or RegExp).
function find(frame, match, { tag, nth = 0, minW = 0 } = {}) {
  const list = (frame.index || []).filter((e) =>
    (!tag || e.s === tag) && e.b[2] >= minW &&
    (match instanceof RegExp ? match.test(e.t) : e.t === match));
  const hit = list[nth];
  if (!hit) { console.warn("callout target not found", frame.file, String(match)); return null; }
  return { x: hit.b[0], y: hit.b[1], w: hit.b[2], h: hit.b[3] };
}
const findIn = (name, i, match, opts) => find(frameOf(name, i), match, opts);
// Box of a single text line: element boxes span the column, text does not.
const textBox = (r, text, px = 8.7) => r && { x: r.x, y: r.y, w: Math.min(r.w, Math.ceil(text.length * px) + 4), h: r.h };
const pad = (r, p = 6) => r && { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p };
const union = (...rs) => {
  rs = rs.filter(Boolean);
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

// ---------------------------------------------------------------- Screen --
// A floating monitor showing a captured frame. Camera: focus point (cx, cy)
// in page px is placed at the stage anchor; z=1 shows the full viewport at
// PANEL_W wide. Tall captures scroll inside a fixed browser chrome.
const PANEL_W = 1520, ANCHOR = [960, 474];
const TILE_H = 576;

class Screen {
  constructor(parent) {
    this.wrap = el("div", "layer", parent);
    this.box = el("div", "screen", this.wrap);
    this.page = el("div", "screen-layer", this.box);
    this.img = el("img", "", this.page);
    this.tiles = [];
    this.chromeTop = el("div", "", this.box);
    this.chromeSide = el("div", "", this.box);
    css(this.chromeTop, { position: "absolute", left: "0", top: "0", width: "1536px", height: "57px", display: "none" });
    css(this.chromeSide, { position: "absolute", left: "0", top: "57px", width: "240px", height: "807px", display: "none" });
    this.over = el("div", "screen-layer", this.box);
    this.k = 1; this.tx = 0; this.ty = 0; this.scrollY = 0;
  }

  // frame: manifest frame; opts.scroll for tall shots; opts.chrome frame for fixed bars
  show(name, i = 0, { scroll = 0, chrome = null } = {}) {
    const s = shot(name);
    const f = frameOf(name, i);
    this.current = { name, frame: f, tall: !!s.tall, height: s.height || VH };
    scroll = s.tall ? clamp(scroll, 0, (s.height || VH) - VH) : 0;
    this.scrollY = scroll;
    if (s.tall && FILM.tiles[f.file]) {
      this.img.style.display = "none";
      const tiles = FILM.tiles[f.file];
      while (this.tiles.length < tiles.length) this.tiles.push(el("img", "tile", this.page));
      this.tiles.forEach((img, k) => {
        const tile = tiles[k];
        const visible = tile && tile.y + TILE_H > scroll - 300 && tile.y < scroll + VH + 300;
        img.style.display = visible ? "block" : "none";
        if (visible) { setSrc(img, tile.src); img.style.top = `${tile.y}px`; }
      });
    } else {
      this.tiles.forEach((img) => (img.style.display = "none"));
      this.img.style.display = "block";
      setSrc(this.img, f.file);
    }
    this.page.style.transform = `translateY(${-scroll}px)`;
    this.over.style.transform = `translateY(${-scroll}px)`;
    const showChrome = s.tall && chrome;
    for (const [node, pos] of [[this.chromeTop, "0px 0px"], [this.chromeSide, "0px -57px"]]) {
      node.style.display = showChrome ? "block" : "none";
      if (showChrome) {
        const src = frameOf(chrome[0], chrome[1] || 0).file;
        node.style.background = `url("${src}") ${pos} / 1536px 864px no-repeat`;
      }
    }
    return this;
  }

  // Camera: cx, cy in page coordinates (scroll applied), z zoom, rx/ry tilt deg.
  // The monitor edge may intrude at most (mx, my) into the frame, so zoomed
  // shots stay filled; smaller panels are centred.
  camera({ cx = VW / 2, cy = VH / 2, z = 1, rx = 0, ry = 0, x = 0, y = 0, opacity = 1, blur = 0, mx = 230, my = 120, free = false } = {}) {
    const k = (PANEL_W / VW) * z;
    const vy = cy - this.scrollY;
    const w = VW * k, h = VH * k;
    let tx = ANCHOR[0] - cx * k, ty = ANCHOR[1] - vy * k;
    if (!free) {
      tx = w > W - 2 * mx ? clamp(tx, W - mx - w, mx) : (W - w) / 2;
      ty = h > H - 2 * my ? clamp(ty, H - my - h, my) : (H - h) / 2 - 50;
    }
    this.k = k;
    this.tx = tx + x;
    this.ty = ty + y;
    this.box.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${k})`;
    this.wrap.style.transform = rx || ry ? `perspective(2400px) rotateX(${rx}deg) rotateY(${ry}deg)` : "";
    this.wrap.style.opacity = opacity;
    this.wrap.style.filter = blur ? `blur(${blur}px)` : "";
    return this;
  }

  // page px -> stage px
  project(x, y) { return [this.tx + x * this.k, this.ty + (y - this.scrollY) * this.k]; }
  rect(r) {
    const [x, y] = this.project(r.x, r.y);
    return { x, y, w: r.w * this.k, h: r.h * this.k };
  }
}

// --------------------------------------------------------------- overlay --
const OVERLAY = document.getElementById("overlay");
const LABELS = el("div", "layer", document.getElementById("stage"));
LABELS.style.pointerEvents = "none";
document.getElementById("stage").insertBefore(LABELS, document.getElementById("grain"));
// Per-scene overlay containers so callouts fade with their scene.
const OVL = { g: OVERLAY, l: LABELS };
function clearOverlay() { OVERLAY.innerHTML = ""; LABELS.innerHTML = ""; OVL.g = OVERLAY; OVL.l = LABELS; }
function overlayFor() {
  OVL.g = svg("g", {}, OVERLAY);
  OVL.l = el("div", "layer", LABELS);
  return OVL;
}

const COLORS = { lime: "#9ded00", amber: "#f2b84b", red: "#ff5d5d", blue: "#68a0ff", white: "#ecedf0" };

// Bracketed highlight around a stage-space rect, drawn on with progress p.
function highlight(r, p, { color = "lime", radius = 8, fill = true, glow = true } = {}) {
  if (!r || p <= 0) return;
  const c = COLORS[color] || color;
  const g = svg("g", { opacity: clamp(p * 1.6) }, OVL.g);
  if (fill) svg("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: radius, fill: c, "fill-opacity": 0.07 * clamp(p * 2) }, g);
  const per = 2 * (r.w + r.h);
  if (glow) svg("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: radius, fill: "none", stroke: c, "stroke-opacity": 0.25, "stroke-width": 8,
    "stroke-dasharray": per, "stroke-dashoffset": per * (1 - ease.out(p)) }, g);
  svg("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: radius, fill: "none", stroke: c, "stroke-width": 2.5,
    "stroke-dasharray": per, "stroke-dashoffset": per * (1 - ease.out(p)) }, g);
  // corner ticks
  const L = Math.min(18, r.w / 4, r.h / 3), o = 6;
  const corners = [[r.x - o, r.y - o, 1, 1], [r.x + r.w + o, r.y - o, -1, 1], [r.x - o, r.y + r.h + o, 1, -1], [r.x + r.w + o, r.y + r.h + o, -1, -1]];
  for (const [x, y, dx, dy] of corners) {
    svg("path", { d: `M${x} ${y + dy * L}V${y}H${x + dx * L}`, fill: "none", stroke: c, "stroke-width": 2, opacity: clamp((p - 0.4) * 2) }, g);
  }
}

// Label tag anchored to a stage point; side: 'top'|'bottom'|'left'|'right'.
function tag(text, at, p, { color = "", side = "top", sub = "", dx = 0, dy = 0 } = {}) {
  if (!at || p <= 0) return;
  const node = el("div", `label-tag ${color}`, OVL.l, esc(text) + (sub ? `<small>${esc(sub)}</small>` : ""));
  const off = (1 - ease.out(clamp(p))) * 14;
  const [x, y] = at;
  const tf = { top: `translate(-50%, calc(-100% - 14px + ${off}px))`, bottom: `translate(-50%, ${14 + off}px)`,
    left: `translate(calc(-100% - 16px - ${off}px), -50%)`, right: `translate(${16 + off}px, -50%)` }[side];
  css(node, { left: `${x + dx}px`, top: `${y + dy}px`, transform: tf, opacity: clamp(p * 1.5) });
  return node;
}

function callout(screen, r, p, text, opts = {}) {
  if (!r) return;
  const sr = screen.rect(pad(r, opts.pad ?? 6));
  highlight(sr, p, opts);
  if (text) {
    const side = opts.side || "top";
    const at = { top: [sr.x + sr.w / 2, sr.y], bottom: [sr.x + sr.w / 2, sr.y + sr.h],
      left: [sr.x, sr.y + sr.h / 2], right: [sr.x + sr.w, sr.y + sr.h / 2] }[side];
    if (opts.align === "start" && (side === "top" || side === "bottom")) at[0] = sr.x + 10;
    tag(text, at, prog(p, 0.25, 1), { ...opts, side });
  }
}

// Mouse cursor + click ripple in stage space.
function cursor(pos, { click = -1, t = 0, visible = 1 } = {}) {
  if (!pos || visible <= 0) return;
  const [x, y] = pos;
  if (click >= 0 && t >= click && t < click + 0.7) {
    const p = prog(t, click, click + 0.7);
    svg("circle", { cx: x, cy: y, r: 10 + 34 * ease.out(p), fill: "none", stroke: COLORS.lime, "stroke-width": 3 * (1 - p), opacity: 1 - p }, OVL.g);
    svg("circle", { cx: x, cy: y, r: 8 * (1 - p), fill: COLORS.lime, opacity: 0.7 * (1 - p) }, OVL.g);
  }
  const press = click >= 0 && t >= click - 0.08 && t < click + 0.12 ? 0.86 : 1;
  const g = svg("g", { transform: `translate(${x} ${y}) scale(${1.25 * press})`, opacity: visible }, OVL.g);
  svg("path", { d: "M0 0 L0 22 L6 16.5 L10.5 26 L14 24.4 L9.6 15.2 L17 15 Z", fill: "#f4f6f9", stroke: "#0b111c", "stroke-width": 1.6,
    "stroke-linejoin": "round", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }, g);
}

// Interpolated cursor path between stage points: keys [[t, x, y], ...]
const path2 = (t, keys) => keyed(t, keys, ease.inOut);

// ---------------------------------------------------------------- grain ---
const GRAIN = document.getElementById("grain");
const gctx = GRAIN.getContext("2d");
const noiseTile = (() => {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const x = c.getContext("2d");
  const img = x.createImageData(512, 512);
  const r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(r() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
})();
function grain(frameNo, amount) {
  const r = rng(frameNo * 7919 + 13);
  const ox = Math.floor(r() * 512), oy = Math.floor(r() * 512);
  gctx.clearRect(0, 0, 960, 540);
  for (let y = -oy; y < 540; y += 512) for (let x = -ox; x < 960; x += 512) gctx.drawImage(noiseTile, x, y);
  GRAIN.style.opacity = amount;
}

// ------------------------------------------------------- glitch helper ----
// RGB-split offsets for a short burst: returns px offset (0 when idle).
function glitchAmt(t, at, dur = 0.35, seed = 1) {
  if (t < at || t > at + dur) return 0;
  const r = rng(Math.floor(t * FPS) * 31 + seed);
  return (r() - 0.5) * 2 * (1 - prog(t, at, at + dur));
}
function rgbSplit(node, amt) {
  if (!amt) { node.style.filter = ""; node.style.transform = node.dataset.baseTf || ""; return; }
  const px = Math.round(amt * 14);
  node.style.filter = `drop-shadow(${px}px 0 0 rgba(255,60,90,0.65)) drop-shadow(${-px}px 0 0 rgba(60,200,255,0.65))`;
  node.style.transform = `${node.dataset.baseTf || ""} translateX(${px * 0.6}px)`;
}

// Typewriter text: returns visible substring at progress p.
const typed = (text, p) => text.slice(0, Math.round(text.length * clamp(p)));
