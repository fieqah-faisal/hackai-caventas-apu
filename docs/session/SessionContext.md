# Session Context

> Living snapshot. History goes in `SessionLog.md`. Decisions in
> `Decisions.md`. Open work in `Backlog.md`. Last reviewed: 2026-10-12.

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
- Approval → simulated execution → reporting merged (BL-003, PR #6
  `b93fa6c`): decision binding + security preconditions + outcome→state
  rebuild + v1.2 report JSON/PDF; suite **44 passed** on `main`@`3cecd3e`.
  Tool catalogue still provisional (BL-008). Without a key the planner
  falls back to the fake adapter; the simulator on `main` is still the fake
  (bounded simulator pending on `security-scenario-simulation-evaluation-lead`).
  On `link` (unmerged): read-only `GET /cases/{id}/actions` +
  `/action-results` (BL-027, DEC-011) and newest-plan-by-`created_at` in
  reports; suite **52 passed**. Missing reads: BL-013, BL-025.
- Live planner smoke passed against OpenCode Go (BL-007): containment plan
  with 4 evidence-grounded actions + 7 gaps; planner client hardened for
  reasoning models (see `SessionLog.md`).
- Security scenario, simulation and evaluation (Aidan, branch
  `security-scenario-simulation-evaluation-lead`): bounded simulator wired
  into execution (DEC-006), synthetic incident package
  (`backend/scenarios/`, 3 scenarios + 2 variants), evaluation harness +
  scorer (`backend/evaluation/`). Calibration: oracle 12/12 checkpoints,
  unsafe 0/12, fake planner 0/12; BL-014 full live run passed 2/5 scenarios
  and 8/12 checkpoints: sc01 FAIL (CP3 `no_collateral_targets`), messy PASS,
  sc02 PASS, sc03 FAIL (CP1 `no_forbidden_actions`, CP2
  `no_collateral_targets`), mismatch FAIL (CP1 `no_forbidden_actions`).
  Simulator defaults to the `clean` profile; `demo` (CRM fault) is set
  explicitly by the demo / harness. Naive-timestamp crash fixed; stale
  approvals deferred to GAS-lite (DEC-007, BL-024).
  Suite **137 passed** after syncing with main.
- Firestore emulator smoke passed (BL-004): full API flow against the real
  emulator; emulator credential bug fixed (anonymous credential path).
  Re-confirmed by the `link` UI runs (S2/S5/S6).
- Storage: Google Cloud Firestore via Firebase Admin SDK; uploaded
  originals on the local filesystem (`backend/uploads/`, gitignored) with
  SHA-256 recorded in Firestore.
- Code-review graph built (148 nodes / 658 edges); local data in
  `.code-review-graph/` (gitignored).
- Frontend (BL-009): analyst workspace under `frontend/` (React + Vite +
  Tailwind, DEC-005), merged in PR #8 (`3a6a323`): dashboard, create-case
  flow, 7-tab case workspace, fixture|api data providers (`VITE_DATA_MODE`);
  `npm run build` + `npm run test` (23 passed) green. API-mode wiring gaps
  vs the live backend: BL-013. On `link` (unmerged), the audit shape, list
  order, report generation and plan/report honesty are reconciled with the
  live backend (DEC-008, DEC-009), and the Approvals queue reads the new
  read-only `GET /actions` / `GET /action-results` (BL-027, DEC-011);
  follow-ups are BL-025, BL-026 and BL-027 (a)–(c). On `link`: backend
  52 tests, frontend 75. Product record + palette in root `PRODUCT.md`.
- Frontend↔backend link (`link`, unmerged, not pushed): API mode verified
  end to end on the Firestore emulator (2026-10-09 S6). All 7 case tabs
  load real data; approve/reject/execute/report run from the UI with
  execution and validation shown apart; audit maps the real shape (no UI
  surface yet). Dashboard is honestly "unsupported" (BL-013). Open:
  BL-013, BL-025..BL-029.
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
