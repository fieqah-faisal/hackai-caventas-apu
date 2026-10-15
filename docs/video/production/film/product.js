/* Act III: the real Caventas workspace (API mode) captured by capture.mjs.
 * Every screen is a captured frame; overlays only point at what is there. */
"use strict";

const noteIdx = (name, note, from = 0) => {
  const i = shot(name).frames.findIndex((f, k) => k >= from && f.note === note);
  return i < 0 ? 0 : i;
};
// Map u in [0,1] onto the captured timeline of a sequence.
function seqIdx(name, u, from = 0, to = -1) {
  const fr = shot(name).frames;
  const a = from, b = to < 0 ? fr.length + to : to;
  const c = lerp(fr[a].t, fr[b].t, clamp(u));
  let i = a;
  while (i + 1 <= b && fr[i + 1].t <= c) i++;
  return i;
}
// Smallest element of `tag` that contains rect r (e.g. the card around a label).
function container(frame, r, tag = "li") {
  if (!r) return null;
  const hits = (frame.index || []).filter((e) => e.s === tag && e.b[0] <= r.x && e.b[1] <= r.y && e.b[0] + e.b[2] >= r.x + r.w && e.b[1] + e.b[3] >= r.y + r.h);
  hits.sort((a, b) => a.b[2] * a.b[3] - b.b[2] * b.b[3]);
  const h = hits[0];
  return h ? { x: h.b[0], y: h.b[1], w: h.b[2], h: h.b[3] } : null;
}
const reg = (name, i, key) => frameOf(name, i).regions?.[key] || null;
const center = (r) => r && [r.x + r.w / 2, r.y + r.h / 2];
const at = (s, id, frac = 0) => s.lineAt[id] + FILM.durations[id] * frac;

const CHROME_1 = ["approve_isolate", 0];
const CHROME_2 = ["approve_disable", 0];

function productScene(def) {
  const { setup } = def;
  return scene({
    grain: 0.03, xfIn: 0.35, gap: 0.35,
    ...def,
    build(root, s) {
      el("div", "backdrop", root).appendChild(el("div", "grid"));
      this.scr = new Screen(root);
      setup && setup.call(this, root, s);
    },
  });
}

// Small entrance for each product scene: slight scale-up + settle.
const enter = (t) => ({ z: 1 - 0.035 * (1 - smooth(t, -0.35, 0.5, ease.out)) });
// A small punch-in on a hard cut inside a scene.
const punch = (lt) => 1 + 0.035 * (1 - smooth(lt, 0, 0.45, ease.out));

// ------------------------------------------------------ 01 Create case ----
productScene({
  id: "p01", chapter: ["01", "Create the case"], lines: ["n08"], pre: 1.1, post: 0.5, min: 7.5,
  render(t, s) {
    const S = this.scr;
    const typingEnd = 3.9, clickAt = 4.3, toHeader = 5.2;
    if (t < toHeader) {
      const last = shot("create_case").frames.length - 1;
      const filled = noteIdx("create_case", "filled");
      let i = t < 0.6 ? 0 : t < typingEnd ? seqIdx("create_case", prog(t, 0.6, typingEnd), 0, filled) : t < clickAt + 0.15 ? filled : last;
      S.show("create_case", i);
      const [cx, cy, z] = keyed(t, [[0, 768, 432, 1], [0.6, 768, 432, 1], [1.5, 1180, 300, 1.85], [4.5, 1210, 300, 1.85], [5.2, 1100, 330, 1.5]]);
      S.camera({ cx, cy, z: z * enter(t).z });
      const btn = reg("create_case", filled, "create");
      const title = reg("create_case", 0, "title");
      if (btn && title) {
        const p0 = S.project(...center(title)), p1 = S.project(...center(btn));
        const pos = path2(t, [[0, ...p0], [3.6, p0[0] + 120, p0[1] + 60], [clickAt - 0.05, ...p1], [10, ...p1]]);
        cursor(pos, { click: clickAt, t, visible: smooth(t, 0.6, 1.0) * (1 - smooth(t, 4.8, 5.1)) });
      }
      callout(S, title, smooth(t, 1.5, 2.1) * (1 - smooth(t, 3.8, 4.1)), "Incident title", { side: "left" });
    } else {
      S.show("overview1", 0, { chrome: CHROME_1 });
      const id = findIn("overview1", 0, /^Case ID: CASE-/, { tag: "span" });
      const lt = t - toHeader;
      const [cx, cy, z] = keyed(lt, [[0, 600, 200, 1.6], [2.5, 470, 205, 2.1]]);
      S.camera({ cx, cy, z: z * punch(lt) });
      callout(S, id, smooth(lt, 0.4, 1.1), "Permanent case ID", { side: "bottom" });
    }
  },
  sfx: (s) => [{ type: "typing", t: 0.7, dur: 3.1 }, { type: "click", t: 4.3 }, { type: "whoosh", t: 5.15 }],
});

