# Requirements Document

## Introduction

This feature is a large, multi-surface redesign of the Caventas Incident Response Planner frontend (React + Vite + TypeScript + Tailwind, under `frontend/`, talking to the FastAPI backend over HTTP only). It applies progressive-disclosure information architecture — informed by Firebase Console structure (concise global overview, detail separated into focused pages, underline tabs, one-step-at-a-time setup with future steps visible-but-disabled, icons aiding recognition) while borrowing none of Firebase's colour, type, or branding.

The redesign reduces text density on the global dashboard, introduces a step-wise Create New Case flow, adds demo scenario templates, and gives each case a dedicated workspace with underline tabs (Overview, Evidence, Timeline, Analysis, Response Plan, Approvals, Report). It encodes a progressive demonstration behaviour (the Infostealer main demo, the Phishing scenario, and the False-alarm scenario), an Approvals experience, a Report surface, a CoreUI-based icon system with attribution, restrained motion, and a responsive layout.

Throughout, the four legible product states — proposed, approved, executed, effective — must never be blurred; the UI must degrade honestly against HTTP 501 backend stubs; and only synthetic, record-backed data may be shown. The existing stack, operational shell (top bar + sidebar), routing, Barlow + IBM Plex Mono typography, and the navy/lime design-token palette MUST be preserved. The FastAPI boundary is absolute: the UI never reaches Firestore directly.

### Delivery sequencing (core vs follow-on)

To make a first shippable slice clear, requirements are labelled:

- **[Core]** — part of the first increment: Dashboard redesign, Create New Case flow, the Infostealer main-demo scenario, the icon system, cross-cutting constraints, and PRODUCT.md accuracy.
- **[Follow-on]** — subsequent increments: Phishing and False-alarm scenarios, and the deeper case tabs (Timeline, Analysis, Response Plan, Approvals, Report) beyond what the main demo requires.

Each requirement below carries a `[Core]` or `[Follow-on]` tag in its heading.

## Glossary

- **Caventas_Frontend**: The React + Vite + TypeScript + Tailwind single-page application under `frontend/` that renders the analyst workspace. The system under specification. Shortened to "the Frontend" in acceptance criteria.
- **FastAPI_Backend**: The existing Python/FastAPI service the Frontend calls over HTTP. The only data source the Frontend may contact.
- **Case**: The system-of-record root for one incident. Has a status of open, investigating, contained, recovered, or closed.
- **Incident_State**: A versioned, never-overwritten snapshot of an incident containing entities, relationships, timeline, findings, MITRE ATT&CK mappings, hypotheses, missing evidence, and recovery status. Each snapshot has an integer `version`.
- **State_Version**: The integer `version` of an Incident_State snapshot.
- **Entity**: A tracked object in an Incident_State, of type host, account, process, file, ip, or domain.
- **Relationship_Status**: Whether a relationship is `observed` (directly supported by evidence) or `inferred` (hypothesized).
- **Recovery_Status**: The Incident_State recovery field: investigating, containing, eradicating, recovering, or resolved.
- **Planning_Run**: A backend run (`POST /cases/{id}/runs`) that drives the AI planner through analyze → sufficiency route → propose, producing a Plan. Its lifecycle presents to the Frontend as active or blocked.
- **Plan**: The output of a Planning_Run for one Stage; contains Proposed_Actions and may report missing evidence. Plans are versioned (Plan v1, Plan v2, ...).
- **Stage**: One of assessment, preservation, containment, eradication, hardening, or restoration.
- **Proposed_Action**: An AI-proposed action with a tool, target entity, evidence refs, policy refs, rationale, prerequisites, risk, expected effect, and validation checks.
- **Stored_Action**: A Proposed_Action after backend validation and persistence, carrying an integer `version` so an approval binds to one exact revision.
- **Action_State**: The displayed lifecycle state of a Stored_Action, restricted to exactly: Proposed, Approved, Simulated, Validated effective, Validated ineffective, Superseded.
- **Audit_Event**: A factual record emitted by the backend for every meaningful activity.
- **Evidence_Item**: A normalized record derived from an uploaded evidence file, carrying a SHA-256 hash, source file reference, evidence type, and observed/inferred status.
- **Case_Workspace**: The dedicated per-case surface containing the persistent case header and the underline tabs.
- **Needs_Attention_Section**: The dashboard region listing at most three items requiring analyst attention.
- **Setup_Panel**: The right-side panel of the Create New Case flow that reveals one active step at a time.
- **Demo_Scenario**: A clearly-labelled, demonstration-only preset that loads synthetic evidence for a known incident narrative.
- **Stub_Endpoint**: A FastAPI_Backend endpoint that currently returns HTTP 501 (approvals, execution, reporting — backlog BL-003).
- **Icon_Module**: A local module holding the selected subset of CoreUI Icons used by the Frontend.
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
2. THE Frontend SHALL render a compact 7-day activity chart within the Case Activity card using 7 contiguous day-length buckets covering the trailing 7 calendar days ending on the current day, assigning each Audit_Event returned by the FastAPI_Backend to the bucket containing its timestamp.
3. WHILE the Case Activity card is awaiting FastAPI_Backend data, THE Frontend SHALL display a distinct loading state and SHALL NOT present stale or placeholder values as current data.
4. IF no Audit_Event data exists for the trailing 7 days, THEN THE Frontend SHALL display an honest empty state within the activity chart rather than a fabricated or zero-filled trend presented as data.
5. IF the FastAPI_Backend request for Case Activity data fails, THEN THE Frontend SHALL display an error state and SHALL NOT present stale or placeholder values as current data.
6. THE Frontend SHALL derive every Case Activity card value from current FastAPI_Backend data and SHALL NOT display hardcoded values.
7. THE Frontend SHALL NOT render the Case Activity chart as a continuously animated element.

