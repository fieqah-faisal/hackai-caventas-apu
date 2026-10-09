# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite + Tailwind CSS for the analyst workspace frontend, talking to the
existing FastAPI backend over HTTP. Chosen over the steering notes' Streamlit
flow because the operational shell (persistent top bar, compact sidebar,
selected navigation states, thin borders, restrained accent) needs layout and
interaction-state control that Streamlit does not give cleanly. The backend
(Python / FastAPI / Firestore via Firebase Admin SDK) is unchanged; the UI
never touches Firestore directly. This stack choice is recorded for team
review and may be vetoed.

## Users

Primary: Tier 1 and junior Tier 2 SOC (Security Operations Center) analysts
working an active incident queue. They triage incoming cases, read AI-proposed
response plans, decide whether to approve each proposed action, and watch
simulated outcomes. They are time-pressured, work across several cases at once,
and are not senior incident commanders. Secondary (future scope, not built):
senior analysts who receive escalated high-impact approvals.

## Product Purpose

Caventas is a human-in-the-loop agentic incident-response planning workspace.
It ingests synthetic incident evidence (logs, alerts, analyst notes), maintains
a versioned incident state, lets an AI planner recommend response actions, and
requires an analyst to approve each action before it is executed in a bounded
simulator. Success is a structured, complete, traceable incident-response
report backed by stored case records. The system recommends; analysts decide;
all execution is simulated.

## Positioning

The defining mechanism is strict separation of four states that most "AI
security copilot" tools blur: proposed, approved, executed, and effective. AI
output is never authorization. An action executes only when it passes a chain
of backend checks (approved tool, existing target, evidence references, a valid
incident-state version, an analyst approval bound to that exact action version,
an approval not invalidated by later state changes, and backend validation).
A completed execution does not by itself mean the response was effective. The
interface must make these four states legible and never let the AI's confidence
read as a decision already made.

## Operating Context

Analyst workflow, matching the backend pipeline:

Evidence -> normalization -> incident state -> AI analysis (planning run) ->
response proposal -> human approval -> simulated action -> effect validation ->
incident-state update -> replanning -> incident report.

- A **case** is the system-of-record root for one incident (status: open,
  investigating, contained, recovered, closed).
- **Incident state** is versioned and never overwritten; it holds entities
  (host, account, process, file, ip, domain), relationships (observed vs
  inferred), a timeline, findings, MITRE ATT&CK mappings, hypotheses, missing
  evidence, and recovery status (investigating, containing, eradicating,
  recovering, resolved).
- A **planning run** (`POST /cases/{id}/runs`) drives the AI planner through
  analyze -> sufficiency route -> propose, producing a **plan** for a response
  **stage** (assessment, preservation, containment, eradication, hardening,
  restoration). A plan contains proposed actions and may report missing
  evidence.
- A **proposed action** has a tool, a target entity, evidence refs, policy
  refs, rationale, prerequisites, risk, expected effect, and validation checks.
  A stored action carries a version so an approval binds to one exact revision.
- Approval routing: a single analyst may approve routine actions; high-impact
  actions (e.g. host isolation, account block) flag for senior review before
  they can execute.
- Concurrency: the workspace is a shared SOC view. The dashboard shows the
  whole team's open cases and pending approvals, not a per-analyst "my work"
  slice. Per-analyst case assignment and ownership are recorded as future
  capability, not built in the MVP.
- Everything meaningful emits an audit event; the activity log is a factual
  trail, not a feed.

## Capabilities and Constraints

Implemented backend today: case creation, evidence ingestion (CSV/JSON/TXT via
upload, original stored on local filesystem with SHA-256 in Firestore),
versioned incident state, audit trail, and the AI planning run plus plan
listing (`/cases/{id}/runs`, `/cases/{id}/plans`). Approvals, bounded simulated
execution, effect validation, and report generation are defined contracts but
currently HTTP 501 stubs (backlog BL-003). The frontend must therefore render
approval, execution, and report surfaces against their known contracts while
tolerating not-yet-implemented endpoints, and must not invent data those
endpoints will later own.

