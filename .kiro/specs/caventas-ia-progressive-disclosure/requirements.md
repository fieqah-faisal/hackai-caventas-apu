# Requirements Document

## Introduction

This feature is a large, multi-surface redesign of the Caventas Incident Response Planner, spanning both the FastAPI backend and the React + Vite + TypeScript + Tailwind frontend (under `frontend/`). The feature is no longer frontend-only: the system under specification now includes Core backend work on the FastAPI service, specifically the approvals decision endpoint, bounded simulation execution, effect validation, a plan-detail retrieval endpoint, and structured report generation, in addition to the frontend redesign. The frontend continues to talk to the FastAPI backend over HTTP only and never reaches Firestore directly.

The redesign applies progressive-disclosure information architecture — informed by Firebase Console structure (concise global overview, detail separated into focused pages, underline tabs, one-step-at-a-time setup with future steps visible-but-disabled, icons aiding recognition) while borrowing none of Firebase's colour, type, or branding.

The redesign reduces text density on the global dashboard, introduces a step-wise Create New Case flow, adds demo scenario templates, and gives each case a dedicated workspace with underline tabs (Overview, Evidence, Timeline, Analysis, Response Plan, Approvals, Report). It encodes a progressive demonstration behaviour (the Infostealer main demo, the Phishing scenario, and the False-alarm scenario), an Approvals experience backed by an implemented backend decision path, a Report surface backed by implemented structured report generation, a CoreUI Icons Free icon system with attribution, restrained motion, and a responsive layout.

Throughout, the four legible product states — proposed, approved, executed, effective — are the conceptual lineage for Caventas' human-in-the-loop principle; the authoritative, enumerated UI and domain state model is the six-value Action_State defined in the Glossary. The backend MUST enforce — not merely surface — the human-control invariants: AI output is never authorization, simulation runs only via a valid non-stale approval, and no action executes against real infrastructure (bounded simulator only). The UI must never blur a recommendation with a confirmed outcome, must reflect authoritative backend state without fabrication, and may show only synthetic, record-backed data. The existing stack, operational shell (top bar + sidebar), routing, Barlow + IBM Plex Mono typography, and the navy/lime design-token palette MUST be preserved. The FastAPI boundary is absolute: the UI never reaches Firestore directly.

### Delivery sequencing (core vs follow-on)

Caventas is not shippable without the full vertical flow: evidence → incident state → plan → human decision → bounded simulation → outcome validation → structured report. To make a first shippable slice clear, requirements are labelled:

- **[Core]** — part of the first increment: the full vertical demo flow, now including the implemented backend path. This includes the Dashboard redesign; the Create New Case flow; the Infostealer main-demo scenario; minimum-viable implementations of every case tab (Overview, Evidence, Timeline, Analysis, Response Plan, Approvals, Report); the human-control invariants enforced in the backend; the one canonical Action_State model; the icon system; required automated tests; cross-cutting honesty, accessibility, motion, and responsive constraints; PRODUCT.md accuracy; and the Core backend endpoints: the approvals decision endpoint (`POST /cases/{case_id}/actions/{action_id}/decision`), bounded simulation execution (`POST /cases/{case_id}/actions/{action_id}/execute`), effect validation, the plan-detail endpoint (`GET /cases/{case_id}/plans/{plan_id}` with embedded complete stored actions), and structured report generation (`POST`/`GET /cases/{case_id}/reports` for the structured JSON document).
- **[Follow-on]** — subsequent increments: the Phishing scenario; the False-alarm scenario (including the CHG-2026-118 evidence gate); PDF export and rendering; and the deeper richness and polish of the case tabs beyond their minimum-viable depth.

Each requirement below carries a `[Core]` or `[Follow-on]` tag in its heading. Several Core tab requirements note which richer behaviour is deferred to Follow-on within the requirement itself.

## Glossary