### Requirement 3: Dashboard Agent Planning overview card [Core]

**User Story:** As a SOC analyst, I want a compact Agent Planning card, so that I can see where automated planning stands.

#### Acceptance Criteria

1. THE Frontend SHALL display an Agent Planning overview card showing the count of active Planning_Runs, defined as Planning_Runs whose Stage is not blocked, and the count of blocked Planning_Runs, defined as Planning_Runs whose Stage reports a blocked lifecycle.
2. THE Frontend SHALL render a compact Stage distribution within the Agent Planning card derived from Planning_Run data returned by the FastAPI_Backend, grouping Planning_Runs by Stage and ordering the Stages by the backend workflow Stage sequence.
3. WHILE the Agent Planning card is awaiting FastAPI_Backend data, THE Frontend SHALL display a distinct loading state and SHALL NOT present stale or placeholder values as current data.
4. IF no Planning_Run data exists, THEN THE Frontend SHALL display an honest empty state within the Agent Planning card.
5. IF the FastAPI_Backend request for Agent Planning data fails, THEN THE Frontend SHALL display an error state and SHALL NOT present stale or placeholder values as current data.
6. THE Frontend SHALL derive every Agent Planning card value from current FastAPI_Backend data and SHALL NOT display hardcoded values.

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
3. WHERE a Recent Cases row is displayed, THE Frontend SHALL show the Case title, Classification, current Stage, updated time, and Status.
4. THE Frontend SHALL NOT display description paragraphs within the Recent Cases table.
5. WHILE the Recent Cases table is awaiting FastAPI_Backend data, THE Frontend SHALL display a distinct loading state and SHALL NOT present stale or placeholder values as current data.
6. IF no Cases exist, THEN THE Frontend SHALL display an honest empty state within the Recent Cases table.
7. IF the FastAPI_Backend request for Recent Cases data fails, THEN THE Frontend SHALL display an error state and SHALL NOT present stale or placeholder values as current data.
8. THE Frontend SHALL derive the Recent Cases rows from current FastAPI_Backend data.

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

### Requirement 9: Create New Case Step 2 — Evidence [Core]

**User Story:** As a SOC analyst, I want to upload evidence after entering details, so that the case has material to analyze.

#### Acceptance Criteria

1. WHEN Step 2 is active, THE Frontend SHALL accept uploads in CSV, JSON, and TXT formats and SHALL display the accepted formats.
2. WHEN a file is accepted, THE Frontend SHALL display each accepted file as a compact row with a source icon.
3. IF an uploaded file is not in CSV, JSON, or TXT format, THEN THE Frontend SHALL reject the file and SHALL display a wrong-file-type error.
4. IF the FastAPI_Backend reports an uploaded file as malformed or unparseable, THEN THE Frontend SHALL reject the file and SHALL display a malformed-record error.
5. IF an uploaded file exceeds 10 MB, THEN THE Frontend SHALL reject the file and SHALL display a file-size error.
6. THE Frontend SHALL keep advanced evidence fields hidden until at least one file is accepted.
7. IF no file has been accepted, THEN THE Frontend SHALL keep the Step 3 prerequisite unmet and SHALL display the reason on the disabled Step 3.

