// Drives the real Caventas UI (API mode) against the real backend and records
// it with a CDP screencast. A cursor overlay is injected into the recording
// browser only (no app code changes). API calls the UI has no button for
// (later evidence uploads, re-plans) are made here and logged for the
// terminal scenes.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SP = path.resolve(__dirname, '..');
const DEMO = path.join(SP, 'demo');
const OUT = path.join(__dirname, process.env.TAKE || 'take2');
const APP = 'http://localhost:5173';
const API = 'http://127.0.0.1:8000';
const BACKEND = '/home/user/hackai-caventas-apu/backend';
const PY = '/home/user/hackai-caventas-apu/.venv/bin/python';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
const frameLog = fs.createWriteStream(path.join(OUT, 'frames.jsonl'));
const markers = [];
const apiLog = [];
let frameNo = 0;
let lastTs = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => lastTs || Date.now() / 1000;
function mark(name) { markers.push({ name, t: Date.now() / 1000 }); console.log('MARK', name); }

async function api(method, p, body, label) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['content-type'] = 'application/json'; }
  const r = await fetch(API + p, opts);
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  apiLog.push({ label, method, path: p, status: r.status, request: body instanceof FormData ? '[multipart file]' : body, response: json, t: Date.now() / 1000 });
  console.log('API', label, r.status);
  return json;
}

const CURSOR_JS = `
(() => {
  if (window.__cur) return;
  const add = () => {
    const c = document.createElement('div');
    c.id = '__cur';
    c.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 24 L9 18.5 L13 27.5 L17 25.8 L13 17 L21 17 Z" fill="#ffffff" stroke="#0b1220" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed', left:'0px', top:'0px', zIndex: 2147483647, pointerEvents:'none', transform:'translate(720px, 600px)', filter:'drop-shadow(0 2px 3px rgba(0,0,0,.5))'});
    document.documentElement.appendChild(c);
    window.__cur = {x:720, y:600};
    window.__moveCursor = (x, y, ms) => new Promise(res => {
      const sx = window.__cur.x, sy = window.__cur.y, t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 4*k*k*k : 1 - Math.pow(-2*k + 2, 3) / 2;
        const nx = sx + (x - sx) * e, ny = sy + (y - sy) * e;
        c.style.transform = 'translate(' + (nx - 3) + 'px,' + (ny - 2) + 'px)';
        if (k < 1) requestAnimationFrame(step); else { window.__cur = {x, y}; res(); }
      };
      requestAnimationFrame(step);
    });
    window.__ripple = (x, y) => {
      const r = document.createElement('div');
      Object.assign(r.style, {position:'fixed', left:(x-18)+'px', top:(y-18)+'px', width:'36px', height:'36px', borderRadius:'50%', border:'2px solid #9ded00', zIndex:2147483646, pointerEvents:'none', transition:'transform .45s ease-out, opacity .45s ease-out', transform:'scale(.3)', opacity:'1'});
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();`;

(async () => {
  const browser = await chromium.launch({ args: ['--force-device-scale-factor=2'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctx.addInitScript(CURSOR_JS);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', async (f) => {
    const name = String(frameNo++).padStart(6, '0') + '.jpg';
    fs.writeFileSync(path.join(OUT, 'frames', name), Buffer.from(f.data, 'base64'));
    lastTs = f.metadata.timestamp;
    frameLog.write(JSON.stringify({ f: name, t: f.metadata.timestamp }) + '\n');
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });

  const main = () => page.locator('main');
  async function cursorTo(loc, ms = 650) {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    await page.evaluate(([x, y, ms]) => window.__moveCursor(x, y, ms), [b.x + b.width / 2, b.y + b.height / 2, ms]);
    return b;
  }
  async function click(loc, { pause = 250, ms = 650 } = {}) {
    const b = await cursorTo(loc, ms);
    await sleep(pause);
    await page.evaluate(([x, y]) => window.__ripple(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
    await loc.click();
  }
  async function type(loc, text, delay = 32) {
    await click(loc);
    await loc.pressSequentially(text, { delay });
  }
  async function scrollMain(dy, ms = 1800) {
    await main().evaluate((el, [dy, ms]) => new Promise(res => {
      const s = el.scrollTop, t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2) / 2;
        el.scrollTop = s + dy * e;
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    }), [dy, ms]);
  }
  async function scrollMainTo(y, ms = 1200) {
    const cur = await main().evaluate((el) => el.scrollTop);
    await scrollMain(y - cur, ms);
  }
  const tab = (name) => page.getByRole('tab', { name, exact: true });
  const card = (tool, extra) => {
    let l = page.locator('main ul > li').filter({ has: page.locator('span.mono, code, span', { hasText: new RegExp('^' + tool + '$') }) });
    if (extra) l = l.filter({ hasText: extra });
    return l.first();
  };

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2880, maxHeight: 1620, everyNthFrame: 1 });


  const caseId = process.env.CASE_ID;
  await page.goto(APP + `/cases/${caseId}/report`);
  await page.waitForSelector('text=Generate report');
  await sleep(1200);
  mark('report_generate');
  await click(page.getByRole('button', { name: 'Generate report', exact: true }));
  await page.waitForSelector('text=sections populated');
  await sleep(2600);
  mark('collapse');
  for (const title of ['Timeline', 'Evidence', 'Affected assets and identities']) {
    const btn = page.locator('main section > button').filter({ hasText: new RegExp('^' + title.replace(/[&]/g, '.') + '$') }).first();
    await click(btn, { ms: 500 });
    await sleep(500);
  }
  await sleep(800);
  mark('report_body');
  await scrollMain(360, 2600);
  await sleep(2600);
  mark('decisions');
  await scrollMain(420, 2600);
  await sleep(2800);
  mark('actions');
  await scrollMain(700, 3000);
  await sleep(2000);
  mark('validation');
  await scrollMain(700, 3000);
  await sleep(2500);
  mark('gaps');
  const total = await main().evaluate((el) => el.scrollHeight - el.clientHeight);
  await scrollMainTo(total, 3500);
  await sleep(3500);
  mark('end');
  await cdp.send('Page.stopScreencast');
  await api('GET', `/cases/${caseId}/audit`, undefined, 'audit_final');
  fs.writeFileSync(path.join(OUT, 'markers.json'), JSON.stringify({ caseId, markers }, null, 1));
  fs.writeFileSync(path.join(OUT, 'api.json'), JSON.stringify(apiLog, null, 1));
  frameLog.end();
  await browser.close();
  console.log('frames', frameNo);
})().catch((e) => { console.error(e); process.exit(1); });
