# IR Planner — Backend (Base Layer)

Human-in-the-loop incident-response backend: the system of record for cases,
evidence, versioned incident state, approvals, bounded simulated execution,
audit trail and reports.

Owner: Raaj (Backend, Incident State, Data & Integration).

## Status: Milestone 1, AI planning and BL-003 working

**Functional now:**

Milestone 1 (cases, evidence, incident state, audit):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/cases` | Create an incident |
| GET | `/cases/{case_id}` | Retrieve a case |
| POST | `/cases/{case_id}/evidence` | Upload CSV / JSON / TXT evidence |
| GET | `/cases/{case_id}/evidence` | List normalized evidence |
| GET | `/cases/{case_id}/state` | Current incident-state version |
| GET | `/cases/{case_id}/audit` | Audit trail |
| GET | `/health` | Health check |

Uploading evidence computes a SHA-256 of the original file, normalizes each
record with a unique evidence id and source location, stores the original on
the local filesystem, and automatically builds a new incident-state version
(observed entities + relationships + timeline).

AI planning (BL-002):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/cases/{case_id}/runs` | Run the planner; persist a plan + proposed actions |
| GET | `/cases/{case_id}/plans` | List stored plans for a case |

The planner runs behind `app/ai/langgraph_planner.py` (LangGraph over the
OpenCode Go gateway, model `deepseek-v4.1-flash`). It returns proposals only;
the backend validates every id before persisting. With no
`OPENCODE_GO_API_KEY` configured it falls back to `FakePlannerAdapter`, so
the backend works without a key.

Approvals, simulated execution and reports (BL-003):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/cases/{case_id}/actions/{action_id}/decision` | Analyst decision (`approve` / `reject`) |
| POST | `/cases/{case_id}/actions/{action_id}/execute` | Run an approved action in the bounded simulator |
| POST | `/cases/{case_id}/reports` | Generate and store a new report version (JSON + PDF) |
| GET | `/cases/{case_id}/reports/{report_id}` | Retrieve a stored report |

Execution goes through `simulator_adapter` (currently
`FakeSimulatorAdapter`; the real simulator drops in behind the same
interface). There is no list endpoint for stored actions, execution results
or reports yet (see BL-013 / BL-025 in `docs/session/Backlog.md`).

## Architecture

```
UI → FastAPI (this backend) → Firebase Admin SDK → Firestore
```

The Admin SDK runs privileged and bypasses Firestore client Security Rules,
so **backend-side validation is the security boundary** (see
`.kiro/steering/security.md`). AI output is always a proposal; approval and
execution are gated by the backend, never by the model.

Layout (see `.kiro/steering/structure.md` for the full tree and Firestore
data model):

```
app/
  api/        FastAPI routers
  schemas/    Pydantic models (case, evidence, incident_state, plan, report)
  services/   ingestion, state_manager, audit, planning, approval, execution, reporting
  database/   firebase.py (client), repositories.py (all Firestore access)
  ai/         planner_adapter.py (Protocol + fake), langgraph_planner.py (real adapter)
  simulator/  simulator_adapter.py (SimulatorAdapter + FakeSimulatorAdapter)
```

## Running locally

Requires Python 3.10+ (development uses 3.12; LangGraph requires >=3.10).

```bash
cd backend
python3 -m venv ../.venv
../.venv/bin/pip install -r requirements.txt
cp .env.example .env   # then fill in values

# run against the local Firestore emulator (no cloud project needed):
#   firebase emulators:start --only firestore
# and set in .env:  FIRESTORE_EMULATOR_HOST=localhost:8080

../.venv/bin/uvicorn app.main:app --reload
```

Open http://localhost:8000/docs for the interactive API.

## Tests

```bash
cd backend
../.venv/bin/python -m pytest -q
```

Tests use an in-memory fake Firestore (`tests/fake_firestore.py`), so they
run without the emulator or any credentials. The suite covers the Milestone 1
endpoints, persistence, state versioning, malformed/unsupported uploads,
404s, the audit trail, the planner adapter (scripted LLM), the planning
endpoints, and the approval, execution and reporting endpoints.

## Next steps (handoff)

1. Smoke-test against the Firestore emulator (tests use a fake only).
2. Add the read endpoints the UI still lacks (BL-013 stored actions /
   execution results, BL-025 report list).
