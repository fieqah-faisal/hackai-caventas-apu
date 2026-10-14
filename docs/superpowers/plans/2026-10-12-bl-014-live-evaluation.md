# BL-014 Live Planner Evaluation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the first live-planner calibration — `backend/evaluation/results/live.json` + regenerated `SUMMARY.md` — by replaying the 5 synthetic scenarios through the real backend with the OpenCode Go planner, and land it through a reviewed PR.

**Architecture:** `evaluation.run_eval --planner live` runs fully in-process (FastAPI TestClient + in-memory Firestore fake + temp upload/report dirs + bounded simulator). Only the planner performs network calls (`LangGraphPlannerAdapter` → OpenCode Go, `deepseek-v4.1-flash`, key from `backend/.env`). Full run = 5 scenarios / 12 checkpoints plus un-scored re-plans between executions; the run writes `results/live.json` only after all scenarios finish, then rebuilds `SUMMARY.md` from every results file. Scenario-scoped runs land in `results/partial/` and never touch SUMMARY.

**Tech Stack:** Python 3.12 venv (`.venv`), existing evaluation package — no new dependencies, no code changes expected.

## Global Constraints

- Branch from `main`; never commit on `main`.
- Do not modify `backend/scenarios/**` (evaluator ground truth), `evaluation/scorer.py`, or `evaluation/harness.py` unless a defect blocks the run — and then stop and ask.
- Commit results exactly as produced; never edit or fudge scores.
- The `.env` API key must never appear in any committed file.
- Budgets: ≤ 3 run attempts, ≤ ~60 min wall clock, token spend well under $2 (V4.1 Flash).
- Stop-and-ask conditions: 3 failed attempts; a crash needing logic changes; auth/quota errors; anything that would change the scenarios or scorer.

---

### Task 1: Branch, preflight, scoped live smoke

**Files:**
- Create branch `feat/bl-014-live-evaluation` from `main`
- Add: `docs/superpowers/plans/2026-10-12-bl-014-live-evaluation.md` (this file)

**Interfaces:**
- Consumes: `backend/evaluation/run_eval.py` (CLI), key in `backend/.env`
- Produces: `backend/evaluation/results/partial/live.json` (sc01 smoke), timing estimate for the full run

- [ ] **Step 1: Sync and branch**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/bl-014-live-evaluation
```

- [ ] **Step 2: Commit the plan**

```bash
git add docs/superpowers/plans/2026-10-12-bl-014-live-evaluation.md
git commit -m "Add BL-014 live-evaluation plan"
```

- [ ] **Step 3: Preflight checks (key masked, suite green)**

```bash
n=$(sed -n 's/^OPENCODE_GO_API_KEY=//p' backend/.env | tr -d '\n' | wc -c | tr -d ' '); echo "key chars: $n"
cd backend && ../.venv/bin/python -m pytest -q   # expect 137 passed on main (post PR #11)
```

- [ ] **Step 4: Scoped live smoke (one scenario)**

```bash
cd backend && ../.venv/bin/python -m evaluation.run_eval --planner live --scenario sc01_infostealer
```

Expected: stderr line like `[live] sc01_infostealer: PASS/FAIL (CP1=.. CP2=.. CP3=..) Xs`, then `results/partial/live.json` exists. If the shell timeout is hit, relaunch with the Task 2 background pattern.

- [ ] **Step 5: Sanity-check the partial result**

```bash
cd backend && ../.venv/bin/python - <<'PY'
import json
d = json.load(open("evaluation/results/partial/live.json"))
for r in d["runs"]:
    for cp in r["checkpoints"]:
        print(r["scenario_id"], cp["checkpoint"], cp["score"], cp["passed"],
              [g["gate"] for g in cp["gates"] if not g["passed"]])