### Requirement 10: Create New Case Step 3 — Evidence Review [Core]

**User Story:** As a SOC analyst, I want to review ingested evidence, so that I confirm what was accepted before analysis.

#### Acceptance Criteria

1. WHEN Step 3 is active, THE Frontend SHALL display the accepted record count, the detected sources, and the count of rejected or malformed records exactly as returned by the FastAPI_Backend without substituting fabricated values.
2. WHEN the analyst explicitly requests it, THE Frontend SHALL display the SHA-256 hash and ingestion status rather than displaying them by default.
3. THE Frontend SHALL require the analyst to confirm the evidence review before the Step 4 prerequisite is met.
4. WHEN the analyst changes the evidence after confirming the review, THE Frontend SHALL clear the prior review confirmation.
5. IF the analyst has not confirmed the evidence review, THEN THE Frontend SHALL keep the Step 4 prerequisite unmet and SHALL display the reason on the disabled Step 4.

### Requirement 11: Create New Case Step 4 — Start Analysis [Core]

**User Story:** As a SOC analyst, I want a final summary before starting analysis, so that I begin from a confirmed baseline.

#### Acceptance Criteria

1. WHEN Step 4 is active, THE Frontend SHALL display a summary containing the Case details, the evidence sources, the accepted record count, and the current State_Version.
2. THE Frontend SHALL present a primary action labelled "Start analysis" within Step 4.
3. WHEN the analyst activates "Start analysis", THE Frontend SHALL request the FastAPI_Backend to begin a Planning_Run for the Case.
4. IF a Planning_Run for the Case has already been started, THEN THE Frontend SHALL NOT request a duplicate Planning_Run.
5. IF the FastAPI_Backend request to begin a Planning_Run fails, THEN THE Frontend SHALL display an honest error and SHALL NOT display a false success.

### Requirement 12: Demo scenario templates [Core]

**User Story:** As a presenter, I want clearly-labelled demo scenario templates, so that I can load a known incident narrative for demonstration.

#### Acceptance Criteria

1. THE Frontend SHALL present a helper labelled "Load demo scenario" that is explicitly marked as for demonstration only and not for production use.
2. THE Frontend SHALL display three Demo_Scenario cards, each with a one-sentence description: "Infostealer to Session Hijack" with badge "Main demo", "Phishing to Account Takeover" with badge "Light scenario", and "Planned Backup Migration" with badge "False alarm".
3. THE Frontend SHALL read the fictional organisation label "Caventas Demo Organisation" from exactly one configuration value and SHALL NOT hardcode that label elsewhere.
4. WHERE a Demo_Scenario populates fields, THE Frontend SHALL keep those fields editable and SHALL retain any manual override the analyst applies.
5. THE Frontend SHALL exclude unrelated placeholder incidents (generic OAuth, beacon, and credential-stuffing) from the primary demo fixtures except where required for isolated component testing.

### Requirement 13: Case Workspace header and underline tabs [Core]

**User Story:** As a SOC analyst, I want each case to open in a dedicated workspace with a persistent header and underline tabs, so that I keep context while moving between facets.

#### Acceptance Criteria

1. WHEN the analyst opens a Case, THE Frontend SHALL display a Case_Workspace with a persistent case header showing the title, severity, incident status, current response Stage, last-updated time, and a compact agent state.
2. THE Frontend SHALL display the case header once per Case_Workspace and SHALL NOT repeat the header content inside each tab.
3. THE Frontend SHALL present the tabs Overview, Evidence, Timeline, Analysis, Response Plan, Approvals, and Report using an underline tab style and SHALL NOT present them as pill-style tabs.

### Requirement 14: Case Workspace tab-availability state machine [Core]

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

### Requirement 15: Case Overview tab [Follow-on]

**User Story:** As a SOC analyst, I want a visual, concise case overview, so that I grasp the case state without reading detail.

#### Acceptance Criteria

