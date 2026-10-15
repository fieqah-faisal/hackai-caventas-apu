// Records the real Caventas workspace (API mode) for the product film.
//
// Drives the actual UI against capture_backend.py and saves high-DPI frames
// plus a manifest of frame timings and element boxes (for cursor/zoom moves).
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core/index.mjs \
//   CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//   node capture.mjs <outdir>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const PY = path.join(REPO, ".venv/bin/python");
const OUT = path.resolve(process.argv[2] ?? "capture");
const APP = process.env.APP_URL ?? "http://localhost:5173";
const API = "http://127.0.0.1:8000";
const VW = 1536, VH = 864, DSF = 2.5;

fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });
const manifest = { viewport: { w: VW, h: VH, dsf: DSF }, shots: {} };
const save = () => fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
const api = (args) => execFileSync(PY, [path.join(HERE, "film_api.py"), ...args], { encoding: "utf8" });
const setDelay = (seconds) => fetch(`${API}/__film/delay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seconds }) });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const context = await browser.newContext({
  viewport: { width: VW, height: VH }, deviceScaleFactor: DSF,
  timezoneId: "Asia/Kuala_Lumpur", locale: "en-GB", colorScheme: "dark",
});
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);

async function box(locator) {
  const b = await locator.first().boundingBox();
  return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

async function boxes(map) {
  const out = {};
  for (const [name, locator] of Object.entries(map ?? {})) out[name] = await box(locator).catch(() => null);
  return out;
}

// Text + box of visible elements, so the compositor can aim callouts at
// real UI elements by their text.
const indexElements = () => page.evaluate(() => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("h1,h2,h3,h4,p,li,button,a,dt,dd,label,span,td,th,section,[role=status],[role=alert],.react-flow__node")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const text = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 260) continue;
    const key = `${text}|${Math.round(r.x)}|${Math.round(r.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ s: el.tagName.toLowerCase(), t: text, b: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
  }
  return out;
});

let frameNo = 0;
async function frame(shot, note = "", regions, index = false) {
  const file = `frames/${String(++frameNo).padStart(4, "0")}-${shot.name}.jpg`;
  await page.screenshot({ path: path.join(OUT, file), type: "jpeg", quality: 93 });
  const entry = { file, t: Date.now() - shot.t0, note, regions: await boxes(regions) };
  if (index) entry.index = await indexElements();
  shot.frames.push(entry);
}

function begin(name, extra = {}) {
  const shot = { name, t0: Date.now(), frames: [], ...extra };
  manifest.shots[name] = shot;
  return shot;
}

// A still, optionally a tall one: the viewport grows to the scroll height of
// <main> so the compositor can glide over the whole page. Pages taller than
// Chromium's screenshot limit are captured in chunks (stitched by build.py).
const CHUNK = 5600;
async function still(name, { tall = false, regions, maxHeight = 3600 } = {}) {
  await pause(400);
  let height = VH;
  if (tall) {
    await page.evaluate(() => document.querySelector("main")?.scrollTo({ top: 0 }));
    await pause(200);
    const extra = await page.evaluate(() => {
      const main = document.querySelector("main");
      return main ? main.scrollHeight - main.clientHeight : 0;
    });
    height = Math.min(VH + extra, maxHeight);
  }
  if (tall && height > CHUNK) {
    const shot = begin(name, { tall, height, chunked: true });
    await page.setViewportSize({ width: VW, height: CHUNK });
    await pause(500);
    const chunks = [];
    const index = [];
    for (let top = 0; top < height - 57; top += CHUNK - 57) {
      const y = await page.evaluate((v) => { const m = document.querySelector("main"); m.scrollTo({ top: v }); return m.scrollTop; }, top);
      await pause(350);
      const file = `frames/${String(++frameNo).padStart(4, "0")}-${name}-c${chunks.length}.jpg`;
      await page.screenshot({ path: path.join(OUT, file), type: "jpeg", quality: 93 });
      chunks.push({ file, offset: y });
      for (const e of await indexElements()) if (e.b[1] >= 57 && e.b[1] < CHUNK) index.push({ ...e, b: [e.b[0], e.b[1] + y, e.b[2], e.b[3]] });
      if (y + CHUNK - 57 >= height) break;
    }
    shot.frames.push({ file: chunks[0].file, chunks, t: 0, note: "", regions: {}, index });
    await page.evaluate(() => document.querySelector("main")?.scrollTo({ top: 0 }));
    await page.setViewportSize({ width: VW, height: VH });
    await pause(250);
    save();
    return shot;
  }
  if (tall) {
    await page.setViewportSize({ width: VW, height });
    await pause(500);
  }
  const shot = begin(name, { tall, height });
  await frame(shot, "", regions, true);
  if (tall) {
    await page.setViewportSize({ width: VW, height: VH });
    await pause(250);
  }
  save();
  return shot;
}