Hard constraints:
- Synthetic incident data only. The product never attacks, scans, or modifies
  real systems; all execution is a bounded Python simulator.
- The UI must not fabricate evidence, evidence IDs, metrics, or outcomes. It
  shows only facts backed by stored case records.
- AI confidence/rationale is advisory. The UI must never present a proposal as
  an approved or effective action.
- The UI calls FastAPI only; it never reaches Firestore directly.

## Brand Commitments

Name: Caventas. This is an operational interface for working an incident, not a
marketing page, not a generic analytics dashboard. Voice is plain, precise, and
calm under pressure; no hype, no cybersecurity theatrics.

### Visual world: dark navy operational shell, lime reserved for action

The HTB Labs screenshot is both a structural reference (persistent top nav,
compact sidebar, selected states, thin borders) and the primary colour
reference (deep navy shell + restrained lime). Caventas uses an HTB-inspired
palette while keeping its own branding; HTB assets, logos, and gamification are
never duplicated.

Design tokens (authoritative — the frontend must use these exact values):

```
/* Backgrounds — deep navy canvas and chrome, lighter navy for hierarchy */
--bg-canvas:          #101827;  /* page canvas, behind everything */
--bg-shell:           #141E2D;  /* top navigation + sidebar chrome */
--bg-surface:         #1B2637;  /* primary content surface / list rows */
--bg-surface-raised:  #263145;  /* raised surface for emphasis within a region */
--bg-surface-hover:   #2D394D;  /* row / control hover */

/* Borders — thin blue-grey lines instead of shadows */
--border-subtle:      #2B374A;  /* default separators, region edges */
--border-strong:      #394558;  /* stronger division, focused inputs */

/* Text — off-white primary, muted blue-grey for metadata */
--text-primary:       #ECECED;  /* primary text, headings, labels */
--text-secondary:     #BAC5D7;  /* secondary content */
--text-muted:         #7788A4;  /* metadata, timestamps, de-emphasis */

/* Accent — lime, reserved for action / confirmed / selected */
--accent-primary:     #9DED00;  /* Create New Case, Approve, confirmed outcome */
--accent-hover:       #B0FF1A;
--accent-pressed:     #84C900;
--accent-text:        #101827;  /* text/icon on a lime fill */

/* Status — operational meaning only; always paired with label or icon */
--status-warning:     #F2B84B;  /* awaiting approval / caution */
--status-danger:      #FF5D5D;  /* failed / destructive / escalation */
--status-info:        #68A0FF;  /* informational / in-progress */
```

Colour rules (binding):
- Deep navy (`--bg-canvas`, `--bg-shell`) carries the page canvas, top
  navigation, and sidebar. Lighter navy surfaces (`--bg-surface`,
  `--bg-surface-raised`) establish hierarchy; no nested cards.
- Hierarchy and separation come from thin blue-grey borders
  (`--border-subtle` / `--border-strong`), never shadows.
- Lime is reserved for Create New Case, confirmed/effective outcomes, important
  active indicators, and selected controls. It is never decorative and never
  applied to inactive states.
- Active navigation is NOT lime text. Use a lighter navy selected background
  (`--bg-surface-raised`) with white text, plus an optional thin lime indicator
  bar if emphasis is needed.
- Off-white (`--text-primary`) for primary text; muted blue-grey
  (`--text-muted` / `--text-secondary`) for secondary metadata.
- Status is never conveyed by colour alone — every status pairs its hue with a
  text label and/or icon.

Explicit anti-references (do not do): gradients, neon glow, pure black,
excessive/large areas of green, coloured decorative backgrounds, glassmorphism,
excessive rounding, nested cards, invented charts, oversized typography,
decorative statistics, and cybersecurity cliches.

### Typography

Caventas uses Barlow for interface text and IBM Plex Mono for technical
identifiers, commands, hashes and structured values (case ids, state versions,
tool names). Monospace is used selectively and never for long explanatory
text. Fonts are self-hosted (bundled locally) so the UI makes no runtime
Google Fonts request. Hierarchy comes from deliberate differences in size,
weight and colour between headings, body and metadata — never colour alone.

## Evidence on Hand