1. WHEN the Overview tab is shown, THE Frontend SHALL display a one-sentence case summary, an affected-entities count, an evidence-source count, the current hypothesis, the current response Stage, a missing-evidence indicator, and a compact agent-progress indicator.
2. THE Frontend SHALL provide links from the Overview tab to the corresponding detail tabs rather than reproducing their content.
3. THE Frontend SHALL NOT display long paragraph text within the Overview tab.

### Requirement 16: Evidence tab [Follow-on]

**User Story:** As a SOC analyst, I want to filter and inspect evidence, so that I can examine source records in detail.

#### Acceptance Criteria

1. THE Frontend SHALL provide secondary filters labelled All, Endpoint, Identity, Network, Application, and Analyst Notes on the Evidence tab.
2. WHERE an Evidence_Item row is displayed, THE Frontend SHALL show a source icon, a timestamp, a concise title, the evidence type, and the observed-or-inferred status.
3. WHEN the analyst selects an Evidence_Item row, THE Frontend SHALL open a side panel showing the full content, the SHA-256 hash, the source file, related entities, the ATT&CK mapping, the agent usage, and the State_Version.
4. WHEN the analyst selects a different Evidence_Item row while the side panel is open, THE Frontend SHALL replace the side-panel content with the newly selected Evidence_Item without closing the side panel.
5. WHEN the analyst dismisses the side panel, THE Frontend SHALL close the side panel and clear the Evidence_Item selection.

### Requirement 17: Timeline tab [Follow-on]

**User Story:** As a SOC analyst, I want a chronological timeline, so that I understand event sequence and relationships.

#### Acceptance Criteria

1. THE Frontend SHALL display timeline events in chronological order, each with an icon and a short label.
2. THE Frontend SHALL support displaying relevant events, decoy-benign events, analyst-added events, and held-back-or-newly-introduced events, and SHALL distinguish observed from inferred relationships.
3. WHILE the appropriate demo stage has not been reached, THE Frontend SHALL NOT reveal held-back evidence in the timeline.
4. WHEN the analyst selects a timeline event that has associated evidence, THE Frontend SHALL open the evidence detail panel for that event.
5. IF the analyst selects a timeline event that has no associated evidence, THEN THE Frontend SHALL display an indication that no evidence is associated and SHALL NOT open the evidence detail panel.

### Requirement 18: Analysis tab [Follow-on]

**User Story:** As a SOC analyst, I want concise analysis sections, so that I understand the agent's assessment without a wall of text.

#### Acceptance Criteria

1. WHEN the Analysis tab is shown, THE Frontend SHALL display concise sections for the current classification, the confidence with its evidence basis, the affected entities, the ATT&CK techniques, the missing evidence, and the active hypotheses.
2. THE Frontend SHALL label the displayed confidence as advisory.
3. THE Frontend SHALL provide expandable sections for detailed reasoning rather than one continuous text block.

### Requirement 19: Response Plan tab and six action states [Follow-on]

**User Story:** As a SOC analyst, I want to navigate a plan by stage and see each action's exact state, so that I never confuse a recommendation with a confirmed outcome.

#### Acceptance Criteria

1. THE Frontend SHALL provide Stage navigation across Assessment, Preservation, Containment, Eradication, Hardening, and Restoration, and SHALL display only the selected Stage's actions.
2. WHERE the selected Stage has no actions, THE Frontend SHALL display an explicit empty-stage indication and SHALL keep Stage navigation available.
3. WHERE an action is displayed on the Response Plan tab, THE Frontend SHALL show the action, the target, the risk, the approval requirement, and the current Action_State.
4. WHEN the analyst opens an action's detail, THE Frontend SHALL display the rationale, policy references, expected effect, and validation checks in a side panel.
5. THE Frontend SHALL represent each Action_State using exactly one of the mutually exclusive states Proposed, Approved, Simulated, Validated effective, Validated ineffective, or Superseded.
6. THE Frontend SHALL display the Simulated state and the Validated-effective state as distinct states, SHALL NOT collapse a Simulated action into a Validated-effective outcome, and SHALL NOT collapse a Validated-effective outcome into a Simulated state.
7. THE Frontend SHALL present every action as a recommendation and SHALL NOT state that any real infrastructure was modified.

### Requirement 20: Infostealer main-demo progressive behaviour [Core]