// Captures frames continuously until `done()` resolves true.
async function record(name, done, { interval = 250, max = 120, regions, after = 3 } = {}) {
  const shot = begin(name);
  for (let i = 0; i < max; i++) {
    await frame(shot, "", typeof regions === "function" ? regions() : regions);
    if (await done().catch(() => false)) break;
    await pause(interval);
  }
  for (let i = 0; i < after; i++) { await pause(interval); await frame(shot, "tail"); }
  save();
  return shot;
}

async function typeInto(shot, locator, text, every = 3, region = {}) {
  await locator.click();
  for (let i = 0; i < text.length; i += every) {
    await locator.pressSequentially(text.slice(i, i + every), { delay: 10 });
    await frame(shot, "type", region);
  }
}

// Real React Flow interaction: wheel-zoom toward the account node, then
// select the host to show neighbourhood emphasis.
async function graphZoom(name) {
  await page.evaluate(() => document.querySelector(".react-flow")?.scrollIntoView({ block: "center" }));
  await pause(500);
  const shot = begin(name);
  const node = (text) => page.locator(".react-flow__node").filter({ hasText: text }).first();
  const canvas = page.locator(".react-flow");
  const host = await node("SALES-LT-07").boundingBox();
  const area = await canvas.boundingBox();
  await frame(shot, "fit", { canvas });
  await page.mouse.move(host.x - 60, area.y + area.height / 2);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -80);
    await pause(340);
    await frame(shot, "zoom", { canvas });
  }
  await pause(400);
  await frame(shot, "zoomed", { canvas, host: node("SALES-LT-07"), account: node("farah") }, true);
  await node("SALES-LT-07").click().catch(() => {});
  await pause(700);
  await frame(shot, "selected", { canvas, host: node("SALES-LT-07"), account: node("farah") }, true);
  save();
  await page.keyboard.press("Escape");
  await pause(300);
}

async function expandMissing() {
  await page.getByText(/^Missing evidence \(\d+\)$/).first().click().catch(() => {});
  await pause(500);
}

async function showHistory(shot, regionsFor) {
  await page.getByText("Execution history", { exact: true }).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => document.querySelector("main")?.scrollBy({ top: 120 }));
  await pause(500);
  await frame(shot, "history", regionsFor ? regionsFor() : {}, true);
}

const tab = (name) => page.getByRole("tab", { name, exact: true });
async function openTab(name) {
  await tab(name).click();
  await page.waitForLoadState("networkidle");
  await pause(900);
}

// ---------------------------------------------------------------------------
console.log(api(["seed"]));
const evidenceDir = path.join(OUT, "evidence");
console.log(api(["split", evidenceDir]));

await page.goto(APP, { waitUntil: "networkidle" });
await pause(800);
await still("dashboard_start", { regions: { create: page.getByRole("link", { name: /Create New Case/ }) } });

