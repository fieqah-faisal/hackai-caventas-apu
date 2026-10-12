# `link` final report: frontend ↔ FastAPI backend in API mode (S6)

Branch `link` was created off `main` and fast-forwarded to `origin/main`@`3cecd3e` (PR #7). Every commit below is on `link`. None are on `main`, and nothing has been pushed; the user decides push/PR. All data used is synthetic.

## Commits on `link` (`git log main..link`, oldest first)

| SHA | Subject |
|-----|---------|
| `8e6d882` | docs(session): record link preflight baseline and reconcile notebook |
| `b342031` | docs(session): record S1 commit SHA in SessionLog |
| `fd35071` | docs(session): record link API-mode E2E run findings |
| `4e54fa2` | docs(session): record S2 commit SHA in SessionLog |
| `91b3717` | fix(frontend): map the real audit event shape in API mode |
| `5aa1b09` | test(frontend): pin the approve/reject decision contract |
| `a078663` | fix(frontend): order plans by created_at in API mode |
| `b29e9bc` | fix(backend): pick the newest plan by created_at for reports |
| `a727289` | fix(frontend): generate reports only on an explicit analyst action |
| `7fecd92` | fix(frontend): keep decision, execution and validation apart in the report |
| `fc2be8d` | fix(frontend): don't claim a completed simulation for failed report actions |
| `5d6ffc2` | fix(frontend): show honest plan-action and re-plan states in API mode |
| `584e186` | fix(frontend): map real evidence titles and upload order in API mode |
| `02e1c6d` | chore(backend): correct the stale router comment in main.py |
| `6400c4b` | docs(session): close S3 contract fixes; log deferred API-mode follow-ups |
| `d4974d4` | docs(session): record S3 closing SHA in SessionLog |
| `4fdfcac` | docs: correct router comments and API-mode READMEs after S3 fixes |
| `71f0805` | docs(session): record S4 tidy commit SHA in SessionLog |
| `ed0712a` | feat(backend): add read-only GET actions and action-results lists (BL-027) |
| `e5e604b` | feat(frontend): load the API-mode approvals queue from GET actions (BL-027) |
| `842e994` | docs(session): record S5 commit SHAs in SessionLog |
| (this commit) | docs(session): record S6 final API-mode verification and teardown |

The S6 commit can't contain its own SHA. A notebook-only follow-up commit records it in `SessionLog.md`, the same pattern S1–S5 used.

## Test results (S6, at `842e994` plus notebook-only changes)

- `cd backend && ../.venv/bin/python -m pytest -q`: **52 passed**. The S1 baseline was 44.
- `cd frontend && npm run build && npm run test`: the build is green and **75 passed** in 9 files. The S1 baseline was 23 in 6.

## Live API-mode re-walk (S6)

The stack ran locally:

- the Firestore emulator (firebase-tools 15.33.0, `--project demo-ir-planner`, :8080)
- uvicorn :8000 with `FIRESTORE_EMULATOR_HOST=localhost:8080`, `FIREBASE_PROJECT_ID=demo-ir-planner`, and the fake planner and fake simulator (no key)
- `VITE_DATA_MODE=api npm run dev` on :5173

Playwright drove a synthetic case, `CASE-EE17E1B1`. It was created in the UI, and `backend/fixtures/login_logs.csv` and `planner_smoke_evidence.json` were uploaded (10 records). The run started from the UI. A second run was sent via `POST /api/…/runs`, because the UI has no re-plan button. There were 0 console errors.

| Tab | Result | Note |
|-----|--------|------|
| Overview | ok | Counts are real (4 entities, 10 evidence, current plan v1→v2). The "start a planning run" copy still shows after a run (BL-026 d). |
| Evidence | ok | Records are in upload order, with real `event_type` titles. Nearly every row is under Endpoint (BL-026 e). |
| Timeline | ok | 10 real events in file order. |
| Analysis | ok / empty | Entities are real. Classification, techniques and hypotheses are empty because of the fake planner. |
| Response Plan | ok (honest) | Plans v1 and v2 appear in `created_at` order with "Plan vN proposed 1 action … detail is not loaded". There is no fixture re-plan copy (BL-027 b). |
| Approvals | ok | Approve sends one `POST …/decision` (`approve`), and the card stays queued after a reload with "Run bounded simulation". Simulate sends one `POST …/execute`, and the toast reads "completed / ineffective". Reject requires a reason and sends `POST …/decision` (`reject`). After that the queue is empty (BL-027 a). |
| Report | ok | Opening the tab sends no POST. Generate sends one `POST /reports`. The report reads "Rejected by … — reason: …", "Approved by …", "Approved, sent to simulator, not validated effective", and validation "Not validated effective … → Suspicious outbound communication continued." After a reload it shows "No report generated yet" (BL-025). |
| Audit | no UI surface | The live probe through the real `RealProvider.getAudit` and `toAuditEventVM` mapped all 12 events (`case_created`, `evidence_ingested`, `state_version_created`, `plan_created`, `action_approved`, `action_rejected`, `action_executed`, `report_generated`). |
| Dashboard | unsupported (honest) | There is no global `GET /cases` (BL-013). |

Confirmed against the backend:

- Executing a rejected action returns 409.
- Re-executing returns the same `EXEC-dbad5df0a197`, with still 1 result and 1 `action_executed` event.
- Decision `"approved"` returns 422. The UI sends `approve`/`reject`.
- Execution and validation (effective) are kept separate in the toast, in the report and in `GET /action-results`.

## S5 decision

DEC-011 / BL-027 adds read-only `GET /cases/{id}/actions` and `GET /cases/{id}/action-results`. Both are sorted by `created_at`, return 404 for an unknown case, write nothing, and are covered by 7 backend tests. The decision and execute paths are unchanged. The API-mode Approvals queue is built from them, so it is no longer "unsupported".

## Open backlog items from this work

- BL-013: global `GET /cases` (dashboard) and plan detail.
- BL-024: react-router 6.x runtime advisories (fixing them needs v7).
- BL-025: report read endpoint, so a report survives a reload.
- BL-026 (a)–(g): API-mode UI copy and labels. (a) comes first: the analyst note is labelled "captured as evidence" but is never sent.
- BL-027 (a)–(c): the result card is replaced after a simulation, Response Plan could join `GET /actions`, and fixture-mode refresh may hide approved cards.
- BL-028 (new): the "Senior approval" badge is a frontend tool-name heuristic, shown next to "Any analyst".
- BL-029 (new): pytest writes uploaded copies into `backend/uploads/` (24 files per run).
- Also still open: BL-001, BL-008, BL-009, BL-010, BL-011 and BL-012 (team/other owners).

## Teardown

- Stopped: vite, uvicorn, and the emulator (npx/firebase/java).
- Deleted:
  - `/tmp/caventas-e2e`, which held the Playwright project, screenshots, logs and curl dumps
  - the untracked S1–S5 scratch in this folder
  - `firestore-debug.log`
  - the 2026-10-12 E2E and pytest copies in the gitignored `backend/uploads/` and `backend/reports/`; older files and `.gitkeep` were kept
- Downloaded tool caches, left in place for the user to remove if wanted:
  - Playwright browsers: `~/Library/Caches/ms-playwright` (about 572 MB: chromium-1248, chromium_headless_shell-1248, ffmpeg-1013)
  - firebase-tools 15.33.0 npx cache: `~/.npm/_npx/112a9764e56265fb` (about 261 MB)
  - Firestore emulator jar and UI: `~/.cache/firebase/emulators` (about 148 MB)
  - Homebrew JDK `openjdk@21` 21.0.12.1: `/opt/homebrew/Cellar/openjdk@21` (about 331 MB; `brew uninstall openjdk@21`)
  - Homebrew Node 26.11.0: `/opt/homebrew/Cellar/node` (about 76 MB). The orchestrator installed it; `frontend/` still needs it.