**User Story:** As a presenter, I want the Infostealer demo to re-plan visibly when new evidence arrives, so that the audience sees the human-in-the-loop re-planning value.

#### Acceptance Criteria

1. WHEN the presenter activates the batch-reveal control for Batch 1 of the Infostealer Demo_Scenario, THE Frontend SHALL display the initial infostealer evidence and a Plan v1 containing exactly the four actions isolate laptop, preserve memory and disk, block domain, and re-image after preservation.
2. THE Frontend SHALL advance Demo_Scenario batches only in response to an explicit presenter batch-reveal control and SHALL NOT reveal, advance, or re-plan any batch based on elapsed real time.
3. IF the presenter activates the batch-reveal control for a batch that is already revealed, THEN THE Frontend SHALL leave the displayed evidence, plan version, and diff unchanged.
4. WHEN the presenter activates the batch-reveal control for Batch 2 of the Infostealer Demo_Scenario, THE Frontend SHALL display a visible "New evidence received" announcement and the session replay with the 1,200 CRM record export.
5. WHEN Batch 2 is revealed, THE Frontend SHALL create a Plan v2 and SHALL display a visual diff that assigns every Plan v2 action to exactly one of the four categories unchanged, added, replaced-or-insufficient, or policy-triggered, where the four categories are mutually exclusive and collectively exhaustive over all Plan v2 actions.
6. WHEN the Plan v2 diff is displayed, THE Frontend SHALL display the re-plan explanation "Re-imaging the laptop was necessary but not sufficient: the stolen session is still valid."
7. WHERE the partner-portal flag is enabled, THE Frontend SHALL permit the presenter batch-reveal control to reveal optional Batch 3.
8. WHERE the partner-portal flag is disabled, THE Frontend SHALL NOT reveal Batch 3 for any presenter batch-reveal control activation.
9. THE Frontend SHALL NOT display any interface text within the Infostealer Demo_Scenario that claims any Action was executed against real infrastructure.

### Requirement 21: Phishing scenario progressive behaviour [Follow-on]

**User Story:** As a presenter, I want the Phishing demo to expand scope on Batch 2, so that a lighter scenario still shows re-planning.

#### Acceptance Criteria

1. WHEN the presenter activates the batch-reveal control for Batch 1 of the Phishing Demo_Scenario, THE Frontend SHALL display a Plan v1.
2. THE Frontend SHALL advance Phishing Demo_Scenario batches only in response to an explicit presenter batch-reveal control and SHALL NOT advance any batch based on elapsed real time.
3. IF the presenter activates the batch-reveal control for a Phishing Demo_Scenario batch that is already revealed, THEN THE Frontend SHALL leave the displayed evidence and plan version unchanged.
4. WHEN the presenter activates the batch-reveal control for Batch 2 of the Phishing Demo_Scenario, THE Frontend SHALL display an expanded incident scope and a Plan v2 that differs from Plan v1 by at least one Action.
5. THE Frontend SHALL NOT display any interface text within the Phishing Demo_Scenario that claims any Action was executed against real infrastructure.

### Requirement 22: False-alarm scenario evidence-request gate [Follow-on]

**User Story:** As a presenter, I want the False-alarm demo to require an evidence request before closing, so that the audience sees the agent avoid a false positive responsibly.

#### Acceptance Criteria

1. WHEN the presenter activates the batch-reveal control for the initial evidence of the "Planned Backup Migration" Demo_Scenario, THE Frontend SHALL display the initial evidence and SHALL NOT auto-close the Case.
2. WHEN the initial evidence is revealed, THE Frontend SHALL display the agent's Evidence Request "Was there an approved change for FS-01 last night?"
3. WHILE the analyst has not supplied an input that exactly matches the change reference "CHG-2026-118", THE Frontend SHALL NOT classify the Case as a false positive and SHALL NOT close the Case.
4. IF the analyst supplies an input that does not exactly match the change reference "CHG-2026-118", THEN THE Frontend SHALL retain the open Case, SHALL continue to display the Evidence Request "Was there an approved change for FS-01 last night?", and SHALL display an indication that the supplied reference did not match.
5. WHEN the analyst supplies an input that exactly matches "CHG-2026-118", THE Frontend SHALL classify the Case as a false positive, SHALL NOT present or trigger any defensive Action, and SHALL display an evidence-backed report.
6. THE Frontend SHALL NOT display any interface text within the False-alarm Demo_Scenario that claims any Action was executed against real infrastructure.