// ---------------------------------------------------- 02 Ingest evidence --
productScene({
  id: "p02", chapter: ["02", "Ingest evidence"], lines: ["n09"], pre: 0.3, post: 0.4, min: 7.2,
  render(t, s) {
    const S = this.scr;
    const clickAt = 0.7, split = 3.9;
    if (t < split) {
      const created = shot("create_case").frames.length - 1;
      if (t < clickAt + 0.3) S.show("create_case", created);
      else if (t < 1.6) S.show("upload_batch1", seqIdx("upload_batch1", prog(t, clickAt + 0.3, 1.6)));
      else S.show("upload_done");
      const [cx, cy, z] = keyed(t, [[0, 1250, 300, 1.6], [1.4, 1300, 330, 1.95], [split, 1300, 340, 2.0]]);
      S.camera({ cx, cy, z: z * enter(t).z });
      const add = reg("create_case", created, "addFiles");
      if (add) cursor(S.project(add.x + 30, add.y + 14), { click: clickAt, t, visible: smooth(t, 0.1, 0.3) * (1 - smooth(t, 1.4, 1.7)) });
      const files = union(...["analyst-triage-note.json", "identity-signin-logs.json"].map((n) => findIn("upload_done", 0, n, { tag: "li" })));
      callout(S, files, smooth(t, 1.8, 2.4), "5 sources · 20 records", { side: "left" });
    } else {
      const lt = t - split;
      const up = findIn("evidence1", 0, "Upload more evidence", { tag: "button" });
      const top = (up?.y ?? 450) - 200;
      S.show("evidence1", 0, { scroll: lerp(top, top + 380, ease.inOutSine(prog(lt, 1.8, 4.3))), chrome: CHROME_1 });
      S.camera({ cx: 820, cy: S.scrollY + 432, z: 1.12 * punch(lt) });
      callout(S, up, window_(lt, 0.3, 2.0, 0.3), "Add evidence any time", { side: "right" });
    }
  },
  sfx: () => [{ type: "click", t: 0.7 }, { type: "blip", t: 1.7 }, { type: "whoosh", t: 3.85 }],
});

// ----------------------------------------------------- 03 Reconstruct -----
productScene({
  id: "p03", chapter: ["03", "Reconstruct the incident"], lines: ["n10"], pre: 0.4, post: 0.5, min: 7.0,
  render(t, s) {
    const S = this.scr;
    const alertY = findIn("timeline1", 0, "Edr Alert", { tag: "span" })?.y ?? 1350;
    const scroll = lerp(330, alertY - 430, ease.inOutSine(prog(t, 1.0, 3.6)));
    S.show("timeline1", 0, { scroll, chrome: CHROME_1 });
    S.camera({ cx: 880, cy: scroll + 432, z: 1.2 * enter(t).z });
    const state = findIn("timeline1", 0, "State v5", { tag: "span" });
    callout(S, state, window_(t, 0.6, 3.0, 0.4), "Versioned incident state", { side: "bottom" });
    const alert = findIn("timeline1", 0, "Edr Alert", { tag: "span" });
    const alertRow = container(frameOf("timeline1", 0), alert, "tr") || alert;
    callout(S, alertRow, smooth(t, 3.4, 4.0), "EDR alert · 9:41 PM", { side: "top" });
  },
});