// 1. Create the case -------------------------------------------------------
await page.goto(`${APP}/cases/new`, { waitUntil: "networkidle" });
const caseJson = JSON.parse(fs.readFileSync(path.join(REPO, "backend/scenarios/sc01_infostealer/agent_inputs/case.json"), "utf8"));
const titleBox = page.getByPlaceholder("e.g. Infostealer on sales laptop");
const descBox = page.getByLabel("Short description");
const createBtn = page.getByRole("button", { name: "Create case & continue" });
{
  const shot = begin("create_case");
  const regions = { title: titleBox, desc: descBox, create: createBtn };
  await frame(shot, "empty", regions);
  await typeInto(shot, titleBox, caseJson.title, 3, regions);
  await typeInto(shot, descBox, caseJson.description, 5, regions);
  await frame(shot, "filled", regions);
  await createBtn.click();
  await page.getByRole("button", { name: "Add evidence files" }).waitFor();
  await pause(400);
  await frame(shot, "created", { addFiles: page.getByRole("button", { name: "Add evidence files" }) }, true);
  save();
}
const caseId = await page.evaluate(async () => {
  const r = await fetch("/api/cases"); const cases = await r.json();
  return cases.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0].case_id;
});
manifest.caseId = caseId;
console.log("case", caseId);

// 2. Upload evidence from five sources -------------------------------------
{
  const files = fs.readdirSync(evidenceDir).map((f) => path.join(evidenceDir, f));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add evidence files" }).click();
  await (await chooser).setFiles(files);
  await record("upload_batch1", async () => (await page.getByText(/Accepted files:\s*5/).count()) > 0, { interval: 200, after: 2 });
}
await still("upload_done", { regions: { sources: page.locator("aside li").nth(1) } });
{
  const reviewStep = page.getByRole("button", { name: "Evidence review" });
  if (await reviewStep.isEnabled()) await reviewStep.click();
  await page.getByRole("button", { name: "Confirm review & continue" }).waitFor();
  await pause(800);
  await still("review", { regions: { confirm: page.getByRole("button", { name: "Confirm review & continue" }) } });
  await page.getByRole("button", { name: "Confirm review & continue" }).click();
  await page.getByRole("button", { name: "Start analysis", exact: true }).waitFor();
  await still("start", { regions: { start: page.getByRole("button", { name: "Start analysis", exact: true }) } });
}

// 3. Agent analysis run ----------------------------------------------------
await setDelay(2.6);
await page.getByRole("button", { name: "Start analysis", exact: true }).click();
await record("agent_run1", async () => (await page.locator(".analysis-run-dialog").getByText(/PLAN-/).count()) > 0,
  { interval: 300, after: 6, regions: { dialog: page.locator(".analysis-run-dialog") } });
await setDelay(0);
await page.getByRole("button", { name: "Minimise" }).click();
await pause(600);

// 4. Reconstructed incident ------------------------------------------------
await openTab("Overview");
await still("overview1", { tall: true });
await openTab("Evidence");
await still("evidence1", { tall: true });
await openTab("Timeline");
await still("timeline1", { tall: true });
await openTab("Incident Graph");
await still("graph1", { tall: true, regions: { canvas: page.locator(".react-flow") } });
await graphZoom("graph_zoom1");
await openTab("Analysis");
await expandMissing();
await still("analysis1", { tall: true });
await openTab("Response Plan");
await still("plan1", { tall: true });
await openTab("Approvals");
await still("approvals1", { tall: true });