- **Caventas_Frontend**: The React + Vite + TypeScript + Tailwind single-page application under `frontend/` that renders the analyst workspace. Shortened to "the Frontend" in acceptance criteria.
- **FastAPI_Backend**: The Python/FastAPI service the Frontend calls over HTTP. The only data source the Frontend may contact, and now also part of the system under specification for the Core backend endpoints. Shortened to "the Backend" in acceptance criteria that concern backend behaviour.
- **Case**: The system-of-record root for one incident, returned by `GET /cases/{id}` with fields case_id, title, description, status, current_state_version, created_at, and updated_at. Status is one of open, investigating, contained, recovered, or closed. The Case document does not carry severity, classification, stage, or recovery status; those are derived from Incident_State or Plans. The Case document has no PATCH or update endpoint; title and description are immutable after creation.
- **Incident_State**: A versioned, never-overwritten snapshot of an incident returned by `GET /cases/{id}/state`, containing entities, relationships, timeline, findings, attack_mapping, hypotheses, missing_evidence, and recovery_status. Each snapshot has an integer `version`.
- **State_Version**: The integer `version` of an Incident_State snapshot. The Case document exposes the latest as `current_state_version`.
- **Entity**: A tracked object in an Incident_State, of type host, account, process, file, ip, or domain.
- **Relationship_Status**: Whether a relationship is `observed` (directly supported by evidence) or `inferred` (hypothesized).
- **Recovery_Status**: The Incident_State `recovery_status` field: investigating, containing, eradicating, recovering, or resolved. Derived from Incident_State, not from the Case document.
- **Stage**: One of assessment, preservation, containment, eradication, hardening, or restoration. Derived from the latest Plan's `stage`, not from the Case document.
- **Planning_Run**: A backend run (`POST /cases/{id}/runs`) that drives the AI planner through analyze → sufficiency route → propose, producing a Plan and returning the Plan plus full action documents in its response, and persisting Stored_Action documents.
- **PlanningRunStatus**: A run-lifecycle value — one of queued, running, completed, blocked, or failed — that is only available WHERE a backend run-status endpoint exists. Until such an endpoint exists, run-lifecycle counts shown on the dashboard are explicitly synthetic.
- **Plan**: The output of a Planning_Run for one Stage, returned by `GET /cases/{id}/plans` with fields plan_id, case_id, based_on_state_version, stage, missing_evidence, action_ids, and created_at. The list endpoint returns `action_ids`, not complete Stored_Action detail. Plans are versioned and append-only (Plan v1, Plan v2, ...).
- **Plan_Detail_Endpoint**: The Core backend endpoint `GET /cases/{case_id}/plans/{plan_id}` that returns the Plan document together with its complete embedded Stored_Action detail, enabling the Frontend to reload a historical Plan and its exact action versions after a page refresh.
- **Proposed_Action**: An AI-proposed action with a tool, target entity, evidence refs, policy refs, rationale, prerequisites, risk, expected effect, and validation checks.
- **Stored_Action**: A Proposed_Action after backend validation and persistence, carrying an integer `version` and a `based_on_state_version` so an approval binds to one exact revision and one exact Incident_State. Complete Stored_Action detail — action_id, version, based_on_state_version, tool, target, evidence_ids, policy_refs, rationale, prerequisites, risk, expected_effect, validation_checks, and current Action_State — is returned both in the `POST /cases/{id}/runs` response for the just-run plan and by the Plan_Detail_Endpoint for any persisted plan.
- **Action_State**: The authoritative, enumerated lifecycle state of a Stored_Action, restricted to exactly one of: proposed, approved, simulated, validated_effective, validated_ineffective, or superseded. These six values are the single canonical domain model used everywhere, in both the Backend and the Frontend. Human-readable display labels may vary by surface, but the domain meaning is consistent across surfaces.
- **Analyst_Decision**: An analyst's Approve, Reject, or Request-more-investigation choice on one exact Stored_Action, persisted and audit-recorded via the approvals decision endpoint, and bound to the exact action_id, Stored_Action version, and based_on_state_version under review.
- **Bounded_Simulation**: The execution of an approved Stored_Action through the bounded simulator only. It never touches real infrastructure, runs only for an action carrying a valid non-stale approval, records a simulation result, and transitions the action to the simulated Action_State.
- **Effect_Validation**: The backend evaluation of a simulated action's recorded validation checks that transitions the action from simulated to validated_effective or validated_ineffective. The simulated and validated_effective states remain distinct.
- **Audit_Event**: A factual record emitted by the backend for every meaningful activity, including every Analyst_Decision and every Bounded_Simulation and Effect_Validation result, read per case via `GET /cases/{id}/audit`. There is no global audit endpoint.
- **Evidence_Item**: A normalized record returned by `GET /cases/{id}/evidence`, carrying evidence_id, source_file, source_location (file, row, line), sha256, kind (csv, json, or txt), event_time, ingestion_time, and fields.
- **Evidence_Upload_Result**: The result of `POST /cases/{id}/evidence`, carrying source_file, sha256, kind, item_count, evidence_ids, and new_state_version.
- **Client_Rejected_Upload**: An upload the Frontend rejects client-side before or independently of the backend (wrong file type, oversize), tracked only in Frontend state and never attributed to the FastAPI_Backend.
- **Case_Workspace**: The dedicated per-case surface containing the persistent case header and the underline tabs.
- **Needs_Attention_Section**: The dashboard region listing at most three items requiring analyst attention.
- **Setup_Panel**: The right-side panel of the Create New Case flow that reveals one active step at a time.
- **Demo_Scenario**: A clearly-labelled, demonstration-only preset that supplies synthetic evidence input batches, reveal order, and expected assertions for a known incident narrative. A Demo_Scenario is a presentation and evidence-reveal harness; it is not the AI planner.
- **Offline_Fallback**: The explicitly-labelled synthetic Plan and evidence content a Demo_Scenario definition may hold, used only when the FastAPI_Backend is unavailable, and always marked as synthetic rather than presented as a real planner result.
- **Structured_Report**: The record-backed structured report document generated and returned by the reporting endpoints (`POST`/`GET /cases/{id}/reports`), containing the collapsible report sections populated only from stored case records.
- **Stub_Endpoint**: A FastAPI_Backend endpoint that currently returns HTTP 501. With this feature, the approvals decision, execution, effect validation, plan-detail, and reporting endpoints are implemented as Core and are no longer Stub_Endpoints; any remaining HTTP 501 endpoint is treated honestly by the Frontend as not-yet-available, but no Core requirement of this feature depends on a permanent 501.
- **Icon_Module**: A curated local module (the Icon component and its backing data) holding only the subset of CoreUI Icons Free `cil-*` icons the Frontend uses, rather than the whole library.
- **Synthetic_Data_Indicator**: A visible label marking that displayed data is synthetic, not from real systems.
- **PRODUCT_Doc**: The repo-root `PRODUCT.md` durable product-context document.
- **Attention_Item**: A Case or Stored_Action that the FastAPI_Backend reports as awaiting approval, as belonging to a blocked Planning_Run, or as a high-impact escalation. The observable rule for "requiring attention".

## Requirements

### Requirement 1: Global Dashboard header and synthetic-data labelling [Core]

**User Story:** As a SOC analyst, I want a concise dashboard header, so that I can orient immediately without reading dense text.

#### Acceptance Criteria

1. WHEN the dashboard loads, THE Frontend SHALL display a header containing the eyebrow text "SOC OPERATIONS", the heading "Dashboard", and the single sentence "Incident activity and decisions requiring attention."
2. THE Frontend SHALL display a Synthetic_Data_Indicator within the dashboard header.
3. THE Frontend SHALL display the existing Create New Case action within the dashboard header.
4. THE Frontend SHALL NOT display on the dashboard any workflow stepper, detailed case descriptions, full approval cards, long Audit_Event descriptions, Plan tools or targets, evidence IDs, State_Version metadata, or full agent rationale.

### Requirement 2: Dashboard Case Activity overview card [Core]

**User Story:** As a SOC analyst, I want a compact Case Activity card, so that I can see case load and attention at a glance.

#### Acceptance Criteria

1. THE Frontend SHALL display a Case Activity overview card showing the count of open Cases and the count of Cases that are Attention_Items.
2. THE Frontend SHALL render a compact 7-day activity chart within the Case Activity card using 7 contiguous day-length buckets covering the trailing 7 calendar days ending on the current day, assigning each Audit_Event returned by the FastAPI_Backend per-case audit endpoint to the bucket containing its timestamp.
3. WHILE the Case Activity card is awaiting FastAPI_Backend data, THE Frontend SHALL display a distinct loading state and SHALL NOT present stale or placeholder values as current data.
4. IF no Audit_Event data exists for the trailing 7 days, THEN THE Frontend SHALL display an honest empty state within the activity chart rather than a fabricated or zero-filled trend presented as data.
5. IF the FastAPI_Backend request for Case Activity data fails, THEN THE Frontend SHALL display an error state and SHALL NOT present stale or placeholder values as current data.
6. THE Frontend SHALL derive every Case Activity card value from current FastAPI_Backend data and SHALL NOT display hardcoded values.
7. THE Frontend SHALL NOT render the Case Activity chart as a continuously animated element.

### Requirement 3: Dashboard Agent Planning overview card [Core]

**User Story:** As a SOC analyst, I want a compact Agent Planning card, so that I can see where automated planning stands.

#### Acceptance Criteria

1. THE Frontend SHALL display an Agent Planning overview card showing an active Planning_Run count and a blocked Planning_Run count.
2. THE Frontend SHALL derive the active and blocked Planning_Run counts from PlanningRunStatus data only WHERE a backend run-status endpoint exists, and SHALL NOT infer a blocked state from the Stage enum.
3. WHILE no backend run-status endpoint exists, THE Frontend SHALL mark the active and blocked Planning_Run counts as synthetic by displaying an adjacent Synthetic_Data_Indicator and SHALL NOT present those counts as current FastAPI_Backend data.
4. THE Frontend SHALL render a compact Stage distribution within the Agent Planning card derived from Plan data returned by the FastAPI_Backend, grouping Plans by Stage and ordering the Stages by the backend workflow Stage sequence.
5. WHILE the Agent Planning card is awaiting FastAPI_Backend data, THE Frontend SHALL display a distinct loading state and SHALL NOT present stale or placeholder values as current data.
6. IF no Plan data exists, THEN THE Frontend SHALL display an honest empty state within the Agent Planning card.
7. IF the FastAPI_Backend request for Agent Planning data fails, THEN THE Frontend SHALL display an error state and SHALL NOT present stale or placeholder values as current data.
8. THE Frontend SHALL derive every non-synthetic Agent Planning card value from current FastAPI_Backend data and SHALL NOT display hardcoded values.