productScene({
  id: "p04", chapter: ["03", "Reconstruct the incident"], lines: ["n11"], pre: 0.35, post: 0.8, min: 8.0, xfIn: 0.4,
  render(t, s) {
    const S = this.scr;
    const zoomed = noteIdx("graph_zoom1", "zoomed"), selected = noteIdx("graph_zoom1", "selected");
    const i = t < 0.8 ? 0 : t < 3.2 ? seqIdx("graph_zoom1", prog(t, 0.8, 3.2), 0, zoomed) : t < 5.0 ? zoomed : selected;
    S.show("graph_zoom1", i);
    const canvas = reg("graph_zoom1", 0, "canvas");
    const host = reg("graph_zoom1", zoomed, "host");
    const acct = reg("graph_zoom1", zoomed, "account");
    // the app caps zoom at 1.4x; the camera continues the push-in on the 4K capture
    const focus = host ? [host.x - 40, host.y - 20] : center(canvas);
    const c0 = center(canvas);
    const [cx, cy, z] = keyed(t, [[0, c0[0], c0[1] - 30, 1.3], [0.8, c0[0], c0[1] - 30, 1.3], [3.4, focus[0], focus[1], 2.3], [s.dur, focus[0] + 20, focus[1], 2.45]]);
    S.camera({ cx, cy, z: z * enter(t).z });
    if (t >= 3.2 && t < 5.0) {
      callout(S, acct, smooth(t, 3.4, 3.9), "Account", { side: "top", color: "blue" });
      callout(S, host, smooth(t, 3.7, 4.2), "Host", { side: "bottom", color: "blue" });
    }
    if (t >= 5.0) {
      cursor(S.project(...center(host)), { click: 5.0, t, visible: 1 - smooth(t, 6.0, 6.3) });
      callout(S, host, smooth(t, 5.2, 5.7), "Directed relationships", { side: "bottom" });
    }
    const legend = findIn("graph_zoom1", zoomed, /^Direction: source/, { tag: "span" });
    callout(S, legend, window_(t, 0.9, 2.9, 0.3), "Source → target", { side: "bottom" });
  },
  sfx: () => [{ type: "zoom", t: 0.8, dur: 2.4 }, { type: "click", t: 5.0 }],
});

// ---------------------------------------------------- 04 Agent analysis ---
const STEP_LABEL = {
  loading_state: "Loading incident state", loading_guidance: "Loading approved guidance", analyze: "Analysing evidence",
  route: "Checking evidence sufficiency", retrieve_guidance: "Retrieving approved guidance", propose: "Proposing response actions",
  validate_proposal: "Validating the proposal", persist_plan: "Storing the plan", completed: "Plan stored",
};
function traceRows(run) {
  const rows = [];
  for (const st of run.steps) {
    if (rows.length && rows.at(-1).step === st.step) continue;
    const summary = st.decision_summary || st.validation_summary || st.message || "";
    rows.push({ step: st.step, name: STEP_LABEL[st.step] || st.step, summary });
  }
  return rows;
}

function tracePanel(root, run) {
  const panel = el("div", "panel", root);
  css(panel, { left: "1060px", top: "120px", width: "760px" });
  el("h4", "", panel, `Decision trace · ${esc(run.run_id)} · State v${run.based_on_state_version}`);
  const rows = traceRows(run).map((r) => {
    const row = el("div", "trace-row", panel, `<div class="tick"></div><div><div class="name">${esc(r.name)}</div><div class="sum">${esc(r.summary.slice(0, 92))}</div></div>`);
    return row;
  });
  return { panel, rows };
}

productScene({
  id: "p05", chapter: ["04", "Agent analysis"], lines: ["n12", "n13"], pre: 0.3, post: 0.45,
  setup(root) {
    this.trace = tracePanel(root, FILM.capture.runs[0]);
  },
  render(t, s) {
    const S = this.scr;
    const n12 = s.lineAt.n12, runEnd = n12 + FILM.durations.n12;
    const dialog = reg("agent_run1", 0, "dialog");
    S.show("agent_run1", t < runEnd ? seqIdx("agent_run1", prog(t, 0.2, runEnd)) : shot("agent_run1").frames.length - 1);
    const c = center(dialog);
    const shift = smooth(t, 0.4, 1.4, ease.inOut);
    S.camera({ cx: c[0], cy: c[1] + 10, z: lerp(1.0, 1.42, shift) * enter(t).z, x: lerp(0, -470, shift) });
    const { panel, rows } = this.trace;
    panel.style.opacity = smooth(t, 1.0, 1.6);
    panel.style.transform = `translateX(${(1 - smooth(t, 1.0, 1.8, ease.out)) * 60}px)`;
    rows.forEach((row, k) => {
      const at_ = lerp(1.6, runEnd - 0.3, k / (rows.length - 1));
      const p = smooth(t, at_, at_ + 0.35);
      row.style.opacity = 0.25 + 0.75 * p;
      row.classList.toggle("done", p > 0.5);
    });
    const n13 = s.lineAt.n13;
    const r = panel.getBoundingClientRect();
    highlight({ x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 }, smooth(t, n13, n13 + 0.7), { radius: 16, fill: false });
    if (t > n13) tag("Stored with the run · no hidden reasoning", [r.left + r.width / 2, r.top + r.height + 8], smooth(t, n13 + 0.3, n13 + 0.9), { side: "bottom" });
  },
  sfx: (s) => [{ type: "agent", t: 0.3, dur: s.lineAt.n12 + FILM.durations.n12 }],
});

