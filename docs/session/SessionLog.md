# Session Log

> Newest first. Append-only. Protocol: [README.md](README.md).
> Archived entries: none yet.

### 2026-10-09 Bounded action simulator wired into the backend (DONE)

- `backend/app/simulator/`: `catalog.py` (9 tools = the planner's
  `approved_tools`; resolves BL-008), `engine.py` (pure, deterministic),
  `environment.json` (fictional org assets + `demo` fault: CRM admin API
  down until 10:30 on the infostealer day), `BoundedSimulatorAdapter`.
- Stateless: simulated clock = latest evidence time + 5 min per action;
  history = stored action results. No SQLite / no new store (DEC-006).
- Backend wiring (small, flagged for Raaj): `execution_service` now uses
  the real adapter, passes `case_id`, stores `simulated_at` / `services` /
  `side_effects`, maps completed+not_applicable -> `not_applicable`;
  `state_manager` orders result events by `simulated_at`;
  `SIMULATOR_PROFILE` setting (`demo` | `clean`).
- Tests: `tests/test_simulator.py` (23); suite **66 passed**
  (`cd backend && ../.venv/bin/python -m pytest -q`).
- Branch `security-scenario-simulation-evaluation-lead` (Aidan).
### 2026-10-07 Analyst dashboard shell + PRODUCT.md (IN PROGRESS)

- Wrote root `PRODUCT.md` (product record, HTB-inspired dark-navy token
  palette, binding colour rules); recorded the frontend stack in `## Stack`.
- Built the React + Vite + Tailwind analyst workspace under `frontend/`:
  persistent top bar, responsive sidebar (static at lg, off-canvas drawer
  below), and the Dashboard's 5 approved regions (attention, approvals,
  agent status, recently updated, activity) over synthetic data; approval
  rows marked "not persisted" while BL-003 endpoints are stubs.
- Verified: `cd frontend && npm run build` -> green (tsc strict + vite).
  Visual pass on desktop 1440 + mobile 390 (headless Chrome); fixed sidebar
  overflow + approval/attention row overflow on mobile, reconfirmed clean.
- Impeccable detector: 1 warning only (Inter "overused") — kept by design
  for an Operate-mode tool; no errors.
- Branch `feat/frontend-workspace-fieqah` (not yet committed). See DEC-005,
  BL-009.
t.

### 2026-10-08 BL-003 approval loop implemented (IN PROGRESS)

- Approvals: `POST /cases/{id}/actions/{id}/decision` — approve/reject with
  analyst + reason; approval binds (action_id, action_version,
  state_version); stored-action statuses + audit events.
- Execution: `POST /cases/{id}/actions/{id}/execute` — the security.md
  preconditions (approved status, matching approval, state not invalidated,
  tool catalogue, target in state, evidence exists); bounded simulator;
  `execution_status` kept separate from `validation_status`; idempotent by
  execution id; ineffective → action status `failed`, effective → `verified`
  (report-schema v1.2 status set).
- Outcome → state loop (proposal §5.4.4): rebuild adds defender-side
  timeline events (approvals, rejections, action results) + action/result
  ids so re-planning can see what happened.
- Reporting: `POST/GET /cases/{id}/reports[...]` — schema-v1.2-shaped JSON
  from stored records + ReportLab PDF; unsourceable sections stay
  empty/"unknown" (no fabrication).
- Tests: 16 new; suite **43 passed**. Branch `feat/bl-003-approval-loop`;
  PR open for review.
- Notes: prototype writes are sequential (the test fake has no
  transactions); tool catalogue remains the provisional guidance allowlist
  until BL-008; decision payload to be confirmed with Syafieqah's approval
  UI.

### 2026-10-06 Live planner smoke passed; reasoning-model hardening (DONE)

- First real end-to-end run against OpenCode Go (`deepseek-v4.1-flash`):
  6 evidence items → state v1 → plan `stage=containment` with 4
  evidence-grounded actions (isolate_host, preserve_evidence,
  revoke_sessions, reset_password; POL-01 cited) + 7 remaining gaps
  (42.5s). Script: `backend/scripts/planner_smoke.py` (re-runnable).
- Fixes the smoke surfaced and shipped on `chore/planner-live-smoke`:
  - timeline entries now carry record fields (destinations, domains, byte
    counts) so the planner can ground on evidence — `state_manager.py`,
    flagged for Raaj (his layer); pinned by `test_state_detail.py`;
  - analysis prompt defines "sufficient" as enough for an *initial* plan
    (active-compromise indicators → plan + gaps), matching the scenario
    design;
  - `max_tokens` 4000→32000 and timeout 60→300s: reasoning burned the
    budget mid-thought (empty content at 4000);
  - proposal prompt pins the exact action JSON schema; validation accepts
    `tool`/`target` aliases; empty-content errors report `finish_reason`.
- Suite: **27 passed**.

### 2026-10-06 PR #3 merged — BL-002 complete (DONE)

- PR #3 merged to `main` (`b4f445a`): planner adapter, planning endpoints,
  guidance fixture and env alignment are now on `main`.
- Follow-up docs sync: `backend/README.md` updated for the implemented
  planning endpoints (`b6cc341` — committed while `main` was checked out;
  that was a branch-discipline lapse. Guard for all future commits:
  verify the current branch first, never commit on `main`).
- Live smoke test still pending `OPENCODE_GO_API_KEY` in `backend/.env`.
- Next: BL-003 (approvals → execution → reporting); BL-008 catalogue sync.

### 2026-10-06 PR #3 opened for BL-002 review (IN PROGRESS)

- Opened PR #3 (`feat/ai-planner-adapter` → `main`): planner adapter,
  planning endpoints, guidance fixture, env alignment, 24 tests passing.
