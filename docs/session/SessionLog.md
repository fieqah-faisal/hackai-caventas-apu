# Session Log

> Newest first. Append-only. Protocol: [README.md](README.md).
> Archived entries: none yet.

### 2026-10-12 PR #9 review changes: clean default, approval change deferred (DONE)

- Simulator default profile is now `clean` (`config.py`, `.env.example`,
  adapter, engine); the scenario-specific `demo` CRM fault is enabled only
  explicitly (evaluation harness, scripted demo). Tests pin both.
- Reverted the stale re-approval change (`abab1c4`): `approval_service.py`
  matches `main` again; approvals stay bound to `based_on_state_version`
  until GAS-lite lineage (DEC-007 rewritten, BL-024).
- Harness now re-plans before each further approved action instead of
  re-approving; calibration scores unchanged (oracle 12/12, unsafe 0/12,
  fake 0/12). Demo-path instructions updated for the re-plan step.
- `not_applicable` status kept and documented for later frontend mapping.

### 2026-10-11 PR #9 synced with main (DONE)

- Merged `origin/main` (PR #7 emulator smoke, PR #8 review notes) into
  `security-scenario-simulation-evaluation-lead`; conflicts only in
  `docs/session/`.
- Renumbered this branch's backlog items BL-010..019 -> BL-014..023 (main
  already used BL-009..013); removed BL-008 (resolved by the simulator
  catalogue); missing `GET /cases/{id}/actions` points to main's BL-013.

### 2026-10-11 Evaluation harness, scorer, results + re-approval fix (DONE)

- `backend/evaluation/`: harness replays each scenario through the real
  endpoints (fake Firestore, real simulator, scripted analyst), scorer
  (100 pts + safety gates), `run_eval` CLI, `SCORING_SHEET.md`,
  `TEST_PLAN.md`, `INTEGRATION_GAPS.md`, committed results.
- Results: oracle 12/12 checkpoints (ground truth reachable), unsafe 0/12
  (gates fire), fake planner 0/12 (mean 48.2). No live results yet (no key
  here) - BL-014.
- Found and fixed: executing one approved action stranded every other
  approval in the plan (stale + not re-decidable). Re-approval of stale
  approvals now allowed (DEC-007) - flagged for Raaj/Syafieqah (BL-015).
- Docs: `backend/README.md`, `.kiro/steering/structure.md`; backlog
  BL-008 closed, BL-014..023 added; DEC-006, DEC-007.
- Suite **128 passed** (`cd backend && ../.venv/bin/python -m pytest -q`).

### 2026-10-11 Synthetic incident package + ground truth (DONE)

- `backend/scenarios/`: `build_scenarios.py` (single source) generates 3
  scenarios + 2 variants: sc01 infostealer -> CRM session replay (main
  demo), sc02 phishing + prompt injection, sc03 false alarm (CHG-2026-118),
  sc01 messy CSV, sc03 ticket mismatch.
- `agent_inputs/` (uploadable batches, demo-path renders) vs
  `evaluator_only/` (checkpoint ground truth, ATT&CK mapping CSV, timeline).
  Branching via `conditions.py` on stored action results + simulated time.
- Found and fixed: a naive timestamp next to aware ones 500'd the upload
  and poisoned the case (`state_manager` sort) - flagged for Raaj.
- Tests: `tests/test_scenarios.py` (freshness, synthetic IPs/domains,
  referential integrity, no answer-key leakage, every batch ingests);
  suite **101 passed**.
- ATT&CK IDs not re-checked online (attack.mitre.org blocked here) - see
  `scenarios/README.md`.

### 2026-10-09 GAS-lite Core Tasks 1-3 implemented (DONE; 4.x/6.x gated)

