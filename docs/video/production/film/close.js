/* Act IV: montage of the real workspace and the end card. */
"use strict";

scene({
  id: "c01", lines: ["n26"], pre: 0.4, post: 0.6, xfIn: 0.6, grain: 0.05, captions: false,
  sfx: () => [{ type: "whoosh", t: 0.1 }],
  build(root) {
    el("div", "backdrop", root).appendChild(el("div", "grid"));
    const wall = el("div", "layer", root);
    css(wall, { perspective: "2200px", perspectiveOrigin: "50% 45%" });
    this.plane = el("div", "", wall);
    css(this.plane, { position: "absolute", left: "0", top: "0", width: `${W}px`, height: `${H}px`, transformStyle: "preserve-3d" });
    const picks = [
      ["timeline1", 0], ["graph_zoom2", -1], ["agent_run1", -1],
      ["analysis2", 0], ["report_generate", -1], ["approve_disable", -1],
      ["upload_batch2", -1], ["reviews", -1], ["dashboard_end", 0],
    ];
    this.tiles = picks.map(([name, i], k) => {
      const tile = el("div", "", this.plane);
      const col = k % 3, row = Math.floor(k / 3);
      css(tile, { position: "absolute", width: "640px", height: "360px", left: `${col * 680 - 60}px`, top: `${row * 400 - 80}px`,
        borderRadius: "10px", overflow: "hidden", border: "1px solid #394558", boxShadow: "0 30px 80px rgba(0,0,0,0.6)", background: "#101827" });
      const img = el("img", "", tile);
      css(img, { width: "640px", display: "block" });
      setSrc(img, frameOf(name, i).file);
      return { tile, k, col, row };
    });
    this.text = el("div", "", root, `<div class="a" style="font:500 40px/1.2 var(--sans);color:#bac5d7">From fragmented alerts</div>
      <div class="b" style="margin-top:10px;font:700 76px/1.05 var(--sans);letter-spacing:-0.015em;color:#ecedf0">to an accountable response.</div>`);
    css(this.text, { position: "absolute", left: "0", right: "0", top: "395px", textAlign: "center", textShadow: "0 10px 60px rgba(0,0,0,0.95)" });
    this.dim = el("div", "layer", root);
    css(this.dim, { background: "radial-gradient(ellipse 60% 50% at 50% 48%, rgba(6,10,19,0.86), rgba(6,10,19,0.45))" });
    root.appendChild(this.text);
  },
  render(t, s) {
    const p = prog(t, 0, s.dur);
    this.plane.style.transform = `translateZ(${-260 - 380 * ease.inOutSine(p)}px) rotateX(${12 - 4 * p}deg) rotateY(${-10 + 6 * p}deg) translateX(${-30 * p}px)`;
    for (const { tile, k } of this.tiles) {
      const a = smooth(t, 0.05 + k * 0.07, 0.6 + k * 0.07, ease.out);
      tile.style.opacity = a;
      tile.style.transform = `translateZ(${(1 - a) * -300 + ((k * 37) % 5) * 22}px)`;
    }
    this.dim.style.opacity = smooth(t, 0.6, 1.6);
    const n = s.lineAt.n26, d = FILM.durations.n26;
    const a = this.text.querySelector(".a"), b = this.text.querySelector(".b");
    a.style.opacity = smooth(t, n, n + 0.5);
    b.style.opacity = smooth(t, n + d * 0.22, n + d * 0.22 + 0.5);
    b.style.transform = `translateY(${(1 - smooth(t, n + d * 0.22, n + d * 0.22 + 0.7, ease.out)) * 18}px)`;
    this.text.style.opacity = 1 - smooth(t, s.dur - 0.5, s.dur);
  },
});

scene({
  id: "c02", lines: [], pre: 0, post: 0, min: 5.9, xfIn: 0.7, grain: 0.05,
  build(root) {
    el("div", "backdrop", root);
    const L = FILM.logo;
    const scale = 0.25;
    const ox = 960 - (L.word.x + L.word.w / 2) * scale, oy = 300 - 789 * scale;
    this.logo = el("div", "layer", root);
    for (const part of [...L.icon, L.word, L.tag]) {
      const img = el("img", "", this.logo);
      img.src = `assets/logo/${part.src}`;
      css(img, { position: "absolute", left: `${ox + part.x * scale}px`, top: `${oy + part.y * scale}px`, width: `${part.w * scale}px` });
    }
    this.taglines = ["Evidence connected.", "Decisions explained.", "Response controlled."].map((txt, i) => {
      const n = el("span", "", null, txt);
      css(n, { display: "inline-block", margin: "0 18px", opacity: "0" });
      return n;
    });
    const row = el("div", "", root);
    css(row, { position: "absolute", left: "0", right: "0", top: "676px", textAlign: "center", font: "600 40px var(--sans)", color: "#ecedf0", letterSpacing: "-0.005em" });
    this.taglines.forEach((n) => row.appendChild(n));
    this.rule = el("div", "", root);
    css(this.rule, { position: "absolute", left: "860px", width: "200px", top: "760px", height: "2px", background: "#9ded00" });
    this.fine = el("div", "mono", root, "SYNTHETIC INCIDENT DATA &nbsp;·&nbsp; ALL RESPONSE ACTIONS SIMULATED &nbsp;·&nbsp; HUMAN APPROVAL REQUIRED");
    css(this.fine, { position: "absolute", left: "0", right: "0", top: "930px", textAlign: "center", font: "500 15px var(--mono)", letterSpacing: "0.2em", color: "#5f6f88" });
    this.credit = el("div", "mono", root, "HACKAI 2026 &nbsp;·&nbsp; TRACK 1 &nbsp;·&nbsp; AGENTIC CYBER DEFENSE");
    css(this.credit, { position: "absolute", left: "0", right: "0", top: "962px", textAlign: "center", font: "500 15px var(--mono)", letterSpacing: "0.2em", color: "#5f6f88" });
  },
  render(t) {
    this.logo.style.opacity = smooth(t, 0.1, 0.9);
    this.logo.style.transform = `scale(${1.03 - 0.03 * smooth(t, 0, 2.5, ease.out)})`;
    this.taglines.forEach((n, i) => {
      const p = smooth(t, 1.0 + i * 0.55, 1.5 + i * 0.55, ease.out);
      n.style.opacity = p;
      n.style.transform = `translateY(${(1 - p) * 16}px)`;
      n.style.color = i === 2 ? "#9ded00" : "#ecedf0";
    });
    this.rule.style.transform = `scaleX(${smooth(t, 2.6, 3.4, ease.out)})`;
    this.fine.style.opacity = this.credit.style.opacity = smooth(t, 3.2, 4.0);
  },
});
