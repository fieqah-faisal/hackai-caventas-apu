# Requirements Document

## Introduction

GAS-lite (Graph-as-State, STAIR-inspired) is the incident-state foundation for the
Caventas IR Planner. In Caventas, the incident state is the complete, versioned
understanding of an incident — not merely a visual graph. GAS-lite enriches that
existing understanding so it can hold the case facts, normalized evidence
references, an entity-and-relationship graph, the reconstructed timeline, the
analytical assessment, the response situation, and the links out to proposed
actions, human decisions, action outcomes and the continuous report.

This slice is a focused, backward-compatible extension of the system that already
exists in the backend: the `IncidentState` schema (`app/schemas/incident_state.py`),
the `state_manager` service (`app/services/state_manager.py`) that reconstructs and
versions state, and the Firestore repositories layer (`app/database/repositories.py`).
It does not rebuild the project, replace Firestore, introduce a graph database, or
reproduce STAIR. Everything here is **STAIR-inspired**: concepts are reimplemented
in Caventas's own code and contracts, never copied.

GAS-lite is advisory and human-controlled. It records and structures understanding so
that an agent can recommend, a human can review, authorized personnel or existing
tooling can perform the real action, and the analyst can report the outcome back for
recording and evaluation. GAS-lite never performs consequential actions on real
infrastructure and never treats AI output as authorization.

This is a **Core slice**: backward-compatible enriched schemas, a pure graph-building
service, evidence-to-graph reconstruction grounded in the current synthetic fixtures,
response-action representation, immutable state-history retrieval and endpoints, tests,
and documentation. Full IR-phase routing logic, planner working-context projection,
the simulator catalogue, and frontend graph visualisation are explicitly follow-on.

## STAIR References

STAIR is used only as conceptual inspiration. The following references are consulted
for ideas; the implementation is reimplemented in Caventas code.

- Paper: https://arxiv.org/abs/2608.09524
- Repository overview: https://anonymous.4open.science/r/stair/README.md
- Graph-as-State: https://anonymous.4open.science/r/stair/pipeline/response_planner/core/gas_state.py
- Stage Router: https://anonymous.4open.science/r/stair/pipeline/response_planner/core/stage_router.py
- Stage-specialized agents: https://anonymous.4open.science/r/stair/pipeline/response_planner/core/stage_agents.py
- Experience components: https://anonymous.4open.science/r/stair/pipeline/response_planner/experience/
- Effect validation: https://anonymous.4open.science/r/stair/evaluator/step_evaluator.py

Constraints on using these references:

- STAIR source code MUST NOT be copied into Caventas. Concepts are reimplemented.
- IF a STAIR file listed above cannot be accessed, THEN that limitation is stated in
  the design/implementation notes and only the verified repository documentation and
  the paper are relied on.
- STAIR internal behaviour that cannot be verified from accessible references MUST NOT
  be invented or assumed.

## Caventas Workflow Context

GAS-lite sits in the middle of the Caventas human-in-the-loop pipeline:

```
Observe → Reconstruct → [Incident State Manager / GAS-lite] → Analyze →
Evidence Sufficiency → IR Phase Router → Retrieve → Propose → Human Approval →
Action Tracking and Outcome Validation → Re-Plan → continuously updated report
```

This slice implements the **Incident State Manager / GAS-lite foundation** stage only.
It enriches and versions the incident state and exposes state history. It must *support*
the inputs and outputs of the neighbouring stages (sufficiency, phase routing, response
tracking, reporting) without implementing their full logic in this slice.

## Glossary

- **GAS-lite**: Graph-as-State (STAIR-inspired). The structured, versioned incident
  state in Caventas, comprising an entity/relationship graph plus the surrounding
  case facts, assessment, response situation and links to actions, decisions,
  outcomes and reports. It is the complete incident state, not only a visual graph.
- **Incident_State**: A versioned snapshot of understanding for one case. Never
  overwritten in place; each change appends a new version.