- Awaiting maintainer review/merge; live smoke test to follow once
  `OPENCODE_GO_API_KEY` is set in `backend/.env`.

### 2026-10-06 Env structure aligned to the OpenCode Go provider (DONE)

- Replaced the `DEEPSEEK_*` env vars with provider-scoped `OPENCODE_GO_*`
  in `config.py`, `.env.example` and `.env`: `OPENCODE_GO_API_KEY`,
  `OPENCODE_GO_MODEL`, `OPENCODE_GO_ENDPOINT` (full documented URL
  `https://opencode.ai/zen/go/v1/chat/completions`), plus optional
  `OPENCODE_GO_MAX_TOKENS`, `OPENCODE_GO_TEMPERATURE`,
  `OPENCODE_GO_TIMEOUT_SECONDS`.
- Adapter reads all request tuning from settings and posts to the endpoint
  as configured; added a test pinning the request shape (URL, Bearer auth,
  user-agent, `x-opencode-session`, model, params). Suite: **24 passed**.
- Note: `.env` still needs the real key (`OPENCODE_GO_API_KEY=`).

### 2026-10-06 BL-002 planner adapter + planning endpoints implemented (DONE)

- `backend/app/ai/langgraph_planner.py`: LangGraph graph (analyze →
  sufficiency route → propose) over the OpenCode Go chat-completions API
  (`deepseek-v4.1-flash`); injectable LLM call for tests; local safety
  validation (Stage enum, known entity/evidence ids, tool allowlist from
  guidance, `based_on_state_version` always from the state).
- `backend/fixtures/guidance.json`: provisional policy pack (POL-01…04) +
  stage guidance + approved tool allowlist from the approved scenario doc.
- `POST /cases/{id}/runs` + `GET /cases/{id}/plans` implemented via
  `planning_service` + repository additions; `plan_created` audit event.
- Tests: 14 new (`test_planner_adapter.py`, `test_planning_api.py`);
  suite now **23 passed**.
- Branch `feat/ai-planner-adapter`; pending: live smoke test with the
  OpenCode Go key, and BL-008 catalogue sync with Aidan at integration.

### 2026-10-06 BL-002 environment ready (DONE)

- `.venv` on Python 3.12; `requirements.txt` (+ `langgraph` 1.2.13)
  installed; `backend/.env` created from the example (API key pending).
- Baseline backend suite: `9 passed` (`cd backend && ../.venv/bin/python
  -m pytest -q`).
- Firebase CLI not installed (Node 26 / npm 11 available) — needed at the
  integration step (Step 5 / BL-004).
- Next: Step 3 — planner adapter + endpoints (BL-002).

### 2026-10-06 Python floor raised to 3.10+; inputs unblocked (DONE)

- `tech.md` and `backend/README.md` updated: Python 3.10+ (development on
  3.12); 3.9 dropped — see DEC-004. `langgraph` added to
  `backend/requirements.txt`.
- OpenCode Go API structure verified against the official docs: endpoint
  `https://opencode.ai/zen/go/v1/chat/completions`, model
  `deepseek-v4.1-flash`, `Authorization: Bearer sk-...`, OpenAI-compatible
  request body; the adapter will add the recommended user-agent and
  `x-opencode-session` headers.
- Airil approved `IRP_Incident_Scenarios_draft.docx` as the source for the
  v1 guidance fixture and the provisional action vocabulary.
- Next: BL-002 implementation (adapter + LangGraph graph + planning
  endpoints).

### 2026-10-06 OpenCode Go gateway resolved from official docs (DONE)

- BL-007 confirmed via the OpenCode Go docs: base URL
  `https://opencode.ai/zen/go/v1`, OpenAI-compatible `/chat/completions`,
  model ID `deepseek-v4.1-flash` (matches DEC-003).
- Provider guidance noted for the adapter: specific user-agent +
  `x-opencode-session` header; the service is documented for
  coding-agent-style traffic (low-volume reasoning use; subscription is
  Airil's, flagged for awareness).
- Remaining input: the API key itself (Airil) before the live smoke test;
  mocked tests do not need it.
- Branch `feat/ai-planner-adapter`; next: BL-002 environment + adapter.

### 2026-10-06 Model references updated to DeepSeek V4.1 Flash (DONE)

- AI planner model aligned to the updated proposal §9: `LangGraph +
  DeepSeek V4.1 Flash` (`deepseek-v4.1-flash`) in `.kiro/steering/tech.md`,
  `backend/app/config.py`, `backend/.env.example`, `backend/README.md`, and
  the `planner_adapter.py` docstring.
- Resolved BL-005 via DEC-003 (V4.1 Flash via Airil's OpenCode Go
  subscription key; endpoint/model slug to confirm as BL-007). Added BL-008
  for the simulator action-catalogue sync (deferred to system integration).
- Historical spec/plan references updated for consistency.
- Branch `chore/deepseek-v4-1-flash`, commit `5cc12b2`.
- Next: BL-002 — implement the real planner adapter (LangGraph + V4.1
  Flash) on `feat/ai-planner-adapter`.

### 2026-10-06 Backend base layer + session notebook adoption (DONE)

- Backend Milestone 1 committed: cases, evidence ingestion, versioned
  incident state, audit trail (`950873c`).
- Planning / approvals / execution / reports remain HTTP 501 stubs with
  fake adapters (contracts fixed).
- Code-review graph built (148 nodes / 658 edges); `.code-review-graph/`
  now gitignored.
- Session notebook adopted under `docs/session/` (see DEC-001, DEC-002);
  agent triggers added (`.kiro/steering/session-notebook.md`, `AGENTS.md`).
- Next: BL-002 (real PlannerAdapter), BL-003 (approval → execution →
  reporting), BL-001 (proposal vs repo stack reconciliation).