PY
```

Expected: 3 checkpoints, integer scores, gates listed; no traceback in the log.

---

### Task 2: Full live run (resilient, background)

**Files:**
- Produce: `backend/evaluation/results/live.json`, regenerated `SUMMARY.md`

**Interfaces:**
- Consumes: same CLI as Task 1, default `--profile demo`, all scenarios
- Produces: the two files above; attempts recorded for the log entry

- [ ] **Step 1: Launch in the background**

```bash
cd backend && nohup ../.venv/bin/python -m evaluation.run_eval --planner live > /tmp/live_eval.log 2>&1 &
echo "pid $!"
```

- [ ] **Step 2: Poll (repeat every 1–2 min in separate calls)**

```bash
pgrep -f evaluation.run_eval >/dev/null && echo "running" || echo "finished"
tail -5 /tmp/live_eval.log
ls -la backend/evaluation/results/live.json 2>/dev/null || echo "no results yet"
```

- [ ] **Step 3: Outcome handling**

- Success (process exited 0, `live.json` exists): go to Task 3.
- Failure (exit without `live.json`): `tail -40 /tmp/live_eval.log`, identify the cause; relaunch (Step 1). Max 3 attempts total; on the 3rd failure, STOP and report.
- Expected log shape per scenario: `[live] scXX_y: PASS/FAIL (CPn=score[!]) Ns`; final `summary: .../SUMMARY.md`.

- [ ] **Step 4: Verify SUMMARY rebuilt**

```bash
grep -c "| \`live\`" backend/evaluation/results/SUMMARY.md   # >= 1
grep -c "No live-planner results yet" backend/evaluation/results/SUMMARY.md   # 0
```

---

### Task 3: Extract and record results

**Files:**
- Modify: `docs/session/SessionLog.md` (new dated entry), `docs/session/Backlog.md` (close BL-014)

**Interfaces:**
- Consumes: `results/live.json`, `results/SUMMARY.md`
- Produces: the numbers quoted in the log entry, commit message and PR body

- [ ] **Step 1: Extract the results table**

```bash
cd backend && ../.venv/bin/python - <<'PY'
import json
d = json.load(open("evaluation/results/live.json"))
for r in d["runs"]:
    for cp in r["checkpoints"]:
        print(r["scenario_id"], cp["checkpoint"], cp["branch"], cp.get("plan", {}).get("stage"),
              cp["score"], cp["passed"], [g["gate"] for g in cp["gates"] if not g["passed"]])
PY
```

- [ ] **Step 2: Write the SessionLog entry**

Dated entry with: the command, attempts used, per-scenario summary, checkpoint pass count (`n/12`), failed gates called out by name (especially `prompt_injection_resisted` → BL-020; `every_action_cites_evidence` / `preserve_before_reimage` → note for BL-017/grounding), branch + commit SHAs, and next steps.

- [ ] **Step 3: Update the Backlog**

Mark BL-014 done (remove it per protocol, or leave "PR open" until merged); do not invent new items — if a genuinely new gap appears, add it with the next free ID (BL-031).

---

### Task 4: Commit, push, PR

**Files:**
- Add: `backend/evaluation/results/live.json` (new), modify `backend/evaluation/results/SUMMARY.md`, `docs/session/SessionLog.md`, `docs/session/Backlog.md`

- [ ] **Step 1: Commit**

```bash
git add backend/evaluation/results/live.json backend/evaluation/results/SUMMARY.md docs/session/SessionLog.md docs/session/Backlog.md
git commit -m "feat(ai): add live planner evaluation results (BL-014)"
```

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/bl-014-live-evaluation
```

PR title/body per the github-pr-writing skill: summary, why (SUMMARY said the fake numbers say nothing about the real agent), scope, the results table, honest caveats (un-scored areas: findings/classification/ATT&CK), risks, human action (review/merge). Include the exact commands + observed results. Wait for the user to merge; never merge autonomously.

---

### Task 5: Conditional defect handling (only if a crash reveals a defect)

- [ ] STOP. Report the traceback, the failing call, and a proposed minimal fix.
- [ ] Do not change scenarios, scorer or harness logic without approval.
- [ ] After approval: fix with a test where applicable (`tests/`), re-run Task 1's smoke to confirm.

---

## Verification (end state)

- `results/live.json` parses; 5 scenario runs, 12 checkpoints.
- `SUMMARY.md` contains the `live` row; `fake`/`oracle`/`unsafe` rows unchanged; the "No live-planner results yet" note gone.
- No changes outside: results files, notebook, plan file.
- Backend suite still 137 passed; branch pushed; PR open for review.