// 5. Human approval: approve + simulate isolate_host, reject a block --------
const card = (tool, target) => page.locator("li").filter({ has: page.getByText(tool, { exact: true }) }).filter({ hasText: target });
{
  const isolate = card("isolate_host", "HOST::SALES-LT-07");
  await isolate.scrollIntoViewIfNeeded();
  await pause(500);
  const shot = begin("approve_isolate");
  const regions = () => ({ card: isolate, approve: isolate.getByRole("button", { name: "Approve" }) });
  await frame(shot, "before", regions());
  await isolate.getByRole("button", { name: "Approve" }).click();
  await isolate.getByRole("button", { name: "Run bounded simulation" }).waitFor();
  await pause(300);
  await frame(shot, "approved", { card: isolate, simulate: isolate.getByRole("button", { name: "Run bounded simulation" }) });
  await isolate.getByRole("button", { name: "Run bounded simulation" }).click();
  await isolate.getByText(/Validation:/).waitFor();
  await pause(500);
  await frame(shot, "simulated", { card: isolate, result: isolate.getByText(/Simulation \(bounded/).locator("..") }, true);
  await showHistory(shot);
  save();
}
{
  const block = card("block_domain", "pdf-editor-free.example");
  await block.scrollIntoViewIfNeeded();
  await pause(500);
  const shot = begin("reject_block");
  await frame(shot, "before", { card: block, reject: block.getByRole("button", { name: "Reject" }) });
  await block.getByRole("button", { name: "Reject" }).click();
  await pause(400);
  const reason = block.getByPlaceholder("Reason...");
  await frame(shot, "reason", { card: block, reason });
  await typeInto(shot, reason, "Lure domain only; already blocked by the web-proxy category policy. Track as IOC.", 6, { card: block, reason });
  await frame(shot, "typed", { card: block, reject: block.getByRole("button", { name: "Reject" }) });
  await block.getByRole("button", { name: "Reject" }).click();
  await frame(shot, "rejecting", {});
  await block.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  await pause(300);
  await frame(shot, "rejected", {});
  save();
}

// Off camera: the demo path's next approvals, each from a fresh plan.
console.log(api(["advance", caseId]));
await page.reload({ waitUntil: "networkidle" });
await openTab("Approvals");
await still("approvals_history", { tall: true });
await openTab("Response Plan");
await still("plan_history", { tall: true });

// 6. New evidence -> stale plan -> replan ------------------------------------
const batch2 = path.join(OUT, "crm-audit-and-idp-signins.json");
console.log(api(["batch2", caseId, batch2]));
await openTab("Evidence");
{
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload more evidence" }).click();
  await (await chooser).setFiles([batch2]);
  await record("upload_batch2", async () => (await page.getByText(/must be reviewed/).count()) > 0,
    { interval: 200, after: 3, regions: () => ({ stale: page.getByRole("alert") }) });
}
await still("stale_warning", { regions: { stale: page.getByRole("alert").filter({ hasText: "must be reviewed" }), header: page.locator("main section").first() } });
await openTab("Response Plan");
await still("plan_stale", { tall: true });

await page.getByRole("button", { name: "Analyze new evidence" }).click().catch(async () => openTab("Analysis"));
await openTab("Analysis");
await setDelay(2.6);
await page.getByRole("button", { name: "Re-run analysis" }).click();
for (let i = 0; i < 15 && !(await page.locator(".analysis-run-dialog").count()); i++) await pause(100);
if (!(await page.locator(".analysis-run-dialog").count())) {
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "View agent")?.click());
}
await record("agent_run2", async () => (await page.locator(".analysis-run-dialog").getByText(/PLAN-/).count()) > 0,
  { interval: 300, after: 6, regions: { dialog: page.locator(".analysis-run-dialog") } });
await setDelay(0);
await page.getByRole("button", { name: "Minimise" }).click().catch(() => {});
await pause(600);
await openTab("Analysis");
await expandMissing();
await still("analysis2", { tall: true });
await openTab("Overview");
await still("overview2", { tall: true });
await openTab("Response Plan");
await still("plan2", { tall: true });
await openTab("Incident Graph");
await still("graph2", { tall: true, regions: { canvas: page.locator(".react-flow") } });
await graphZoom("graph_zoom2");
await openTab("Approvals");
await still("approvals2", { tall: true });

// 7. Policy-bound approval: disable_account needs the IT manager (POL-02) ----
{
  const disable = card("disable_account", "ACCOUNT::farah");
  await disable.scrollIntoViewIfNeeded();
  await pause(500);
  const shot = begin("approve_disable");
  const role = disable.getByLabel("Acting approver role");
  await frame(shot, "before", { card: disable, role, approve: disable.getByRole("button", { name: "Approve" }) });
  await disable.getByRole("button", { name: "Approve" }).click();
  await pause(1200);
  await frame(shot, "denied", { card: disable, role, alert: page.getByRole("alert").last() }, true);
  await pause(600);
  await frame(shot, "denied2", { card: disable, role });
  await role.selectOption("it_manager");
  await pause(400);
  await frame(shot, "it_manager", { card: disable, role, approve: disable.getByRole("button", { name: "Approve" }) });
  await disable.getByRole("button", { name: "Approve" }).click();
  await disable.getByRole("button", { name: "Run bounded simulation" }).waitFor();
  await pause(300);
  await frame(shot, "approved", { card: disable, simulate: disable.getByRole("button", { name: "Run bounded simulation" }) });
  await disable.getByRole("button", { name: "Run bounded simulation" }).click();
  await disable.getByText(/Validation:/).waitFor();
  await pause(500);
  await frame(shot, "simulated", { card: disable }, true);
  await showHistory(shot);
  save();
}