- **Entity**: A node in the graph (host, account, session, process, file, ip, domain,
  other) with a stable id, type, name, attributes, evidence references, first/last seen
  and condition.
- **Relationship**: A directed edge between two entities, carrying a category of
  **context**, **attack** or **response**, plus provenance.
- **Observed**: Directly supported by evidence (carries valid evidence_ids).
- **Inferred**: Hypothesized, not directly observed; remains distinguishable from
  observed.
- **Immutable_State_Version**: A stored state document that is never modified after it
  is written. New understanding produces a new version document.
- **parent_version**: The version number of the state snapshot a new version was
  derived from.
- **created_from / change_type**: The documented, extensible vocabulary describing what
  triggered a new state version (e.g. `initial_reconstruction`, `evidence_upload`,
  `action_result`).
- **change_reason**: A short human-readable explanation stored alongside a new version.
- **observed_response_status**: What the organisation is observed to be doing or to have
  done about the incident, as evidenced. Distinct from any recommendation.
- **recommended_response_focus**: The response objective the system RECOMMENDS as the
  next focus. One of {assessment, preservation, containment, eradication, hardening,
  restoration}. A recommendation only — it does not claim a phase was completed.
- **result_source**: The provenance of an action outcome. One of {analyst_reported,
  simulator, evidence_confirmed}.
- **The three memory boundaries**:
  1. **Incident State Memory** — persistent, case-specific incident understanding.
  2. **Agent Working Context** — a minimized projection of the smallest relevant context
     handed to the planner, not the full raw evidence collection.
  3. **Organizational Knowledge Base** — playbooks, policies, topology, asset
     criticality and templates: reference material, never stored as observed incident
     evidence.

## Requirements

### Requirement 1: GAS-lite is the complete incident state (Alignment A)

**User Story:** As an incident responder, I want the incident state to hold the whole
picture of an incident, so that analysis, recommendations, outcomes and the report all
draw from one consistent, versioned source of truth.

#### Acceptance Criteria

1. THE GAS-lite_State SHALL support or reference the following within a single versioned
   snapshot: case information, normalized evidence references, entities and
   relationships, the reconstructed timeline, the analytical assessment,
   supported/alternative/rejected hypotheses, uncertainty and evidence gaps, observed
   response status, recommended response focus, the response objective and
   prerequisites, proposed actions, human decisions and feedback, action outcomes, and
   reporting status. In Core these are carried as optional/defaulted schema fields; Core
   reconstructs and populates entities, relationships and the timeline, while populating
   the analytical assessment (findings, hypotheses, uncertainty, evidence gaps and
   observed response status) is Follow-on.
2. THE GAS-lite_State SHALL represent each referenced record (evidence, action,
   approval, result, report) as its stable identifier string plus an optional short
   summary, and SHALL NOT store a full copy of the referenced Firestore record body.
3. WHERE a referenced record exists in Firestore, THE GAS-lite_State SHALL reference it
   by its stable identifier so the authoritative Firestore record remains the single
   source of truth.
4. WHILE enriching the state, THE GAS-lite_State SHALL keep every new section optional
   or defaulted, and an existing stored snapshot that lacks the new sections SHALL load
   and validate without error.
5. WHEN a new snapshot is constructed, THE GAS-lite_State SHALL set its `version` to
   exactly the prior version plus one so version numbers increase monotonically by one.
6. IF a referenced record identifier cannot be resolved in Firestore, THEN THE
   GAS-lite_State SHALL retain the identifier reference and SHALL NOT fabricate the
   referenced record body.

### Requirement 2: Separate observed response status from recommended focus (Alignment B)

**User Story:** As an analyst, I want the system to distinguish what the organisation is
observed to be doing from what the system recommends, so that a recommendation is never
mistaken for a completed phase.

#### Acceptance Criteria

1. THE GAS-lite_State SHALL expose `observed_response_status` and
   `recommended_response_focus` as separate fields and SHALL NOT collapse them into one
   ambiguous `stage` field.
