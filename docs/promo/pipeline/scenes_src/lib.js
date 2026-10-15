const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
const easeOut = (k) => { k = clamp(k); return 1 - Math.pow(1 - k, 3); };
const easeIn = (k) => { k = clamp(k); return k * k * k; };
const prog = (t, a, b) => clamp((t - a) / (b - a));
const fadeIO = (t, a, b, f = 0.3) => Math.min(ease((t - a) / f), ease((b - t) / f));
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const $ = (s) => document.querySelector(s);
function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || document.getElementById('stage')).appendChild(e); return e; }
function setStyle(e, o) { for (const k in o) e.style[k] = o[k]; }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Typewriter: returns visible prefix of text at time t (chars per second)
const typed = (text, t, start, cps) => text.slice(0, Math.max(0, Math.floor((t - start) * cps)));
// Terminal: lines = [{t, text(html allowed if html:true), type:'cmd'|'out', cps}]
function renderTerm(pre, lines, t) {
  let out = '';
  for (const ln of lines) {
    if (t < ln.t) break;
    if (ln.type === 'cmd') {
      const vis = typed(ln.text, t, ln.t, ln.cps || 90);
      const done = vis.length >= ln.text.length;
      out += '<span class="c-acc">$ </span><span class="c-txt">' + esc(vis) + '</span>' + (!done && Math.floor(t * 3) % 2 === 0 ? '<span class="c-acc">▍</span>' : '') + '\n';
      if (!done) return pre.innerHTML = out;
    } else if (ln.type === 'comment') {
      out += '<span class="c-mut">' + esc(ln.text) + '</span>\n';
    } else {
      out += (ln.html ? ln.text : esc(ln.text)) + '\n';
    }
  }
  pre.innerHTML = out;
}