### Requirement 4: Dashboard Human Decisions overview card [Core]

**User Story:** As a SOC analyst, I want a compact Human Decisions card, so that I can see what awaits my decision.

#### Acceptance Criteria

1. THE Frontend SHALL display a Human Decisions overview card showing the awaiting-approval count, the high-impact escalation count defined as the count of Stored_Actions at the backend's highest escalation level, and the oldest-waiting duration.
2. THE Frontend SHALL compute the oldest-waiting duration as the elapsed time from the earliest awaiting-approval submission timestamp to the current time, rendered in the single largest whole unit of days, hours, or minutes.
3. IF no actions await a decision, THEN THE Frontend SHALL display the oldest-waiting duration as absent rather than as zero.
4. THE Frontend SHALL render a compact risk-and-state distribution within the Human Decisions card derived from FastAPI_Backend data.
5. WHILE the Human Decisions card is awaiting FastAPI_Backend data, THE Frontend SHALL display a distinct loading state and SHALL NOT present stale or placeholder values as current data.
6. IF no actions await a decision, THEN THE Frontend SHALL display an honest empty state within the Human Decisions card.
7. IF the FastAPI_Backend request for Human Decisions data fails, THEN THE Frontend SHALL display an error state and SHALL NOT present stale or placeholder values as current data.
8. THE Frontend SHALL derive every Human Decisions card value from current FastAPI_Backend data and SHALL NOT display hardcoded values.

### Requirement 5: Dashboard Needs Attention section [Core]

**User Story:** As a SOC analyst, I want a short Needs Attention list, so that I can decide where to go next without reading detail.

#### Acceptance Criteria

1. THE Frontend SHALL display a Needs_Attention_Section containing at most three items, selecting the Attention_Items with the earliest waiting-since timestamps, breaking ties by descending escalation level and then by ascending Case title.
2. THE Frontend SHALL NOT display Attention_Items beyond the three shown as rows within the Needs_Attention_Section, deferring the remainder to the "View all" affordance.
3. WHERE a Needs_Attention_Section item is displayed, THE Frontend SHALL show an icon, a title, one short status label, a relative time, and an arrow affordance.
4. THE Frontend SHALL NOT display within a Needs_Attention_Section item any paragraph text, Case ID, State_Version, or agent rationale.
5. THE Frontend SHALL display a "View all" affordance for the Needs_Attention_Section.
6. WHILE the Needs_Attention_Section is awaiting FastAPI_Backend data, THE Frontend SHALL display a distinct loading state and SHALL NOT present stale or placeholder values as current data.
7. IF no Attention_Items exist, THEN THE Frontend SHALL display an honest empty state within the Needs_Attention_Section.
8. IF the FastAPI_Backend request for Needs_Attention data fails, THEN THE Frontend SHALL display an error state and SHALL NOT present stale or placeholder values as current data.
9. THE Frontend SHALL derive the Needs_Attention_Section items from current FastAPI_Backend data.

### Requirement 6: Dashboard Recent Cases table [Core]

**User Story:** As a SOC analyst, I want a compact recent-cases table, so that I can scan recent activity without descriptions.

#### Acceptance Criteria

1. THE Frontend SHALL display a Recent Cases table containing at most five rows, selecting the Cases with the most recent updated times and breaking ties by ascending Case title.
2. THE Frontend SHALL NOT display Cases beyond the five shown as rows within the Recent Cases table.
3. WHERE a Recent Cases row is displayed, THE Frontend SHALL show the Case title, the derived Classification, the derived current Stage, the updated time, and the Case Status.
4. THE Frontend SHALL derive the Classification and the current Stage from Incident_State and Plan data respectively, because the Case document does not carry those fields, and WHERE a derived value is unavailable, THE Frontend SHALL display an honest absent indicator rather than a fabricated value.
5. THE Frontend SHALL NOT display description paragraphs within the Recent Cases table.
6. WHILE the Recent Cases table is awaiting FastAPI_Backend data, THE Frontend SHALL display a distinct loading state and SHALL NOT present stale or placeholder values as current data.
7. IF no Cases exist, THEN THE Frontend SHALL display an honest empty state within the Recent Cases table.
8. IF the FastAPI_Backend request for Recent Cases data fails, THEN THE Frontend SHALL display an error state and SHALL NOT present stale or placeholder values as current data.
9. THE Frontend SHALL derive the Recent Cases rows from current FastAPI_Backend data.

### Requirement 7: Create New Case step-wise setup panel [Core]

**User Story:** As a SOC analyst, I want a guided one-step-at-a-time setup panel, so that I create a case without being overwhelmed.

#### Acceptance Criteria

1. WHEN the analyst starts the Create New Case flow, THE Frontend SHALL display a right-side Setup_Panel revealing exactly one active step at a time.
2. THE Frontend SHALL display future steps as visible-but-disabled within the Setup_Panel until their prerequisites are met.
3. WHERE a step is disabled, THE Frontend SHALL display a short explanation of the unmet prerequisite.
4. THE Frontend SHALL keep completed steps accessible for the analyst to revisit.
5. THE Frontend SHALL allow the analyst to move backwards to any earlier step at any time.
6. WHEN the analyst edits an input on an earlier step, THE Frontend SHALL invalidate the step containing that input and every step after it.
7. WHILE the analyst navigates backwards, THE Frontend SHALL preserve previously entered and confirmed values unless an edited prerequisite invalidates them.

### Requirement 8: Create New Case Step 1 — Case Details [Core]

**User Story:** As a SOC analyst, I want to enter case details first, so that the case has a title and context.

#### Acceptance Criteria

1. WHEN Step 1 is active, THE Frontend SHALL present fields for a case title, a short description, and an analyst note.
2. THE Frontend SHALL present an optional scenario-template selector within Step 1.
3. IF the case title is empty, contains only whitespace, or exceeds 200 characters, THEN THE Frontend SHALL keep the Step 2 prerequisite unmet and SHALL display the reason on the disabled Step 2.

### Requirement 9: Create New Case persistence and post-creation read-only behaviour [Core]

**User Story:** As a SOC analyst, I want case details to become clearly read-only after the case is created, so that I am never misled into thinking an edit was saved.

#### Acceptance Criteria

1. WHEN the analyst completes Step 1 and the flow proceeds to evidence upload, THE Frontend SHALL create the Case via `POST /cases` so the Case exists before evidence is uploaded.
2. WHEN the Case has been created via `POST /cases`, THE Frontend SHALL render the Case title and the Case description as read-only and SHALL display a short explanation that case details are fixed after creation.
3. WHEN the Case has been created via `POST /cases`, THE Frontend SHALL NOT display an editable input for the Case title or the Case description and SHALL NOT present an unsaved edited value as pending or persisted.
4. THE Frontend SHALL capture the analyst note as an Evidence_Item submitted via `POST /cases/{id}/evidence` on upload, and SHALL NOT persist the analyst note as a mutable Case field.
5. THE Frontend SHALL NOT call any PATCH or update Case endpoint, because no such endpoint exists in the FastAPI_Backend.
6. IF the FastAPI_Backend `POST /cases` request fails, THEN THE Frontend SHALL display an honest error and SHALL NOT advance to evidence upload.

