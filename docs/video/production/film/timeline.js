/* Lays scenes end to end from the narration durations and renders a frame.
 * Exposes renderFrame(n), FILM_TOTAL and cueSheet() for the audio mix. */
"use strict";

const DUR = FILM.durations;
const CAPTION = Object.fromEntries(FILM.narration.lines.map((l) => [l.id, l.caption]));

let clock = 0;
for (const s of SCENES) {
  s.start = clock;
  let local = s.pre ?? 0.3;
  s.lineAt = {};
  (s.lines || []).forEach((id, i) => {
    s.lineAt[id] = local;
    local += DUR[id] + (i < s.lines.length - 1 ? s.gap ?? 0.4 : 0);
  });
  local += s.post ?? 0.4;
  s.dur = Math.max(local, s.min ?? 0);
  clock += s.dur;
}
const FILM_TOTAL = clock;

const SCENE_ROOT = document.getElementById("scenes");
SCENES.forEach((s, i) => {
  s.root = el("div", "scene", SCENE_ROOT);
  s.root.id = s.id;
  s.root.style.zIndex = String(i + 1);
  s.build && s.build(s.root, s);
});

const CAPTIONS = [];
for (const s of SCENES) for (const id of s.captions === false ? [] : s.lines || []) {
  CAPTIONS.push({ id, start: s.start + s.lineAt[id], end: s.start + s.lineAt[id] + DUR[id], text: CAPTION[id] });
}

// Chapters + progress rail
const CHAPTERS = [];
for (const s of SCENES) if (s.chapter) {
  const last = CHAPTERS[CHAPTERS.length - 1];
  if (last && last.num === s.chapter[0]) last.end = s.start + s.dur;
  else CHAPTERS.push({ num: s.chapter[0], label: s.chapter[1], start: s.start, end: s.start + s.dur });
}
const RAIL = document.getElementById("rail");
const railSegs = CHAPTERS.map((c, i) => {
  const seg = el("div", "seg", RAIL);
  const w = (1792 - (CHAPTERS.length - 1) * 10) / CHAPTERS.length;
  css(seg, { left: `${i * (w + 10)}px`, width: `${w}px` });
  return el("i", "", seg);
});
const CH = document.getElementById("chapter");
const chNum = CH.querySelector(".num"), chLabel = CH.querySelector(".label"), chCaret = CH.querySelector(".caret");
const CAP = document.querySelector("#caption span");
const LB_TOP = document.querySelector("#letterbox .top"), LB_BOT = document.querySelector("#letterbox .bottom");
const FADE = document.getElementById("fade");

function letterboxAt(t) {
  let v = 0;
  for (const s of SCENES) {
    if (t < s.start - (s.xfIn || 0) || t >= s.start + s.dur) continue;
    const lb = typeof s.letterbox === "function" ? s.letterbox(t - s.start, s) : s.letterbox ?? 0;
    v = lb;
  }
  return v;
}

window.renderFrame = async (n) => {
  const t = n / FPS;
  clearOverlay();
  let grainAmt = 0.04;
  SCENES.forEach((s, k) => {
    const xfIn = s.xfIn || 0;
    const active = t >= s.start - xfIn && t < s.start + s.dur;
    s.root.style.display = active ? "block" : "none";
    if (!active) return;
    const lt = t - s.start;
    const fadeIn = xfIn ? smooth(lt, -xfIn, 0) : 1;
    s.root.style.opacity = fadeIn;
    const next = SCENES[k + 1];
    const fadeOut = next && next.xfIn ? 1 - smooth(t - next.start, -next.xfIn, -next.xfIn * 0.35) : 1;
    const ov = overlayFor();
    s.render(lt, s);
    ov.g.setAttribute("opacity", fadeIn * fadeOut);
    ov.l.style.opacity = fadeIn * fadeOut;
    if (s.grain != null) grainAmt = s.grain;
  });
  // letterbox
  const lb = letterboxAt(t);
  LB_TOP.style.height = LB_BOT.style.height = `${138 * lb}px`;
  // captions (with a scrim over product footage)
  document.getElementById("scrim").style.opacity = (1 - lb) * Math.max(0, ...CAPTIONS.map((c) => window_(t, c.start - 0.5, c.end + 0.8, 0.35)));
  const cap = CAPTIONS.find((c) => t >= c.start - 0.1 && t < c.end + 0.35);
  if (cap) {
    CAP.textContent = cap.text;
    CAP.style.opacity = window_(t, cap.start - 0.1, cap.end + 0.35, 0.18);
  } else CAP.style.opacity = 0;
  // chapter tag + rail
  const ch = CHAPTERS.find((c) => t >= c.start && t < c.end);
  if (ch) {
    const lt = t - ch.start;
    chNum.textContent = ch.num;
    chLabel.textContent = typed(ch.label.toUpperCase(), prog(lt, 0.15, 0.75));
    chCaret.style.opacity = Math.floor(t * 2.2) % 2 ? 0.2 : 1;
    CH.style.opacity = Math.min(smooth(t, CHAPTERS[0].start, CHAPTERS[0].start + 0.4), 1 - smooth(t, CHAPTERS.at(-1).end - 0.4, CHAPTERS.at(-1).end));
  } else CH.style.opacity = 0;
  const railOn = CHAPTERS.length && t >= CHAPTERS[0].start && t < CHAPTERS.at(-1).end;
  RAIL.style.opacity = railOn ? Math.min(smooth(t, CHAPTERS[0].start, CHAPTERS[0].start + 0.5), 1 - smooth(t, CHAPTERS.at(-1).end - 0.5, CHAPTERS.at(-1).end)) : 0;
  CHAPTERS.forEach((c, i) => { railSegs[i].style.width = `${100 * prog(t, c.start, c.end)}%`; });
  // global fade in/out
  FADE.style.opacity = Math.max(1 - smooth(t, 0, 0.8), smooth(t, FILM_TOTAL - 1.2, FILM_TOTAL - 0.05));
  grain(n, grainAmt);
  await document.fonts.ready;
  while (pendingDecodes.size) await Promise.all([...pendingDecodes]);
  return t;
};

// Narration + sound-design cues for the audio mix.
window.cueSheet = () => ({
  total: FILM_TOTAL,
  narration: SCENES.flatMap((s) => (s.lines || []).map((id) => ({ id, start: +(s.start + s.lineAt[id]).toFixed(3) }))),
  scenes: SCENES.map((s) => ({ id: s.id, start: +s.start.toFixed(3), dur: +s.dur.toFixed(3), lineAt: s.lineAt })),
  chapters: CHAPTERS.map((c) => ({ num: c.num, start: +c.start.toFixed(3) })),
  sfx: SCENES.flatMap((s) => [...(s.sfx ? s.sfx(s) : []), ...(s.chapter ? [{ type: "whoosh", t: -0.05 }] : [])]
    .map((e) => ({ ...e, t: +(s.start + e.t).toFixed(3) }))),
});
window.FILM_TOTAL = FILM_TOTAL;