2. THE GAS-lite_State SHALL support the fields `observed_response_status`,
   `recommended_response_focus`, `response_objective`, `response_prerequisites`,
   `routing_rationale`, `routing_evidence_ids`, `routing_confidence` and
   `routing_transition`.
3. THE GAS-lite_State SHALL constrain `recommended_response_focus` to one of
   {assessment, preservation, containment, eradication, hardening, restoration}.
4. THE GAS-lite_State SHALL constrain `routing_transition` to one of {initial, stay,
   advance, rollback, re_enter}.
5. IF `recommended_response_focus` or `routing_transition` is set to a value outside its
   enumerated set, THEN THE GAS-lite_State SHALL reject the value with a schema
   validation error.
6. WHERE a response focus is recommended, THE GAS-lite_State SHALL represent it as a
   recommendation of the next objective and SHALL NOT assert that the organisation
   completed a response phase.
7. THE GAS-lite_State SHALL support these routing output fields in the Core schema now
   as optional/defaulted fields, WHILE both the full IR-phase router logic AND the
   population of these routing fields with real planner-populated routing decisions are
   deferred to a follow-on slice; Core SHALL leave them empty/None.
8. THE GAS-lite_State SHALL make all routing fields optional or defaulted so a stored
   snapshot without them loads unchanged and existing `GET /state` consumers remain
   valid.

### Requirement 3: Advisory, human-controlled action model (Alignment C)

**User Story:** As an authorized responder, I want Caventas to recommend rather than act,
so that only humans and existing tooling perform real infrastructure actions and the
system never misrepresents what happened.

#### Acceptance Criteria

1. THE GAS-lite_State SHALL represent response actions as recommendations and records,
   and the system SHALL NOT issue, trigger, or perform any action against real
   infrastructure.
2. THE GAS-lite_State SHALL support the advisory workflow in which an agent recommends,
   a human reviews, authorized personnel or existing tooling performs the real action,
   an analyst reports the result, and Caventas records and evaluates it.
3. THE GAS-lite_State SHALL treat the isolated Python simulator as an optional
   demonstration path only.
4. THE Action_Result record SHALL carry a `result_source` field constrained to the
   closed set {analyst_reported, simulator, evidence_confirmed}, and the identifier
   `result_source` SHALL reside on the action-result record rather than on the state
   schema.
5. IF an action-result `result_source` is absent or outside the closed set, THEN THE
   Backend SHALL reject the outcome record.
6. WHERE an action outcome originates from the simulator, THE Action_Result record SHALL
   retain its `result_source` as `simulator` so a simulated outcome is never later
   presented as a real infrastructure action in the UI or report.
7. IF an outcome record is submitted for an action that was not human-reviewed and
   authorized, THEN THE Backend SHALL reject the outcome record.

### Requirement 4: Action lifecycle representation (Alignment D)

**User Story:** As an analyst, I want the state to describe where each action sits in its
lifecycle, so that I can distinguish a recommendation from an approval, an execution and
a verified effect without breaking the existing action contract.

#### Acceptance Criteria

1. THE GAS-lite_State schema SHALL be able to represent or reference the closed lifecycle
   value set {recommended, awaiting_approval, approved, edited, rejected,
   manually_executed, simulated, successfully_verified (verified), failed,
   not_applicable, superseded}.
2. THE GAS-lite_State SHALL represent lifecycle information using separate
   decision/execution/validation fields and SHALL NOT force all lifecycle values into
   the existing backend action-status enum where doing so would break current contracts.
3. THE GAS-lite_State SHALL document a mapping for every lifecycle value in criterion 1
   to the existing backend action-status model, following the chain
   `awaiting_approval` → `approved` | `rejected` → `verified` | `failed`.
4. THE GAS-lite_State SHALL represent effectiveness as a separate, explicitly set
   attribute and SHALL NOT derive effectiveness automatically from execution completion.
