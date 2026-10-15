# IR Planner - Backend

Human-in-the-loop incident-response backend: the system of record for cases,
evidence, versioned incident state, approvals, bounded simulated execution,
audit trail and reports.

Owner: Raaj (Backend, Incident State, Data & Integration).

## Status: Core workflow implemented

The backend currently supports evidence ingestion, immutable GAS-lite incident
state, stage-scoped policy retrieval, DeepSeek planning, deterministic policy
enforcement, analyst approval, bounded simulation, audit history and structured
JSON/PDF reporting. The final integration branch passes **222 backend tests**
(2026-10-14); live-provider availability is tracked separately in BL-043.

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
| GET | `/cases/{case_id}/timeline` | Typed current-state chronology projected from stored records |
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
| POST | `/cases/{case_id}/analysis-runs` | Queue a persisted background analysis run; returns 202 and run ID |
| GET | `/cases/{case_id}/analysis-runs/active` | Discover the case's active run for navigation/refresh recovery; returns the run or `null` |
| GET | `/cases/{case_id}/analysis-runs` | List persisted runs, newest first |
| GET | `/cases/{case_id}/analysis-runs/{run_id}` | Read stored stage, state binding, terminal plan or sanitized failure |
| GET | `/cases/{case_id}/analysis-runs/{run_id}/steps` | Read the ordered, sanitized operational Agent Decision Trace |
| GET | `/cases/{case_id}/plans` | List stored plans for a case |

The planner runs behind `app/ai/langgraph_planner.py` (LangGraph over the
OpenCode Go gateway, model `deepseek-v4.1-flash`). It analyzes the incident,
retrieves stage-relevant policy passages, and returns proposals only; the
backend validates every id before persisting. With no
`OPENCODE_GO_API_KEY` configured it falls back to `FakePlannerAdapter`, so
the backend works without a key.

Only one background analysis run may be active per case. A duplicate queue
request returns HTTP 409 with the existing `run_id`; clients resume that run
rather than scheduling the planner again.

Asynchronous runs prevent a second active run for the same case via an
atomic Firestore claim, expose only actual service boundaries (loading state,
loading guidance, running planner, persisting plan), and store a sanitized
failure rather than provider response text. The original synchronous `/runs`
remains supported. A FastAPI process restart during a background run can leave
its queued/running record nonterminal; durable worker recovery is follow-on.
Each asynchronous run also owns append-only trace-step documents for operations
that actually executed. Steps carry state/run bindings, timings, bounded
summaries and record IDs only; prompts, responses, provider payloads, hidden
reasoning, credentials and arbitrary metadata are not part of the schema.
The deterministic adapter now emits evidence-grounded typed analysis for
synthetic/offline verification; this is not evidence that the live model works.

The planner also returns a validated analysis block — incident type, severity,
confidence, findings (each citing stored evidence ids) and ATT&CK technique
ids. It is persisted with the plan and rendered into the report (BL-017,
DEC-015); findings without stored evidence and malformed technique ids are
dropped, so the report only carries evidence-backed claims.

Approvals, bounded simulated execution and reporting (BL-003):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/cases/{case_id}/actions/{action_id}/decision` | Analyst decision (`approve` / `reject`, with approver role) |
| POST | `/cases/{case_id}/actions/{action_id}/execute` | Run an approved action in the bounded simulator |
| POST | `/cases/{case_id}/reports` | Generate and store a new report version (JSON + PDF) |
| GET | `/cases/{case_id}/reports/latest` | Retrieve the newest persisted report |
| GET | `/cases/{case_id}/reports/{report_id}` | Retrieve a stored report |
| GET | `/cases/{case_id}/reports/{report_id}/pdf` | Download the exact generated PDF |
| GET | `/cases/{case_id}/investigation-activity` | Unified read-only review/decision/outcome activity |

Read-only lists for the API-mode approvals queue (BL-027, DEC-011), sorted
by `created_at`, 404 for an unknown case:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/cases/{case_id}/actions` | Stored actions (status, version, bound state version) |
| GET | `/cases/{case_id}/action-results` | Recorded simulator results (execution and validation status kept separate) |

Approval is created by the backend, never by AI output, and the backend
enforces policy independently of the planner's cited `policy_refs`: the
declared approver role, target asset type, evidence presence and sequencing
prerequisites are all checked against `guidance.json` and stored records.
Execution and effectiveness are distinct: a `completed` execution with an
`ineffective` validation does NOT improve a target entity's condition — only a
validated `effective` outcome applies its allowlisted condition change. A stale
approval (one bound to a superseded state version) requires a new planning run
and a replacement action rather than silent re-use. The proposal, approval,
execution and validation records are each stored and immutable; GAS-lite adds
an `action_attempted_on` response edge referencing the stored `action_id` and
`execution_id` without replacing those records. A pure read model combines
reviews, approvals/rejections, execution/validation results and selected audit
events without replacing those records or inferring a replacement action.
Reports copy the typed timeline, operational trace, activity log and sign-off
into each immutable snapshot. Execution goes through
`BoundedSimulatorAdapter`; `FakeSimulatorAdapter` is used only by tests that
need a fixed outcome.

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
  schemas/    Pydantic models (case, evidence, state, timeline, trace, report)
  services/   ingestion, state_manager, gas_lite, policy_service, planning,
              approval, execution, audit, reporting
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
404s, the audit trail, the planner adapter (scripted LLM, analysis
validation, malformed-JSON retry), the planning endpoints, the approval,
execution and reporting endpoints, typed timeline/trace/activity projections,
immutable report snapshots, and the read-only action/result lists.

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

1. Re-run the Firestore emulator smoke path after backend changes; the latest
   recorded full flow passed (BL-004), while unit tests continue to use the
   in-memory fake.
2. Add the read endpoints the UI still lacks (BL-025 report list; BL-013
   global case list and historical plan detail).
3. Fill report notifications, policy conformance and asset criticality from
   `guidance.json` (BL-033), then align the simulator catalogue and frontend
   fixtures with the policy pack (BL-035/BL-036/BL-039).
4. Follow-on GAS-lite work: planner-populated routing / assessment fields,
   report-section invalidation, non-material version suppression, and frontend
   graph visualisation of the state history. (Policy-aware retrieval and
   deterministic backend policy enforcement are implemented — see above.)