### Requirement 23: Approvals experience [Follow-on]

**User Story:** As a SOC analyst, I want to review and decide on actions in both the case and global surfaces, so that I can act from wherever I am.

#### Acceptance Criteria

1. THE Frontend SHALL present the Approvals experience on both the case Approvals tab and the global Approvals page.
2. THE Frontend SHALL display on the dashboard exactly one aggregate awaiting-approval count and at most one urgent shortcut, and SHALL NOT display any individual action detail or per-action approve/reject control on the dashboard.
3. WHEN the analyst opens an action for review, THE Frontend SHALL display the recommendation, the target, the supporting evidence, the organisation-policy reference, the expected effect, the risk, the required approver, and the State_Version.
4. THE Frontend SHALL present Approve, Reject, and Request-more-investigation controls when reviewing an action.
5. IF the analyst selects Reject or Request-more-investigation, THEN THE Frontend SHALL require an analyst comment containing at least one non-whitespace character before submitting the decision.
6. IF the analyst submits a Reject or Request-more-investigation decision with a comment that is empty or contains only whitespace, THEN THE Frontend SHALL block submission and SHALL display a validation message indicating a comment is required.
7. IF the approval Stub_Endpoint returns HTTP 501, THEN THE Frontend SHALL state plainly that the capability is not yet available and SHALL NOT display a fabricated success.

### Requirement 24: Report tab [Follow-on]

**User Story:** As a SOC analyst, I want a structured, collapsible report, so that I can assemble a traceable incident record without inventing data.

#### Acceptance Criteria

1. THE Frontend SHALL present the Report tab as collapsible sections for the executive summary, classification, timeline, affected assets and identities, evidence, ATT&CK mapping, decisions and approvals, recommended and simulated actions, validation results, unresolved gaps, and lessons and hardening.
2. THE Frontend SHALL display a completeness indicator derived from the count of record-backed sections present versus total sections, and SHALL NOT display an invented numeric accuracy percentage.
3. WHILE the reporting Stub_Endpoint does not support PDF export, THE Frontend SHALL display the PDF export control as disabled and labelled unavailable.
4. IF the analyst activates the PDF export control while it is disabled, THEN THE Frontend SHALL NOT initiate an export and SHALL NOT display a fabricated success.
5. THE Frontend SHALL populate every report section only from record-backed FastAPI_Backend data, and WHERE a section has no record-backed data, THE Frontend SHALL display that section as empty rather than displaying fabricated content.

### Requirement 25: CoreUI icon system and attribution [Core]

**User Story:** As a maintainer, I want a consistent, correctly-licensed icon system, so that the UI is recognisable, accessible, and legally compliant.

#### Acceptance Criteria

1. THE Frontend SHALL adopt CoreUI Icons as the icon reference and SHALL store the selected subset in a local Icon_Module rather than importing the whole library.
2. THE Frontend SHALL display CoreUI attribution on a Credits or About surface, because CoreUI Icons Free artwork is licensed under CC BY 4.0 and requires attribution even though CoreUI's code packages are MIT-licensed.
3. THE Frontend SHALL render icon strokes using `currentColor`.
4. THE Frontend SHALL size navigation icons at 20px and workflow and empty-state icons at 24px.
5. THE Frontend SHALL NOT render any icon smaller than 18px.
6. THE Frontend SHALL pair every icon with a text label.
7. WHERE a button is icon-only, THE Frontend SHALL provide an accessible name and a tooltip.
8. THE Frontend SHALL use one icon family per surface.
9. THE Frontend SHALL provide a consistent icon for each of: Dashboard, Cases, Approvals, Guidance Library, Reports, Activity, Settings, Evidence, Timeline, Analysis, Response Plan, Human decision, Report, Endpoint, Identity, Network, Email, File, Warning, Success, Blocked, and Running.

### Requirement 26: Restrained motion [Core]

**User Story:** As a SOC analyst, I want restrained, respectful motion, so that transitions aid comprehension without distraction.

#### Acceptance Criteria

