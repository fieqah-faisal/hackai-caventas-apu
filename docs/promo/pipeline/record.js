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
const OUT = path.join(__dirname, 'take');
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

  // ---------------- 1. Create case ----------------
  await page.goto(APP + '/cases/new');
  await page.waitForSelector('text=Create a case');
  await sleep(1200);
  mark('create_start');
  const caseJson = JSON.parse(fs.readFileSync(BACKEND + '/scenarios/sc01_infostealer/agent_inputs/case.json'));
  await type(page.getByPlaceholder('e.g. Infostealer on sales laptop'), caseJson.title, 28);
  await sleep(300);
  await type(page.locator('textarea').first(), caseJson.description, 24);
  await sleep(600);
  mark('create_click');
  await click(page.getByRole('button', { name: 'Create case & continue' }));
  await page.waitForSelector('text=Add evidence files');
  await sleep(1500);
  mark('evidence_start');
  const files = ['idp_signin_logs.json', 'edr_endpoint_events.json', 'dns_queries.json', 'firewall_proxy_logs.json', 'analyst_notes.json'];
  for (const [i, f] of files.entries()) {
    const chooserP = page.waitForEvent('filechooser');
    await click(page.getByRole('button', { name: 'Add evidence files' }), { ms: i ? 350 : 650, pause: 150 });
    const chooser = await chooserP;
    await chooser.setFiles(path.join(DEMO, 'evidence', f));
    await page.waitForFunction((n) => document.body.innerText.includes(n), f);
    await sleep(650);
  }
  await sleep(900);
  mark('review_start');
  await click(page.getByRole('button', { name: /Evidence review/ }));
  await page.waitForSelector('text=Confirm review & continue');
  await sleep(1800);
  await click(page.getByRole('button', { name: 'Confirm review & continue' }));
  await sleep(1200);
  mark('start_analysis');
  await click(page.getByRole('button', { name: 'Start analysis', exact: true }));
  await page.waitForURL(/\/cases\/CASE-[^/]+$/, { timeout: 60000 });
  const caseId = page.url().split('/').pop();
  console.log('CASE', caseId);
  await page.waitForSelector('text=Affected entities');
  await sleep(2500);
  mark('overview_done');

  // ---------------- 2. Evidence ----------------
  await click(tab('Evidence'));
  await page.waitForSelector('main ul > li');
  await sleep(1500);
  mark('evidence_list');
  await scrollMain(420, 2200);
  await sleep(500);
  const edr = page.locator('main ul > li button').filter({ hasText: 'edr_alert' }).first();
  await click(edr);
  await page.waitForSelector('text=SHA-256');
  await sleep(3200);
  mark('evidence_detail_open');
  await page.keyboard.press('Escape');
  await sleep(400);
  if (await page.locator('text=SHA-256').count()) {
    const close = page.getByRole('button', { name: /close/i }).first();
    if (await close.count()) await click(close);
  }
  await sleep(800);

  // ---------------- 3. Timeline ----------------
  mark('timeline');
  await scrollMainTo(0, 400);
  await click(tab('Timeline'));
  await page.waitForSelector('main ol > li');
  await sleep(1500);
  await scrollMain(900, 4200);
  await sleep(800);
  await scrollMain(700, 3200);
  await sleep(1000);

  // ---------------- 4. Analysis (entities) ----------------
  mark('analysis');
  await scrollMainTo(0, 500);
  await click(tab('Analysis'));
  await page.waitForSelector('text=Affected entities');
  await sleep(1200);
  await scrollMain(220, 1200);
  await sleep(2500);

  // ---------------- 5. Approvals: plan v1 ----------------
  mark('approvals_v1');
  await scrollMainTo(0, 500);
  await click(tab('Approvals'));
  await page.waitForSelector('text=Run bounded simulation, text=Approve', { state: 'attached' }).catch(() => {});
  await page.waitForSelector('main ul > li');
  await sleep(2000);
  // read isolate_host card
  const iso = card('isolate_host');
  await cursorTo(iso.locator('p').first(), 900);
  await sleep(3000);
  mark('reject_reset');
  const rst = card('reset_password');
  await rst.scrollIntoViewIfNeeded();
  await click(rst.getByRole('button', { name: 'Reject' }));
  await sleep(700);
  await type(rst.locator('textarea'), 'Hold: revoke sessions first. A reset now tips off the attacker while stolen cookies stay valid. Re-propose after revocation.', 22);
  await sleep(600);
  await click(rst.getByRole('button', { name: 'Reject' }));
  await sleep(2600);
  mark('approve_isolate');
  const iso2 = card('isolate_host');
  await iso2.scrollIntoViewIfNeeded();
  await sleep(600);
  await cursorTo(iso2.locator('select'), 600);
  await sleep(500);
  await click(iso2.getByRole('button', { name: 'Approve' }));
  await sleep(1800);
  const simBtn = page.getByRole('button', { name: 'Run bounded simulation' }).first();
  await simBtn.waitFor();
  mark('simulate_isolate');
  await click(simBtn);
  await sleep(4000);
  mark('after_isolate');

  // ---------------- 6. Re-plan v2 via API, revoke partial failure ----------------
  const run2 = await api('POST', `/cases/${caseId}/runs`, undefined, 'replan_v2');
  await page.reload();
  await page.waitForSelector('main ul > li');
  await sleep(1500);
  mark('approvals_v2');
  const rv = card('revoke_sessions', 'state v6');
  await rv.scrollIntoViewIfNeeded();
  await sleep(1500);
  await click(rv.getByRole('button', { name: 'Approve' }));
  await sleep(1600);
  const sim2 = page.getByRole('button', { name: 'Run bounded simulation' }).first();
  await sim2.waitFor();
  await click(sim2);
  mark('revoke_partial');
  await sleep(4500);

  // ---------------- 7. New evidence arrives (API) ----------------
  execFileSync(PY, ['-I', path.join(DEMO, 'render_batch.py'), BACKEND, caseId, '2', path.join(DEMO, 'evidence', 'crm_audit_and_signin_followup.json')], { stdio: 'inherit' });
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(path.join(DEMO, 'evidence', 'crm_audit_and_signin_followup.json'))], { type: 'application/json' }), 'crm_audit_and_signin_followup.json');
  await api('POST', `/cases/${caseId}/evidence`, fd, 'upload_batch2');
  await page.reload();
  await page.waitForSelector('main ul > li');
  await sleep(1500);
  mark('stale_queue');
  await scrollMain(700, 3500);
  await sleep(1500);
  await scrollMainTo(0, 900);
  await sleep(600);
  mark('timeline_new');
  await click(tab('Timeline'));
  await page.waitForSelector('main ol > li');
  await sleep(800);
  const total = await main().evaluate((el) => el.scrollHeight - el.clientHeight);
  await scrollMainTo(total - 760, 2600);
  await sleep(1200);
  await scrollMain(760, 4200);
  await sleep(2500);

  // ---------------- 8. Re-plan v3 via API; role-gated approval ----------------
  await api('POST', `/cases/${caseId}/runs`, undefined, 'replan_v3');
  await scrollMainTo(0, 300);
  await page.reload();
  await page.waitForSelector('text=Plan v3 ready');
  await click(tab('Approvals'));
  await page.waitForSelector('main ul > li');
  await sleep(1200);
  mark('approvals_v3');
  const dis = card('disable_account');
  await dis.scrollIntoViewIfNeeded();
  await main().evaluate((el) => { el.scrollTop = el.scrollTop + 0; });
  await sleep(1800);
  mark('deny_soc');
  await click(dis.getByRole('button', { name: 'Approve' }));
  await sleep(3800);
  mark('approve_itm');
  await click(dis.locator('select'));
  await dis.locator('select').selectOption('it_manager');
  await sleep(900);
  await click(dis.getByRole('button', { name: 'Approve' }));
  await sleep(2600);
  mark('approve_revoke_v3');
  const rv3 = card('revoke_sessions', 'state v8');
  await rv3.scrollIntoViewIfNeeded();
  await sleep(900);
  await click(rv3.getByRole('button', { name: 'Approve' }));
  await sleep(1500);
  const sim3 = rv3.getByRole('button', { name: 'Run bounded simulation' });
  await sim3.waitFor();
  await click(sim3);
  mark('revoke_effective');
  await sleep(4500);

  // ---------------- 9. Report ----------------
  mark('report');
  await scrollMainTo(0, 400);
  await click(tab('Report'));
  await page.waitForSelector('text=Generate report');
  await sleep(1200);
  await click(page.getByRole('button', { name: 'Generate report', exact: true }));
  await page.waitForSelector('text=sections populated');
  await sleep(2500);
  mark('report_scroll');
  await scrollMain(600, 3500);
  await sleep(1200);
  await scrollMain(700, 3500);
  await sleep(1200);
  await scrollMain(900, 4000);
  await sleep(1500);
  await scrollMain(1200, 4500);
  await sleep(2000);
  mark('end');
  await cdp.send('Page.stopScreencast');

  // ---------------- data for motion graphics ----------------
  const metas = await api('GET', `/cases/${caseId}/states`, undefined, 'states');
  for (const m of metas) await api('GET', `/cases/${caseId}/states/${m.version}`, undefined, 'state_v' + m.version);
  await api('GET', `/cases/${caseId}/audit`, undefined, 'audit');
  await api('GET', `/cases/${caseId}/action-results`, undefined, 'results');
  await api('GET', `/cases/${caseId}/plans`, undefined, 'plans');
  await api('GET', `/cases/${caseId}/evidence`, undefined, 'evidence');
  fs.writeFileSync(path.join(OUT, 'markers.json'), JSON.stringify({ caseId, markers }, null, 1));
  fs.writeFileSync(path.join(OUT, 'api.json'), JSON.stringify(apiLog, null, 1));
  frameLog.end();
  await browser.close();
  console.log('frames', frameNo);
})().catch((e) => { console.error(e); process.exit(1); });
