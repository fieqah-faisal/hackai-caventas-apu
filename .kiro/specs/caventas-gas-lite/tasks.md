# Implementation Plan: GAS-lite Core (Incident State Manager)

This plan implements the GAS-lite Core slice: a backward-compatible extension of the
existing backend (`app/schemas/incident_state.py`, `app/services/state_manager.py`,
`app/database/repositories.py`) plus a new pure graph-building service
(`app/services/gas_lite.py`) and two additive state-history endpoints
(`app/api/state.py`). Backend-only, Python/FastAPI/Firestore, test-driven. Each task
builds only on earlier ones and ends with a `_Requirements:_` reference line.

## Status Legend

The user maintains these statuses on each task:

- `- [ ]` **not started** — a Core task yet to be done.
- `- [x]` **completed** — Core task finished and verified.
- `- [~]` **in progress** — currently being worked on.
- `- [!]` **blocked** — cannot proceed (note the blocker inline).
- **follow-on** — listed only under `## Follow-on (not this slice)`; never executed in Core.
- **out of scope** — listed only under `## Out of scope`; never executed in Core.

All Core tasks below start unchecked `- [ ]`. Tasks in the Follow-on and Out of scope
sections are explicitly non-Core and MUST NOT be executed as part of this slice.

## Overview

This plan implements the backend-only GAS-lite Core slice: enriched incident-state
schemas, a pure `app/services/gas_lite.py` graph-building service (no Firestore I/O, no
LLM), state_manager integration, two additive state-history endpoints, their tests, and
documentation updates. The work is test-driven, with each task building only on earlier
ones. Follow-on and out-of-scope work are listed separately so this slice stays focused
and backward-compatible.

## Task Dependency Graph

Ordering of Core leaf sub-tasks (each wave depends on all earlier waves; tasks within a
wave are independent):

```
Wave 0 (schema foundation):          1.1  1.2  1.3
Wave 1 (pure service, no I/O):       2.1
                                      │
Wave 2 (service, depends on 2.1):    2.2  2.3  3.1
                                      │    │
Wave 3 (service composition):        2.4  2.5  2.6
                                      │
Wave 4 (snapshot assembly):          2.7
                                      │
Wave 5 (state_manager integration):  4.1  4.2  4.4
                                      │
Wave 6 (caller wiring):              4.3
                                      │
Wave 7 (API + history tests):        5.1  5.2
                                      │
Wave 8 (end-to-end effect flow):     6.1  6.2
                                      │
Wave 9 (regression gate):            7.1  7.2
                                      │
Wave 10 (docs + session records):    8.1  8.2
```