1. WHEN a tab changes, THE Frontend SHALL apply a fade transition with a duration of at least 120ms and at most 160ms.
2. WHEN a side panel enters, THE Frontend SHALL apply an entrance transition with a duration of at least 180ms and at most 220ms.
3. WHEN a setup step completes, THE Frontend SHALL apply a step-completion transition with a duration of at most 300ms.
4. WHEN new evidence arrives, THE Frontend SHALL apply a single emphasis transition that completes within 500ms and SHALL NOT flash or repeat.
5. WHERE the user has enabled `prefers-reduced-motion`, THE Frontend SHALL remove all non-essential motion defined in criteria 1 through 4 rather than only shortening its duration.
6. THE Frontend SHALL NOT display continuously animated charts.

### Requirement 27: Responsive layout [Core]

**User Story:** As a SOC analyst, I want the workspace to adapt across devices, so that I can work on desktop, tablet, or mobile without broken layout.

#### Acceptance Criteria

1. WHILE the viewport width is at least 1024px, THE Frontend SHALL display a persistent sidebar, a 3-column overview-card layout, and an optional right-side detail panel.
2. WHILE the viewport width is at least 768px and at most 1023px, THE Frontend SHALL display a collapsible sidebar, reflowed overview cards, and horizontally scrollable tabs.
3. WHILE the viewport width is at most 767px, THE Frontend SHALL display off-canvas navigation, one card per row, scrollable tabs, full-screen detail sheets in place of side panels, and compact lists in place of tables.
4. THE Frontend SHALL NOT produce horizontal overflow at any viewport width between 320px and 1920px inclusive.

### Requirement 28: Preserve stack, shell, and FastAPI boundary [Core]

**User Story:** As a maintainer, I want the existing foundations preserved, so that the redesign does not regress the established system.

#### Acceptance Criteria

1. THE Frontend SHALL preserve the existing React + Vite + TypeScript + Tailwind stack, the operational shell (top bar + sidebar), the existing routing, the Barlow and IBM Plex Mono typography, and the navy/lime design tokens defined in PRODUCT_Doc.
2. THE Frontend SHALL contact the FastAPI_Backend over HTTP only.
3. THE Frontend SHALL NOT access Firestore directly.

### Requirement 29: Honest data, states, and visual restraint [Core]

**User Story:** As a SOC analyst, I want every surface to show only true data and honest states, so that I can trust what the interface tells me.

#### Acceptance Criteria

1. THE Frontend SHALL provide loading, empty, error, offline, and notification states on every data-driven surface.
2. THE Frontend SHALL distinguish a browser-offline condition from a FastAPI_Backend request failure by displaying a distinct state for each.
3. IF a FastAPI_Backend endpoint returns HTTP 501, THEN THE Frontend SHALL state plainly that the capability is not yet available and SHALL NOT display fabricated data or a false success.
4. THE Frontend SHALL NOT fabricate evidence, evidence IDs, metrics, or outcomes, and SHALL display only data backed by stored case records.
5. WHERE synthetic data is displayed, THE Frontend SHALL display a visible Synthetic_Data_Indicator adjacent to that data.
6. THE Frontend SHALL NOT apply decorative cyber effects, gradients, or neon glow.

### Requirement 30: Accessibility [Core]

**User Story:** As an analyst using assistive technology or a keyboard, I want the interface to be operable and legible, so that I can work without barriers.

#### Acceptance Criteria

1. WHERE a control is icon-only, THE Frontend SHALL provide an accessible name.
2. THE Frontend SHALL make all navigation and decision controls keyboard operable with a visible focus indicator.
3. THE Frontend SHALL NOT convey status by colour alone.
4. THE Frontend SHALL pair every status hue with a text label or an icon.

### Requirement 31: Keep PRODUCT.md accurate [Core]

**User Story:** As a maintainer, I want PRODUCT.md to reflect this redesign's durable decisions, so that the shared product context stays correct.

#### Acceptance Criteria

1. THE PRODUCT_Doc SHALL record durable decisions for Information Architecture, Progressive Disclosure, Scenario-Based Demonstration, and Action Boundary.
2. THE PRODUCT_Doc SHALL state the interface typography as Barlow.
3. THE PRODUCT_Doc SHALL NOT state the interface typography as IBM Plex Sans.
4. THE PRODUCT_Doc SHALL NOT contain icon filenames, route metadata, or component specifications; those details SHALL reside in DESIGN.md or frontend documentation.