Real backend schemas and endpoints define the vocabulary above (case,
incident_state, plan, proposed/stored action, stages, entity types, recovery
status). Fixtures exist for a login-logs scenario and provisional policy pack
(POL-01..04). There are no real customers, benchmarks, testimonials, SLAs, or
production deployment facts; future work must not fabricate any.

## Product Principles

1. Decision legibility over density: an analyst must always see what is
   proposed vs approved vs executed vs effective without reading twice.
2. Traceability is non-negotiable: every shown item links back to its case,
   evidence, state version, and audit trail.
3. The AI advises, the analyst decides: never style a recommendation as a
   settled outcome.
4. Restraint is the aesthetic: the shell recedes so case work leads; accent and
   emphasis are earned, not decorative.
5. Degrade honestly: where a capability is a stub, say so plainly rather than
   showing placeholder data.

## Accessibility & Inclusion

Operational tool used for sustained reading under time pressure: text and
status contrast must meet WCAG AA on the dark shell (>= 4.5:1 for normal text),
status must never be conveyed by color alone (pair the lime accent and any
status hue with a label or icon), and all navigation and approval controls must
be fully keyboard operable with visible focus.

## Dashboard Experience

The dashboard is an operational summary, not a full incident record. It uses
progressive disclosure and visually separates immediate attention, pending
human decisions, active agent work and recent changes. An operational summary
row (open cases, awaiting approval, active planning runs, blocked/missing
evidence) sits above the queues, with every value derived from case and
planning records rather than hardcoded. Detailed evidence, rationale, policy
references and state history remain on case-specific surfaces; dashboard rows
show only enough to decide where to go next.

## Case Workspace and Tabbed Progressive Disclosure

A case opens into a dedicated workspace, separate from the dashboard. A
persistent header carries case identity, status, stage and recovery, and the
agent planning state; beneath it, tabs disclose the incident in workflow order:
Overview, Evidence, Timeline, Analysis, Response Plan, Approvals and Report.

Tabs are gated by observable case facts rather than shown-then-broken: Evidence
and Timeline latch available once reached (analysts can always revisit), while
Analysis, Response Plan, Approvals and Report unlock only when their
prerequisite exists and relock if it stops being met. A disabled tab explains
why. This keeps the analyst oriented in the Evidence -> State -> Analysis ->
Proposal -> Approval -> Simulation -> Validation -> Report flow without hiding
where they are.

## Scenario-Based Demonstration Harness

The product is demonstrated through synthetic scenarios (e.g. an infostealer
that escalates to session hijack). The scenario layer is a presentation
harness, not a planner: it reveals pre-authored synthetic evidence and the
resulting plan versions. Revealing a later evidence batch drives a visible
re-plan (Plan v1 -> v2) with a diff that classifies each action as unchanged,
added, replaced/insufficient or policy-triggered. The harness never fabricates
backend behaviour and never claims real systems were touched.

## Action Boundary and Data-Source Honesty

The analyst UI selects exactly one data source per run and never mixes them
within a case. Fixture mode supplies deterministic synthetic data implementing
the complete intended contract (six-state action lifecycle, request-more-
investigation, plan history, separate simulation and validation, structured
report), and every such surface is visibly flagged as synthetic. API mode talks
only to endpoints the backend actually implements, surfaces known gaps
explicitly (e.g. no request-more-investigation endpoint, no PDF download), and
never silently falls back to synthetic data on failure. In both modes the AI
recommends, the analyst approves, and execution runs only in the bounded
simulator — the UI never presents a recommendation as an action already taken.

## Prototype Identity and Access Boundary

The MVP uses one fixed synthetic analyst identity. Registration,
authentication, email verification, password recovery, account deletion and
production role-based access control are outside the prototype scope. Senior
approval is represented as a workflow requirement (high-impact actions are
flagged and held) rather than a fully authenticated user role.

## Resilient Interface States

All data-driven surfaces must provide loading, empty, error and
network-failure states. Loading uses skeletons, not full-page spinners. The
interface never reports success before backend confirmation and never replaces
missing backend data with fabricated values; where a capability is a backend
stub, it says so plainly. Browser-offline is distinguished from a backend
request failure.