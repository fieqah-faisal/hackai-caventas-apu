# Project Structure

The backend and incident-state subsystem lives under `backend/`.

```text
ir-planner/
│
├── backend/
│   │
│   ├── app/
│   │   ├── main.py
│   │
│   │   ├── api/
│   │   │   ├── cases.py
│   │   │   ├── evidence.py
│   │   │   ├── state.py           # GET /cases/{id}/states, /states/{version} (GAS-lite)
│   │   │   ├── planning.py
│   │   │   ├── approvals.py
│   │   │   ├── execution.py
│   │   │   └── reports.py
│   │
│   │   ├── schemas/
│   │   │   ├── case.py
│   │   │   ├── evidence.py
│   │   │   ├── incident_state.py
│   │   │   ├── plan.py
│   │   │   └── report.py
│   │
│   │   ├── database/
│   │   │   ├── firebase.py
│   │   │   └── repositories.py
│   │
│   │   ├── services/
│   │   │   ├── ingestion.py
│   │   │   ├── state_manager.py
│   │   │   ├── gas_lite.py        # pure graph builder (no Firestore I/O, no LLM)
│   │   │   ├── approval_service.py
│   │   │   ├── execution_service.py
│   │   │   ├── audit_service.py
│   │   │   └── reporting.py
│   │
│   │   ├── ai/
│   │   │   └── planner_adapter.py
│   │
│   │   └── simulator/
│   │       ├── simulator_adapter.py
│   │       ├── catalog.py
│   │       ├── engine.py
│   │       └── environment.json
│   │
│   ├── scenarios/      # synthetic incident package (agent_inputs/ vs evaluator_only/)
│   ├── evaluation/     # harness, scorer, results (dev tooling, not imported by app/)
│   ├── uploads/
│   ├── reports/
│   ├── fixtures/
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
│
├── firestore.indexes.json
├── firebase.json
├── compose.yaml               # production frontend + backend only
├── backend/Dockerfile         # non-root FastAPI image
├── frontend/Dockerfile        # Vite build -> nginx
├── frontend/nginx.conf        # SPA fallback + /api backend proxy
│
├── .kiro/
│   ├── steering/
│   └── specs/
│
├── frontend/
│   └── src/
│       ├── features/         # React analyst workspace and case tabs
│       └── lib/
│           ├── api/          # fixture|api providers; FastAPI only
│           ├── fixtures/     # deterministic synthetic demo data
│           └── mapping/      # backend DTO -> stable view models
└── README.md
```

## Firestore Data Model

```text
cases/{case_id}
    title
    description
    status
    current_state_version
    created_at
    updated_at

    evidence/{evidence_id}
    state_versions/{state_id}
    plans/{plan_id}
    analysis_runs/{run_id}       # queued/running/completed/failed, plus _active marker
    actions/{action_id}
    approvals/{approval_id}
    action_results/{exec_id}
    audit_events/{audit_id}
    reports/{report_id}
```

Separate top-level collections for reusable knowledge:

```text
playbooks/{playbook_id}
policies/{policy_id}
```

## Conventions

- Keep the MVP minimal. Do not create unnecessary abstractions.
- One language (Python) across the backend.
- API keys, service-account credentials and secrets load from environment
  variables or files referenced by env vars, never hardcoded or committed.
- The DeepSeek/agent integration lives behind `app/ai/planner_adapter.py`.
- All simulated actions route through `app/simulator/simulator_adapter.py`.
  The simulator keeps no state of its own; it reads the case's stored
  evidence and action results.
- `app/` never reads `scenarios/*/evaluator_only/` (answer keys); a test
  enforces this.
- Incident state is versioned and never overwritten in place.
- Analysis-run stages are persisted at real service boundaries; a presentation
  animation or elapsed timer never asserts planner completion. A run is bound
  to the exact state version captured when it was queued.
- Do not store large raw files inside Firestore documents (1 MiB limit).
  Store originals on the local filesystem; keep path + SHA-256 in Firestore.
- The React UI never accesses Firestore directly. Flow is:
  React/Vite → FastAPI → Firebase Admin SDK → Firestore.
- The read-only Incident Graph uses `@xyflow/react` to display the immutable
  `IncidentState.entities` and `.relationships` created by pure `gas_lite.py`.
- API mode resolves stored plan actions through the read-only `/actions`
  endpoint and reads persistent simulator outcomes from `/action-results`.
