// Renders the compositor frame by frame with headless Chromium.
//
//   PLAYWRIGHT_CORE=... CHROME=... node render.mjs <build_dir> <frames_dir> [workers] [from] [to] [step]
// Writes <frames_dir>/NNNNN.jpg and <build_dir>/cues.json.
import fs from "node:fs";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const [build, out, workersArg = "4", fromArg, toArg, stepArg = "1"] = process.argv.slice(2);
const FPS = 30;
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--allow-file-access-from-files", "--disable-web-security"] });
async function open() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") console.log("[page]", m.text()); });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto("file://" + path.resolve(build, "index.html"));
  await page.waitForFunction(() => typeof window.renderFrame === "function");
  return page;
}
const first = await open();
const total = await first.evaluate(() => window.FILM_TOTAL);
fs.writeFileSync(path.join(build, "cues.json"), JSON.stringify(await first.evaluate(() => window.cueSheet()), null, 1));
const frames = Math.ceil(total * FPS);
const from = fromArg ? +fromArg : 0, to = toArg ? Math.min(+toArg, frames) : frames, step = +stepArg;
console.log(`total ${total.toFixed(2)}s, ${frames} frames; rendering ${from}..${to} step ${step}`);
const list = [];
for (let n = from; n < to; n += step) list.push(n);
const workers = [first];
for (let i = 1; i < +workersArg; i++) workers.push(await open());
let next = 0, done = 0;
const t0 = Date.now();
await Promise.all(workers.map(async (page) => {
  while (next < list.length) {
    const n = list[next++];
    await page.evaluate((k) => window.renderFrame(k), n);
    await page.screenshot({ path: path.join(out, `${String(n).padStart(5, "0")}.jpg`), type: "jpeg", quality: 94 });
    if (++done % 150 === 0) console.log(`${done}/${list.length} ${((Date.now() - t0) / done).toFixed(0)} ms/frame`);
  }
}));
await browser.close();
console.log("done", list.length, "frames in", ((Date.now() - t0) / 1000).toFixed(0), "s");