// ------------------------------------------------- 05 Evidence-backed plan -
productScene({
  id: "p06", chapter: ["05", "Evidence-backed plan"], lines: ["n14", "n15"], pre: 0.25, post: 0.4,
  render(t, s) {
    const S = this.scr;
    const n15 = s.lineAt.n15 - 0.2;
    if (t < n15) {
      const cls = findIn("analysis1", 0, "Current classification", { tag: "h2" });
      const findings = findIn("analysis1", 0, "Findings", { tag: "h2" });
      const missBtn = findIn("analysis1", 0, /^Missing evidence \(\d+\)$/, { tag: "button" });
      const missLast = findIn("analysis1", 0, /^Proxy and DNS logs/, { tag: "li" });
      const missing = missBtn && union(missBtn, missLast || missBtn);
      const keys = [[0, 450], [1.8, 450], [3.4, (findings?.y ?? 1200) - 120], [5.2, (missing?.y ?? 1800) - 420], [n15, (missing?.y ?? 1800) - 380]];
      const [scroll] = keyed(t, keys);
      S.show("analysis1", 0, { scroll, chrome: CHROME_1 });
      S.camera({ cx: 880, cy: scroll + 432, z: 1.1 * enter(t).z });
      const type = textBox(findIn("analysis1", 0, "Infostealer Session Hijack", { tag: "p" }), "Infostealer Session Hijack");
      const sev = textBox(findIn("analysis1", 0, "Severity: High", { tag: "p" }), "Severity: High");
      callout(S, type, window_(t, 0.4, 3.3, 0.3), "Classification", { side: "right" });
      callout(S, sev, window_(t, 0.9, 3.3, 0.3), "Severity", { side: "right", color: "amber" });
      const ev = findIn("analysis1", 0, /^SUPPORTING EVIDENCE$/i, { tag: "th" });
      callout(S, ev, window_(t, 3.2, 5.0, 0.3), "Evidence-linked findings", { side: "top" });
      callout(S, missing, smooth(t, 5.0, 5.6), "Missing evidence", { side: "top", color: "amber" });
    } else {
      const lt = t - n15;
      const shotName = "approvals1";
      const fr = frameOf(shotName, 0);
      const tool = findIn(shotName, 0, "isolate_host", { tag: "span" });
      const card = tool && { x: 268, y: tool.y - 14, w: 1240, h: 230 };
      const scroll = (card?.y ?? 650) - 220;
      S.show(shotName, 0, { scroll, chrome: CHROME_1 });
      const c = card ? [card.x + card.w * 0.42, card.y + card.h / 2] : [800, scroll + 400];
      S.camera({ cx: c[0], cy: c[1], z: lerp(1.2, 1.45, smooth(lt, 0, 3.5)) * punch(lt) });
      if (tool) {
        const chips = (fr.index || []).filter((e) => /^EV-[0-9a-f]+$/.test(e.t) && e.b[1] > tool.y + 30 && e.b[1] < tool.y + 140);
        const rowY = chips.length ? Math.min(...chips.map((e) => e.b[1])) : null;
        const row = chips.filter((e) => e.b[1] === rowY).map((e) => ({ x: e.b[0], y: e.b[1], w: e.b[2], h: e.b[3] }));
        const evRow = row.length ? union(...row) : null;
        const pol = (fr.index || []).map((e) => e.t === "POL-04" && e.b[1] > tool.y && e.b[1] < tool.y + 120 ? { x: e.b[0], y: e.b[1], w: e.b[2], h: e.b[3] } : null).find(Boolean);
        callout(S, evRow, smooth(lt, 0.5, 1.1), "Cited evidence records", { side: "bottom", align: "start" });
        callout(S, pol, smooth(lt, 1.2, 1.8), "Policy", { side: "top" });
      }
    }
  },
});