### Requirement 10: Create New Case Step 2 — Evidence [Core]

**User Story:** As a SOC analyst, I want to upload evidence after entering details, so that the case has material to analyze.

#### Acceptance Criteria

1. WHEN Step 2 is active, THE Frontend SHALL accept uploads in CSV, JSON, and TXT formats and SHALL display the accepted formats.
2. WHEN a file is accepted and `POST /cases/{id}/evidence` returns an Evidence_Upload_Result, THE Frontend SHALL display each accepted file as a compact row with a source icon.
3. IF an uploaded file is not in CSV, JSON, or TXT format, THEN THE Frontend SHALL reject the file as a Client_Rejected_Upload and SHALL display a wrong-file-type error.
4. IF an uploaded file exceeds 10 MB, THEN THE Frontend SHALL reject the file as a Client_Rejected_Upload and SHALL display a file-size error.
5. IF `POST /cases/{id}/evidence` returns HTTP 400 for a file, THEN THE Frontend SHALL treat that response as a per-file malformed-record rejection, SHALL display a malformed-record error for that file, and SHALL NOT treat the response as a totals summary.
6. IF `POST /cases/{id}/evidence` returns HTTP 404, THEN THE Frontend SHALL display a case-not-found error and SHALL NOT display a false upload success.
7. THE Frontend SHALL keep advanced evidence fields hidden until at least one file is accepted.
8. IF no file has been accepted, THEN THE Frontend SHALL keep the Step 3 prerequisite unmet and SHALL display the reason on the disabled Step 3.

### Requirement 11: Create New Case Step 3 — Evidence Review [Core]

**User Story:** As a SOC analyst, I want to review ingested evidence, so that I confirm what was accepted before analysis.

#### Acceptance Criteria

1. WHEN Step 3 is active, THE Frontend SHALL display the accepted record count and the detected sources derived from the Evidence_Item records returned by `GET /cases/{id}/evidence`, or equivalently from the `item_count` and `evidence_ids` of the Evidence_Upload_Result, without substituting fabricated values.
2. THE Frontend SHALL display the count of Client_Rejected_Uploads from Frontend state as client-side rejections and SHALL NOT attribute a malformed or rejected total to the FastAPI_Backend unless a backend endpoint provides that total.
3. WHEN the analyst explicitly requests it, THE Frontend SHALL display the SHA-256 hash and ingestion status rather than displaying them by default.
4. THE Frontend SHALL require the analyst to confirm the evidence review before the Step 4 prerequisite is met.
5. WHEN the analyst changes the evidence after confirming the review, THE Frontend SHALL clear the prior review confirmation.
6. IF the analyst has not confirmed the evidence review, THEN THE Frontend SHALL keep the Step 4 prerequisite unmet and SHALL display the reason on the disabled Step 4.

### Requirement 12: Create New Case Step 4 — Start Analysis [Core]

**User Story:** As a SOC analyst, I want a final summary before starting analysis, so that I begin from a confirmed baseline.

#### Acceptance Criteria

1. WHEN Step 4 is active, THE Frontend SHALL display a summary containing the Case details, the evidence sources, the accepted record count, and the current State_Version.
2. THE Frontend SHALL present a primary action labelled "Start analysis" within Step 4.
3. WHEN the analyst activates "Start analysis", THE Frontend SHALL request `POST /cases/{id}/runs` to begin a Planning_Run for the Case.
4. IF a Planning_Run for the Case has already been started, THEN THE Frontend SHALL NOT request a duplicate Planning_Run.
5. IF the `POST /cases/{id}/runs` request fails, THEN THE Frontend SHALL display an honest error and SHALL NOT display a false success.

### Requirement 13: Demo scenario templates [Core]

**User Story:** As a presenter, I want clearly-labelled demo scenario templates, so that I can load a known incident narrative for demonstration.

#### Acceptance Criteria

1. THE Frontend SHALL present a helper labelled "Load demo scenario" that is explicitly marked as for demonstration only and not for production use.
2. THE Frontend SHALL display three Demo_Scenario cards, each with a one-sentence description: "Infostealer to Session Hijack" with badge "Main demo", "Phishing to Account Takeover" with badge "Light scenario", and "Planned Backup Migration" with badge "False alarm".
3. THE Frontend SHALL read the fictional organisation label "Caventas Demo Organisation" from exactly one configuration value and SHALL NOT hardcode that label elsewhere.
4. WHERE a Demo_Scenario populates fields, THE Frontend SHALL keep those fields editable and SHALL retain any manual override the analyst applies.
5. THE Frontend SHALL exclude unrelated placeholder incidents (generic OAuth, beacon, and credential-stuffing) from the primary demo fixtures except where required for isolated component testing.

### Requirement 14: Case Workspace header and underline tabs [Core]

**User Story:** As a SOC analyst, I want each case to open in a dedicated workspace with a persistent header and underline tabs, so that I keep context while moving between facets.

#### Acceptance Criteria

1. WHEN the analyst opens a Case, THE Frontend SHALL display a Case_Workspace with a persistent case header showing the title, the derived severity, the incident status, the derived current response Stage, the last-updated time, and a compact agent state.
2. THE Frontend SHALL derive the severity and the current response Stage from Incident_State and Plan data respectively, because the Case document does not carry those fields, and WHERE a derived value is unavailable, THE Frontend SHALL display an honest absent indicator.
3. THE Frontend SHALL display the case header once per Case_Workspace and SHALL NOT repeat the header content inside each tab.
4. THE Frontend SHALL present the tabs Overview, Evidence, Timeline, Analysis, Response Plan, Approvals, and Report using an underline tab style and SHALL NOT present them as pill-style tabs.

### Requirement 15: Case Workspace tab-availability state machine [Core]

**User Story:** As a SOC analyst, I want tabs to unlock as the case progresses, so that I only see facets that have content while knowing what is coming.

#### Acceptance Criteria

1. THE Frontend SHALL make the Overview tab available at all times.
2. WHILE evidence has been uploaded for the Case, THE Frontend SHALL make the Evidence tab available, and WHILE no evidence has been uploaded for the Case, THE Frontend SHALL make the Evidence tab visible-but-disabled.
3. WHILE normalization or timeline reconstruction has occurred for the Case, THE Frontend SHALL make the Timeline tab available, and WHILE no normalization or timeline reconstruction has occurred for the Case, THE Frontend SHALL make the Timeline tab visible-but-disabled.
4. WHILE a Planning_Run has started for the Case, THE Frontend SHALL make the Analysis tab available, and WHILE no Planning_Run has started for the Case, THE Frontend SHALL make the Analysis tab visible-but-disabled.
5. WHILE analysis has produced a proposal for the Case, THE Frontend SHALL make the Response Plan tab available, and WHILE analysis has not produced a proposal for the Case, THE Frontend SHALL make the Response Plan tab visible-but-disabled.
6. WHILE at least one Stored_Action requires a decision, THE Frontend SHALL make the Approvals tab available, and WHILE no Stored_Action requires a decision, THE Frontend SHALL make the Approvals tab visible-but-disabled.
7. WHILE at least one report-eligible item exists for the Case, where a report-eligible item is a record-backed classification, timeline entry, affected asset or identity, Evidence_Item, ATT&CK mapping, decision, approval, action, validation result, unresolved gap, or lesson, THE Frontend SHALL make the Report tab available, and WHILE no report-eligible item exists for the Case, THE Frontend SHALL make the Report tab visible-but-disabled.
8. WHERE a tab's prerequisite is unmet, THE Frontend SHALL display the tab as visible-but-disabled and SHALL display a prerequisite explanation on hover or focus.
9. WHERE a tab is visible-but-disabled, THE Frontend SHALL exclude the tab from the keyboard tab sequence and SHALL NOT allow the tab to be activated.
10. WHILE a Planning_Run or any later stage is active, THE Frontend SHALL keep the Evidence tab and the Timeline tab available and SHALL NOT return either tab to a disabled state once it has become available.
11. IF the prerequisite for a tab other than Overview, Evidence, or Timeline becomes unmet again after the tab was available, THEN THE Frontend SHALL return that tab to visible-but-disabled, and IF the now-disabled tab was the selected tab, THEN THE Frontend SHALL select the Overview tab.

