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
- Approval → simulated execution → reporting implemented (BL-003, PR open):
  decision binding + security preconditions + outcome→state rebuild +
  v1.2 report JSON/PDF; suite now **43 passed**. Tool catalogue still
  provisional (BL-008); fake adapters remain the fallback without a key.
- Live planner smoke passed against OpenCode Go (BL-007): containment plan
  with 4 evidence-grounded actions + 7 gaps; planner client hardened for
  reasoning models (see `SessionLog.md`).
- Security scenario, simulation and evaluation (Aidan, branch
  `security-scenario-simulation-evaluation-lead`): bounded simulator wired
  into execution (DEC-006), synthetic incident package
  (`backend/scenarios/`, 3 scenarios + 2 variants), evaluation harness +
  scorer (`backend/evaluation/`). Calibration: oracle 12/12 checkpoints,
  unsafe 0/12, fake planner 0/12; **no live-planner results yet** (BL-014).
  Simulator defaults to the `clean` profile; `demo` (CRM fault) is set
  explicitly by the demo / harness. Naive-timestamp crash fixed; stale
  approvals deferred to GAS-lite (DEC-007, BL-024).
  Suite **129 passed** after syncing with main.
- Firestore emulator smoke passed (BL-004): full API flow against the real
  emulator; emulator credential bug fixed (anonymous credential path).
- Storage: Google Cloud Firestore via Firebase Admin SDK; uploaded
  originals on the local filesystem (`backend/uploads/`, gitignored) with
  SHA-256 recorded in Firestore.
- Code-review graph built (148 nodes / 658 edges); local data in
  `.code-review-graph/` (gitignored).
- Frontend (BL-009): analyst workspace scaffolded under `frontend/`
  (React + Vite + Tailwind, DEC-005) — dashboard shell + 5 regions on
  synthetic data; `npm run build` green. Approvals/activity not yet wired to
  live endpoints (BL-003). Product record + palette in root `PRODUCT.md`.
- GAS-lite incident-state (BL-030): STAIR-inspired enrichment of the
  versioned incident state has its spec committed and **Core Tasks 1-3
  implemented** (schema, pure gas_lite service, repository read; backend
  suite 64 passed; implementation not yet committed/pushed). Spec at
  `.kiro/specs/caventas-gas-lite/` (requirements/design/tasks, format-valid);
  decisions in DEC-010. Core = enriched Entity/Relationship schemas, a pure
  `app/services/gas_lite.py` graph builder, three-case prior-state handling,
  and additive `GET /cases/{id}/states[/{version}]` endpoints; assessment,
  routing population, report-section invalidation and non-material version
  suppression are Follow-on. Blocked on PR #9 (state_manager.py) for the
  state-manager / execution-flow integration; preserve its timezone-aware
  sorting and simulator-result behaviour. Target branch
  `feat/gas-lite-state-fieqah`.
- Timeline: internal feature freeze 8/10; submission 15/10 (root README).

## Architecture

- `backend/app/api/` — FastAPI routers
- `backend/app/services/` — ingestion, state_manager, audit; approval /
  execution / reporting stubs
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