- Nested bullet view (dependency chain):
  - `1.*` schema → everything else
  - `2.1` entity_id → `2.2`/`2.3` extractors → `2.4` dedupe, `2.5` edges, `2.6` effects → `2.7` build_snapshot
  - `3.1` repository `list_state_versions` (independent, needed by wave 7)
  - `2.7` + `3.1` → `4.*` state_manager → `5.*` API → `6.*` e2e → `7.*` regression gate → `8.*` docs

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.1a"] },
    { "id": 2, "tasks": ["2.2", "2.2a", "2.3", "2.3a", "3.1"] },
    { "id": 3, "tasks": ["2.4", "2.4a", "2.5", "2.5a", "2.6", "2.6a"] },
    { "id": 4, "tasks": ["2.7", "2.7a"] },
    { "id": 5, "tasks": ["4.1", "4.2", "4.4"] },
    { "id": 6, "tasks": ["4.3"] },
    { "id": 7, "tasks": ["5.1", "5.2"] },
    { "id": 8, "tasks": ["6.1", "6.2"] },
    { "id": 9, "tasks": ["7.1", "7.2"] },
    { "id": 10, "tasks": ["8.1", "8.2"] }
  ]
}
```

## Tasks

- [ ] 1. Schema foundation — extend `app/schemas/incident_state.py` (backward-compatible)
  - [ ] 1.1 Add new enums and the `SESSION` entity type
    - In `app/schemas/incident_state.py` add `SESSION = "session"` to `EntityType`, keeping every existing value.
    - Add `RelationshipCategory` (`context | attack | response`), `ResponseFocus` (`assessment, preservation, containment, eradication, hardening, restoration`), `RoutingTransition` (`initial, stay, advance, rollback, re_enter` — member `RE_ENTER` stored as `"re_enter"`), `CreatedFrom` (Core three: `initial_reconstruction, evidence_upload, action_result`), and `ReportStatus` (`draft, in_review, finalized`).
    - _Requirements: 2.3, 2.4, 2.5, 5.1, 5.2, 5.7, 6.1, 9.1_
    - _Design: Data Models → New enums; EntityType_
  - [ ] 1.2 Enrich `Entity`, `Relationship`, `IncidentState` and add `StateVersionMeta`
    - `Entity`: add `evidence_ids: list[str] = []`, `first_seen`, `last_seen` (optional datetime), `condition: Optional[str] = None`.
    - `Relationship`: add `id`, `category: RelationshipCategory = CONTEXT`, `first_seen`, `last_seen`, `attributes: dict = {}`, `action_id`, `execution_id`; retain `source, relation, target, evidence_ids, status`.
    - `IncidentState`: add provenance (`parent_version`, `change_reason`, `created_from`), response-situation block (`observed_response_status`, `recommended_response_focus`, `response_objective`, `response_prerequisites`, `routing_rationale`, `routing_evidence_ids`, `routing_confidence`, `routing_transition`), report-status block (`report_sections_complete/pending/invalidated`, `latest_report_id`, `latest_report_version`, `report_status`); keep every existing field incl. `recovery_status`.
    - Add `StateVersionMeta` model (`version, parent_version, created_from, change_reason, created_at, entity_count, relationship_count, timeline_count`).
    - All new fields optional or defaulted.
    - _Requirements: 1.1, 2.1, 2.2, 2.8, 4.4, 6.2, 6.3, 9.1, 13.7, 14.1_
    - _Design: Data Models → Entity / Relationship / IncidentState / StateVersionMeta_
  - [ ]* 1.3 Unit test: backward-compatible schema load (obligation precursor)
    - In a new or existing schema test, assert a pre-slice snapshot dict (no new keys) still validates and that new fields take their defaults (`condition=None`, `category=context`, empty lists), and that out-of-enum `created_from` / `recommended_response_focus` / `routing_transition` are rejected.
    - **Validates: Requirements 1.4, 2.5, 2.8, 5.7, 14.1**
    - _Design: Data Models → Backward-compatibility statement; Error Handling_

- [ ] 2. Pure GAS-lite service — create `app/services/gas_lite.py` (no Firestore I/O, no LLM), TDD with `backend/tests/test_gas_lite.py`
  - [ ] 2.1 Implement `entity_id` with normalization and skip-on-missing-key
    - `entity_id(entity_type, *key_parts)`: uppercase type prefix + `"::"` + normalized parts joined by `"::"`; trim/collapse whitespace; lowercase domain values; preserve case for host/account; return no id when any required part is empty (caller creates no entity).
    - _Requirements: 7.1, 7.2, 7.5_
    - _Design: Components → gas_lite.entity_id_
  - [ ]* 2.1a Unit tests for `entity_id`
    - Deterministic ids for `HOST::SALES-LT-07`, `ACCOUNT::farah`, `IP::203.0.113.45`, `DOMAIN::example.test`, `PROCESS::SALES-LT-07::stealer.exe`; empty key part yields no id.
    - **Validates: Requirements 7.1, 7.2, 7.5**
  - [ ] 2.2 Implement `extract_entities` field→entity mapping (incl. session)
    - Map per the documented table: `host`→HOST, `account`→ACCOUNT, `process_start.process`→PROCESS::host::process, `dns_query.query`→DOMAIN, `dns_query.source_ip`→IP, `network_upload.destination_ip`→IP, stable session id→SESSION::account::id; accumulate `evidence_ids`, `first_seen`/`last_seen` from `event_time`; never create entities from fields outside the mapping.
    - _Requirements: 6.8, 6.9, 7.4_
    - _Design: Components → gas_lite.extract_entities_
  - [ ]* 2.2a Unit tests for `extract_entities` (obligations 1 & 2)
    - From `backend/fixtures/planner_smoke_evidence.json`: `HOST::SALES-LT-07` and `ACCOUNT::farah` extracted (obligation 1); IP/domain/process/session extracted for supported fields (obligation 2).
    - **Validates: Requirements 6.8, 7.4** (Test obligations 15.1, 15.2)
  - [ ] 2.3 Implement `extract_relationships` (allowlisted context/attack, provenance, ids)
    - Emit only allowlisted relations supported by the fixture (`logged_into`, `resolved_domain`, `connected_to`, `executed_on`), each `OBSERVED` with `evidence_ids` and a deterministic `REL::` id; feed `alert.technique` into `attack_mapping` not a fabricated relation; drop edges whose endpoints are not both in `entities`; reject any relation value outside the R6.4 allowlist during assembly.
    - _Requirements: 6.4, 6.5, 6.6, 6.7_
    - _Design: Components → gas_lite.extract_relationships_
  - [ ]* 2.3a Unit tests for `extract_relationships` (obligations 5 & 6)
    - Every observed relationship carries ≥1 `evidence_id` (obligation 5); observed vs inferred remain distinguishable via `status` (obligation 6); an out-of-allowlist relation raises.
    - **Validates: Requirements 6.4, 6.5, 6.7** (Test obligations 15.5, 15.6)
  - [ ] 2.4 Implement `dedupe_and_merge` (idempotent merge by deterministic id)
    - Merge duplicate entities/relationships by id: union `evidence_ids`, widen `first_seen`/`last_seen` (min/max), keep a single instance; idempotent on identical input.
    - _Requirements: 5.5, 6.7, 11.5_
    - _Design: Components → gas_lite.dedupe_and_merge_
  - [ ]* 2.4a Unit test for dedup idempotence (obligation 4)
    - Passing identical evidence twice adds no new elements and unions provenance.
    - **Validates: Requirements 6.7, 11.5** (Test obligation 15.4)
  - [ ] 2.5 Implement `build_response_edges`
    - One response edge per executed action (per `action_result`): relation `action_attempted_on`, `category=response`, carrying `action_id` and `execution_id`, targeting the action's target entity; deterministic id includes `execution_id`.
    - _Requirements: 12.1, 12.5_
    - _Design: Components → gas_lite.build_response_edges_
  - [ ]* 2.5a Unit test for response edge (obligation 10)
    - `build_response_edges` emits one `action_attempted_on` (category=response) with `action_id`/`execution_id` per executed action.
    - **Validates: Requirements 12.1, 12.5** (Test obligation 15.10)
  - [ ] 2.6 Implement `apply_validated_effects`
    - Only `validation_status == "effective"` mutates the target entity's `condition` (documented tool→condition transitions, e.g. `isolate_host`→`isolated`, `revoke_session`→`contained`, `preserve_evidence`→no change); `ineffective`/`unknown` leave `condition` unchanged; mutate only the target entity and nothing else.
    - _Requirements: 12.2, 12.3, 12.4_
    - _Design: Components → gas_lite.apply_validated_effects; Traceability → Effect validation_
  - [ ]* 2.6a Unit tests for effect safety (obligations 11 & 12)
    - `ineffective` leaves `condition` unchanged (obligation 11); a synthetic `effective` result changes only the target entity's `condition` (obligation 12).
    - **Validates: Requirements 12.2, 12.3, 12.4** (Test obligations 15.11, 15.12)
  - [ ] 2.7 Implement `build_snapshot` (deterministic assembly + ordering)
    - Compose `extract_entities` → `extract_relationships` → `dedupe_and_merge` → `build_response_edges` → `apply_validated_effects` → timeline → provenance; stable ordering (entities by id, relationships by id, timeline by `(timestamp is None, timestamp)` + tiebreak); `REL::{relation}::{source}::{target}[::{execution_id}]` id scheme; byte-identical content for identical inputs excluding version/provenance/timestamp.
    - _Requirements: 1.5, 11.1, 11.2, 11.3_
    - _Design: Components → gas_lite.build_snapshot_
  - [ ]* 2.7a Unit test for deterministic/stable snapshot (obligation 3)
    - Two `build_snapshot` calls on identical stored inputs yield byte-identical content (excluding version/provenance/timestamp); entity ids stable across the two calls.
    - **Validates: Requirements 11.1, 11.2** (Test obligations 15.3)

- [ ] 3. Repository addition — `app/database/repositories.py`
  - [ ] 3.1 Add `list_state_versions(case_id) -> list[dict]`
    - Stream the `state_versions` subcollection and return stored version documents; keep the `STATE-{version:03d}` doc-id scheme; leave `add_state_version`/`get_state_version` unchanged; caller orders by `version`.
    - _Requirements: 13.2_
    - _Design: Components → Changes to repositories.py_

- [ ] 4. State manager integration — `app/services/state_manager.py`
  - [ ] 4.1 Delegate entity/relationship building to `gas_lite`, preserve timeline detail
    - Have `_reconstruct` call `gas_lite` for entities/relationships while keeping the existing `_describe_fields` / `_DESCRIPTION_SKIP_KEYS` timeline text so a `network_upload` description still contains `network_upload`, the destination IP and the byte count.
    - _Requirements: 11.6, 11.7, 14.2_
    - _Design: Components → Changes to state_manager.py (`_reconstruct`)_
  - [ ] 4.2 Add provenance params to `rebuild_and_version`
    - `rebuild_and_version(case_id, created_from=CreatedFrom.INITIAL_RECONSTRUCTION, change_reason=None)`: set `parent_version` from prior pointer `N`, `next = N + 1` (monotonic +1), call `gas_lite.build_snapshot`, append-only `add_state_version`, pointer-only `update_case`, audit `state_version_created` with `created_from`; abort + leave pointer unchanged + raise `ValueError` if case/current-version missing.
    - _Requirements: 1.5, 5.2, 11.1, 11.3, 11.4, 11.8_
    - _Design: Components → Changes to state_manager.py (`rebuild_and_version`)_
  - [ ] 4.3 Update callers to pass the trigger
    - `ingestion.ingest` → `created_from=EVIDENCE_UPLOAD`; `execution_service.execute` → `created_from=ACTION_RESULT`; first build defaults to `INITIAL_RECONSTRUCTION`.
    - _Requirements: 5.2_
    - _Design: Data flow (a)/(b); Components → rebuild_and_version callers_
  - [ ] 4.4 Add `_is_material` classification hook
    - Add `_is_material(created_from, prior_state, next_state)` returning `True` for the Core triggers (evidence_upload, action_result, initial_reconstruction); document that follow-on non-material suppression will live here but is NOT implemented in Core.
    - _Requirements: 5.4, 5.5, 5.6_
    - _Design: Components → Material-vs-non-material_

- [ ] 5. State-history API — new `app/api/state.py`, registered in `app/main.py`
  - [ ] 5.1 Implement the two additive read endpoints and register the router
    - New `APIRouter(prefix="/cases", tags=["state"])`: `GET /cases/{case_id}/states` → version-ordered `list[StateVersionMeta]` with counts, empty list (not 404) for a case with no versions, 404 for unknown case; `GET /cases/{case_id}/states/{version}` → full `IncidentState`, 404 with distinct details for unknown case vs unknown version. Add a thin `state_manager.list_states` that computes counts via `repositories.list_state_versions`; reuse `state_manager.get_state`. Register with `app.include_router(state.router)`; keep `GET /cases/{case_id}/state` in `evidence.py` unchanged; no direct UI→Firestore access.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_
    - _Design: Components → New / changed API; Route registration; Error Handling_
  - [ ]* 5.2 Endpoint tests in `backend/tests/test_state_history_api.py` (obligations 7, 8, 9, 13)
    - After `POST /evidence` the pointer increments and `GET /states` lists the new version (obligation 7); upload twice and `GET /states/{1}` still returns v1 unchanged (obligation 8); metadata shows correct `parent_version`, `change_reason`, `created_from=evidence_upload` (obligation 9); ordered metadata with counts, empty list for no versions, full snapshot by version, distinct 404s (obligation 13).
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6** (Test obligations 15.7, 15.8, 15.9, 15.13)
    - _Design: Testing Strategy → test_state_history_api.py_

- [ ] 6. Response/effect integration through the real execution flow
  - [ ] 6.1 Verify approve→execute produces a response edge without improving condition
    - Drive the existing approve→execute path (FakeSimulatorAdapter returns `completed`/`ineffective`): assert the next state version contains an `action_attempted_on` response edge carrying `action_id`/`execution_id` and that no target entity `condition` is improved; referenced action/approval/execution records remain intact.
    - _Requirements: 12.1, 12.2, 12.3, 12.5, 12.6_
    - _Design: Data flow (b); Testing Strategy_
  - [ ]* 6.2 Focused effective-path unit (synthetic effective result)
    - Feed a synthetic `effective` action result and assert `apply_validated_effects` mutates only the target entity's `condition` and nothing else.
    - **Validates: Requirements 12.4** (Test obligation 15.12)
    - _Design: Components → apply_validated_effects_

- [ ] 7. Regression + full-suite gate
  - [ ] 7.1 Report-generation regression check
    - Add/confirm a test that structured report generation still derives from stored state after GAS-lite changes (no report composer redesign).
    - _Requirements: 9.3, 9.4, 9.5_
    - _Design: Testing Strategy → Regression_
  - [ ] 7.2 Confirm existing suites and full `pytest -q` pass (obligations 14 & 15)
    - Run `test_state_detail.py`, `test_planner_adapter.py`, `test_planning_api.py`, `test_approvals_api.py`, `test_execution_api.py`, `test_reporting_api.py`, `test_milestone1.py` green unmodified; confirm the full backend pytest suite passes against the in-memory fake Firestore (emulator smoke optional).
    - **Validates: Requirements 14.3** (Test obligations 15.1, 15.14, 15.15, 15.16)
    - _Design: Testing Strategy → Regression (R15.14, R15.15)_

- [ ] 8. Documentation + session records
  - [ ] 8.1 Update project docs
    - `backend/README.md`: document `app/services/gas_lite.py`, the enriched `IncidentState`, and the new `GET /cases/{case_id}/states` and `/states/{version}` endpoints. `.kiro/steering/structure.md`: add `app/services/gas_lite.py` and `app/api/state.py`, note the state-history endpoints, and correct the stack narrative (React + Vite + Tailwind, not Streamlit; UI → FastAPI → Admin SDK → Firestore). Record explicitly that the proposal's Technology Stack section is stale and must be aligned in a follow-on slice.
    - _Requirements: 10.1, 10.3_
    - _Design: Documentation & Decision Impact_
  - [ ] 8.2 Append session notebook records
    - Add a `DEC` entry in `docs/session/Decisions.md` for the GAS-lite state model (response-situation + report-status blocks, `CreatedFrom` vocabulary, the `re_enter` value choice, condition-mutation-only-on-effective); append a `docs/session/SessionLog.md` entry; refresh `docs/session/SessionContext.md`; add follow-on items to `docs/session/Backlog.md`; keep `tasks.md` updated as work progresses.
    - _Requirements: 10.2_
    - _Design: Documentation & Decision Impact → Session notebook_

## Follow-on (not this slice)

These are explicitly non-Core. Do NOT execute them as part of this slice.

- [ ] (follow-on) Full IR-phase / Stage Router routing logic (populate the routing fields with real decisions).
- [ ] (follow-on) Planner working-context projection (Agent Working Context → PlannerAdapter) — Airil.
- [ ] (follow-on) Simulator catalogue and real effects behind `simulator_adapter.py` — Aidan.
- [ ] (follow-on) Frontend graph visualisation of the GAS-lite state.
- [ ] (follow-on) Report integration beyond preserving compatibility.
- [ ] (follow-on) Align the stale proposal **Technology Stack** section.
- [ ] (follow-on) Extended `CreatedFrom` trigger vocabulary (analyst clarification, evidence-gap resolution, action approval, edited recommendation, rejection, another-path request, manual/simulator outcome, unexpected validation, scope change, hypothesis change, report-status change) and non-material version suppression in `_is_material`.

## Out of scope

Never part of this project slice:

- [ ] (out of scope) Neo4j or any other graph database.
- [ ] (out of scope) Six separate AI agents.
- [ ] (out of scope) Tree-of-Thought planning.
- [ ] (out of scope) Experience embedding database / retrieval.
- [ ] (out of scope) Real infrastructure execution.
- [ ] (out of scope) Cloud deployment changes.
- [ ] (out of scope) Replacing Firestore.
- [ ] (out of scope) Modifying the action approval contract.

## Notes

- Sub-tasks marked with `*` are optional test tasks and can be skipped for a faster MVP;
  the parent implementation tasks (unmarked) must be implemented.
- Each task references specific requirement sub-criteria (dotted form) and, where useful,
  a design section for traceability.
- `gas_lite.py` is pure (no Firestore I/O, no LLM) by construction — this structurally
  guarantees R6.6 (the LLM cannot invent persistent graph relationships).
- Tests run against the in-memory fake Firestore (`tests/fake_firestore.py`); the
  Firestore emulator smoke is optional for this slice (R15.16).