### Requirement 16: Case Overview tab [Core]

**User Story:** As a SOC analyst, I want a visual, concise case overview, so that I grasp the case state without reading detail.

#### Acceptance Criteria

1. WHEN the Overview tab is shown, THE Frontend SHALL display a one-sentence case summary, an affected-entities count, an evidence-source count, the current hypothesis, the current response Stage, a missing-evidence indicator, and a compact agent-progress indicator, each derived from current FastAPI_Backend data.
2. THE Frontend SHALL provide links from the Overview tab to the corresponding detail tabs rather than reproducing their content.
3. THE Frontend SHALL NOT display long paragraph text within the Overview tab.
4. (Follow-on) Richer Overview visualisation beyond the concise indicators above is deferred to a Follow-on increment.

### Requirement 17: Evidence tab [Core]

**User Story:** As a SOC analyst, I want to filter and inspect evidence, so that I can examine source records in detail.

#### Acceptance Criteria

1. THE Frontend SHALL display the Evidence_Item records returned by `GET /cases/{id}/evidence`, and WHERE an Evidence_Item row is displayed, THE Frontend SHALL show a source icon, the event_time, a concise title, the evidence kind, and the observed-or-inferred status.
2. WHEN the analyst selects an Evidence_Item row, THE Frontend SHALL open a side panel showing the fields content, the sha256 hash, the source_file, the source_location, related entities, the ATT&CK mapping, and the State_Version.
3. WHEN the analyst selects a different Evidence_Item row while the side panel is open, THE Frontend SHALL replace the side-panel content with the newly selected Evidence_Item without closing the side panel.
4. WHEN the analyst dismisses the side panel, THE Frontend SHALL close the side panel and clear the Evidence_Item selection.
5. IF the `GET /cases/{id}/evidence` request fails, THEN THE Frontend SHALL display an error state and SHALL NOT present fabricated Evidence_Items.
6. (Follow-on) The secondary filters labelled All, Endpoint, Identity, Network, Application, and Analyst Notes, and the agent-usage detail in the side panel, are deferred to a Follow-on increment; the minimum-viable Evidence tab lists and inspects records without those filters.

### Requirement 18: Timeline tab [Core]

**User Story:** As a SOC analyst, I want a chronological timeline, so that I understand event sequence and relationships.

#### Acceptance Criteria

1. THE Frontend SHALL display the Incident_State timeline events in chronological order, each with an icon and a short label.
2. THE Frontend SHALL distinguish observed from inferred relationships in the timeline.
3. WHEN the analyst selects a timeline event that has associated evidence, THE Frontend SHALL open the evidence detail panel for that event.
4. IF the analyst selects a timeline event that has no associated evidence, THEN THE Frontend SHALL display an indication that no evidence is associated and SHALL NOT open the evidence detail panel.
5. (Follow-on) Decoy-benign events, analyst-added events, and held-back-or-newly-introduced event distinctions, together with any demo-stage gating of held-back evidence, are deferred to a Follow-on increment; the minimum-viable Timeline renders the current Incident_State timeline chronologically.

### Requirement 19: Analysis tab [Core]

**User Story:** As a SOC analyst, I want concise analysis sections, so that I understand the agent's assessment without a wall of text.

#### Acceptance Criteria

1. WHEN the Analysis tab is shown, THE Frontend SHALL display concise sections for the current classification, the confidence with its evidence basis, the affected entities, the ATT&CK techniques, the missing evidence, and the active hypotheses, derived from the Incident_State findings, attack_mapping, hypotheses, and missing_evidence.
2. THE Frontend SHALL label the displayed confidence as advisory.
3. THE Frontend SHALL provide expandable sections for detailed reasoning rather than one continuous text block.
4. (Follow-on) Deeper reasoning presentation and cross-linking beyond the concise sections above is deferred to a Follow-on increment.

### Requirement 20: Response Plan tab and the six action states [Core]

**User Story:** As a SOC analyst, I want to navigate a plan by stage and see each action's exact state, so that I never confuse a recommendation with a confirmed outcome.

#### Acceptance Criteria

1. THE Frontend SHALL provide Stage navigation across Assessment, Preservation, Containment, Eradication, Hardening, and Restoration, and SHALL display only the selected Stage's actions.
2. WHERE the selected Stage has no actions, THE Frontend SHALL display an explicit empty-stage indication and SHALL keep Stage navigation available.
3. WHERE an action is displayed on the Response Plan tab, THE Frontend SHALL show the action tool, the target, the risk, the approval requirement, and the current Action_State.
4. WHEN the analyst opens an action's detail, THE Frontend SHALL display the rationale, policy references, expected effect, and validation checks in a side panel.
5. THE Frontend SHALL represent each Action_State using exactly one of the mutually exclusive canonical states proposed, approved, simulated, validated_effective, validated_ineffective, or superseded, and SHALL NOT use any other or legacy state model.
6. THE Frontend SHALL display the simulated state and the validated_effective state as distinct states, SHALL NOT collapse a simulated action into a validated_effective outcome, and SHALL NOT collapse a validated_effective outcome into a simulated state.
7. THE Frontend SHALL present every action as a recommendation and SHALL NOT state that any real infrastructure was modified.
8. THE Frontend SHALL source complete action detail (action_id, version, based_on_state_version, tool, target, evidence_ids, policy_refs, rationale, prerequisites, risk, expected_effect, validation_checks, and current Action_State) from the `POST /cases/{id}/runs` response for the just-run plan and from the Plan_Detail_Endpoint in Requirement 32 for any historical plan, and SHALL NOT fabricate action detail.
9. (Follow-on) Richer plan presentation and cross-stage comparison beyond the minimum-viable per-stage action list is deferred to a Follow-on increment.

### Requirement 21: Human-control invariants enforced in the backend [Core]

**User Story:** As a SOC analyst, I want the backend to enforce the human-control invariants and the frontend to reflect that authoritative state, so that no stale recommendation can be mistaken for authorized action or a confirmed outcome.

#### Acceptance Criteria