5. IF a lifecycle value outside the closed set in criterion 1 is supplied, THEN THE
   GAS-lite_State SHALL reject it rather than silently store it.
6. In Core the schema SHALL provide the capacity to represent/reference these lifecycle
   values and SHALL document the mapping (criteria 1–5); populating or computing the full
   action-lifecycle projection is Follow-on.

### Requirement 5: Incident-state update triggers and versioning policy (Alignment E)

**User Story:** As an analyst, I want new state versions to be created only when
understanding or planning materially changes, so that history is meaningful and free of
unnecessary snapshots.

#### Acceptance Criteria

1. THE GAS-lite_State SHALL record a `created_from` / `change_type` value from a
   documented, extensible vocabulary for each new state version.
2. THE GAS-lite_State SHALL include at least the `created_from` values
   `initial_reconstruction`, `evidence_upload` and `action_result` in Core.
3. THE GAS-lite_State SHALL document the full extensible trigger set: initial
   reconstruction, new evidence upload, analyst clarification, evidence-gap resolution,
   action approval, edited recommendation, action rejection, request for another
   investigation path, manual action outcome, simulator outcome, unexpected validation
   result, incident-scope change, hypothesis status change, and report-status change.
4. THE GAS-lite_State SHALL document the material-vs-non-material classification concept:
   a trigger is material when it changes entities, relationships, timeline, findings,
   hypotheses, recommended response focus, action outcomes, or report status, and all
   other triggers are non-material.
5. WHEN any Core trigger (`initial_reconstruction`, `evidence_upload`, `action_result`)
   occurs, THE GAS-lite_State SHALL create a new immutable state version, and Core SHALL
   provide an `_is_material` classification hook that returns `True` for every Core
   trigger (no suppression in Core).
6. THE GAS-lite_State SHALL defer actual non-material-trigger version suppression (where
   a non-material trigger does NOT create a new version) to a Follow-on slice; Core SHALL
   NOT implement suppression.
7. IF a `created_from` value outside the documented vocabulary is supplied, THEN THE
   GAS-lite_State SHALL reject it.

### Requirement 6: Entities and the graph schema (Alignment F)

**User Story:** As an analyst, I want a controlled set of entity and relationship types,
so that the graph is consistent, provenance-backed, and free of fabricated structure.

#### Acceptance Criteria

1. THE GAS-lite_State SHALL support the closed set of entity types {host, account,
   session, process, file, ip, domain, other}, keeping the existing `EntityType` values
   and adding `session`.
2. THE Entity SHALL carry the fields id, type, name, attributes, evidence_ids,
   first_seen, last_seen and condition, where condition expresses the entity's
   operational or security state.
3. THE Relationship SHALL carry a stable id, source, relation, target, evidence_ids, an
   observed-or-inferred status, a category of {context, attack, response}, first_seen,
   last_seen, attributes, and optional action/execution references for response edges.
4. THE GAS-lite_State SHALL restrict relations to the closed allowlist {logged_into,
   authenticated_from, connected_to, resolved_domain, executed_on, found_on,
   session_used_by, action_attempted_on, evidence_preserved, session_revoked,
   host_isolated}, and SHALL encode this allowlist as a `RelationshipType` string enum
   whose members are exactly those values, typing `Relationship.relation` as that enum.
5. IF a relation outside the `RelationshipType` allowlist in criterion 4 is supplied,
   THEN THE GAS-lite_State SHALL reject it at the schema layer via `RelationshipType`
   validation, AND the pure graph builder SHALL only ever emit allowlisted members.
6. THE GAS-lite_State SHALL NOT allow the LLM to invent arbitrary persistent graph
   relationships.
7. THE GAS-lite_State SHALL require every observed entity and every observed relationship
   to carry at least one evidence_id.
