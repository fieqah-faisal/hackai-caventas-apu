# Session Context

> Living snapshot. History goes in `SessionLog.md`. Decisions in
> `Decisions.md`. Open work in `Backlog.md`. Last reviewed: 2026-10-06.

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
- Planning / approvals / execution / reports are HTTP 501 stubs;
  `FakePlannerAdapter` and `FakeSimulatorAdapter` fix the integration
  contracts.
- Storage: Google Cloud Firestore via Firebase Admin SDK; uploaded
  originals on the local filesystem (`backend/uploads/`, gitignored) with
  SHA-256 recorded in Firestore.
- Code-review graph built (148 nodes / 658 edges); local data in
  `.code-review-graph/` (gitignored).
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