1. THE Backend SHALL bind an Analyst_Decision to the exact action_id, the exact Stored_Action version, and the exact based_on_state_version of the action under review.
2. WHEN a later relevant Incident_State change produces a State_Version greater than the based_on_state_version an approval was bound to, THE Backend SHALL treat that approval as stale and SHALL mark it invalidated.
3. THE Backend SHALL NOT authorize a Bounded_Simulation on the basis of a stale or invalidated approval.
4. THE Frontend SHALL reflect the authoritative approval and Action_State values returned by the Backend, SHALL display a stale or invalidated approval as invalidated, and SHALL NOT present a stale or invalidated approval as authorizing simulation.
5. THE Backend SHALL keep previous Plans available and SHALL NOT overwrite them, treating Plans as versioned and append-only, and THE Frontend SHALL reflect that version history without overwriting it.
6. THE Backend and THE Frontend SHALL keep the simulated Action_State and the validated_effective Action_State distinct, consistent with Requirement 20 criterion 6.
7. THE Backend SHALL emit an Audit_Event for each Analyst_Decision and each Bounded_Simulation and Effect_Validation result, and THE Frontend SHALL surface, from `GET /cases/{id}/audit`, that each decision and each simulation or validation result is audit-recorded, displaying any absence honestly rather than implying a record exists.
8. THE Backend SHALL NOT treat AI planner output as authorization for any Bounded_Simulation.

### Requirement 22: Infostealer main-demo progressive behaviour [Core]

**User Story:** As a presenter, I want the Infostealer demo to re-plan visibly when new evidence arrives, so that the audience sees the human-in-the-loop re-planning value using the real backend.

#### Acceptance Criteria

1. WHEN the presenter activates the batch-reveal control for Batch 1 of the Infostealer Demo_Scenario, THE Frontend SHALL upload or reveal the Batch 1 synthetic evidence via `POST /cases/{id}/evidence`, SHALL rely on the resulting Incident_State v1, SHALL call `POST /cases/{id}/runs`, and SHALL render the Plan v1 returned by that run response.
2. THE Frontend SHALL render Plan v1 and Plan v2 content from the Planning_Run response and SHALL NOT hardcode plan content, except that a Demo_Scenario definition MAY hold an explicitly-labelled Offline_Fallback used only when the FastAPI_Backend is unavailable.
3. THE Frontend SHALL advance Demo_Scenario batches only in response to an explicit presenter batch-reveal control and SHALL NOT reveal, advance, or re-plan any batch based on elapsed real time.
4. IF the presenter activates the batch-reveal control for a batch that is already revealed, THEN THE Frontend SHALL leave the displayed evidence, plan version, and diff unchanged.
5. WHEN the presenter activates the batch-reveal control for Batch 2 of the Infostealer Demo_Scenario, THE Frontend SHALL display the exact announcement "New evidence received", SHALL upload or reveal the Batch 2 synthetic session replay with the 1,200 CRM record export via `POST /cases/{id}/evidence`, SHALL rely on the resulting Incident_State v2, and SHALL call `POST /cases/{id}/runs` again to produce Plan v2.
6. WHEN Plan v2 has been returned, THE Frontend SHALL compute the plan diff client-side from the two real Plan responses and SHALL assign every Plan v2 action to exactly one of the four categories unchanged, added, replaced-or-insufficient, or policy-triggered, where the four categories are mutually exclusive and collectively exhaustive over all Plan v2 actions.
7. WHEN the Plan v2 diff is displayed, THE Frontend SHALL display the re-plan explanation "Re-imaging the laptop was necessary but not sufficient: the stolen session is still valid."
8. WHERE the FastAPI_Backend is unavailable, THE Frontend SHALL fall back to the Offline_Fallback and SHALL display a visible Synthetic_Data_Indicator marking the Plan content as synthetic rather than a real planner result.
9. WHERE the partner-portal flag is enabled, THE Frontend SHALL permit the presenter batch-reveal control to reveal optional Batch 3.
10. WHERE the partner-portal flag is disabled, THE Frontend SHALL NOT reveal Batch 3 for any presenter batch-reveal control activation.
11. THE Frontend SHALL NOT display any interface text within the Infostealer Demo_Scenario that claims any Action was executed against real infrastructure.
12. WHEN the analyst approves an action within the Infostealer Demo_Scenario and activates its simulation, THE Frontend SHALL request `POST /cases/{id}/actions/{action_id}/execute` and SHALL render the resulting simulated and then validated Action_State from the authoritative Backend response, demonstrating the complete decision-to-outcome path.

### Requirement 23: Approvals experience and backend decision path [Core]

**User Story:** As a SOC analyst, I want to review and decide on actions in both the case and global surfaces, and have those decisions persisted and audit-recorded, so that the human-in-the-loop control is real rather than cosmetic.

#### Acceptance Criteria

1. THE Frontend SHALL present the Approvals experience on both the case Approvals tab and the global Approvals page.
2. THE Frontend SHALL display on the dashboard exactly one aggregate awaiting-approval count and at most one urgent shortcut, and SHALL NOT display any individual action detail or per-action approve/reject control on the dashboard.
3. WHEN the analyst opens an action for review, THE Frontend SHALL display the recommendation, the target, the supporting evidence, the organisation-policy reference, the expected effect, the risk, the required approver, the Stored_Action version, and the based_on_state_version.
4. THE Frontend SHALL present Approve, Reject, and Request-more-investigation controls when reviewing an action.
5. IF the analyst selects Reject or Request-more-investigation, THEN THE Frontend SHALL require an analyst comment containing at least one non-whitespace character before submitting the decision.
6. IF the analyst submits a Reject or Request-more-investigation decision with a comment that is empty or contains only whitespace, THEN THE Frontend SHALL block submission and SHALL display a validation message indicating a comment is required.
7. WHEN the analyst submits a decision, THE Frontend SHALL send it to `POST /cases/{id}/actions/{action_id}/decision`.
8. WHEN the Backend receives a decision at `POST /cases/{id}/actions/{action_id}/decision`, THE Backend SHALL persist the Analyst_Decision bound to the exact action_id, Stored_Action version, and based_on_state_version, SHALL emit an Audit_Event for the decision, and SHALL transition an approved action to the approved Action_State.
9. IF the Backend receives an approval whose based_on_state_version is older than the action's current based_on_state_version and a later relevant Incident_State version exists, THEN THE Backend SHALL reject the approval as stale and SHALL NOT transition the action to approved.
10. THE Frontend SHALL source complete action detail for review from the `POST /cases/{id}/runs` response for the just-run plan and from the Plan_Detail_Endpoint in Requirement 32 for any historical plan, and SHALL NOT fabricate action detail.
11. (Follow-on) Richer approvals workflow, bulk decisions, and cross-case queue management beyond the minimum-viable single-action review are deferred to a Follow-on increment.

### Requirement 24: Report tab and structured report generation [Core]

**User Story:** As a SOC analyst, I want a structured, collapsible report generated from stored records, so that I can assemble a traceable incident record without inventing data.

#### Acceptance Criteria