8. THE GAS-lite_State SHALL implement only the entity and relationship mappings supported
   by the current synthetic evidence in Core, using the fixture
   `backend/fixtures/planner_smoke_evidence.json`, mapping each event as follows: a
   `dns_query` event maps to a domain entity from its `query` field and an ip entity from
   its `source_ip` field; a `process_start` event maps to a process entity from its
   `process` field and a file entity from its `path` field; a `network_upload` event maps
   to an ip entity from its `destination_ip` field; an `alert` event maps its technique id
   into the attack mapping; a session entity SHALL be mapped ONLY from an explicitly
   present allowlisted session field (`session_id` or `session_cookie_id`) and SHALL NOT
   be derived or fabricated; and every event carrying a `host` or `account` maps to a host
   or account entity respectively. The `planner_smoke_evidence.json` fixture carries no
   session field, so no session entity is produced from it.
9. WHERE an entity type or relation in the closed sets has no supporting synthetic
   evidence, THE GAS-lite_State SHALL allow the type or relation to exist in the schema
   with no fabricated instances.

### Requirement 7: Deterministic, stable entity identifiers (Alignment F)

**User Story:** As an analyst, I want entity identifiers to be deterministic and stable
across versions, so that the same real-world entity is recognised across the incident
history and never duplicated.

#### Acceptance Criteria

1. THE GAS-lite_State SHALL construct each entity identifier as an uppercase type prefix,
   the `::` delimiter, and the type-aware normalized key field or fields, for example
   `HOST::SALES-LT-07`, `ACCOUNT::farah`, `IP::203.0.113.45`, `DOMAIN::example.test`,
   `PROCESS::SALES-LT-07::installer.exe`, `FILE::SALES-LT-07::c:/users/farah/downloads/installer.exe`
   and `SESSION::<account>::<session_id>` built from an explicitly present session field.
2. THE GAS-lite_State SHALL produce the same identifier for the same input fields so
   identifier construction is deterministic.
