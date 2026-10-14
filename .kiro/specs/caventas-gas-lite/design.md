# Design Document

## Overview

GAS-lite (Graph-as-State, STAIR-inspired) is the **Incident State Manager** stage of
the Caventas human-in-the-loop IR pipeline. In Caventas the incident state is already
the complete, versioned understanding of an incident — this slice *enriches and extends*
that understanding so a single versioned snapshot can hold the case facts, normalized
evidence references, an entity-and-relationship graph, the reconstructed timeline, the
analytical assessment, the response situation, and the links out to proposed actions,
human decisions, action outcomes and the continuous report.

This is a **backend-only Core slice** and a **backward-compatible extension** of the
system that already exists:

- `app/schemas/incident_state.py` — the `IncidentState`, `Entity`, `Relationship`,
  `TimelineEvent` schemas (Raaj's base layer).
- `app/services/state_manager.py` — reconstructs and versions state
  (`rebuild_and_version`, `_reconstruct`, `get_current_state`, `get_state`).
- `app/database/repositories.py` — the sole Firestore data-access layer
  (`add_state_version`, `get_state_version`, `STATE-{version:03d}` doc ids).
- `app/api/evidence.py` — hosts the existing `GET /cases/{case_id}/state` endpoint.

It does **not** rebuild the project, replace Firestore, introduce a graph database, add
six AI agents, or reproduce STAIR. New structure is added to the existing schemas; a new
*pure* graph-building service `app/services/gas_lite.py` is introduced; `state_manager`
delegates reconstruction to it; two additive read endpoints are added.

The slice satisfies, at the design level:

- The complete versioned state and reference-by-id discipline — **R1**, **R11**.
- Observed-vs-recommended response separation — **R2**.
- The advisory, human-controlled, no-real-execution model — **R3**, **R12**.
- Action-lifecycle representation without breaking the action contract — **R4**.
- Update triggers and versioning policy — **R5**, **R11**.
- The controlled entity/relationship graph with provenance — **R6**, **R7**.
- The three memory boundaries and untrusted-data handling — **R8**.
- Report-tracking fields and report-generator compatibility — **R9**.
- Documentation and decision records — **R10**.
- State-history API — **R13**.
- Backward compatibility — **R14**.
- The mandatory test obligations — **R15**.

GAS-lite is advisory and human-controlled: it records and structures understanding so an
agent can recommend, a human reviews, authorized personnel or existing tooling performs
the real action, and the analyst reports the outcome back for recording and evaluation.
GAS-lite never performs consequential actions on real infrastructure and never treats AI
output as authorization.

## STAIR References and Constraints

STAIR is used only as conceptual inspiration. The following references are consulted for
ideas; the implementation is reimplemented in Caventas code.

- Paper: https://arxiv.org/abs/2608.09524
- Repository overview: https://anonymous.4open.science/r/stair/README.md
- Graph-as-State: https://anonymous.4open.science/r/stair/pipeline/response_planner/core/gas_state.py
- Stage Router: https://anonymous.4open.science/r/stair/pipeline/response_planner/core/stage_router.py
- Stage-specialized agents: https://anonymous.4open.science/r/stair/pipeline/response_planner/core/stage_agents.py
- Experience components: https://anonymous.4open.science/r/stair/pipeline/response_planner/experience/
- Effect validation: https://anonymous.4open.science/r/stair/evaluator/step_evaluator.py

Constraints on using these references:

- STAIR source code MUST NOT be copied into Caventas. Every concept below is
  reimplemented in Caventas's own schemas, services and contracts.
- IF a STAIR file listed above cannot be accessed, THEN that limitation is stated here
  and only the verified repository documentation and the paper are relied on.
- STAIR internal behaviour that cannot be verified from accessible references MUST NOT be
  invented or assumed.

**Access note for this environment.** These URLs are external (arXiv and an anonymized
`4open.science` mirror) and the STAIR source files may not be fetchable from the build
environment used to author this design. Where a specific STAIR file could not be
verified, the design relies only on the paper abstract and the verified repository
documentation, and it does not invent STAIR internals. The adaptations below are
expressed entirely in Caventas terms (Pydantic schemas, Firestore documents, FastAPI
endpoints) and stand on their own regardless of STAIR source availability.

## STAIR to Caventas GAS-lite Traceability

| STAIR concept | Caventas GAS-lite adaptation | Reference file | Included in Core? | Simplification or exclusion |
|---|---|---|---|---|
| Graph-as-State | The `IncidentState` snapshot *is* the graph-as-state: entities + relationships + surrounding case context, versioned per change. | gas_state.py | Yes (Core) | Reimplemented as Pydantic models over Firestore JSON; no graph DB. |
| Immutable / evolving state | Append-only versioned snapshots in the `state_versions` subcollection; `parent_version` links the chain; the case doc holds the `current_state_version` pointer. | gas_state.py | Yes (Core) | Already present in `state_manager`; extended with provenance fields. |
| Attack / context / response relationships | `Relationship.category` enum = `context \| attack \| response`; response edges carry `action_id`/`execution_id`. | gas_state.py | Yes (Core) | Only relations supported by the current synthetic fixture are instantiated. |
| Stage Router (output fields) | Core schema **supports the router output fields** (`recommended_response_focus`, `routing_transition`, `routing_rationale`, `routing_evidence_ids`, `routing_confidence`, `response_objective`, `response_prerequisites`). | stage_router.py | Partial (schema only in Core) | Full IR-phase routing logic is **follow-on**; fields are optional/defaulted. |
| Stage-specialized planning (six agents) | A single existing `PlannerAdapter`; GAS-lite only stores the response-situation it would consume. | stage_agents.py | No | **Excluded from MVP.** |
| Execution feedback | Action outcomes recorded as `action_results`; a response edge is created when an action executes. | step_evaluator.py | Yes (Core) | Deterministic `FakeSimulatorAdapter` + analyst-reported outcomes. |
| Effect validation (only validated-effective mutates condition) | `apply_validated_effects` updates target entity `condition` **only** when `validation_status == effective`; execution completion alone changes nothing. | step_evaluator.py | Yes (Core) | Minimal allowed condition transition per tool; ineffective leaves condition unchanged. |
| Experience database (embeddings) | Not implemented. | experience/ | No | **Follow-on / future.** No embedding store, no retrieval. |
| Real execution harness / cyber range | Bounded Python simulator + analyst-reported outcomes; nothing touches real infrastructure. | — | No | **Excluded.** Caventas replacement is advisory + simulated/analyst-reported. |
| Firestore JSON documents | Caventas storage implementation: `cases/{case_id}/state_versions/{STATE-nnn}`. | — (not a STAIR concept) | Yes (Core) | Caventas-specific; STAIR is storage-agnostic. |
| Full STAIR reproduction | Not attempted. | — | No | **Explicitly excluded** per requirements Scope. |

## Architecture

### High-Level Architecture

```
                         Caventas backend (FastAPI, Python)

  ┌────────────────────┐        ┌─────────────────────┐
  │ ingestion.py       │        │ execution_service.py│
  │ (evidence upload)  │        │ (approved action)   │
  └─────────┬──────────┘        └──────────┬──────────┘
            │ rebuild_and_version(          │ rebuild_and_version(
            │   created_from=evidence_upload)│   created_from=action_result)
            ▼                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │ state_manager.py        (orchestration + versioning)       │
  │  - reads latest state + stored evidence/actions/results    │
  │  - sets parent_version, change_reason, created_from        │
  │  - append-only write + pointer update + audit event        │
  └───────────────┬───────────────────────────┬──────────────┘
                  │ (pure call, no I/O)         │ (I/O only)
                  ▼                             ▼
  ┌───────────────────────────┐    ┌──────────────────────────┐
  │ gas_lite.py  (PURE)        │    │ repositories.py (Firestore│
  │  entity_id / extract_*     │    │  data-access layer)       │
  │  dedupe_and_merge          │    │  add_state_version        │
  │  build_response_edges      │    │  get_state_version        │
  │  apply_validated_effects   │    │  list_state_versions (new)│
  │  build_snapshot            │    └───────────┬──────────────┘
  └───────────────────────────┘                │
                                                ▼
                               cases/{case_id}/state_versions/{STATE-nnn}
                               (immutable snapshots; never overwritten)

  Read side (API, additive):
    GET /cases/{id}/state            -> evidence.py  (UNCHANGED, existing)
    GET /cases/{id}/states           -> state.py     (NEW: version metadata list)
    GET /cases/{id}/states/{version} -> state.py     (NEW: one full snapshot)
```

`gas_lite.py` is a **pure** module: deterministic Python over records handed to it by
`state_manager`. It performs no Firestore I/O, holds no global state, and calls no LLM.
This structurally guarantees R6.6 ("the LLM must not invent persistent graph
relationships") — the graph is built by code, not by a model.

### The three memory boundaries (R8)

| Boundary | What it is | Where it lives in Core |
|---|---|---|
| **Incident State Memory** | Persistent, case-specific understanding. | Firestore: the `state_versions`, `evidence`, `actions`, `action_results` subcollections under `cases/{case_id}`. This is the authoritative incident record. |
| **Agent Working Context** | A minimized projection of the smallest relevant context handed to the planner — *not* the full raw evidence collection. | Represented in-schema by what a snapshot *can* project (entities, relationships, response situation). The actual projection function to the planner is **follow-on**; Core retains enough structure to produce it later (R8.6). |
| **Organizational Knowledge Base** | Playbooks, policies, topology, asset criticality, templates — reference material. | The guidance fixture loaded by `langgraph_planner.load_guidance()` (e.g. `backend/fixtures/guidance.json`). Reference material only; never written into a snapshot as observed evidence (R8.3, R8.5). |

No single item belongs to more than one boundary (R8.1). All ingested text (logs,
alerts, notes, uploads) is stored only in data-typed fields (`EvidenceItem.fields`,
`TimelineEvent.description`, entity attributes) and is never applied as a directive or
configuration (R8.4). GAS-lite does not merge guidance into state and does not store
state as guidance (R8.5).

### Data flow

**(a) Evidence upload → new state version**

```
POST /cases/{id}/evidence
  -> ingestion.ingest(): validate, store original on disk, SHA-256,
     normalize records, persist EvidenceItem docs, audit "evidence_uploaded"
  -> state_manager.rebuild_and_version(case_id, created_from="evidence_upload")
       -> read current pointer N, parent_version = N, next = N+1
       -> list evidence/actions/action_results from repositories
       -> gas_lite.build_snapshot(...)  (pure: entities, relationships,
          timeline, response edges, validated effects)
       -> repositories.add_state_version(next, snapshot)        (append-only)
       -> repositories.update_case(current_state_version=next)  (pointer only)
       -> audit "state_version_created" {version, created_from}
```

**(b) Action execution → response edge + conditional effect**

```
(execution_service.execute already enforces all R3/R12 safety preconditions)
  -> simulator returns {execution_status: completed, validation_status: ...}
  -> add_action_result(...), update_action(status), audit "action_executed"
  -> state_manager.rebuild_and_version(case_id, created_from="action_result")
       -> gas_lite.build_response_edges(): one response edge per executed
          action (relation action_attempted_on, category=response,
          carrying action_id + execution_id)
       -> gas_lite.apply_validated_effects(): target entity.condition changes
          ONLY if validation_status == effective; ineffective changes nothing
       -> append-only new version + pointer update + audit
```

### What stays unchanged (R3, R12.5, R14)

- **Approval contract** — `app/services/approval_service.py`, the approval records, and
  the `awaiting_approval → approved | rejected` action-status flow are untouched.
- **Planner adapter** — `app/ai/langgraph_planner.py` / `planner_adapter.py` and the
  `generate_plan(incident_state, guidance) -> PlanProposal` contract are untouched. No
  substantial change to `langgraph_planner.py`.
- **Simulator behaviour** — `FakeSimulatorAdapter` keeps returning
  `execution_status=completed, validation_status=ineffective` so the replan demo path
  stays reproducible (R12.6). The simulator contract is referenced, not modified.
- **Existing `GET /cases/{case_id}/state` response** — remains in `evidence.py` and is
  **additive only**: the response is a strict superset (new optional fields default to
  `None`/`[]`). `test_state_detail.py` keeps passing because timeline descriptions still
  carry record-field detail (see Components and Interfaces).

## Data Models

### Schema changes — `app/schemas/incident_state.py`

All additions are **optional or defaulted**. Existing stored snapshots (and
`test_state_detail.py`) load and validate unchanged (R1.4, R2.8, R14.1). The existing
`GET /state` response becomes a strict superset.

**`EntityType`** — add `SESSION`, keep every existing value (R6.1):

```
HOST, ACCOUNT, PROCESS, FILE, IP, DOMAIN, OTHER, SESSION ("session")
```

**`Entity`** — add provenance and condition fields (R6.2):

```python
evidence_ids: list[str] = []                     # observed entities carry >=1
first_seen:   Optional[datetime] = None          # from earliest event_time
last_seen:    Optional[datetime] = None           # from latest event_time
condition:    Optional[str] = None                # operational/security state
```

The existing `name` field keeps the **original readable value** from the source record
(source casing/form), while the `id` is built from type-aware normalized key parts (see
`entity_id` below). `EntityType` includes `FILE` (existing) and newly `SESSION`.

`condition` vocabulary (documented string set; default `None`, meaning "unknown"):
`unknown | compromised | contained | isolated | recovered`. Only a validated-**effective**
action result changes `condition`; execution completion alone never does (R12.2, R12.4).
`condition` is a documented string rather than an enum so that future tools can introduce
new states in a follow-on without a schema migration; the allowed transitions are
enforced in `gas_lite.apply_validated_effects` (see below).

**`Relationship`** — add graph fields; keep existing `status` and `evidence_ids`
(R6.3, R6.4):

```python
id:           Optional[str] = None                # deterministic, see id scheme
relation:     RelationshipType                    # closed allowlist enum (see below)
category:     RelationshipCategory = CONTEXT      # context | attack | response
first_seen:   Optional[datetime] = None
last_seen:    Optional[datetime] = None
attributes:   dict[str, Any] = {}
action_id:    Optional[str] = None                # response edges only
execution_id: Optional[str] = None                # response edges only
# existing, retained:
# source, target, evidence_ids, status (observed | inferred)
```

New enum `RelationshipCategory`: `context | attack | response`.

**New enum `RelationshipType(str, Enum)`** — the closed relation allowlist (R6.4):

```python
class RelationshipType(str, Enum):   # R6.4
    LOGGED_INTO         = "logged_into"
    AUTHENTICATED_FROM  = "authenticated_from"
    CONNECTED_TO        = "connected_to"
    RESOLVED_DOMAIN     = "resolved_domain"
    EXECUTED_ON         = "executed_on"
    FOUND_ON            = "found_on"
    SESSION_USED_BY     = "session_used_by"
    ACTION_ATTEMPTED_ON = "action_attempted_on"
    EVIDENCE_PRESERVED  = "evidence_preserved"
    SESSION_REVOKED     = "session_revoked"
    HOST_ISOLATED       = "host_isolated"
```

The `relation` field is typed as `RelationshipType`, so any value outside the allowlist is
rejected at the schema layer by Pydantic validation (R6.5); `gas_lite` additionally only
emits allowlisted members. A relation that has no supporting synthetic evidence simply has
no instances (R6.9).

> **Backward-compat for `RelationshipType`.** The pre-slice `Relationship.relation` is a
> free-text string, and the only value the current `state_manager` ever writes is
> `"logged_into"`, which is a `RelationshipType` member. An enum whose values are exactly
> the 11 allowlisted strings therefore deserializes all existing stored data unchanged.
> (Any stored value outside the set would fail — but none exists.) If, on inspection,
> typing `relation` as the enum were found to break stored data, the fallback is to keep
> `relation: str` and enforce the allowlist in `gas_lite` assembly instead; the enum is
> preferred.

**New enums:**

```python
class ResponseFocus(str, Enum):      # R2.3
    ASSESSMENT, PRESERVATION, CONTAINMENT, ERADICATION, HARDENING, RESTORATION

class RoutingTransition(str, Enum):  # R2.4
    INITIAL   = "initial"
    STAY      = "stay"
    ADVANCE   = "advance"
    ROLLBACK  = "rollback"
    RE_ENTER  = "re_enter"           # see note

class CreatedFrom(str, Enum):        # R5.1, R5.2
    INITIAL_RECONSTRUCTION = "initial_reconstruction"
    EVIDENCE_UPLOAD        = "evidence_upload"
    ACTION_RESULT          = "action_result"

class ReportStatus(str, Enum):       # R9.1
    DRAFT, IN_REVIEW, FINALIZED
```

> **`re_enter` value decision.** The requirement (R2.4) specifies the transition value
> `re_enter` (underscore). The Python-safe enum **member** is `RE_ENTER` and the stored
> **value** is `"re_enter"`. Rationale: it keeps the JSON value a valid identifier-style
> token consistent with the other snake_case enum values (`initial_reconstruction`,
> `in_review`), avoids hyphen-escaping in query params and client code, and matches the
> existing project convention where enum values are lowercase snake/word tokens. The
> design records this as a deliberate, documented choice; if a consumer ever requires a
> literal hyphen it can map `re_enter ↔ re-enter` at the edge.

> **`CreatedFrom` extensibility (R5.3, R5.7).** Core enumerates only
> `initial_reconstruction`, `evidence_upload`, `action_result`. The *full documented
> trigger vocabulary* (reserved for follow-on, added to the enum as those triggers are
> implemented) is: initial reconstruction, new evidence upload, analyst clarification,
> evidence-gap resolution, action approval, edited recommendation, action rejection,
> request for another investigation path, manual action outcome, simulator outcome,
> unexpected validation result, incident-scope change, hypothesis status change,
> report-status change. Because `created_from` is typed as the `CreatedFrom` enum, any
> value outside the enum is rejected by Pydantic validation (R5.7).

**`IncidentState`** — add provenance, response-situation and report-status blocks. Keep
every existing field, including `recovery_status`:

```python
# provenance (R5.1, R11.3)
parent_version: Optional[int]        = None
change_reason:  Optional[str]        = None
created_from:   Optional[CreatedFrom] = None

# response situation (R2.1, R2.2)  — all optional/defaulted (R2.8)
observed_response_status:  Optional[str]              = None
recommended_response_focus: Optional[ResponseFocus]   = None
response_objective:        Optional[str]              = None
response_prerequisites:    list[str]                  = []
routing_rationale:         Optional[str]              = None
routing_evidence_ids:      list[str]                  = []
routing_confidence:        Optional[float]            = None
routing_transition:        Optional[RoutingTransition] = None

# report status (R9.1) — all optional/defaulted; Core CARRIES but does not COMPUTE these
report_sections_complete:    list[str]            = []
report_sections_pending:     list[str]            = []
report_sections_invalidated: list[str]            = []
latest_report_id:            Optional[str]        = None
latest_report_version:       Optional[str]        = None
report_status:               Optional[ReportStatus] = None
```

> **Report-status / routing / assessment are carried, not computed in Core (R1.1, R2.7,
> R9.1/R9.2).** These optional blocks exist and default empty/None so the schema can hold
> them, but Core does **not** populate the analytical assessment, routing decisions, or
> report-section status, and Core does **not** compute report-section invalidation.
> Populating assessment and routing, and computing invalidation, are **follow-on** (see
> the STAIR traceability table and the follow-on list in `requirements.md`/`tasks.md`).

> **`recovery_status` vs `observed_response_status` (R2.1).** The existing
> `recovery_status` enum (`investigating/containing/eradicating/recovering/resolved`) is
> **retained unchanged** for backward compatibility — current consumers and tests may
> read it. Going forward it is treated as a coarse, legacy *observed* lifecycle hint.
> `observed_response_status` (free-text, evidence-grounded) is the richer "what the
> organisation is observed doing" field, and `recommended_response_focus` is the strictly
> separate *recommendation*. The design never collapses observed and recommended into one
> `stage` field (R2.1); `recovery_status` is not promoted into a recommendation and is not
> deleted, so no existing reader breaks.

**Backward-compatibility statement.** Every field added above is optional or defaulted.
A stored snapshot written before this slice (no new keys) deserializes with the new
defaults; `test_state_detail.py` continues to pass; and `GET /state` returns a strict
superset of its previous shape (R2.8, R14.1, R14.2).

## Components and Interfaces

### New service — `app/services/gas_lite.py` (pure functions, NO Firestore I/O)

Pure, deterministic, LLM-free. Every function takes already-fetched records and returns
schema objects. `state_manager` owns all I/O.

```python
def entity_id(entity_type: EntityType, *key_parts: str) -> str
```
Build a deterministic identifier: uppercase type prefix + `"::"` + **type-aware**
normalized key part(s) joined by `"::"` (R7.1, R7.2). All parts first have surrounding
whitespace trimmed and internal whitespace runs collapsed to a single space; then the
per-type normalization below is applied. The original readable value is preserved by the
caller in `Entity.name`; only the id is normalized.

**Type-aware normalization table (R7.3):**

| Entity type | Key normalization | Example id |
|---|---|---|
| host | UPPERCASE the host value | `HOST::SALES-LT-07` |
| account | lowercase | `ACCOUNT::farah` |
| domain | lowercase | `DOMAIN::example.test` |
| ip | canonical: trimmed; IPv4 as-is; IPv6 lowercased/compressed (Core fixtures are plain IPv4) | `IP::203.0.113.45` |
| process | `PROCESS::<HOST-normalized>::<process-name>` — process name trimmed and **lowercased** | `PROCESS::SALES-LT-07::installer.exe` |
| file | `FILE::<HOST-normalized>::<normalized-path>` — path trimmed, separators unified (`\` → `/`), lowercased | `FILE::SALES-LT-07::c:/users/farah/downloads/installer.exe` |
| session | `SESSION::<account-normalized>::<session_id>` from an explicitly present session field (never derived) | `SESSION::farah::<session_id>` |

If any required key part is absent or empty after normalization, the function returns no
id and the caller creates no entity — never a partial or placeholder id (R7.5).

```python
def extract_entities(evidence_items: list[dict]) -> dict[str, Entity]
```
Documented field→entity mapping (R6.8), keyed by deterministic id:

| Evidence field / event | Entity produced |
|---|---|
| `host` (any event) | `HOST::<host>` |
| `account` (any event) | `ACCOUNT::<account>` |
| `process_start` → `process` | `PROCESS::<host>::<process>` |
| `process_start` → `path` | `FILE::<host>::<normalized-path>` |
| `dns_query` → `query` | `DOMAIN::<query>` |
| `dns_query` → `source_ip` | `IP::<source_ip>` |
| `network_upload` → `destination_ip` | `IP::<destination_ip>` |
| explicit `session_id` / `session_cookie_id` field | `SESSION::<account>::<session_id>` |

Each entity accumulates `evidence_ids` (the producing records) and `first_seen` /
`last_seen` from the records' `event_time`, and keeps the source value in `Entity.name`.
Fields outside this documented mapping never create entities (R7.4). The SESSION entity is
produced **only** from an explicitly present allowlisted session field (`session_id` or
`session_cookie_id`) — a session identifier is **never derived or fabricated** from other
fields. The `planner_smoke_evidence.json` fixture carries no session field, so it produces
no SESSION entity; the session-extraction test therefore uses a small dedicated
**synthetic** test record that carries a `session_id` (see Testing Strategy). Remaining
closed-set members (`authenticated_from`, `session_used_by`, `evidence_preserved`,
`session_revoked`, `host_isolated`) with no fixture support exist in the schema with no
instances (R6.9).

```python
def extract_relationships(evidence_items: list[dict],
                          entities: dict[str, Entity]) -> list[Relationship]
```
Build only allowlisted `context`/`attack` relations supported by the fixture, each
`OBSERVED`, each carrying `evidence_ids` and a deterministic `id`:

| Condition in a record | Relationship |
|---|---|
| record has both `account` and `host` | `ACCOUNT → logged_into → HOST` (context) |
| `dns_query` has `source_ip` and `query` | `IP → resolved_domain → DOMAIN` (context) |
| `network_upload` has `host` and `destination_ip` | `HOST → connected_to → IP` (context) |
| `process_start` has `host` and `process` | `PROCESS → executed_on → HOST` (context) |

`alert` records' `technique` ids feed `attack_mapping` (existing field) rather than a
fabricated relation. Each emitted `relation` is a `RelationshipType` member. A relation
whose endpoints are not both present in `entities` is not emitted (no dangling edges). Any
relation value outside the R6.4 allowlist is rejected at the schema layer by
`RelationshipType` validation, and `gas_lite` only emits allowlisted members (R6.5).

```python
def dedupe_and_merge(entities, relationships) -> (entities, relationships)
```
Merge by deterministic id: for duplicate entities/relationships, union `evidence_ids`,
widen `first_seen`/`last_seen` (min/max), and keep a single instance (R5.5, R11.5).
Idempotent — re-ingesting identical evidence produces no new elements.

```python
def build_response_edges(actions, action_results, entities) -> list[Relationship]
```
One response edge **per executed action** (i.e. per `action_result`): relation
`action_attempted_on`, `category=RESPONSE`, carrying `action_id` and `execution_id`,
targeting the action's target entity (R12.1). More specific response relations
(`host_isolated`, `session_revoked`, `evidence_preserved` — these are
`RelationshipType` **relation labels**, distinct from tool names such as `isolate_host`
and `revoke_sessions`) are emitted **only** when the corresponding result is
validated-**effective** (ties to `apply_validated_effects`).

```python
def apply_validated_effects(entities, action_results) -> entities
```
Only `validation_status == "effective"` updates the target entity's `condition`;
`ineffective` (and `unknown`) leave `condition` unchanged (R12.2, R12.3, R12.4). Minimal
allowed transition per tool (documented, enforced here):

| Tool (example) | Effective → target condition |
|---|---|
| `isolate_host` | `isolated` |
| `revoke_sessions` | `contained` |
| `preserve_evidence` | (no condition change; records preservation edge) |

An effective result mutates **only** the target entity's `condition` and nothing else
(R12.4). With the deterministic `FakeSimulatorAdapter` (always `ineffective`), no
condition is ever improved in the demo path — exactly the replan scenario.

```python
def build_snapshot(case_id, version, parent_version, created_from, change_reason,
                   evidence_items, actions, action_results,
                   prior_state) -> IncidentState
```
Deterministic assembly: `extract_entities` → `extract_relationships` →
`dedupe_and_merge` → `build_response_edges` → `apply_validated_effects` → timeline (see
`state_manager` section) → populate provenance (`parent_version`, `created_from`,
`change_reason`). **Stable ordering** of entities (by id), relationships (by id) and
timeline (by `(timestamp is None, timestamp)` then a stable tiebreak) so that identical
stored inputs yield byte-identical content excluding `version`, provenance and
timestamp fields (R11.1, R11.2).

**Deterministic relationship-id scheme:** `REL::{relation}::{source}::{target}` (for
response edges, append `::{execution_id}` to keep multiple attempts distinct). Entity ids
use the `entity_id` scheme above.

> **LLM note (R6.6).** `gas_lite.py` imports no planner/LLM code and makes no model
> calls. The graph is built purely from stored records by deterministic Python. The LLM
> cannot invent persistent graph relationships because it is not in this path.

### Changes to `app/services/state_manager.py`

- **`_reconstruct` delegates** entity/relationship building to `gas_lite` while
  **preserving the timeline detail `test_state_detail.py` asserts.** The timeline is
  still built here (or by a `gas_lite` timeline helper that uses the same
  `_describe_fields` logic) so that a `network_upload` record still yields a description
  containing `network_upload`, the `destination_ip` (`203.0.113.45`) and the byte count
  (`2400000`). The existing `_describe_fields` / `_DESCRIPTION_SKIP_KEYS` behaviour is
  retained verbatim; delegation changes *how entities/relationships* are built, not the
  timeline text (R14.2).

- **`rebuild_and_version(case_id, created_from=CreatedFrom.INITIAL_RECONSTRUCTION,
  change_reason: str | None = None)`** — add defaulted params so existing callers keep
  working. Callers:
  - `ingestion.ingest` → `created_from=EVIDENCE_UPLOAD` (R5.2).
  - `execution_service.execute` → `created_from=ACTION_RESULT` (R5.2).
  - First build for a case → `INITIAL_RECONSTRUCTION` (default; R5.2).

  The method then calls `gas_lite.build_snapshot(...)` and keeps the current flow:
  **append-only** `add_state_version`, **pointer-only**
  `update_case(current_state_version=next, ...)`, and an audit event. The audit event name
  stays **`state_version_created`** and its detail now includes `created_from` (R11.3).

  **Prior-state resolution — three precise cases (R11.8):**

  1. **Unknown case** → abort, leave the current-version pointer unchanged, raise
     `ValueError`.
  2. **`current_state_version == 0` (no prior state)** → this is the first build
     (initial reconstruction / first evidence upload). Create version 1 with
     `parent_version = None` and `next = 1`; **do not abort**.
  3. **Pointer `N >= 1` but the referenced prior snapshot document is missing** → a
     data-integrity error: abort **without changing the pointer** and raise `ValueError`.

  Otherwise (`N >= 1` with the prior snapshot present) `parent_version = N` and
  `next = N + 1` (monotonic +1, R1.5/R11.3).

- **Material-vs-non-material (R5.4–R5.6).** Core creates a version on every Core trigger
  (`initial_reconstruction`, `evidence_upload`, `action_result`), which matches current
  behaviour. A single, documented classification hook —
  `_is_material(created_from, prior_state, next_state)` — returns `True` for every Core
  trigger (no suppression). Actual non-material-trigger version **suppression** is a
  **follow-on** (R5.6) and lives here when implemented; Core does **not** implement it, so
  no current test that expects a new version on upload/result regresses.

### Changes to `app/database/repositories.py`

- Add **`list_state_versions(case_id) -> list[dict]`** — stream the `state_versions`
  subcollection and return the stored version documents. The caller orders by `version`.
  The `STATE-{version:03d}` doc-id scheme is unchanged. No other repository changes;
  `add_state_version` / `get_state_version` are reused as-is.

### New / changed API

- **`GET /cases/{case_id}/state`** — unchanged. It remains in `app/api/evidence.py`
  (registered via `app.include_router(evidence.router)` in `app/main.py`) and keeps its
  current `response_model=IncidentState`. Additive-only superset (R13.1, R14.2).

- **`GET /cases/{case_id}/states`** → `list[StateVersionMeta]` (R13.2):
  - Returns lightweight version metadata, **version-ordered**.
  - Returns an **empty list** when the case exists but has no versions (R13.3).
  - Returns **404** only when the case is unknown (R13.5).
  - Does **not** return full duplicated graph bodies.

- **`GET /cases/{case_id}/states/{version}`** → full `IncidentState` snapshot (R13.4):
  - Content equals the stored snapshot for that version.
  - **404** with a case-specific detail when the case is unknown (R13.5).
  - **404** with a distinct version-specific detail when the version is unknown for a
    known case (R13.6).

- **New Pydantic model `StateVersionMeta`** (R13.7) — defined in
  `app/schemas/incident_state.py`:

  ```python
  class StateVersionMeta(BaseModel):
      version: int
      parent_version: Optional[int] = None
      created_from: Optional[CreatedFrom] = None
      change_reason: Optional[str] = None
      created_at: Optional[datetime] = None
      entity_count: int = 0
      relationship_count: int = 0
      timeline_count: int = 0
  ```

- **Route registration.** Add a small router `app/api/state.py`
  (`APIRouter(prefix="/cases", tags=["state"])`) hosting the two new read endpoints, and
  register it in `app/main.py` with `app.include_router(state.router)` — consistent with
  the confirmed registration pattern (`cases`, `evidence`, `planning`, … all included the
  same way). The service calls are `repositories.list_state_versions` (via a thin
  `state_manager.list_states` that computes counts) and `state_manager.get_state`. The UI
  gets no direct Firestore access (R13.8).

## Error Handling

| Failure | Behaviour |
|---|---|
| Unknown case on `GET /states` or `GET /states/{version}` | `404`, detail names the unknown case (R13.5). |
| Unknown version on `GET /states/{version}` (known case) | `404`, **distinct** detail naming the unknown version (R13.6). |
| Unknown case during build | Abort; current-version pointer unchanged; raise `ValueError` (R11.8 case a). |
| `current_state_version == 0` (no prior state) during build | Allowed: create version 1 with `parent_version = None`; do NOT abort (R11.8 case b). |
| Pointer `>= 1` but referenced prior snapshot doc missing | Data-integrity error: abort; pointer unchanged; raise `ValueError` (R11.8 case c). |
| `created_from` outside `CreatedFrom` enum | Pydantic schema validation rejection (R5.7). |
| `relation` outside R6.4 allowlist | Rejected at the schema layer by `RelationshipType` validation; `gas_lite` also only emits allowlisted members (R6.5). |
| `entity type` outside `EntityType` enum | Pydantic schema validation rejection. |
| Action-result `result_source` absent/outside closed set | Rejected on the action-result record (R3.5); value lives on the result record, not the state schema (R3.4). |
| Lifecycle value outside the closed set | Rejected rather than silently stored (R4.5). |
| `recommended_response_focus` / `routing_transition` out of enum | Pydantic validation error (R2.5). |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid
executions of a system — essentially, a formal statement about what the system should do.
Properties serve as the bridge between human-readable specifications and
machine-verifiable correctness guarantees.*

### Property 1: Immutability of past versions
For any case and any stored version `v` whose number is less than the current-version
pointer, no operation modifies, overwrites or deletes the snapshot document for `v`.
**Validates: Requirements 11.4**

### Property 2: Monotonic versioning
For any case, each newly constructed snapshot's `version` equals the prior
current-version pointer plus exactly one, so version numbers increase monotonically by
one.
**Validates: Requirements 1.5, 11.3**

### Property 3: Deterministic snapshot content
For any fixed set of stored evidence, actions and results, repeated snapshot construction
produces byte-identical content excluding the `version`, provenance (`parent_version`,
`created_from`, `change_reason`) and timestamp fields.
**Validates: Requirements 11.1, 11.2**

### Property 4: Dedup idempotence
For any case, re-ingesting evidence identical to already-stored evidence adds no new
entities and no new equivalent relationships; duplicates merge by deterministic id, union
their `evidence_ids`, and widen `first_seen`/`last_seen`.
**Validates: Requirements 6.7, 11.5**

### Property 5: Evidence provenance of observed elements
For any snapshot, every observed entity and every observed relationship carries at least
one `evidence_id` that resolves to an evidence record stored for the same case.
**Validates: Requirements 6.7, 11.6**

### Property 6: Effect safety
For any action result, if its `validation_status` is not `effective` then no target
entity `condition` is improved; if it is `effective` then exactly the target entity's
`condition` is mutated and no other entity attribute changes as a result.
**Validates: Requirements 12.2, 12.3, 12.4**

### Property 7: Reference integrity of response records
For any response edge or recorded validation outcome, the referenced proposed-action
record, approval record and action-result record (which carries both `execution_status`
and `validation_status`) point to existing records, and those authoritative records are
never deleted, overwritten or replaced. There is no separate validation record; the
approval remains authoritative in the approvals collection, traceable via `action_id`.
**Validates: Requirements 12.5**

### Property 8: Backward-compatible superset
For any snapshot stored before this slice, it loads and validates unchanged under the
enriched schema, and the `GET /cases/{case_id}/state` response remains a strict superset
of its prior shape.
**Validates: Requirements 14.1, 14.2**

## Testing Strategy

Tests run against the **in-memory fake Firestore** (`backend/tests/fake_firestore.py`,
wired by `conftest.py`) and the **FastAPI `TestClient`**, matching the existing suite.
The Firestore emulator smoke (`scripts/emulator_smoke.py`,
`tests/test_firebase_emulator.py`) is **optional** for this slice and documented as the
next integration verification (R15.16).

**New `backend/tests/test_gas_lite.py` (pure-function unit tests)** — exercises
`gas_lite` directly, no I/O:

| Obligation (R15) | Test case |
|---|---|
| 15.1 host/account reconstruction | `extract_entities` yields `HOST::SALES-LT-07` and `ACCOUNT::farah` from the fixture. |
| 15.2 IP/domain/process/file extraction (fixture) | `DOMAIN::pdf-editor-free.example`, `IP::192.0.2.44`, `IP::203.0.113.45`, `PROCESS::SALES-LT-07::installer.exe`, `FILE::SALES-LT-07::c:/users/farah/downloads/installer.exe` extracted for the supported fields. |
| 15.2 session extraction (synthetic) | The planner_smoke fixture has **no** session field, so a small dedicated **synthetic** test record carrying an explicit `session_id` is used to assert `SESSION::<account>::<session_id>` is produced; no session id is derived or fabricated. |
| 15.3 identifier stability | Same input fields → identical ids across two `build_snapshot` calls. |
| 15.4 duplicate dedup | Re-passing identical evidence → `dedupe_and_merge` adds no elements, unions `evidence_ids`. |
| 15.5 observed-relation provenance | Every observed relationship has ≥1 `evidence_id`. |
| 15.6 observed vs inferred | Observed and inferred relationships remain distinguishable via `status`. |
| 15.10 response edge | `build_response_edges` emits one `action_attempted_on` (category=response) carrying `action_id`/`execution_id` per executed action. |
| 15.11 ineffective → no positive mutation | `apply_validated_effects` with `ineffective` leaves `condition` unchanged. |
| 15.12 effective → only allowed mutation | A synthetic `effective` result changes only the target entity's `condition`. |

**New `backend/tests/test_state_history_api.py` (endpoint tests)** — via `TestClient`:

| Obligation (R15) | Test case |
|---|---|
| 15.7 upload creates version | After `POST /evidence`, pointer increments and `GET /states` lists the new version. |
| 15.8 previous versions retrievable & unchanged | Upload twice; `GET /states/{1}` still returns v1 content unchanged. |
| 15.9 provenance correct | `GET /states` metadata shows correct `parent_version`, `change_reason`, `created_from` (`evidence_upload`). |
| 15.13 history endpoints | `GET /states` returns ordered `StateVersionMeta` with counts; empty list for a case with no versions; `GET /states/{version}` returns the full snapshot; 404s for unknown case vs unknown version with distinct details. |

**Regression (R15.14, R15.15, R9.5):** `test_state_detail.py`, `test_planner_adapter.py`,
`test_planning_api.py`, `test_approvals_api.py`, `test_execution_api.py`,
`test_reporting_api.py` and `test_milestone1.py` must stay green unmodified. A regression
assertion confirms existing structured report generation still works after the GAS-lite
changes (R9.5). The **full backend pytest suite must pass** (R15.15).

**On property-based testing.** The correctness properties above are expressed as
universal invariants and are ideal for property-based tests (deterministic rebuild,
dedup idempotence, monotonic versioning). This design specifies them so the
implementation phase can realize the testable ones with a property-based library over
generated evidence sets, backed by the example-based unit/endpoint tests enumerated in
R15. The R15 obligations are the mandatory, example-based minimum; property tests
complement them.

## Documentation & Decision Impact

At implementation time, update (R10):

- **`backend/README.md`** — document `app/services/gas_lite.py`, the enriched
  `IncidentState`, and the new `GET /cases/{case_id}/states` and
  `GET /cases/{case_id}/states/{version}` endpoints.
- **`.kiro/steering/structure.md`** — add `app/services/gas_lite.py` and
  `app/api/state.py`; note the state-history endpoints; correct the stack narrative
  (React + Vite + Tailwind, **not** Streamlit; UI → FastAPI → Admin SDK → Firestore).
- **`.kiro/steering/tech.md`** — adjust only if the GAS-lite model surfaces a stack detail
  worth recording; otherwise unchanged (no new dependency is required for Core).
- **Session notebook** — append `docs/session/SessionLog.md`; refresh
  `docs/session/SessionContext.md`; add/adjust `docs/session/Backlog.md` (follow-on:
  stage router, working-context projection, simulator catalogue, frontend graph); and add
  a new entry in `docs/session/Decisions.md` (**DEC** for the GAS-lite state model: the
  response-situation and report-status blocks, `CreatedFrom` vocabulary, the `re_enter`
  value choice, and condition-mutation-only-on-effective).
- Record explicitly that the proposal's **Technology Stack** section is **stale** and must
  be aligned in a follow-on slice (R10.3), and log every proposal change in
  `Decisions.md` and the session log (R10.2).

## Integration Dependencies

> **⚠ Integration warning / dependency — PR #9.** PR #9 modifies
> `app/services/state_manager.py` and **must be merged/rebased before** the state-manager
> and execution-flow integration (tasks **4.x** and **6.x**) is finalized. When
> integrating GAS-lite, **preserve PR #9's timezone-aware timeline sorting** and its
> **simulator-result behaviour** — the GAS-lite delegation changes *how entities and
> relationships* are built, not the timeline sort order or the simulator contract. Tasks
> **4.1, 4.2, 4.3 and 6.1** carry this dependency.

## Teammate-owned surfaces touched

- **Raaj (base layer, owned here):** `app/schemas/incident_state.py` (enriched schema +
  `StateVersionMeta`), `app/database/repositories.py` (`list_state_versions`),
  `app/services/state_manager.py` (delegation + provenance params), plus the new
  `app/services/gas_lite.py` and `app/api/state.py`.
- **Aidan (simulator):** `app/simulator/simulator_adapter.py` is **referenced, not
  changed**; the `FakeSimulatorAdapter` completed-but-ineffective behaviour is preserved
  (R12.6). The simulator catalogue and real effects are a follow-on contract Aidan owns.
- **Airil (planner):** the planner working-context projection (Agent Working Context →
  planner) is documented as a **follow-on contract**; Core retains enough structure to
  produce it later (R8.6). `langgraph_planner.py` / `planner_adapter.py` are untouched.
- **Frontend:** untouched. No frontend file is edited; the UI consumes the additive
  endpoints and never contacts Firestore directly (R13.8).