1. THE Frontend SHALL present the Report tab as collapsible sections for the executive summary, classification, timeline, affected assets and identities, evidence, ATT&CK mapping, decisions and approvals, recommended and simulated actions, validation results, unresolved gaps, and lessons and hardening.
2. WHEN the analyst requests report generation, THE Frontend SHALL call `POST /cases/{id}/reports`, and THE Backend SHALL generate a Structured_Report populated only from record-backed case data and return it; THE Frontend SHALL retrieve a previously generated Structured_Report via `GET /cases/{id}/reports`.
3. THE Backend SHALL populate every Structured_Report section only from record-backed case data, and WHERE a section has no record-backed data, THE Backend SHALL return that section as empty rather than fabricating content.
4. THE Frontend SHALL render each report section only from the Structured_Report returned by the Backend, and WHERE a section is empty, THE Frontend SHALL display that section as empty rather than displaying fabricated content.
5. THE Frontend SHALL display a completeness indicator derived from the count of record-backed sections present versus total sections, and SHALL NOT display an invented numeric accuracy percentage.
6. IF the `POST /cases/{id}/reports` or `GET /cases/{id}/reports` request fails, THEN THE Frontend SHALL display an honest error and SHALL NOT display a fabricated report.
7. WHILE PDF export is not yet implemented, THE Frontend SHALL display the PDF export control as disabled and labelled unavailable.
8. IF the analyst activates the PDF export control while it is disabled, THEN THE Frontend SHALL NOT initiate an export and SHALL NOT display a fabricated success.
9. (Follow-on) PDF export and rendering, and richer report composition and formatting beyond the minimum-viable collapsible record-backed sections, are deferred to a Follow-on increment.

### Requirement 25: Phishing scenario progressive behaviour [Follow-on]

**User Story:** As a presenter, I want the Phishing demo to expand scope on Batch 2, so that a lighter scenario still shows re-planning.

#### Acceptance Criteria

1. WHEN the presenter activates the batch-reveal control for Batch 1 of the Phishing Demo_Scenario, THE Frontend SHALL display a Plan v1 produced via the real backend Planning_Run, falling back to a labelled Offline_Fallback only when the FastAPI_Backend is unavailable.
2. THE Frontend SHALL advance Phishing Demo_Scenario batches only in response to an explicit presenter batch-reveal control and SHALL NOT advance any batch based on elapsed real time.
3. IF the presenter activates the batch-reveal control for a Phishing Demo_Scenario batch that is already revealed, THEN THE Frontend SHALL leave the displayed evidence and plan version unchanged.
4. WHEN the presenter activates the batch-reveal control for Batch 2 of the Phishing Demo_Scenario, THE Frontend SHALL display an expanded incident scope and a Plan v2 that differs from Plan v1 by at least one Action.
5. THE Frontend SHALL NOT display any interface text within the Phishing Demo_Scenario that claims any Action was executed against real infrastructure.

### Requirement 26: False-alarm scenario evidence-request gate [Follow-on]

**User Story:** As a presenter, I want the False-alarm demo to require an evidence request before closing, so that the audience sees the agent avoid a false positive responsibly.

#### Acceptance Criteria

1. WHEN the presenter activates the batch-reveal control for the initial evidence of the "Planned Backup Migration" Demo_Scenario, THE Frontend SHALL display the initial evidence and SHALL NOT auto-close the Case.
2. WHEN the initial evidence is revealed, THE Frontend SHALL display the agent's Evidence Request "Was there an approved change for FS-01 last night?"
3. WHILE the analyst has not supplied an input that exactly matches the change reference "CHG-2026-118", THE Frontend SHALL NOT classify the Case as a false positive and SHALL NOT close the Case.
4. IF the analyst supplies an input that does not exactly match the change reference "CHG-2026-118", THEN THE Frontend SHALL retain the open Case, SHALL continue to display the Evidence Request "Was there an approved change for FS-01 last night?", and SHALL display an indication that the supplied reference did not match.
5. WHEN the analyst supplies an input that exactly matches "CHG-2026-118", THE Frontend SHALL classify the Case as a false positive, SHALL NOT present or trigger any defensive Action, and SHALL display an evidence-backed report.
6. THE Frontend SHALL NOT display any interface text within the False-alarm Demo_Scenario that claims any Action was executed against real infrastructure.

### Requirement 27: CoreUI Icons Free icon system and attribution [Core]

**User Story:** As a maintainer, I want a consistent, correctly-licensed icon system, so that the UI is recognisable, accessible, and legally compliant.

#### Acceptance Criteria

1. THE Frontend SHALL adopt CoreUI Icons Free from https://github.com/coreui/coreui-icons as the icon source, using only the free linear `cil-*` icon family and SHALL NOT use CoreUI Pro icons.
2. THE Frontend SHALL source icons from the official `@coreui/icons` package and SHALL expose only the curated subset Caventas needs through the local Icon_Module rather than bundling or loading the entire icon set.
3. THE Frontend SHALL NOT reference Streamline icons.
4. WHERE a CoreUI icon path is copied into the Icon_Module, THE Frontend SHALL preserve the relevant attribution comments on the copied artwork.
5. THE Frontend SHALL display on an About or Credits surface the exact text "CoreUI Icons Free by the CoreUI Team — licensed under CC BY 4.0", a link to https://github.com/coreui/coreui-icons, and a link to https://creativecommons.org/licenses/by/4.0/.
6. THE Frontend SHALL document the CoreUI Icons Free dependency in the repository's third-party notices or frontend documentation, attributing the icon artwork to CC BY 4.0 and SHALL NOT describe the icon artwork as MIT-licensed.
7. THE Frontend SHALL render icon strokes using `currentColor`.
8. THE Frontend SHALL size navigation icons at 20px and workflow and empty-state icons at 24px.
9. THE Frontend SHALL NOT render any icon smaller than 18px.
10. THE Frontend SHALL pair every icon with a text label.
11. WHERE a button is icon-only, THE Frontend SHALL provide an accessible name and a tooltip.
12. THE Frontend SHALL use one icon family per surface.
13. THE Frontend SHALL provide a consistent `cil-*` icon for each of: Dashboard, Cases, Approvals, Guidance Library, Reports, Activity, Settings, Evidence, Timeline, Analysis, Response Plan, Human decision, Report, Endpoint, Identity, Network, Email, File, Warning, Success, Blocked, and Running.

### Requirement 28: Restrained motion [Core]

**User Story:** As a SOC analyst, I want restrained, respectful motion, so that transitions aid comprehension without distraction.

#### Acceptance Criteria

1. WHEN a tab changes, THE Frontend SHALL apply a fade transition with a duration of at least 120ms and at most 160ms.
2. WHEN a side panel enters, THE Frontend SHALL apply an entrance transition with a duration of at least 180ms and at most 220ms.
3. WHEN a setup step completes, THE Frontend SHALL apply a step-completion transition with a duration of at most 300ms.
4. WHEN new evidence arrives, THE Frontend SHALL apply a single emphasis transition that completes within 500ms and SHALL NOT flash or repeat.
5. WHERE the user has enabled `prefers-reduced-motion`, THE Frontend SHALL remove all non-essential motion defined in criteria 1 through 4 rather than only shortening its duration.
6. THE Frontend SHALL NOT display continuously animated charts.

### Requirement 29: Responsive layout [Core]

**User Story:** As a SOC analyst, I want the workspace to adapt across devices, so that I can work on desktop, tablet, or mobile without broken layout.

#### Acceptance Criteria