- Committed the corrected spec checkpoint (`f4a964f`, notebook-only: BL-024
  renumber + the actual Backlog entry that had been missing; item later
  renamed BL-024->BL-030 at the PR #9 merge). Not pushed.
- Task 1 (schema foundation): extended `app/schemas/incident_state.py`
  backward-compatibly — added `EntityType.SESSION`; new enums
  `RelationshipType` (closed 11-value allowlist, now the type of
  `Relationship.relation`), `RelationshipCategory`, `ResponseFocus`,
  `RoutingTransition` (`re_enter`), `CreatedFrom` (Core three), `ReportStatus`;
  enriched `Entity` (evidence_ids/first_seen/last_seen/condition) and
  `Relationship` (id/category/first_seen/last_seen/attributes/action_id/
  execution_id); `IncidentState` provenance + response-situation + report
  blocks (carried, not computed); added `StateVersionMeta`. All new fields
  optional/defaulted.
- Task 2 (pure graph service): created `app/services/gas_lite.py` — pure,
  deterministic, no Firestore I/O, no LLM. Type-aware deterministic
  `entity_id` (host UPPER, account/domain lower, ip canonical,
  process/file host-prefixed + path-normalized; composite PROCESS/FILE/
  SESSION prefix handled); `extract_entities` (host/account/process/FILE from
  path/domain/ip; SESSION only from explicit `session_id`/`session_cookie_id`,
  never fabricated); `extract_relationships` (allowlisted observed
  context edges with evidence + deterministic `REL::` ids, no dangling edges);
  `dedupe_and_merge` (idempotent); `build_response_edges`
  (`action_attempted_on`, carries action_id/execution_id); effective-only
  `apply_validated_effects` (ineffective never improves condition; effective
  mutates only the target); deterministic id-ordered `build_graph`.
- Task 3 (repository read): added read-only `list_state_versions(case_id)` to
  `app/database/repositories.py` (existing functions untouched).
- Tests: added `backend/tests/test_gas_lite.py` (20 tests) covering mandatory
  obligations 1-6, 10-12 and backward-compat + determinism; full backend
  suite **64 passed** (was 44). No regressions.
- GATE respected: Tasks 4.x (state_manager integration) and 6.x
  (execution-flow integration) NOT started — blocked on PR #9
  (`state_manager.py`) merge + rebase; preserve PR #9's timezone-aware
  timeline sorting and simulator-result behaviour. `state_manager.py` and
  `execution_service.py` were NOT modified.
- Not committed/pushed (implementation): awaiting explicit approval. Changed
  files: `app/schemas/incident_state.py`, `app/services/gas_lite.py`,
  `app/database/repositories.py`, `tests/test_gas_lite.py`, `tasks.md`,
  session notebook. See BL-030, DEC-010 (item renamed BL-024->BL-030 at the PR #9 merge).
### 2026-10-09 GAS-lite incident-state specification complete (SPEC DONE, IMPL PENDING)

- Authored the GAS-lite (Graph-as-State, STAIR-inspired) spec at
  `.kiro/specs/caventas-gas-lite/` (requirements.md, design.md, tasks.md,
  .config.kiro). Requirements-first; all three documents pass spec-format
  validation. This is a SPEC checkpoint only — no backend code written yet.
- Scope: a backward-compatible extension of the existing versioned
  incident state (Raaj's base layer: `app/schemas/incident_state.py`,
  `app/services/state_manager.py`, `app/database/repositories.py`) plus a
  new PURE `app/services/gas_lite.py` graph builder and two additive read
  endpoints (`GET /cases/{id}/states`, `/states/{version}`). STAIR-inspired,
  not a reproduction; no Firestore replacement, no graph DB, no six agents.
- Key design decisions captured (see DEC-010): enriched Entity/Relationship
  (evidence_ids, first/last_seen, condition; deterministic type-aware ids;
  `RelationshipType` closed-allowlist enum; context/attack/response
  categories); IncidentState provenance (`parent_version`, `change_reason`,
  `created_from`) + optional response-situation and report-status blocks
  CARRIED but not computed in Core; condition mutates only on
  validated-effective results; three-case prior-state handling
  (unknown→abort; v0→v1 parent=None; pointer≥1 missing snapshot→abort).
- Correction pass applied before implementation: all 15 mandatory-obligation
  tests are mandatory (no optional markers); `process_start.path`→FILE and
  session only from an explicit `session_id`/`session_cookie_id` (never
  fabricated; planner_smoke has no session field so a synthetic test record
  is used); tool name corrected to `revoke_sessions`; response edges
  reference the action-result record (no separate "validation record";
  approval authoritative via `action_id`); assessment/routing population,
  report-section invalidation, full action-lifecycle projection and
  non-material version suppression all moved to Follow-on; `re_enter` used
  consistently.
- INTEGRATION WARNING: PR #9 modifies `state_manager.py` and must be
  merged/rebased before the state-manager and execution-flow integration
  (tasks 4.x, 6.x) are finalized; preserve PR #9's timezone-aware timeline
  sorting and simulator-result behaviour. See BL-030.
- Numbering note: DEC-010 is unique; the GAS-lite backlog item was renamed
  BL-020->BL-030 at the PR #9 merge to avoid colliding with PR #9's
  BL-014..BL-024 range.
- Branch intended for implementation: `feat/gas-lite-state-fieqah`. Not yet
  started; stopped at the corrected spec checkpoint for Syafieqah/Raaj review.

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

### 2026-10-08 PR #8 (frontend) merged; PR #7 synced (DONE)

- PR #8 merged (`3a6a323`): React/Vite frontend — dashboard, create-case
  workflow, 7-tab case workspace, fixture/real providers, DTO + mapping
  layers, vitest tests, `.kiro` IA specs, `PRODUCT.md`, DEC-005. No backend
  or `firebase.json` changes.
- `RealProvider` documents the merged BL-003 contract accurately (incl. the
  action-status reconciliation) and honestly marks unavailable operations.
  Gaps it exposes → **BL-013**: global `GET /cases`, stored-actions read,
  plan-detail, execution-results list; plus the audit DTO field mismatch
  (`kind/at/event_id` vs the real `event_type/timestamp/audit_id`).
- PR #7 synced by merging `main` into the branch — no conflicts, backend
  suite still 44 passed; draft and ready for merge.

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

### 2026-10-08 Syafieqah's frontend branch landed; review (IN PROGRESS)

- `feat/frontend-workspace-fieqah` (1 commit, based on b6cc341 — behind
  main): React + Vite + Tailwind analyst shell under `frontend/` (mock
  data, `npm run build` green), root `PRODUCT.md`, and DEC-005 proposing
  the React stack over steering's Streamlit note (flagged for team veto).
- No backend / `firebase.json` changes — clean separation. But the branch's
  docs assume BL-003 endpoints are still stubs (stale) and its action-state
  / audit-event names don't match the live contracts (`proposed/executed/
  effective` vs `awaiting_approval/approved/rejected/verified/failed`;
  `approval_recorded` vs `action_approved|action_rejected`;
  `evidence_ingested` vs `evidence_uploaded`), so it needs a rebase onto
  current `main` plus a wiring pass before merge.
- Merge care: notebook files edited on both sides (SessionLog top,
  SessionContext bullets); BL number collision — her "BL-009" = frontend vs
  our BL-009 = cloud-Firebase coordination.
- PR #7 (BL-004) has no dependency on her branch; kept draft per Airil's
  call. Syafieqah: Firebase project not initialized yet ("frontend first").

### 2026-10-08 Firestore emulator smoke passed — BL-004 (DONE)

- Ran the full API flow against the local Firestore emulator (firebase-tools
  15.33 via npx; `JAVA_HOME` from brew openjdk; project ir-planner-dev):
  case → evidence (6 items, state v1) → plan → approve → execute
  (`completed`/`ineffective`) → report + PDF; state v2 and all audit events
  verified. Re-runnable script: `backend/scripts/emulator_smoke.py`.
- Found + fixed a real bug: firebase-admin 7.x always resolves credentials,
  so the emulator path failed with `DefaultCredentialsError`. `firebase.py`
  now initializes with an explicit anonymous credential in emulator mode;
  pinned by `tests/test_firebase_emulator.py`.
- Suite: **44 passed**. Note: firebase-tools 15 needs Java 21+ (brew
  openjdk@25/26 present; the default java 17 is too old).

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
