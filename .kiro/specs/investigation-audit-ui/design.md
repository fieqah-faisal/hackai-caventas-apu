# Investigation audit UI: design

## Projections and persistence

`timeline_projection.py` is a pure allowlisted projection over stored evidence, state descriptions and action results. Existing `IncidentState.timeline` remains unchanged for historical/planner compatibility. The current-state endpoint and report builder call the same projector; reports store copied rows and PDF/frontend read only that snapshot.

Agent Decision Trace steps live under `cases/{case_id}/analysis_runs/{run_id}/trace_steps/{step_id}`. Sequence-based IDs and create-only repository writes make the collection append-only. A run-scoped emitter records real service/planner boundaries with timestamps, durations, references and closed safe summaries. Run progress, planner-node steps and IR lifecycle stages remain distinct contracts.

`investigation_activity.py` reads authoritative review, approval, action-result and audit records, joins only explicit identifiers, deduplicates source/audit pairs and returns deterministically ordered typed rows. Rejection never implies replacement; a later plan is referenced as a replacement only if a persisted relation explicitly establishes it. No projection read writes audit data.

## APIs and UI

- `GET /cases/{case_id}/timeline`
- `GET /cases/{case_id}/analysis-runs`
- `GET /cases/{case_id}/analysis-runs/{run_id}/steps`
- `GET /cases/{case_id}/investigation-activity`

The Timeline tab uses a reusable responsive `TimelineTable`; technical/raw fields are collapsed. Analyst Reviews uses a native accessible disclosure, computes current plans from exact state bindings and disables stale choices. Report trace/activity disclosures are collapsed by default and consume snapshot DTOs only.

## Security and ownership

Trace schemas forbid extra fields and have no generic metadata dictionary. Failure events use closed categories, never exception/provider text. Evidence is referenced by ID. Repository functions are the only Firestore access. Changes to Airil-owned `langgraph_planner.py` and `planner_adapter.py` are limited to safe instrumentation; prompts and graph behavior remain unchanged.