// ------------------------------------------------------ 06 Human approval --
productScene({
  id: "p07", chapter: ["06", "Human approval"], lines: ["n16", "n17"], pre: 0.3, post: 0.35, gap: 0.45,
  render(t, s) {
    const S = this.scr;
    const n17 = s.lineAt.n17 - 0.35;
    if (t < n17) {
      const approveAt = 1.0, simAt = 2.6, toast = 2.85, hist = 4.0;
      const i = t < approveAt + 0.15 ? 0 : t < simAt + 0.2 ? 1 : t < hist ? 2 : 3;
      S.show("approve_isolate", i);
      const cardR = reg("approve_isolate", 0, "card");
      const c = center(cardR);
      if (t < hist) {
        const [cx, cy, z] = keyed(t, [[0, c[0], c[1] + 20, 1.5], [toast, c[0], c[1] + 20, 1.5], [toast + 0.6, 1100, 260, 1.55]]);
        S.camera({ cx, cy, z: z * enter(t).z });
      } else {
        const row = findIn("approve_isolate", 3, /^isolate_host on HOST::SALES-LT-07 Execution/, { tag: "li" });
        const rc = row ? center(row) : [880, 790];
        S.camera({ cx: rc[0] - 120, cy: rc[1] - 40, z: 1.55 * punch(t - hist) });
        callout(S, row, smooth(t, hist + 0.3, hist + 0.9), "Simulated · completed · effective", { side: "top" });
      }
      const ap = reg("approve_isolate", 0, "approve"), sim = reg("approve_isolate", 1, "simulate");
      const p0 = S.project(ap.x + ap.w / 2, ap.y + ap.h / 2);
      const p1 = sim ? S.project(sim.x + 40, sim.y + sim.h / 2) : p0;
      if (t < toast) cursor(path2(t, [[0.2, p0[0] - 160, p0[1] + 120], [approveAt - 0.05, ...p0], [simAt - 0.4, ...p1], [9, ...p1]]),
        { click: t < simAt - 0.3 ? approveAt : simAt, t, visible: smooth(t, 0.2, 0.5) * (1 - smooth(t, toast - 0.2, toast)) });
      const toastR = { x: 1200, y: 90, w: 320, h: 66 }; // second toast (index taken after it rendered off-list)
      if (t >= toast && t < hist) callout(S, toastR, smooth(t, toast + 0.5, toast + 1.0), "Bounded simulator", { side: "bottom" });
    } else {
      const lt = t - n17;
      const fr = shot("reject_block").frames;
      const reasonI = noteIdx("reject_block", "reason"), typedI = noteIdx("reject_block", "typed"), rejectingI = noteIdx("reject_block", "rejecting");
      const i = lt < 0.5 ? 0 : lt < 0.9 ? reasonI : lt < 2.3 ? seqIdx("reject_block", prog(lt, 0.9, 2.3), reasonI, typedI) : lt < 2.75 ? typedI : rejectingI;
      S.show("reject_block", i);
      const cardR = reg("reject_block", 0, "card");
      const c = center(cardR);
      S.camera({ cx: c[0], cy: c[1] + 50, z: 1.45 * punch(lt) });
      const rj = reg("reject_block", 0, "reject"), rj2 = reg("reject_block", typedI, "reject");
      const reason = reg("reject_block", reasonI, "reason");
      const a = S.project(...center(rj)), b = rj2 ? S.project(...center(rj2)) : a;
      cursor(path2(lt, [[0, a[0] - 120, a[1] - 60], [0.35, ...a], [2.3, ...a], [2.6, ...b], [9, ...b]]),
        { click: lt < 1.5 ? 0.4 : 2.65, t: lt, visible: 1 - smooth(lt, 3.1, 3.4) });
      if (lt < 2.7) callout(S, reason, smooth(lt, 1.0, 1.5), "Reason recorded", { side: "top", color: "amber" });
    }
  },
  sfx: (s) => [{ type: "click", t: 1.0 }, { type: "click", t: 2.6 }, { type: "confirm", t: 3.0 },
    { type: "click", t: s.lineAt.n17 + 0.05 }, { type: "typing", t: s.lineAt.n17 + 0.55, dur: 1.4 }, { type: "click", t: s.lineAt.n17 + 2.3 }],
});

productScene({
  id: "p08", chapter: ["06", "Human approval"], lines: ["n18"], pre: 0.3, post: 0.5, xfIn: 0.4,
  render(t, s) {
    const S = this.scr;
    const head = findIn("approvals_history", 0, "Execution history");
    const row = findIn("approvals_history", 0, /partially_completed/, {}) || head;
    const scroll = (row?.y ?? 1800) - 380;
    S.show("approvals_history", 0, { scroll: scroll - 60 * (1 - smooth(t, 0, 2.5)), chrome: CHROME_1 });
    S.camera({ cx: 820, cy: (row?.y ?? scroll + 400) + 30, z: lerp(1.25, 1.5, smooth(t, 0, 3)) * enter(t).z });
    const fail = findIn("approvals_history", 0, /FAILED in crm/);
    const box = row && fail ? union(row, fail) : row;
    callout(S, box, smooth(t, s.lineAt.n18 + 0.6, s.lineAt.n18 + 1.3), "Executed ≠ effective", { side: "top", color: "red" });
  },
});

