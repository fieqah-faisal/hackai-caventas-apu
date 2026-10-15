# Caventas promo video

`caventas-promo.mp4` — 1920×1080, 30 fps, about 3 minutes, with narration,
an original score and a separate caption file (`caventas-promo.srt`).

Built from `main` at `9253749` (PR #26 merged). Every product shot is a real
recording of the analyst workspace (`VITE_DATA_MODE=api`) driving the real
FastAPI backend. Nothing in the UI was mocked or edited.

## Storyline

One continuous incident, the main demo scenario `sc01_infostealer`:

unsigned installer on SALES-LT-07 → browser passwords and cookies read →
archive uploaded to 203.0.113.45 → plan v1 → password reset **rejected with a
reason**, host isolation **approved and simulated** → session revocation only
**partially works** (CRM admin API in maintenance) → new evidence: the stolen
CRM session is replayed from 198.51.100.23 and 1,200 customer records are
exported → older approvals flagged **stale** → re-plan against state v8 →
`disable_account` **refused for a SOC analyst** (POL-02) and approved as IT
manager → revocation **validated effective** → audit trail → structured report
and its PDF.

| # | Chapter | Source |
|---|---------|--------|
| — | Cold open (alert storm) | Motion graphic. Event lines are the scenario's real records; the alert queue is a dramatisation. |
| — | Brand | Logo supplied by the team. |
| 01–02 | Create case, ingest evidence | Screen recording: Create Case flow, 5 evidence files (batch 1 split by source). |
| 03 | Reconstruct | Screen recording (Evidence detail with SHA-256, Timeline) + graph drawn from the real `GET /cases/{id}/states/5` snapshot. |
| 04 | Agent analysis | Decision trace drawn from the planner's logged node outputs (not model reasoning). |
| 05 | Evidence-backed plan | `GET /plans` analysis panel + Approvals tab recording. |
| 06 | Human approval | Approvals tab recording: reject with reason, approve, bounded simulation, partial failure. |
| 07 | Continuous replanning | Real API calls (evidence upload, 409 for a stale approval, re-plan) + Timeline/Approvals recordings. |
| 08 | Accountability | Approvals recording (policy 403, IT-manager approval) + real `GET /audit`. |
| 09 | Structured report | Report tab recording + pages of the real server-rendered PDF. |

## What is real, and what is not

- **UI and backend**: real code from `main`. The backend ran with the
  in-memory Firestore double from `backend/tests/fake_firestore.py` (same
  repository layer) and `SIMULATOR_PROFILE=demo`, the documented demo profile.
- **Planner**: the real `LangGraphPlannerAdapter` graph ran (analyze → route →
  retrieve → propose → adapter validation → backend policy checks), but the
  two LLM calls were **replayed**, because no planner API key was available
  when recording. The replayed plans copy the stage, tools, targets, cited
  records, policy refs and missing-evidence lists of the recorded live run in
  `backend/evaluation/results/live.json` (sc01 CP1/CP2); three rationales are
  verbatim from the BL-038 live smoke. Findings and the remaining prose were
  written for the demo in the planner's output style. See
  `pipeline/replay_plans.json` (`_provenance`). The closing card says so.
- **Later evidence**: batch 2 was rendered with `scenarios/conditions.py`
  from the case's actual action results, exactly as the evaluation harness
  does (branch `replay_succeeded`).
- **Terminal scenes**: the HTTP calls were made against the running backend
  and the responses shown are the real ones; they are drawn as `curl` for
  readability. The 409 shown is the real response for the `disable_account`
  approval made at state v8 after the case moved to v9 (the terminal comment
  says this).
- **Motion graphics**: the intro, transitions and end card are illustrative.
  Data-driven scenes (graph, decision trace, chain on the end card) use the
  recorded case's real values.
- **Narration**: synthetic voice (Kokoro TTS, `af_heart`). **Music**: an
  original score synthesised in `pipeline/music.py` (no samples).

## Requested beats that are not shown, and why

The brief asked for a few things the product does not do yet. They are left
out rather than mocked:

- **Incident graph view in the UI** — the backend builds the graph
  (GAS-lite); the workspace has no graph view. The video draws the real
  snapshot as a motion graphic, captioned with its API source.
- **Agent-processing animation in the UI** — not in the product; shown as a
  decision-trace graphic from logged node outputs instead.
- **Analyst notes, dispute/confirm a finding, request more evidence, sign-off**
  — not implemented in API mode (request-more-investigation exists only in
  fixture mode; report `sign_off` is null). The video shows the accountability
  that does exist: mandatory reject reasons, role-gated approvals, analyst
  notes ingested as evidence, and the audit trail.
- **"Upload more evidence" / "Re-plan" buttons in the workspace** — not in the
  UI; both go through the API (`POST /evidence`, `POST /runs`), shown as such.
- **PDF download from the UI** — the button is disabled; the PDF is rendered
  server-side, so the video shows its pages instead of a download.
- **Classification on the Analysis tab** — in API mode that tab reads the
  incident state, so it shows "Not yet classified"; the planner's
  classification lives in the plan document and the report. The video shows
  it there.

UI inconsistencies visible in the footage are tracked in
`docs/session/Backlog.md` (BL-043..BL-045).

## Reproducing

`pipeline/` holds the scripts as they were run (absolute scratch paths at the
top of each script need adjusting):

1. `serve_demo.py <backend_dir>` — backend with the fake Firestore, demo
   simulator profile and replayed planner; logs `trace.jsonl`.
2. Frontend: `VITE_DATA_MODE=api npx vite` in `frontend/`.
3. `record.js`, `record_report.js` — Playwright + CDP screencast at 2×
   (`--force-device-scale-factor=2`); `render_batch.py` renders batch 2.
4. `gen_sent.py` + `narration.json` — narration; `music.py` — score.
5. `scenes_src/` + `render_scene.js` — motion graphics; `edl.py` +
   `composite.py` — footage edit; `assemble.py` — final mix and captions.
