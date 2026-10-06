# IR Planner — Backend (Base Layer)

Human-in-the-loop incident-response backend: the system of record for cases,
evidence, versioned incident state, approvals, bounded simulated execution,
audit trail and reports.

Owner: Raaj (Backend, Incident State, Data & Integration).

## Status: base layer complete, Milestone 1 working

**Functional now (Milestone 1):**

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

**Stubbed for later milestones (return HTTP 501):**

- `POST /cases/{case_id}/runs`, `GET /cases/{case_id}/plans` — AI planning
- `POST /cases/{case_id}/actions/{action_id}/decision` — analyst approval
- `POST /cases/{case_id}/actions/{action_id}/execute` — simulated execution
- `POST /cases/{case_id}/reports`, `GET .../reports/{report_id}` — reporting

The service/adapter interfaces for these exist (`approval_service`,
`execution_service`, `reporting`, `planner_adapter`, `simulator_adapter`)
with the agreed contracts and `Fake*` implementations, so integration with
the AI planner (Airil) and the simulator (Aidan) can proceed against stable
shapes.

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
  services/   ingestion, state_manager, audit (+ stubbed approval/execution/reporting)
  database/   firebase.py (client), repositories.py (all Firestore access)
  ai/         planner_adapter.py (PlannerAdapter + FakePlannerAdapter)
  simulator/  simulator_adapter.py (SimulatorAdapter + FakeSimulatorAdapter)
```

## Running locally

Requires Python 3.9+ (developed/tested on 3.9).

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
run without the emulator or any credentials. The suite covers the five
Milestone 1 endpoints, persistence, state versioning, malformed/unsupported
uploads, 404s and the audit trail.

## Next steps (handoff)

1. Smoke-test against the Firestore emulator (tests use a fake only).
2. Wire the real `PlannerAdapter` (Airil / LangGraph + DeepSeek V4.1 Flash)
   behind the existing interface.
3. Implement approvals → execution (bounded simulator) → reporting in order.