// ---------------------------------------------- 07 Continuous replanning --
productScene({
  id: "p09", chapter: ["07", "Continuous replanning"], lines: ["n19", "n20"], pre: 0.3, post: 0.35,
  render(t, s) {
    const S = this.scr;
    const n20 = s.lineAt.n20 - 0.25;
    if (t < n20) {
      const n = shot("upload_batch2").frames.length;
      S.show(t < 1.4 ? "upload_batch2" : "stale_warning", t < 1.4 ? seqIdx("upload_batch2", prog(t, 0.2, 1.4), 1) : 0);
      const alert = findIn("stale_warning", 0, /must be reviewed/, { tag: "div" }) || reg("stale_warning", 0, "stale");
      const ingest = textBox(findIn("stale_warning", 0, /^Evidence ingested/), "Evidence ingested — State v10 created", 9.2);
      const c = alert ? center(alert) : [880, 420];
      S.camera({ cx: c[0], cy: c[1] + 40, z: lerp(1.15, 1.45, smooth(t, 1.2, 3.6)) * enter(t).z });
      callout(S, ingest, smooth(t, 1.6, 2.2), "New state version", { side: "top" });
      const rows = findIn("stale_warning", 0, /crm_export/) || null;
      callout(S, rows, smooth(t, 2.6, 3.2), "1,200 records exported", { side: "bottom", color: "red" });
      if (t > 4.2) callout(S, alert, smooth(t, 4.2, 4.8), "Plan is stale", { side: "bottom", color: "amber" });
    } else {
      const lt = t - n20;
      S.show("plan_stale", 0, { chrome: CHROME_2 });
      const badge = findIn("plan_stale", 0, /needs review$/, { tag: "span" });
      const state = findIn("plan_stale", 0, /^State v\d+$/, { tag: "span" });
      const bound = findIn("plan_stale", 0, /based on state v\d+/);
      S.camera({ cx: 620, cy: 380, z: lerp(1.45, 1.6, smooth(lt, 0, 4)) * punch(lt) });
      callout(S, state, smooth(lt, 0.3, 0.8), "Current state", { side: "top" });
      callout(S, bound, smooth(lt, 0.9, 1.4), "Plan bound to an older state", { side: "bottom", color: "amber" });
      callout(S, badge, smooth(lt, 1.5, 2.0), "Flagged", { side: "right", color: "amber" });
    }
  },
  sfx: (s) => [{ type: "click", t: 0.2 }, { type: "alarm", t: 4.2 }],
});

productScene({
  id: "p10", chapter: ["07", "Continuous replanning"], lines: ["n21"], pre: 0.3, post: 0.4,
  render(t, s) {
    const S = this.scr;
    const runEnd = 2.4, planAt = 4.6;
    if (t < runEnd) {
      S.show("agent_run2", seqIdx("agent_run2", prog(t, 0, runEnd)));
      const c = center(reg("agent_run2", 0, "dialog"));
      S.camera({ cx: c[0], cy: c[1], z: 1.45 * enter(t).z });
    } else if (t < planAt) {
      const lt = t - runEnd;
      const cls = findIn("analysis2", 0, "Current classification", { tag: "h2" });
      S.show("analysis2", 0, { scroll: (cls?.y ?? 550) - 260, chrome: CHROME_2 });
      S.camera({ cx: 760, cy: (cls?.y ?? 550) + 60, z: 1.55 * punch(lt) });
      const sev = textBox(findIn("analysis2", 0, /^Severity: Critical/i, { tag: "p" }), "Severity: Critical");
      callout(S, sev, smooth(lt, 0.3, 0.8), "Critical", { side: "right", color: "red" });
    } else {
      const lt = t - planAt;
      S.show("plan2", 0, { chrome: CHROME_2 });
      const a = findIn("plan2", 0, "revoke_sessions", { tag: "span" });
      const b = findIn("plan2", 0, "disable_account", { tag: "span" });
      S.camera({ cx: 700, cy: 600, z: lerp(1.45, 1.55, smooth(lt, 0, 3)) * punch(lt) });
      callout(S, a, smooth(lt, 0.2, 0.7), "Revoke CRM session", { side: "left" });
      callout(S, b, smooth(lt, 0.8, 1.3), "Disable account", { side: "left" });
    }
  },
  sfx: () => [{ type: "agent", t: 0, dur: 2.4 }, { type: "whoosh", t: 2.35 }, { type: "whoosh", t: 4.55 }],
});

