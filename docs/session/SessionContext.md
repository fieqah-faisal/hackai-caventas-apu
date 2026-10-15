# Session Context

> Living snapshot. History goes in `SessionLog.md`. Decisions in
> `Decisions.md`. Open work in `Backlog.md`. Last reviewed: 2026-10-15 (investigation timeline and auditable decision trace).

## Project

Caventas Incident Response Planner — HackAI 2026, Track 1 (Agentic Cyber
Defense), Problem Statement 04. Five-person APU team. Human-in-the-loop:
the system recommends, analysts approve, and all execution is simulated.

## How to run

Backend (FastAPI + Firestore):

```bash
cd backend
python3 -m venv ../.venv
../.venv/bin/pip install -r requirements.txt
cp .env.example .env   # fill values; or use the Firestore emulator
# firebase emulators:start --only firestore
#   → set FIRESTORE_EMULATOR_HOST=localhost:8080 in .env
../.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000/docs
```

Tests: `cd backend && ../.venv/bin/python -m pytest -q` (in-memory fake
Firestore; no credentials needed).

## Current state

- Milestone 1 backend complete at `950873c`: cases, evidence ingestion,
  versioned incident state, audit trail.
- Planning implemented and merged (BL-002, PR #3): real LangGraph adapter
  + `/runs` + `/plans` endpoints, guidance fixture, 24 tests passing on
  `main`.
- Approval → bounded simulated execution → reporting merged (BL-003, PR #6;
  simulator PR #9): decision binding + security preconditions +
  outcome→state rebuild + v1.2 report JSON/PDF. The simulator defaults to
  `clean` and uses the approved 9-tool catalogue; `demo` is explicit.
  Read-only actions/results and newest-plan report selection merged in PR
  #11 (`5e53c66`). Persisted case/dashboard and latest-report reads were added
  on `chore/final-integration-fieqah`.
- Live planner smoke passed against OpenCode Go (BL-007): containment plan
  with 4 evidence-grounded actions + 7 gaps; planner client hardened for
  reasoning models (see `SessionLog.md`).
- Security scenario, simulation and evaluation (Aidan, branch
  `security-scenario-simulation-evaluation-lead`): bounded simulator wired
  into execution (DEC-006), synthetic incident package
  (`backend/scenarios/`, 3 scenarios + 2 variants), evaluation harness +
  scorer (`backend/evaluation/`). Calibration: oracle 12/12 checkpoints,
  unsafe 0/12, fake planner 0/12 (fake 1/12 · 42.9 post-policy-guard).
  BL-020 untrusted-evidence marking (merged) and BL-041 incident_type enum
  (branch) reran live: **12/12 checkpoints, 5/5 scenarios, mean 92.7**
  (branch history: 95.5 pre-merge, 93.4 post-policy-guard); injection gates
  hold; report coverage complete.
  History: BL-017 (12/12, 93.4, PR #19), BL-031 (92.4, PR #18), BL-038
  (10/12, PR #17), BL-014 (8/12, PR #13).
  Simulator defaults to the `clean` profile; `demo` (CRM fault) is set
  explicitly by the demo / harness. Naive-timestamp crash fixed; stale
  approvals deferred to GAS-lite (DEC-007, BL-024).
  Suite **214 passed** on this branch (212 on main). Live results merged via
  PR #13 (`4145f41`).
- Policy pack v1.0 (Aida, DEC-012) merged in PR #10 (`bae3f66`): 19
  structured rules (ten fields) + 8-asset list in
  `backend/fixtures/guidance.json` (`policy_pack_version` 1.0). The planner
  now retrieves stage-relevant rules and passages (deterministic retrieve
  node between analyze and propose, DEC-013); stored `policy_refs` are
  validated against the selected set, and refs outside the pack are dropped.
  Enforcement is deterministic in the backend (PR #22 policy guard, DEC-010;
  BL-032/BL-018/BL-019 closed); remaining follow-up BL-033. Asset/fixture
  alignment BL-035 and BL-036. Verification-first grounding lives in
  `backend/app/ai/skills/verification_first/SKILL.md`, embedded in both
  prompts (BL-031, DEC-014); untrusted-evidence marking lives in
  `backend/app/ai/skills/untrusted_evidence/SKILL.md` with full state
  descriptions and catalogue target-type validation (BL-020, DEC-016); the
  full live run is 12/12 with all gates holding.
- Report schema v1.3 (Aida, DEC-017) in `docs/report-schema/`: the contract
  for the report JSON. BL-041's constrained `incident_type` enum is merged.
  BL-040/BL-042 are complete: reports persist current-state/latest-plan
  provenance and staleness, increment report versions, keep every historical
  action's own plan/state/phase, expose deterministic action-policy fields,
  and carry planner model, finding status and affected-entity evidence IDs.
  The typed frontend renders every v1.3 section and does not count unknown or
  not-assessed placeholders as populated. Remaining fill-ins are BL-033.
- The additive analyst-report view is implemented as template schema 2.0 while
  preserving every v1.3 top-level field. Backend assembly derives overview,
  prioritized current-state findings, material chronology, entity relevance,
  action lifecycle, risk and appendices from authoritative stored records. A
  shared typed contract drives the responsive Report tab and professional A4
  ReportLab renderer; old stored reports receive conservative frontend defaults.
  Full infostealer and false-alarm tests enforce generic reuse and prevent false
  compromise claims. Oversized untrusted fields are bounded in report summaries
  and PDF cells so malformed evidence cannot break document generation.
- Investigation audit views are additive to GAS-lite and existing lifecycle
  stores (DEC-019). `GET /timeline` exposes a pure allowlisted current-state
  chronology; asynchronous analysis runs own append-only, state-bound safe
  trace steps; `GET /investigation-activity` joins reviews, approvals,
  rejections, results and selected audits without replacing or mutating them.
  Reports immutably copy the structured timeline, operational trace, activity,
  rejection reasons and sign-off for shared web/PDF rendering. The responsive
  timeline supports sorting/filtering/evidence links, and stale plans remain
  visible but disabled as review targets.
- Firestore emulator smoke passed (BL-004): full API flow against the real
  emulator; emulator credential bug fixed (anonymous credential path).
  Re-confirmed by the `link` UI runs (S2/S5/S6).
- Storage: Google Cloud Firestore via Firebase Admin SDK; uploaded
  originals on the local filesystem (`backend/uploads/`, gitignored) with
  SHA-256 recorded in Firestore.
- Code-review graph built (966 nodes / 7335 edges); local data in
  `.code-review-graph/` (gitignored).
- Frontend (BL-009): analyst workspace under `frontend/` (React + Vite +
  Tailwind, DEC-005), merged in PR #8 (`3a6a323`): dashboard, create-case
  flow, 7-tab case workspace, fixture|api data providers (`VITE_DATA_MODE`);
  `npm run build` + `npm run test` (23 passed) green. On `link` (merged via
  PR #11 `5e53c66`),
  the audit shape, list order, report generation and plan/report honesty
  are reconciled with the live backend (DEC-008, DEC-009), and the
  Approvals queue reads the read-only `GET /actions` / `GET /action-results`
  (BL-027, DEC-011); follow-ups are BL-025, BL-026 and BL-027 (a)–(c).
  Main's pre-integration verification was backend **212**, frontend **75**,
  with a green production build. Product record + palette are in root
   `PRODUCT.md`.
- Frontend branding uses the supplied complete Caventas lockup in header,
  sidebar organization branding and About page; organization/profile display
  defaults are Caventas SOC / Caventas SOC Analyst. The supplied asset has no
  separate compact icon variant, so the favicon remains unchanged.
- Frontend↔backend integration: API mode loads all 7 case tabs; stored actions
  populate Response Plan and Approvals, and stored execution/validation results
  remain visible after execution. `not_applicable` is explicit, the analyst-note
  label is honest, and the infostealer fixture matches policy/scenario ids,
  roles, assets and approved tools. Persisted `GET /cases` now backs the real
  Dashboard and Cases page; latest reports survive reload and exact generated
  PDFs download through the API. Direct case/evidence refresh, all workspace
  tabs, long-running planning status/duplicate prevention and responsive review
  actions passed real browser acceptance. Other UI follow-ups remain in
  BL-026/028/029. The final GAS-lite analyst integration adds a read-only
  Incident Graph with state history/diff and provenance, persisted case-ID and
  plan-analysis overview, repeat evidence uploads with stale-plan warning,
  explicit re-analysis and backend-persisted agent progress. Active-run
  discovery and structured duplicate recovery feed shell-level case-keyed
  polling, a persistent indicator and an accessible minimisable robot dialog
  across route changes and refresh. The Incident Graph now uses deterministic
  left-to-right dependency ranks, explicit source/target handles, closed
  semantic arrowheads, neighbourhood emphasis and a direction legend while
  preserving immutable stored relationships. The additive analysis-run API
  keeps `/runs` compatible; process-interruption recovery is tracked in BL-044.
  Synthetic deterministic browser acceptance covers two
  bound plans, three immutable states, an approved bounded simulation, a
  response edge and a reloadable report/PDF; live planner BL-043 remains open.
- GAS-lite incident-state (BL-030, **Core complete**): STAIR-inspired
  (not a STAIR reproduction) enrichment of the versioned incident state.
  All Core Tasks 1-8 implemented on `feat/gas-lite-state-fieqah`; merged with
  the latest `main` (policy pack v1.0, API wiring, stage retrieval,
  verification-first skill, analysis persistence). Caventas stores immutable,
  versioned incident-state graph snapshots in Firestore (append-only, pointed
  to by `current_state_version`); the graph is built by the pure
  `app/services/gas_lite.py` (no Firestore I/O, no LLM) while `state_manager`
  owns persistence + the record-field timeline (PR #9 timezone-aware sort /
  `simulated_at` ordering preserved). Planning is bound to an exact state
  version; a stale approval requires a new planning run and a replacement
  action. Evidence and response relationships are record-grounded; AI
  recommendations are not authorization; actions are bounded simulations;
  execution and effectiveness are distinct (only a validated-`effective`
  outcome applies its allowlisted condition change). Additive
  `GET /cases/{id}/states[/{version}]` expose immutable history;
  `GET /cases/{id}/state` is unchanged. Evaluation calibration regenerated
  after entity enrichment (oracle 12/12, unsafe 0/12, fake mean 48.2->42.9).
  Scenario freshness test made cross-platform (BL-031 closed). Spec at
  `.kiro/specs/caventas-gas-lite/`; decisions in DEC-010. Follow-on:
  planner-populated routing/assessment, report-section invalidation,
  non-material version suppression, frontend graph visualisation.
- Deterministic policy enforcement (BL-032/018/019, merged into `feat/gas-lite-state-fieqah`): `app/services/policy_service.py` derives the required approver role, target asset type, evidence validity and POL-01 preserve-before-reimage from `guidance.json` + stored records — never the planner's `policy_refs`. `approver_role` (soc_analyst|it_manager|dpo) is on the decision request, approval record and audit; approval returns 403 on an insufficient role, execution re-checks role/evidence/sequencing (409 + audit, no result), unknown assets fail closed. Declared-role prototype (no auth yet). Backend 205 passed, frontend 75 passed, build green.
- Planner prompts explicitly delimit incident-state/evidence content as
  untrusted data and reject embedded instructions; backend enforcement remains
  the authorization boundary. Final-integration focused checks: backend 42,
  frontend 79 plus clean typecheck (2026-10-14).
- Production packaging is a two-container Compose stack: non-root FastAPI
  backend plus nginx-served API-mode frontend (`:8088`), with `/api` proxying,
  health checks and Windows-host emulator access through
  `host.docker.internal:8080`. Build contexts exclude credentials and `.env`.
- Final verification (2026-10-14): backend **206 passed**; frontend strict
  typecheck, **80 tests** and production build passed; Compose config, both
  image builds/health checks, full and abbreviated emulator-backed API-mode
  workflows through nginx, diff check and changed-file secret scan passed.
- Post-repair verification (2026-10-14): backend **211 passed**; frontend
  strict typecheck, **83 tests**, production build, Compose config and both
  Docker image builds passed. Real API-mode acceptance produced a persisted,
  reloadable report and valid PDF. The one permitted post-acceptance live
  planner request returned HTTP 502 without persisting a plan (BL-043); the UI
  kept the request singular and surfaced failure without false navigation.
- Synchronization verification (2026-10-14): `origin/main` at `f6f002e` is
  merged locally without rebasing. Main's BL-020 skill, full state evidence
  descriptions and target-type guard coexist with integration packaging and
  browser repairs. Backend **218 passed**; frontend strict typecheck, **83
  tests** and production build passed; Compose config and diff checks passed.
- Post-merge API-mode acceptance (2026-10-14): the complete assertion-backed
  browser workflow passed without a live-provider retry. Primary navigation,
  dashboard actions and the approval bell no longer expose unsupported
  placeholder pages; retired direct URLs redirect to persisted Cases. Case
  creation/evidence, refresh, every workspace tab, report reload/PDF download,
  responsive review controls and single-request planning pending state passed.
- Investigation-audit verification (2026-10-15): backend **257 passed**;
  frontend strict typecheck, **109 tests in 20 files**, production build,
  Compose config and both image builds passed. Deterministic nginx-routed
  acceptance confirmed the typed timeline, 8 append-only run steps, unified
  rejection/sign-off activity, immutable report snapshot and 24,913-byte PDF.
  No live-provider request was made.
- Corrective integration gate (2026-10-14): backend **223 passed**; frontend
  strict typecheck, **95 tests in 17 files**, production build, Compose config
  and diff checks passed. Isolated deterministic browser acceptance verified
  active-run duplicate recovery, navigation persistence, refresh recovery,
  minimisation/reopening and directed graph arrows without a live-provider call.
- Final `origin/main` integration gate (2026-10-14): the no-commit merge of
  BL-041 was resolved with no application-code conflicts, then structured
  reporting BL-040/BL-042 was completed. Backend **227 passed**; frontend
  strict typecheck, **97 tests in 17 files**, production build, Compose config,
  both image builds and recreated container health checks passed. Deterministic
  API-mode browser acceptance used `FakePlannerAdapter` and verified states
  1/2/3, plans bound to 1/2, response edge, persisted state-v3/plan-v2 stale
  report disclosure, per-action provenance, refresh recovery and a valid
  13,405-byte PDF. No live planner request was made; BL-043 remains open.
- Timeline: internal feature freeze 8/10; submission 15/10 (root README).

## Architecture

- `backend/app/api/` — FastAPI routers
- `backend/app/services/` — ingestion, state_manager, planning_service,
  approval_service, execution_service, audit_service, reporting
- `backend/app/database/` — Firestore client + repositories
- `backend/app/ai/planner_adapter.py` — AI boundary (LangGraph + DeepSeek
  V4.1 Flash)
- `backend/app/simulator/` — action simulator boundary
- Full tree and Firestore data model: `.kiro/steering/structure.md`
- Stack rules: `.kiro/steering/tech.md`; security: `.kiro/steering/security.md`;
  product: `.kiro/steering/product.md`

## User rules

1. Never work on `main` — always a feature branch.
2. Synthetic incident data only — never real systems, people, or data.
3. No secrets, credentials, or PII in any file.
4. Update the session notebook after every task; never batch.
5. `.kiro/steering/*.md` is the current implementation truth; known
   divergence from the original proposal is tracked in `Backlog.md` (BL-001).

## Links

- Open work: [Backlog.md](Backlog.md)
- History: [SessionLog.md](SessionLog.md)
- Decisions: [Decisions.md](Decisions.md)
- Protocol: [README.md](README.md)
