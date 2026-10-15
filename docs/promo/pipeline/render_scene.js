// node render_scene.js <scene.html> <outdir> <seconds> [--still t] [--alpha]
const { chromium } = require('/tmp/claude-0/-home-user-hackai-caventas-apu/32216d5a-3284-52ab-b2e0-12f307a4848e/scratchpad/rec/node_modules/playwright');
const fs = require('fs'); const path = require('path');
(async () => {
  const [html, outdir, secs] = process.argv.slice(2);
  const still = process.argv.includes('--still') ? parseFloat(process.argv[process.argv.indexOf('--still') + 1]) : null;
  const alpha = process.argv.includes('--alpha');
  const every = process.argv.includes('--every') ? parseInt(process.argv[process.argv.indexOf('--every') + 1]) : 1;
  fs.mkdirSync(outdir, { recursive: true });
  const data = fs.readFileSync(path.join(__dirname, 'data', 'case.json'), 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.addInitScript(`window.DATA = ${data};`);
  p.on('console', (m) => console.log('[page]', m.text()));
  p.on('pageerror', (e) => { console.error('[pageerror]', e.message); process.exit(1); });
  await p.goto('file://' + path.resolve(html));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => typeof window.render === 'function');
  await p.evaluate(() => window.setup && window.setup());
  await p.waitForTimeout(300);
  const fps = 30;
  const stills = process.argv.includes('--stills') ? process.argv[process.argv.indexOf('--stills') + 1].split(',').map(Number) : null;
  if (stills) {
    for (const st of stills) { await p.evaluate((t) => window.render(t), st); await p.screenshot({ path: path.join(outdir, 'still_' + st + '.png') }); }
    await b.close(); console.log('stills', stills.length); return;
  }
  const frames = still != null ? [Math.round(still * fps)] : [...Array(Math.round(parseFloat(secs) * fps)).keys()].filter((i) => i % every === 0);
  for (const i of frames) {
    await p.evaluate((t) => window.render(t), i / fps);
    await p.screenshot({ path: path.join(outdir, (still != null ? 'still' : String(i).padStart(5, '0')) + '.png'), omitBackground: alpha });
  }
  await b.close();
  console.log('rendered', frames.length, 'frames ->', outdir);
})();
