# Session Context

> Living snapshot. History goes in `SessionLog.md`. Decisions in
> `Decisions.md`. Open work in `Backlog.md`. Last reviewed: 2026-10-13 (GAS-lite merged; deterministic policy enforcement).

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
  #11 (`5e53c66`). Missing reads: BL-013, BL-025.
- Live planner smoke passed against OpenCode Go (BL-007): containment plan
  with 4 evidence-grounded actions + 7 gaps; planner client hardened for
  reasoning models (see `SessionLog.md`).
- Security scenario, simulation and evaluation (Aidan, branch
  `security-scenario-simulation-evaluation-lead`): bounded simulator wired
  into execution (DEC-006), synthetic incident package
  (`backend/scenarios/`, 3 scenarios + 2 variants), evaluation harness +
  scorer (`backend/evaluation/`). Calibration: oracle 12/12 checkpoints,
  unsafe 0/12, fake planner 0/12. BL-017 analysis persistence + report fill
  (2026-10-13) took the full live run to **12/12 checkpoints, 5/5 scenarios,
  mean 93.4** and cleared the report coverage (`not_produced_yet=[]` on all
  scenarios; findings 5-12, techniques 3-10 each). History: BL-031 (12/12,
  mean 92.4, PR #18), BL-038 (10/12, 3/5, PR #17), BL-014 (8/12, 2/5,
  PR #13).
  Simulator defaults to the `clean` profile; `demo` (CRM fault) is set
  explicitly by the demo / harness. Naive-timestamp crash fixed; stale
  approvals deferred to GAS-lite (DEC-007, BL-024).
  Suite **156 passed** on merged main. Live results merged via
  PR #13 (`4145f41`).
- Policy pack v1.0 (Aida, DEC-012) merged in PR #10 (`bae3f66`): 19
  structured rules (ten fields) + 8-asset list in
  `backend/fixtures/guidance.json` (`policy_pack_version` 1.0). The planner
  now retrieves stage-relevant rules and passages (deterministic retrieve
  node between analyze and propose, DEC-013); stored `policy_refs` are
  validated against the selected set, and refs outside the pack are dropped.
  Enforcement follow-ups are BL-032/BL-033; asset/fixture alignment BL-035
  and BL-036. Verification-first grounding lives in
  `backend/app/ai/skills/verification_first/SKILL.md`, embedded in both
  prompts (BL-031, DEC-014); the full live run is 12/12 with all gates
  holding.
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
  `npm run build` + `npm run test` (23 passed) green. API-mode wiring gaps
  vs the live backend: BL-013. On `link` (merged via PR #11 `5e53c66`),
  the audit shape, list order, report generation and plan/report honesty
  are reconciled with the live backend (DEC-008, DEC-009), and the
  Approvals queue reads the read-only `GET /actions` / `GET /action-results`
  (BL-027, DEC-011); follow-ups are BL-025, BL-026 and BL-027 (a)–(c).
  Backend suite **137**, frontend **75** on `main`. Product record +
  palette in root `PRODUCT.md`.
- Frontend↔backend integration: API mode loads all 7 case tabs; stored actions
  populate Response Plan and Approvals, and stored execution/validation results
  remain visible after execution. `not_applicable` is explicit, the analyst-note
  label is honest, and the infostealer fixture matches policy/scenario ids,
  roles, assets and approved tools. Dashboard and report reload reads remain
  unsupported (BL-013, BL-025); other UI follow-ups remain in BL-026/028/029.
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
