# IR Planner — Backend (Base Layer)

Human-in-the-loop incident-response backend: the system of record for cases,
evidence, versioned incident state, approvals, bounded simulated execution,
audit trail and reports.

Owner: Raaj (Backend, Incident State, Data & Integration).

## Status: Milestone 1 + AI planning working

**Functional now:**

Milestone 1 (cases, evidence, incident state, audit):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/cases` | Create an incident |
| GET | `/cases/{case_id}` | Retrieve a case |
| POST | `/cases/{case_id}/evidence` | Upload CSV / JSON / TXT evidence |
| GET | `/cases/{case_id}/evidence` | List normalized evidence |
| GET | `/cases/{case_id}/state` | Current incident-state version |
| GET | `/cases/{case_id}/states` | List immutable state-version metadata (GAS-lite) |
| GET | `/cases/{case_id}/states/{version}` | Full immutable snapshot for one version (GAS-lite) |
| GET | `/cases/{case_id}/audit` | Audit trail |
| GET | `/health` | Health check |

Uploading evidence computes a SHA-256 of the original file, normalizes each
record with a unique evidence id and source location, stores the original on
the local filesystem, and automatically builds a new immutable incident-state version. The
entity/relationship graph (hosts, accounts, IPs, domains, processes,
files, sessions; typed allowlisted relations; response edges; validated
effects; ATT&CK ids) is built by the pure `app/services/gas_lite.py`
service (no Firestore I/O, no LLM); `state_manager` owns persistence and
the timeline. Each change appends a new version pointed to by
`current_state_version` — history is never overwritten (GAS-lite,
STAIR-inspired incident-state).

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

Approvals, bounded simulated execution and reporting (BL-003):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/cases/{case_id}/actions/{action_id}/decision` | Analyst approve / reject |
| POST | `/cases/{case_id}/actions/{action_id}/execute` | Run an approved action in the bounded simulator |
| POST | `/cases/{case_id}/reports` | Generate a report from stored records |
| GET | `/cases/{case_id}/reports/{report_id}` | Retrieve a stored report |

Approval is created by the backend, never by AI output. Execution and
effectiveness are distinct: a `completed` execution with an `ineffective`
validation does NOT improve a target entity's condition — only a validated
`effective` outcome applies its allowlisted condition change. A stale approval
(one bound to a superseded state version) requires a new planning run and a
replacement action rather than silent re-use. The proposal, approval,
execution and validation records are each stored and immutable; GAS-lite adds
an `action_attempted_on` response edge referencing the stored `action_id` and
`execution_id` without replacing those records.

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
  services/   ingestion, state_manager, audit, planning (+ stubbed approval/execution/reporting)
  database/   firebase.py (client), repositories.py (all Firestore access)
  ai/         planner_adapter.py (Protocol + fake), langgraph_planner.py (real adapter)
  simulator/  bounded action simulator: catalog.py, engine.py, environment.json,
              simulator_adapter.py (BoundedSimulatorAdapter + FakeSimulatorAdapter)
scenarios/    synthetic incident package + ground truth (see scenarios/README.md)
evaluation/   harness, scorer, results (see evaluation/SCORING_SHEET.md)
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
404s, the audit trail, the planner adapter (scripted LLM) and the planning
endpoints.

## Action simulator, scenarios and evaluation (Aidan)

Approved actions run through the **bounded simulator** (`app/simulator/`):
9 catalogue tools (identical to the planner's `approved_tools`), a fictional
environment, no free-text parameters, and no state of its own. It derives
the simulated clock and history from the case's stored evidence and action
results. `SIMULATOR_PROFILE` defaults to `clean` (no injected faults). The
scenario-specific `demo` profile injects one fault (the CRM admin API is in
maintenance until 10:30 on 5 Oct, so an early CRM session revocation
partially fails and the planner has to adapt); set it explicitly for the
scripted demo only. The evaluation harness enables it on its own.

```bash
# regenerate the synthetic incident package (after editing build_scenarios.py)
../.venv/bin/python -m scenarios.build_scenarios

# evaluate planners through the real endpoints (fake Firestore, real simulator)
../.venv/bin/python -m evaluation.run_eval --planner fake oracle unsafe
../.venv/bin/python -m evaluation.run_eval --planner live   # needs OPENCODE_GO_API_KEY
```

- `scenarios/README.md`: the three incidents and two variants, how to run
  the demo by hand, and evidence branching.
- `evaluation/SCORING_SHEET.md`: the rubric and safety gates;
  `evaluation/results/SUMMARY.md`: latest results.
- `evaluation/TEST_PLAN.md`: adversarial and edge-case tests;
  `evaluation/INTEGRATION_GAPS.md`: open gaps per owner.

Never upload or index `scenarios/*/evaluator_only/`: those are the answer keys.

## Next steps (handoff)

1. Smoke-test against the Firestore emulator (tests use a fake only).
2. Follow-on GAS-lite work (not in this slice): planner-populated routing /
   assessment fields, report-section invalidation, non-material version
   suppression, frontend graph visualisation of the state history, and
   policy-pack integration.