3. THE GAS-lite_State SHALL apply type-aware normalization to identifier key parts —
   host UPPERCASE, account lowercase, domain lowercase, ip canonical (trimmed; IPv4 as-is,
   IPv6 lowercased/compressed), process name trimmed and lowercased, file path trimmed
   with path separators unified (`\` → `/`) — while preserving the original readable value
   in `Entity.name`, and SHALL keep an entity's identifier stable across state versions.
4. THE GAS-lite_State SHALL document the field-to-entity mapping explicitly and SHALL NOT
   create entities from arbitrary fields outside that mapping.
5. IF a key field required to build an entity identifier is absent or empty, THEN THE
   GAS-lite_State SHALL NOT create that entity and SHALL NOT emit a partial or placeholder
   identifier.

### Requirement 8: Three separated memory boundaries and untrusted data (Alignment G)

**User Story:** As a security engineer, I want the three memory boundaries kept distinct
and all ingested text treated as untrusted data, so that reference material is never
confused with evidence and no ingested content is treated as instructions.

#### Acceptance Criteria

1. THE GAS-lite_State SHALL keep the Incident State Memory, the Agent Working Context and
   the Organizational Knowledge Base as separate boundaries in its schema and structure,
   and no single item SHALL belong to more than one boundary at the same time.
2. THE GAS-lite_State SHALL represent the Agent Working Context as a subset projection of
   the Incident State Memory that excludes the full raw evidence collection and SHALL NOT
   equate it with the full raw evidence collection.
3. THE GAS-lite_State SHALL treat Organizational Knowledge Base content (playbooks,
   policies, topology, asset criticality, templates) as reference material and SHALL NOT
   store it as observed incident evidence.
4. THE GAS-lite_State SHALL store text originating from logs, alerts, emails and analyst
   uploads only in data-typed fields and SHALL never apply that text as a directive,
   instruction or configuration.
5. IF a write would store Organizational Knowledge Base content as observed incident
   evidence, or would store observed incident evidence as Organizational Knowledge Base
   content, THEN THE GAS-lite_State SHALL reject the write.
6. THE GAS-lite_State SHALL preserve these boundaries in Core, WHILE the full
   working-context projection to the planner is deferred to a follow-on slice, and SHALL
   retain enough structure to produce that projection later.

### Requirement 9: Continuous report state and report compatibility (Alignment H)

**User Story:** As a report author, I want the state to track report progress and
invalidation, so that reporting stays consistent with the latest understanding and the
existing report generator keeps working.

#### Acceptance Criteria

1. THE GAS-lite_State SHALL carry the optional, defaulted report-tracking fields completed
   report sections, pending report sections, sections invalidated by newer evidence, the
   latest report identifier, the latest report version, and the report finalization
   status, where finalization status is constrained to the enum {draft, in_review,
   finalized}. In Core these fields exist and default empty/None; Core does NOT compute
   their values.
2. THE GAS-lite_State SHALL defer the active report-section invalidation behaviour (where
   newer evidence changing the basis of a report section marks that section invalidated
   and records the triggering state version) to a Follow-on slice; Core SHALL NOT compute
   invalidation.
3. THE GAS-lite_State SHALL keep the set of report sections and their evidence references
   unchanged for identical inputs before and after the GAS-lite changes.
4. THE GAS-lite_State SHALL NOT require a redesign of the existing report composer in
   Core.
5. THE Implementation SHALL include regression testing confirming existing structured
   report generation still works after the GAS-lite changes.

### Requirement 10: Documentation and decision records (Alignment I)

**User Story:** As a teammate, I want the project documentation to reflect the real
implemented stack and record every proposal change, so that the shared session notebook
stays trustworthy.

#### Acceptance Criteria

1. THE Documentation SHALL reflect the implemented stack: Firestore (not SQLite);
   React + Vite + Tailwind (not Streamlit); the FastAPI backend boundary; DeepSeek V4.1
   Flash accessed via the OpenCode Go gateway; uploaded originals on local storage with
   path and SHA-256; the UI never contacting Firestore directly; and ReportLab for
   reports.
2. WHEN a proposal change is made, THE Documentation SHALL record it in
   `docs/session/Decisions.md` and in the session log.
3. THE Documentation SHALL record explicitly that the proposal's Technology Stack section
   is stale and must be aligned in a follow-on slice.

### Requirement 11: Immutable state versions and provenance (State Evolution)

**User Story:** As an analyst, I want each state change to append a deterministic,
provenance-stamped version, so that history is auditable and older snapshots never
change.

#### Acceptance Criteria

1. WHEN new evidence or an action result is recorded, THE State_Manager SHALL read the
   latest state together with the authoritative stored evidence, actions and results,
   and SHALL construct the next snapshot deterministically.
2. WHEN the same stored inputs are provided, THE State_Manager SHALL produce
   byte-identical snapshot content, excluding the version, provenance and timestamp
   fields.
3. WHEN a new version is constructed, THE State_Manager SHALL set `parent_version`,
   record `change_reason` and `created_from`, store the snapshot as a new version,
   update only the case current-version pointer, and emit an audit event.
4. THE State_Manager SHALL NOT modify, overwrite or delete any state version document
   whose version number is less than the current-version pointer.
5. IF repeated or duplicate evidence is ingested, THEN THE State_Manager SHALL NOT create
   duplicate nodes or equivalent duplicate relationships, and SHALL dedupe by
   deterministic identifier, merge evidence provenance, and widen `first_seen` and
   `last_seen`.
6. THE State_Manager SHALL ensure every observed relationship and observed entity carries
   at least one evidence_id that resolves to an evidence record stored for the same case.
7. THE State_Manager SHALL keep observed and inferred elements distinguishable.
8. THE State_Manager SHALL handle prior-state resolution in exactly three cases:
   (a) IF the case is unknown, THEN it SHALL abort construction, leave the current-version
   pointer unchanged, and raise an error; (b) IF `current_state_version == 0` (no prior
   state), THEN it SHALL create version 1 with `parent_version = None` (the
   initial_reconstruction / first evidence-upload path) and SHALL NOT abort; (c) IF the
   current-version pointer is `>= 1` but the referenced prior snapshot document is missing,
   THEN it SHALL abort construction as a data-integrity error, leave the current-version
   pointer unchanged, and raise an error.

### Requirement 12: Response actions and effect validation (Response Actions)

**User Story:** As an analyst, I want executed actions and their validated effects
represented honestly in the graph, so that an ineffective action never looks like a
success and the authoritative records stay intact.

#### Acceptance Criteria

1. WHEN a simulator action completes execution, THE GAS-lite_State SHALL create a response
   relationship record linking the action to its target entity with a relationship type
   indicating the action was attempted, for example `action_attempted_on`.
2. IF an action's `execution_status` is `completed`, THEN THE GAS-lite_State SHALL NOT
   change the target entity `condition` and SHALL NOT set any effectiveness indicator
   based on execution completion alone.
3. IF an action result `validation_status` is `ineffective`, THEN THE GAS-lite_State SHALL
   retain the result record in the current state version AND SHALL NOT set the target
   entity `condition` to recovered, isolated, or safe.
4. WHERE an action result `validation_status` is `effective`, THE GAS-lite_State SHALL
   update only the relevant target entity `condition` in the next state version AND SHALL
   NOT modify any other entity attribute as a result of that validation.
5. WHEN the GAS-lite_State records a response action or its validation outcome, THE
   GAS-lite_State SHALL reference the identifiers of the original proposed-action record,
   the approval record, and the action-result record (which carries both
   `execution_status` and `validation_status`) AND SHALL NOT delete, overwrite, or replace
   those referenced records. There is no separate "validation record"; the approval
   remains authoritative in the approvals collection and is traceable through `action_id`.
6. WHEN the FakeSimulatorAdapter executes an action, THE Implementation SHALL return
   `execution_status` equal to `completed` and `validation_status` equal to `ineffective`
   so the replanning demonstration path remains reproducible.

### Requirement 13: State-history API (State-History API)

**User Story:** As a frontend developer, I want endpoints to list and retrieve state
versions, so that the UI can show history without touching Firestore and without
re-fetching full duplicated graph bodies.

#### Acceptance Criteria

1. THE Backend SHALL keep the existing `GET /cases/{case_id}/state` endpoint
   backward-compatible and additive only.
2. THE Backend SHALL add `GET /cases/{case_id}/states` returning lightweight version
   metadata limited to the fields version, parent_version, created_from, change_reason,
   created_at, and element counts, SHALL order the listing by version, and SHALL NOT
   return full duplicated graph bodies from that endpoint.
3. WHERE a case exists but has no stored versions, THE Backend SHALL return an empty list
   from `GET /cases/{case_id}/states` rather than a 404.
4. THE Backend SHALL add `GET /cases/{case_id}/states/{version}` returning one complete
   immutable snapshot whose content equals the stored snapshot for that version.
5. IF the requested case is unknown, THEN THE Backend SHALL return a 404 whose detail
   indicates the unknown case.
6. IF the requested version is unknown for a known case, THEN THE Backend SHALL return a
   404 whose detail indicates the unknown version.
7. THE Backend SHALL define the state-history responses with typed Pydantic models.
8. THE Backend SHALL NOT grant the UI direct Firestore access.

### Requirement 14: Backward compatibility (Backward Compatibility)

**User Story:** As a maintainer, I want all new fields optional and existing behaviour
preserved, so that stored test data, current consumers and existing tests keep working.

#### Acceptance Criteria

1. THE GAS-lite_State SHALL make all new schema fields optional or defaulted so existing
   stored test data remains valid.
2. THE Backend SHALL keep the existing `GET /state` consumers working, including the
   frontend realProvider/dto and `test_state_detail.py`, which asserts that timeline
   descriptions contain record fields such as `network_upload`, the destination IP and
   the byte count.
3. THE Backend SHALL NOT regress the existing planner, approval, execution or reporting
   behaviour.

### Requirement 15: Mandatory test obligations (Test Obligations)

**User Story:** As a maintainer, I want an explicit, verifiable list of tests the
implementation must satisfy, so that correctness and non-regression are provable before
the slice is accepted.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that host and account reconstruction still works.
2. THE Test_Suite SHALL verify that IP, domain, process, file and session extraction
   works for the supported fields.
3. THE Test_Suite SHALL verify that entity identifiers are stable across state versions.
4. THE Test_Suite SHALL verify that duplicate evidence does not create duplicate graph
   elements.
5. THE Test_Suite SHALL verify that observed relationships contain valid evidence
   references.
6. THE Test_Suite SHALL verify that observed and inferred relationships remain
   distinguishable.
7. THE Test_Suite SHALL verify that uploading evidence creates a new state version.
8. THE Test_Suite SHALL verify that previous versions remain retrievable and unchanged.
9. THE Test_Suite SHALL verify that `parent_version`, `change_reason` and `created_from`
   are correct.
10. THE Test_Suite SHALL verify that action execution produces a response edge.
11. THE Test_Suite SHALL verify that an ineffective action does not apply a positive
    entity-state mutation.
12. THE Test_Suite SHALL verify that an effective synthetic outcome applies only its
    allowed mutation.
13. THE Test_Suite SHALL verify that the state-history endpoints return the correct
    metadata and snapshots.
14. THE Test_Suite SHALL verify that the existing planner, approval, execution and
    reporting tests do not regress.
15. THE Test_Suite SHALL verify that the full backend pytest suite passes.
16. THE Test_Suite SHALL run against the in-memory fake Firestore, WHILE the Firestore
    emulator smoke is treated as optional for this slice and documented as the next
    integration verification.

## Scope

### Core (in scope)

- Backward-compatible enriched schemas for the incident state, entities and
  relationships.
- A pure GAS-lite graph-building service at `backend/app/services/gas_lite.py`.
- Evidence-to-graph reconstruction grounded in the current synthetic fixtures.
- Response action and result representation in the graph.
- Immutable state-history retrieval.
- State-history API endpoints.
- Comprehensive tests covering the obligations in Requirement 15.
- Updated project documentation and session records (Decisions log and session log).

### Out of scope

- Neo4j or any other graph database.
- Six separate AI agents.
- Tree-of-Thought planning.
- An experience embedding database.
- Real infrastructure execution.
- Frontend graph visualisation.
- Major changes to `langgraph_planner.py`.
- Cloud deployment changes.
- Replacing Firestore.
- Modifying the action approval contract.

### Follow-on

- Full Stage Router / IR-phase routing logic, including population of the routing fields
  with real planner-populated routing decisions (R2.7).
- Analytical assessment population — findings, hypotheses, uncertainty, evidence gaps and
  observed response status (R1.1).
- Report-section invalidation computation (R9.2).
- Full action-lifecycle projection — populating/computing the lifecycle fields (R4.6).
- Non-material state-version suppression in `_is_material` (R5.6).
- Planner integration with working-context projection.
- Simulator catalogue and effects (owned by Aidan).
- Frontend graph visualisation.
- Report integration beyond preserving compatibility.
- Aligning the stale Technology Stack section of the proposal.
- Extended `created_from` trigger vocabulary beyond the Core three (R5.3).

## Team Ownership / Collision Note

This slice touches Raaj's base layer: the incident-state schemas
(`app/schemas/incident_state.py`), the repositories layer
(`app/database/repositories.py`) and the `state_manager` service
(`app/services/state_manager.py`). It references Aidan's simulator contract
(`app/simulator/simulator_adapter.py`) without changing its behaviour, and it documents
follow-on contracts for Airil (planner working-context projection) and Aidan (simulator
catalogue and effects).

To avoid collisions: do not edit frontend files; avoid substantial changes to
`langgraph_planner.py`; and keep simulator changes minimal, preserving the
`FakeSimulatorAdapter` completed-but-ineffective behaviour.