// Off camera: the replacement CRM revocation from a fresh plan (after 10:30).
console.log(api(["approve", caseId, "revoke_sessions", "ACCOUNT::farah"]));
await page.reload({ waitUntil: "networkidle" });
await openTab("Approvals");
await still("approvals_final", { tall: true });

// 8. Analyst collaboration ---------------------------------------------------
{
  const panel = page.locator("section").filter({ has: page.getByRole("button", { name: /Analyst reviews/ }) }).first();
  await page.evaluate(() => document.querySelector("main")?.scrollTo({ top: 0 }));
  await page.getByRole("button", { name: /Analyst reviews/ }).click();
  await pause(700);
  const shot = begin("reviews");
  const typeSel = page.getByLabel("Review type");
  const comment = page.getByLabel("Comment");
  const submit = page.getByRole("button", { name: "Record review" });
  const regions = () => ({ panel, type: typeSel, comment, submit });
  await page.getByRole("button", { name: /Analyst reviews/ }).scrollIntoViewIfNeeded();
  await frame(shot, "open", regions());
  await page.getByLabel("Analyst", { exact: true }).fill("soc.analyst");
  await page.getByLabel("Role", { exact: true }).fill("Tier 1 SOC analyst");
  await frame(shot, "identity", regions());
  const entries = [
    ["confirm", "Confirmed with Farah by phone: she was in a client meeting at 10:20 and did not use the CRM. The export from 198.51.100.23 is attacker activity."],
    ["request_more_evidence", "Need the full CRM audit trail for crm-s-7731 and a sweep for svchost-update.exe on other endpoints before eradication."],
    ["note", "DPO informed about the 1,200 exported customer records (POL-03)."],
    ["sign_off", "Containment verified for the current state: sessions revoked, account disabled, laptop isolated and imaged. Signed off for reporting."],
  ];
  for (const [kind, text] of entries) {
    await typeSel.selectOption(kind);
    await comment.fill("");
    await typeInto(shot, comment, text, 12, regions());
    await submit.first().click();
    await pause(900);
    await frame(shot, `saved-${kind}`, regions());
  }
  save();
  await still("reviews_full", { tall: true });
  await page.getByRole("button", { name: /Analyst reviews/ }).click();
  await pause(500);
}

// 9. Structured report and PDF export ----------------------------------------
await openTab("Report");
{
  const generate = page.getByRole("button", { name: "Generate report" });
  const shot = begin("report_generate");
  await frame(shot, "before", { generate });
  await generate.click();
  await page.getByText("Incident report").first().waitFor();
  await pause(1500);
  await frame(shot, "generated", {}, true);
  save();
}
await still("report_full", { tall: true, maxHeight: 20000 });
{
  const download = page.waitForEvent("download");
  const link = page.getByRole("link", { name: /Download PDF/ });
  manifest.pdfButton = await box(link);
  await link.click();
  const file = await download;
  const pdf = path.join(OUT, "report.pdf");
  await file.saveAs(pdf);
  fs.mkdirSync(path.join(OUT, "pdf"), { recursive: true });
  execFileSync("pdftoppm", ["-r", "110", "-png", pdf, path.join(OUT, "pdf", "page")]);
  manifest.pdfPages = fs.readdirSync(path.join(OUT, "pdf")).sort();
}
await page.goto(APP, { waitUntil: "networkidle" });
await pause(800);
await still("dashboard_end");

const getJson = async (url) => (await fetch(`${API}${url}`)).json();
manifest.runs = await getJson(`/cases/${caseId}/analysis-runs`);
for (const run of manifest.runs) run.steps = await getJson(`/cases/${caseId}/analysis-runs/${run.run_id}/steps`);
manifest.plans = await getJson(`/cases/${caseId}/plans`);
save();
await browser.close();
console.log("frames", frameNo);