productScene({
  id: "p11", chapter: ["07", "Continuous replanning"], lines: ["n22"], pre: 0.3, post: 0.5, min: 9.2,
  render(t, s) {
    const S = this.scr;
    const N = "approve_disable";
    const tClick1 = 0.9, tDenied = 1.2, tRole = 3.3, tClick2 = 4.5, tSim = 5.7;
    const idx = t < tDenied ? noteIdx(N, "before") : t < tRole ? noteIdx(N, "denied") : t < tClick2 ? noteIdx(N, "it_manager")
      : t < tSim + 0.2 ? noteIdx(N, "approved") : noteIdx(N, "simulated");
    S.show(N, idx);
    const card = reg(N, 0, "card");
    const c = center(card);
    const [ccx, ccy, cz] = t < tDenied + 0.2 || t > tRole - 0.4 && t < tSim + 0.3 ? [c[0] + 80, c[1] + 10, 1.42] : [1180, 260, 1.5];
    S.camera({ cx: ccx, cy: ccy, z: cz * enter(t).z });
    const ap = reg(N, 0, "approve"), role = reg(N, 0, "role"), sim = reg(N, noteIdx(N, "approved"), "simulate");
    const pA = S.project(...center(ap)), pR = S.project(...center(role)), pS = sim ? S.project(sim.x + 40, sim.y + sim.h / 2) : pA;
    cursor(path2(t, [[0.2, pA[0] + 140, pA[1] + 90], [tClick1 - 0.05, ...pA], [tRole - 0.6, ...pA], [tRole - 0.05, ...pR], [tClick2 - 0.6, ...pR], [tClick2 - 0.05, ...pA], [tSim - 0.5, ...pA], [tSim - 0.05, ...pS], [20, ...pS]]),
      { click: t < tRole - 0.3 ? tClick1 : t < tClick2 - 0.3 ? tRole : t < tSim - 0.3 ? tClick2 : tSim, t, visible: smooth(t, 0.2, 0.5) * (1 - smooth(t, 6.6, 6.9)) });
    if (t >= tDenied && t < tRole - 0.4) {
      const alertR = findIn(N, noteIdx(N, "denied"), /^Decision not recorded/, { tag: "div" }) || reg(N, noteIdx(N, "denied"), "alert");
      callout(S, alertR, window_(t, tDenied + 0.1, tRole - 0.4, 0.3), "Refused by backend policy", { side: "bottom", color: "red" });
    }
    callout(S, role, window_(t, tRole - 0.1, tClick2 + 0.4, 0.3), "IT manager", { side: "top" });
    if (t > tSim + 0.3) {
      const toastR = findIn(N, noteIdx(N, "simulated"), /^Bounded simulation complete/, { tag: "div" });
      callout(S, toastR, smooth(t, tSim + 0.4, tSim + 0.9), "Simulated · effective", { side: "bottom" });
    }
  },
  sfx: () => [{ type: "click", t: 0.9 }, { type: "deny", t: 1.2 }, { type: "click", t: 3.3 }, { type: "click", t: 4.5 }, { type: "click", t: 5.7 }, { type: "confirm", t: 6.0 }],
});

// ------------------------------------------------- 08 Collaboration -------
productScene({
  id: "p12", chapter: ["08", "Analyst collaboration"], lines: ["n23"], pre: 0.3, post: 0.45, min: 7.4,
  render(t, s) {
    const S = this.scr;
    const split = 4.4;
    if (t < split) {
      const n = shot("reviews").frames.length;
      const ri = seqIdx("reviews", prog(t, 0.1, split - 0.2));
      S.show("reviews", ri);
      const panel = reg("reviews", ri, "comment") || reg("reviews", 1, "comment");
      const c = panel ? center(panel) : [890, 520];
      S.camera({ cx: c[0], cy: c[1] - 60, z: 1.3 * enter(t).z });
      callout(S, reg("reviews", ri, "type"), window_(t, 0.6, split - 0.3, 0.3), "Confirm · dispute · request evidence · sign off", { side: "top" });
    } else {
      const lt = t - split;
      const hist = findIn("reviews_full", 0, "Review history", { tag: "h3" });
      const hy = hist?.y ?? 380;
      S.show("reviews_full", 0, { scroll: hy - 250, chrome: CHROME_2 });
      S.camera({ cx: 880, cy: hy + 180, z: 1.3 * punch(lt) });
      const badges = union(...["Confirmed", "Signed off"].map((b) => findIn("reviews_full", 0, b, { tag: "span" })).filter(Boolean));
      callout(S, badges.w ? badges : null, smooth(lt, 0.3, 0.9), "Analyst status", { side: "bottom" });
      const list = hist && { x: hist.x, y: hist.y + 30, w: hist.w, h: 380 };
      callout(S, list, smooth(lt, 0.9, 1.5), "Analyst entries · separate from agent output", { side: "top", align: "start", fill: false });
    }
  },
  sfx: () => [{ type: "typing", t: 0.5, dur: 3.5 }, { type: "whoosh", t: 4.35 }],
});