1. WHILE the viewport width is at least 1024px, THE Frontend SHALL display a persistent sidebar, a 3-column overview-card layout, and an optional right-side detail panel.
2. WHILE the viewport width is at least 768px and at most 1023px, THE Frontend SHALL display a collapsible sidebar, reflowed overview cards, and horizontally scrollable tabs.
3. WHILE the viewport width is at most 767px, THE Frontend SHALL display off-canvas navigation, one card per row, scrollable tabs, full-screen detail sheets in place of side panels, and compact lists in place of tables.
4. THE Frontend SHALL NOT produce horizontal overflow at any viewport width between 320px and 1920px inclusive.

### Requirement 30: Preserve stack, shell, and FastAPI boundary [Core]

**User Story:** As a maintainer, I want the existing foundations preserved, so that the redesign does not regress the established system.

#### Acceptance Criteria

1. THE Frontend SHALL preserve the existing React + Vite + TypeScript + Tailwind stack, the operational shell (top bar + sidebar), the existing routing, the Barlow and IBM Plex Mono typography, and the navy/lime design tokens defined in PRODUCT_Doc.
2. THE Frontend SHALL contact the FastAPI_Backend over HTTP only.
3. THE Frontend SHALL NOT access Firestore directly.
4. THE Backend SHALL NOT execute any Action against real infrastructure and SHALL route every Bounded_Simulation through the bounded simulator only.

### Requirement 31: Honest data, states, and visual restraint [Core]

**User Story:** As a SOC analyst, I want every surface to show only true data and honest states, so that I can trust what the interface tells me.

#### Acceptance Criteria

1. THE Frontend SHALL provide loading, empty, error, offline, and notification states on every data-driven surface.
2. THE Frontend SHALL distinguish a browser-offline condition from a FastAPI_Backend request failure by displaying a distinct state for each.
3. IF a FastAPI_Backend endpoint returns HTTP 501, THEN THE Frontend SHALL state plainly that the capability is not yet available and SHALL NOT display fabricated data or a false success.
4. THE Frontend SHALL NOT fabricate evidence, evidence IDs, metrics, or outcomes, and SHALL display only data backed by stored case records.
5. WHERE synthetic data is displayed, THE Frontend SHALL display a visible Synthetic_Data_Indicator adjacent to that data.
6. THE Frontend SHALL NOT apply decorative cyber effects, gradients, or neon glow.

### Requirement 32: Plan-detail endpoint for complete stored actions [Core]

**User Story:** As a maintainer, I want a backend endpoint that returns a plan with its complete stored actions, so that the Response Plan and Approvals surfaces can reload historical action detail after a page refresh without fabricating data.

#### Acceptance Criteria

1. THE Backend SHALL implement the Plan_Detail_Endpoint `GET /cases/{case_id}/plans/{plan_id}` that returns the Plan document together with its complete embedded Stored_Action detail, including for each action the action_id, version, based_on_state_version, tool, target, evidence_ids, policy_refs, rationale, prerequisites, risk, expected_effect, validation_checks, and current Action_State.
2. THE Backend SHALL keep Plans append-only and SHALL retain the version history of every Plan accessible through the Plan_Detail_Endpoint.
3. THE Frontend SHALL reload a historical Plan and its exact action versions after a page refresh via the Plan_Detail_Endpoint and SHALL NOT rely solely on the `POST /cases/{id}/runs` response for historical action detail.
4. WHERE both the `POST /cases/{id}/runs` response for the just-run Plan and the Plan_Detail_Endpoint are available, THE Frontend SHALL use the just-run response for the just-run Plan and the Plan_Detail_Endpoint for any other persisted Plan.
5. IF the Plan_Detail_Endpoint request fails, THEN THE Frontend SHALL display an honest error and SHALL NOT present fabricated action detail as record-backed.

### Requirement 33: Accessibility [Core]

**User Story:** As an analyst using assistive technology or a keyboard, I want the interface to be operable and legible, so that I can work without barriers.

#### Acceptance Criteria

1. WHERE a control is icon-only, THE Frontend SHALL provide an accessible name.
2. THE Frontend SHALL make all navigation and decision controls keyboard operable with a visible focus indicator.
3. THE Frontend SHALL NOT convey status by colour alone.
4. THE Frontend SHALL pair every status hue with a text label or an icon.

### Requirement 34: Mandatory automated tests [Core]

**User Story:** As a maintainer, I want the critical honesty, gating, invariant, and backend-path behaviours covered by automated tests, so that regressions in trust-critical logic are caught.

#### Acceptance Criteria

1. THE Frontend test suite SHALL cover apiClient result mapping for HTTP 501 responses, network failures, and browser-offline conditions, asserting each maps to its distinct honest state.
2. THE Frontend test suite SHALL cover Create New Case setup step gating, asserting that each step's prerequisite correctly meets or blocks the following step.
3. THE Frontend test suite SHALL cover tab availability, including that the Evidence tab and the Timeline tab never return to disabled once available, and that disabling the selected non-Overview tab falls back to the Overview tab.
4. THE Frontend test suite SHALL cover scenario batch advancement, asserting that advancement is presenter-driven only, is idempotent for an already-revealed batch, and never advances on elapsed real time.
5. THE Frontend test suite SHALL cover plan-diff completeness, asserting that every Plan v2 action is assigned to exactly one of the four categories unchanged, added, replaced-or-insufficient, or policy-triggered over the actual Plan v2 actions.
6. THE Backend test suite SHALL cover stale-approval invalidation, asserting that an approval bound to an earlier based_on_state_version is treated as invalidated after a later relevant Incident_State change and does not authorize a Bounded_Simulation.
7. THE Backend test suite SHALL cover the approvals decision path, asserting that a persisted Analyst_Decision binds to the exact action_id, version, and based_on_state_version and emits an Audit_Event.
8. THE Backend test suite SHALL cover Bounded_Simulation and Effect_Validation, asserting that simulation runs only via a valid non-stale approval, never executes against real infrastructure, records a simulation result, and transitions the action to a distinct simulated then validated_effective or validated_ineffective Action_State.
9. THE Backend test suite SHALL cover the Plan_Detail_Endpoint, asserting that it returns the Plan with complete embedded Stored_Action detail and retained version history.
10. THE Backend test suite SHALL cover structured report generation, asserting that every Structured_Report section is populated only from record-backed data and that a section with no record-backed data is returned empty.
11. THE Frontend test suite SHALL cover the false-alarm evidence gate, asserting that the Case closes as a false positive only on an exact match of "CHG-2026-118" and never on a non-matching input.

### Requirement 35: Keep PRODUCT.md accurate [Core]

**User Story:** As a maintainer, I want PRODUCT.md to reflect this redesign's durable decisions, so that the shared product context stays correct.

#### Acceptance Criteria

1. THE PRODUCT_Doc SHALL record durable decisions for Information Architecture, Progressive Disclosure, Scenario-Based Demonstration, and Action Boundary.
2. THE PRODUCT_Doc SHALL state the interface typography as Barlow.
3. THE PRODUCT_Doc SHALL NOT state the interface typography as IBM Plex Sans.
4. THE PRODUCT_Doc SHALL NOT contain icon filenames, route metadata, or component specifications; those details SHALL reside in DESIGN.md or frontend documentation.