// ---------------------------------------------------- 09 Report ----------
const REPORT_SECTIONS = [
  ["Executive summary", "Executive summary", "h3"],
  ["Key findings", "Findings", "h3"],
  ["Structured timeline", "Timeline", "h3"],
  ["Entities and indicators", "Affected entities", "h3"],
  ["Actions and outcomes", "Response actions", "h3"],
  ["Agent Decision Trace", "Agent decision trace", "span"],
  ["Analyst reviews and sign-off", "Analyst activity", "h3"],
];
productScene({
  id: "p13", chapter: ["09", "Structured report"], lines: ["n24", "n25"], pre: 0.3, post: 0.7,
  setup(root) {
    this.pdfLayer = el("div", "layer", root);
    css(this.pdfLayer, { perspective: "2000px" });
    this.pages = (FILM.capture.pdfPages || []).slice(0, 7).map((src, k) => {
      const img = el("img", "", this.pdfLayer);
      img.src = src;
      css(img, { position: "absolute", left: "680px", top: "-40px", width: "560px", borderRadius: "4px", boxShadow: "0 30px 90px rgba(0,0,0,0.6)", transformOrigin: "50% 100%" });
      return img;
    });
    this.pdfTag = el("div", "chip lime", root, "PDF EXPORT");
    css(this.pdfTag, { position: "absolute", left: "960px", top: "830px", transform: "translateX(-50%)", fontSize: "18px" });
  },
  render(t, s) {
    const S = this.scr;
    const genClick = 0.8, scrollStart = 2.0, pdfAt = s.lineAt.n25 - 0.6;
    const R = "report_full";
    const fr = frameOf(R, 0);
    const secs = REPORT_SECTIONS.map(([text, label, tg]) => ({ label, r: find(fr, text, { tag: tg }) })).filter((x) => x.r);
    const showPdf = t >= pdfAt;
    if (t < scrollStart) {
      S.show("report_generate", t < genClick + 0.4 ? 0 : 1);
      const g = reg("report_generate", 0, "generate");
      const c = g ? center(g) : [890, 500];
      S.camera({ cx: c[0], cy: c[1] + 60, z: 1.4 * enter(t).z });
      if (g) cursor(S.project(...c), { click: genClick, t, visible: smooth(t, 0.1, 0.3) * (1 - smooth(t, 1.4, 1.7)) });
    } else if (!showPdf || t < pdfAt + 0.6) {
      const lt = t - scrollStart;
      const span = pdfAt - scrollStart - 0.2;
      // hold on each section, glide between them
      const per = span / secs.length;
      const keys = [];
      secs.forEach((sec, k) => { keys.push([k * per, sec.r.y - 140]); keys.push([k * per + per * 0.55, sec.r.y - 140]); });
      const [scroll] = keyed(lt, keys);
      S.show(R, 0, { scroll, chrome: CHROME_2 });
      S.camera({ cx: 880, cy: scroll + 432, z: 1.22 * punch(lt) });
      secs.forEach((sec, k) => {
        const vis = window_(lt, k * per - 0.15, (k + 1) * per - 0.1, 0.25);
        if (vis > 0.01) callout(S, { x: sec.r.x - 6, y: sec.r.y - 6, w: 1218, h: sec.r.h + 12 }, vis, sec.label, { side: "top", align: "start", fill: false, glow: false });
      });
    }
    if (showPdf) {
      const lt = t - pdfAt;
      this.scr.wrap.style.opacity = 1 - smooth(lt, 0.2, 0.7);
      this.pages.forEach((img, k) => {
        const p = smooth(lt, 0.3 + k * 0.12, 1.1 + k * 0.12, ease.out);
        const spread = k - (this.pages.length - 1) / 2;
        img.style.opacity = p;
        img.style.transform = `translateX(${spread * 230 * p}px) translateY(${(1 - p) * 300 + Math.abs(spread) * 26}px) rotateY(${-spread * 9 * p}deg) rotateZ(${spread * 3.2 * p}deg) scale(0.74)`;
      });
      this.pdfTag.style.opacity = smooth(lt, 0.9, 1.3);
    } else {
      this.pages.forEach((img) => (img.style.opacity = 0));
      this.pdfTag.style.opacity = 0;
      this.scr.wrap.style.opacity = 1;
    }
  },
  sfx: (s) => [{ type: "click", t: 0.8 }, { type: "scroll", t: 2.0, dur: s.lineAt.n25 - 2.6 }, { type: "whoosh", t: s.lineAt.n25 - 0.4 }],
});
