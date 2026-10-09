# Implementation Plan: Caventas IA Progressive-Disclosure Redesign

## Overview

This plan extends the existing Caventas system — it does not rebuild it. The
feature now spans **both** the FastAPI backend (`backend/app`) **and** the React
frontend (React 18 + Vite 5 + TypeScript strict + Tailwind 3 under `frontend/`),
because the first shippable slice requires the full honest vertical flow:
evidence → incident state → plan → human decision → bounded simulation → effect
validation → structured report.

On the **backend** side, five endpoints move from 501-stub/missing to Core:
the approvals decision endpoint, bounded simulation execution, effect
validation, the plan-detail endpoint, and structured report generation. These
follow the existing codebase layout: routers in `backend/app/api/`, services in
`backend/app/services/`, Pydantic schemas in `backend/app/schemas/`, and all
Firestore access through `backend/app/database/repositories.py` (Firebase Admin
SDK; per-case subcollections `evidence`, `state_versions`, `plans`, `actions`,
`approvals`, `action_results`, `audit_events`, `reports`). Backend tests use
`pytest` + FastAPI `TestClient` + the existing `backend/tests/fake_firestore.py`.
The backend enforces the security rules: AI output is never authorization,
bounded simulation runs only via a valid non-stale approval, incident state and
plans/actions are versioned/append-only, and every decision/simulation/
validation emits an `Audit_Event`.

On the **frontend** side, the existing `AppShell` (TopBar + Sidebar + drawer +
ConnectionBanner), UI primitives (`Button`, `StatusBadge`,
`Region`/`EmptyState`/`ErrorState`/`PendingBackendNote`, `Skeleton`, `Mono`,
`Toast`), `createBrowserRouter` routing in `src/app/App.tsx`, Barlow + IBM Plex
Mono typography, and the navy/lime CSS-token palette (Req 30) are all preserved.
The UI contacts the FastAPI backend over HTTP only and never touches Firestore
(Req 30.2–30.3).

Core tasks are sequenced to build **one honest vertical demo slice**: contracts
& types → API boundary → **Core backend endpoints** → Create Case flow →
Evidence upload + review → Case Workspace shell + tab machine + Overview → real
planning run (Plan v1) → Analysis + Response Plan (six-state, fed by the real
plan-detail endpoint) → Approvals (human decision via the real decision
endpoint) → Batch 2 replan (Plan v2 + MECE diff) → real simulation/validation
surfacing → Report (real structured-report endpoints) → Timeline → Evidence tab
→ dashboard polish → icons/About/PRODUCT.md + cross-cutting
motion/responsive/a11y + verification. The frontend surfaces that consume a
backend endpoint are sequenced (and wired in the dependency graph) **after** the
backend task that implements it. Follow-on (Phishing, False-alarm +
CHG-2026-118 gate, PDF export, deeper tab richness, polish) follows and is marked
optional with `*`.

Property-based testing is **not** used (per design Testing Strategy — a UI
redesign plus CRUD/state-transition backend logic over the existing fake
Firestore; these are example/integration cases). Frontend unit tests use Vitest;
backend tests use pytest. The twelve tests mandated by Req 34 (five backend,
seven frontend) are **required** (no `*`); other unit tests remain optional.

### Backend-dependency notes

With this feature the approvals decision, bounded simulation, effect validation,
plan-detail, and structured report endpoints are **Core deliverables of this
feature**, implemented in `backend/app` — not external gaps the frontend degrades
around. After this feature the only genuinely out-of-scope / optional items,
handled honestly in the frontend, are:

- **PDF export/rendering — Follow-on.** The structured JSON report is Core and
  rendered; the PDF export control is rendered disabled + labelled unavailable
  and activating it does nothing (Req 24.7–24.8).
- **Planning-run status endpoint — optional, absent.** Dashboard active/blocked
  run counts are shown **synthetic** and flagged, **never inferred from Stage**
  (Req 3.2–3.3).
- **Global cases list (`GET /cases`) and global audit — optional, absent.** The
  dashboard and recent-cases table are served by a **synthetic** fixture, flagged
  with a `Synthetic_Data_Indicator` (Req 2–6); per-case `GET /cases/{id}/audit`
  is used for the real audit surface.
- **`PATCH /cases/{id}` — does not exist by decision.** After `POST /cases` the
  Case title **and** description are read-only; the UI never calls PATCH
  (Req 9.2–9.5).

## Tasks

- [ ] 1. Set up Vitest and foundational test harness (frontend)
  - Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
    `@testing-library/user-event`, `jsdom` to `frontend/package.json` devDependencies
  - Add a `test` script and Vitest config (jsdom environment, `@` alias matching Vite) in `frontend/vite.config.ts` or `frontend/vitest.config.ts`
  - Create `frontend/src/test/setup.ts` registering jest-dom matchers
  - Add one trivial passing smoke test to confirm the harness runs
  - _Requirements: 34.1_

### (a) Contracts and types (frontend)

- [ ] 2. Backend DTO types — exact server shapes
  - Create `frontend/src/lib/api/dto.ts` with the exact backend DTOs: `CaseDTO` (case_id, title, description, status, current_state_version, created_at, updated_at — **no** severity/classification/stage/recovery_status), `EvidenceItemDTO`, `EvidenceUploadResultDTO`, `IncidentStateDTO` (entities, relationships observed/inferred, timeline, findings, attack_mapping, hypotheses, missing_evidence, recovery_status, integer version), `PlanDocDTO` (plan_id, case_id, based_on_state_version, stage, missing_evidence, **action_ids only**, created_at), `StoredActionDTO` (action_id, version, based_on_state_version, tool_name, target_id, target_type, risk, escalation_required, **action_state**, rationale, evidence_refs, policy_refs, expected_effect, validation_checks), `RunResponseDTO` (run_id, case_id, stage, plan, **full actions[]**), `PlanDetailDTO` (PlanDocDTO + embedded `actions: StoredActionDTO[]`), `ApprovalDTO` (approval_id, case_id, action_id, action_version, based_on_state_version, decision, comment, decided_at, decided_by, invalidated), `ActionResultDTO` (exec_id, case_id, action_id, action_version, based_on_state_version, execution_status, validation_status?, observed_effect, simulated_at, validated_at?), `ReportSectionDTO` (key, title, present, items[]), `StructuredReportDTO` (report_id, case_id, generated_at, sections[], completeness{present,total}), `AuditEventDTO`
  - Add the shared enums `CaseStatus`, `RecoveryStatus`, `Stage`, `EntityType`, `EvidenceKind`, `DecisionKind`
  - _Requirements: 30.1, 30.2, 32.1, 32.3_

- [ ] 3. Canonical six-state model and frontend view-model types
  - Edit `frontend/src/lib/types.ts`: add the single canonical `PlanActionState` union (`proposed | approved | simulated | validated_effective | validated_ineffective | superseded`) and an `actionStateLabel` map; remove reliance on any legacy four/five-state model
  - Add view models `CaseHeaderVM`, `CaseWorkspaceVM`, `RecentCaseRowVM`, `EvidenceItemVM`, `ResponsePlanActionVM` (`state` copied from the backend action doc; `source: "real"`), `ReportVM` (sections[], completeness{present,total}), plus `Severity`, `DayBucket`, `Duration`, `AttentionItem`, `AttentionReason`, `PendingApproval` (with client `stalePrewarn` flag), `DecisionInput`, `AgentRun`, `CaseFacts`, `TabId`, `StepId`, and scenario shapes (`ScenarioDef`, `BatchDef`, `DiffCategory`, `PlanDiff`, `EvidenceRequestGate`, `OfflineFallback`)
  - Preserve existing types; keep DTOs and view models as distinct layers
  - _Requirements: 20.5, 20.6, 21.5, 6.3, 14.1_

- [ ] 4. Mapping functions — the only derivation site
  - Create `frontend/src/lib/mapping/` with `toCaseHeaderVM`, `toRecentCaseRowVM`, `toEvidenceItemVM`, `toResponsePlanActionVM` (copies `action_state` straight from the DTO; never fabricates state), `toReportVM`
  - Derivation rules enforced here (never in components): recovery status ← `IncidentState.recovery_status`; current stage ← latest `Plan.stage`; classification/severity ← `IncidentState.findings`/`attack_mapping` or null; every unavailable derived value yields `null` → honest absent indicator (never fabricated)
  - _Requirements: 6.4, 14.2, 31.4_

- [ ]* 5. Unit test mapping derivations
  - Create `frontend/src/lib/mapping/mapping.test.ts`: null (honest absent) when no record-backed severity/classification/stage/recovery exists; derived stage from latest plan; recovery from state; action state copied verbatim from the DTO
  - _Requirements: 6.4, 14.2_

### (b) API boundary (frontend)

- [ ] 6. Data-access layer: apiClient
  - Create `frontend/src/lib/api/apiClient.ts` with `ApiResult<T>` (`ok | http_error | not_implemented(501) | network_error | offline`) and an `ApiClient` interface ({ get, post, postForm })
  - Base path `/api`; map HTTP 501 to `not_implemented` **before** generic `http_error` (defensive only — the five Core endpoints no longer return 501); keep 400/404 as `http_error` so evidence upload can distinguish per-file malformed (400) vs case-not-found (404); keep 409/422 as `http_error` so the approvals/execution surfaces can show the exact precondition failure (stale, no approval, comment required); return `offline` when `navigator.onLine` is false and `network_error` on request failure
  - _Requirements: 30.2, 31.1, 31.2, 31.3_

- [ ] 7. Unit test apiClient result mapping (MANDATORY — Req 34.1)
  - Create `frontend/src/lib/api/apiClient.test.ts`: 501 → `not_implemented`; request failure → `network_error`; `navigator.onLine === false` → `offline`; 409/422 → `http_error` with precondition detail; ok passthrough — each a distinct honest state
  - _Requirements: 34.1, 31.3, 31.1, 31.2_

### (c) Core backend endpoints (FastAPI)

- [ ] 8. Backend schemas and six-state action model
  - [ ] 8.1 Create approval, action-result, and report schemas
    - Create `backend/app/schemas/approval.py`: `Decision` enum (`approve` | `reject` | `request_more_investigation`); `DecisionInput` (decision, comment="", decided_by="analyst"); `Approval` (approval_id "APR-{hex12}", case_id, action_id, action_version, based_on_state_version, decision, comment, decided_at, decided_by, invalidated=False)
    - Create `backend/app/schemas/action_result.py`: `ActionResult` (exec_id "EXE-{hex12}", case_id, action_id, action_version, based_on_state_version, execution_status "completed"|"failed", validation_status "effective"|"ineffective"|None, observed_effect, simulated_at, validated_at=None)
    - Create `backend/app/schemas/report.py`: `ReportSection` (key, title, present, items: list[dict]=[]); `StructuredReport` (report_id "RPT-{hex12}", case_id, generated_at, sections: list[ReportSection], completeness: dict {present:int,total:int})
    - _Requirements: 23.3, 23.8, 24.1, 24.5_
  - [ ] 8.2 Extend the stored action doc with the six-state model
    - Edit `backend/app/schemas/plan.py` (StoredAction, or the action doc written by `backend/app/services/planning_service.py`): add `ActionState` enum (`proposed | approved | simulated | validated_effective | validated_ineffective | superseded`), an `action_state: ActionState` field defaulting to `proposed` when the action is first written, and an append-only `state_history: list[{state, at, audit_id}]`; retain `action_id, version, based_on_state_version` binding
    - _Requirements: 20.5, 20.6, 21.5_

- [ ] 9. Repository extensions for actions, approvals, results, reports
  - Extend `backend/app/database/repositories.py` matching the existing per-case subcollection style: `get_plan(case_id, plan_id)`, `get_action(case_id, action_id)`, `list_actions(case_id)`, `update_action(case_id, action_id, patch)` (the only path that mutates `action_state`/appends `state_history`), `add_approval`, `list_approvals(case_id, action_id)`, `add_action_result`, `list_action_results(case_id, action_id)`, `add_report`, `get_report(case_id, report_id)`
  - _Requirements: 32.1, 23.8, 22.12, 24.2_

- [ ] 10. Approvals decision service and endpoint (replace 501)
  - [ ] 10.1 Implement the approval decision service
    - Create `backend/app/services/approval_service.py`: `ApprovalError` (kinds not_found|comment_required|approval_stale); `is_stale(case_current_version, action_based_on_version)` returns `case_current_version > action_based_on_version`; `decide(case_id, action_id, inp)` loads the action (404 if missing), builds an `Approval` bound to the exact `(action_id, version→action_version, based_on_state_version)`, rejects a stale `approve` as `approval_stale` without transitioning, requires a ≥1 non-whitespace comment for `reject`/`request_more_investigation` (else `comment_required`), persists via `add_approval`, audit-records `analyst_decision` via `backend/app/services/audit_service.py`, and on a non-stale `approve` writes `action_state=approved` + a `state_history` entry via `update_action`
    - _Requirements: 21.1, 21.2, 23.3, 23.5, 23.6, 23.8, 23.9_
  - [ ] 10.2 Wire the decision endpoint
    - Edit `backend/app/api/approvals.py` to replace the 501 stub with `POST /cases/{case_id}/actions/{action_id}/decision` delegating to `approval_service.decide`; map `ApprovalError` kinds to HTTP 404 (not_found), 422 (comment_required), 409 (approval_stale); return the stored `Approval`
    - _Requirements: 23.1, 23.7, 23.8, 23.9_

- [ ] 11. Bounded simulation and effect validation service and endpoints (replace 501)
  - [ ] 11.1 Implement the execution service (simulate + validate)
    - Create `backend/app/services/execution_service.py`: `ExecutionError` (kinds no_valid_approval|approval_stale|action_not_approved|not_simulated); `simulate(case_id, action_id)` precondition = a valid, non-stale `approve` approval (via `list_approvals`) and action in `approved` state (else `no_valid_approval` / `approval_stale` / `action_not_approved`), routed **only** through `backend/app/simulator/simulator_adapter.py` (never real infrastructure), persists an `ActionResult` via `add_action_result`, writes `action_state=simulated` via `update_action`, audit-records `bounded_simulation`; `validate_effect(case_id, action_id)` requires the action in `simulated` state with a recorded `ActionResult` (else `not_simulated`), evaluates the action's validation checks against the recorded result, writes a **distinct** `validated_effective` | `validated_ineffective` state (never collapsing `simulated` and `validated_effective`), persists the outcome on the `ActionResult`, audit-records `effect_validation`
    - _Requirements: 20.6, 21.3, 21.5, 21.6, 22.12, 30.4_
  - [ ] 11.2 Wire the execute and validate endpoints
    - Edit `backend/app/api/execution.py` to replace the 501 stub with `POST /cases/{case_id}/actions/{action_id}/execute` (→ `simulate`) and add `POST /cases/{case_id}/actions/{action_id}/validate` (→ `validate_effect`), both delegating to the execution service; **preserve the existing `GET /cases/{case_id}/audit`**; map `ExecutionError` kinds to HTTP 409 (no_valid_approval/approval_stale/not_simulated) and 422 (action_not_approved); return the `ActionResult`
    - _Requirements: 21.3, 21.5, 22.12, 30.4_

- [ ] 12. Plan-detail endpoint (new — Req 32)
  - Add `GET /cases/{case_id}/plans/{plan_id}` to `backend/app/api/planning.py` (preserve the existing `POST /runs` and `GET /plans`): resolve the plan via `get_plan` and its `action_ids` to full `StoredAction` docs via `get_action`/`list_actions`, returning a `PlanDetail` (plan fields + `actions[]`, each incl. current `action_state`); 404 if the case or plan is missing; plans remain append-only with version history retained
  - _Requirements: 32.1, 32.2_

- [ ] 13. Structured report service and endpoints (replace 501)
  - [ ] 13.1 Implement the reporting service
    - Create `backend/app/services/reporting.py` `build_report(case_id)`: assemble a `StructuredReport` with fixed-order sections (`executive_summary`, `classification`, `timeline`, `affected_assets_identities`, `evidence`, `attack_mapping`, `decisions_approvals`, `recommended_simulated_actions`, `validation_results`, `unresolved_gaps`, `lessons_hardening`) populated **only** from stored case records (case, evidence, state versions, plans, actions, approvals, action_results, audit_events); a section with no record-backed data is returned **empty** (`present=False`, `items=[]`), never fabricated; `completeness={present,total}` (count of present sections vs total), never a percentage; persist via `add_report`; audit-record `report_generated`
    - _Requirements: 24.1, 24.3, 24.5_
  - [ ] 13.2 Wire the report endpoints
    - Edit `backend/app/api/reports.py` to replace the 501 stubs with `POST /cases/{case_id}/reports` (→ `build_report`, returns the stored report) and `GET /cases/{case_id}/reports/{report_id}` (→ `get_report`, 404 if missing); PDF rendering/export stays Follow-on
    - _Requirements: 24.2, 24.4, 24.6_

### (d) Mandatory backend tests (pytest + fake Firestore + TestClient)

- [ ] 14. Backend test — approval binding + staleness invalidation (MANDATORY — Req 34.6, 34.7)
  - Create `backend/tests/test_approvals.py`: a persisted `Analyst_Decision` binds to the exact `action_id`, `version`, and `based_on_state_version` and emits an `analyst_decision` `Audit_Event`; an `approve` on an action whose `based_on_state_version` trails a later `IncidentState` version is rejected as stale (409 `approval_stale`), does **not** transition the action to `approved`, and cannot later authorize a simulation; a `reject`/`request_more_investigation` without a non-whitespace comment returns 422 `comment_required`
  - _Requirements: 34.6, 34.7, 21.1, 21.2, 23.8, 23.9_

- [ ] 15. Backend test — bounded simulation only via valid approval, no real execution (MANDATORY — Req 34.8)
  - Create `backend/tests/test_execution.py`: `execute` fails 409 with no valid non-stale `approve` approval; with a valid approval it routes through the fake `simulator_adapter` **only** (assert no real-infrastructure call path exists), records an `ActionResult`, transitions the action to `simulated`, and emits a `bounded_simulation` `Audit_Event`
  - _Requirements: 34.8, 21.3, 30.4_

- [ ] 16. Backend test — effect validation transition distinctness (MANDATORY — Req 34.8)
  - Add to `backend/tests/test_execution.py`: `validate` transitions `simulated → validated_effective | validated_ineffective`; assert `simulated` and `validated_effective` are **distinct persisted states** (never collapsed) and that an `effect_validation` `Audit_Event` is recorded
  - _Requirements: 34.8, 20.6, 21.5, 21.6_

- [ ] 17. Backend test — plan-detail returns full actions with retained history (MANDATORY — Req 34.9)
  - Create `backend/tests/test_plan_detail.py`: `GET /cases/{id}/plans/{plan_id}` returns the plan with complete embedded `StoredAction` detail (incl. current `action_state`) and retains version history across appended plans
  - _Requirements: 34.9, 32.1, 32.2_

- [ ] 18. Backend test — structured report assembled only from records (MANDATORY — Req 34.10)
  - Create `backend/tests/test_reporting.py`: every `StructuredReport` section is populated only from stored case records; a section with no record-backed data is returned empty (`present=False`, `items=[]`); `completeness` reports present/total, never a fabricated percentage
  - _Requirements: 34.10, 24.3, 24.5_

- [ ] 19. Checkpoint — contracts, API boundary, and Core backend endpoints build and tests pass
  - Ensure `tsc --strict` and `vitest` pass for the frontend; `vite build` still succeeds; and `pytest` passes for the backend (all five mandatory backend tests green); ask the user if questions arise.

### (e) DataProvider and providers (frontend, over the now-real endpoints)

- [ ] 20. DataProvider + real provider + synthetic fixture provider
  - [ ] 20.1 Define DataProvider and real provider (all real endpoints)
    - Create `frontend/src/lib/api/provider.ts` (`DataProvider`, `Sourced<T>`) and `frontend/src/lib/api/realProvider.ts` wiring **every real endpoint**: `GET /cases/{id}`, `POST /cases`, evidence upload/list, `GET /cases/{id}/state`, `POST /cases/{id}/runs` (full just-run actions), `GET /cases/{id}/plans` (action_ids only), **`getPlanDetail` → `GET /cases/{id}/plans/{plan_id}`**, `GET /cases/{id}/audit`, **`submitDecision` → `POST .../decision`**, **`executeAction` → `POST .../execute`**, **`validateAction` → `POST .../validate`**, **`generateReport` → `POST .../reports`**, **`getReport` → `GET .../reports/{report_id}`**; all mark `source: "real"`
    - **Remove** any synthetic `listHistoricalActions` fallback — historical complete actions are now a real read via `getPlanDetail` (Req 32); decision/execute/validate/report calls return `ok` on success and ordinary `http_error` (409/422) on precondition failures, never a faked 501
    - _Requirements: 30.2, 32.1, 32.2, 32.3, 23.7, 24.2_
  - [ ] 20.2 Synthetic fixture provider for the only two missing reads
    - Create `frontend/src/lib/api/fixtureProvider.ts` providing `listCases()` (no global `GET /cases`) and `syntheticRunCounts()` (no run-status endpoint) returning `source: "synthetic"`; migrate/extend `frontend/src/lib/mock-data.ts` as the synthetic source; every synthetic payload flagged so surfaces attach a `Synthetic_Data_Indicator`; the run counts are **never inferred from Stage**
    - _Requirements: 31.4, 31.5, 3.2, 3.3_

### (f) Create Case flow (frontend)

- [ ] 21. Create New Case step machine (pure)
  - Create `frontend/src/lib/setup/stepMachine.ts`: `StepId` (`details | evidence | review | start`), `StepStatus`, `SetupState`, `stepStatuses`, `prerequisiteReason`, `editEarlier` (invalidate the containing step and all later), one-active-step reveal, future-steps visible-but-disabled with reason, completed steps revisitable, backward nav preserving confirmed values; flags `detailsLocked` (true once `POST /cases` succeeds → **title AND description read-only**), `acceptedFiles`, `clientRejectedCount`, `reviewConfirmed`, `runStarted` (duplicate-run guard); no "unsaved description/note" concept — details are simply read-only after creation
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 9.2, 9.3, 12.4_

- [ ] 22. Unit test the setup step machine (MANDATORY — Req 34.2)
  - Create `frontend/src/lib/setup/stepMachine.test.ts`: each step's prerequisite meets/blocks the next; title validation gate (8.3); edit-earlier invalidation (7.6); backward-nav value preservation (7.7); details read-only after creation and no PATCH concept (9.2–9.5); duplicate-run guard (12.4)
  - _Requirements: 34.2, 8.3, 7.6, 7.7, 9.2, 12.4_

- [ ] 23. Create New Case flow UI, route, and Step 1 (Case Details)
  - Create `frontend/src/features/createCase/CreateCasePage.tsx` and `SetupPanel.tsx`; add route `/cases/new` in `frontend/src/app/App.tsx` (preserve existing routing)
  - Step 1 fields: title, short description, analyst note, optional scenario-template selector; title validation (non-empty, non-whitespace, ≤200 chars) gates Step 2 with reason shown on the disabled step; on transition into Step 2 call `POST /cases` to obtain `caseId` before any upload; a failed `POST /cases` shows an honest error and does **not** advance; once created, render **both the title and the description read-only** with a short explanation that case details are fixed after creation (no editable input, no unsaved-pending value); the analyst note is **not** a mutable Case field — it is captured as an `Evidence_Item` on upload; **never** call a PATCH/update endpoint (none exists)
  - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

### (g) Evidence upload and review (frontend)

- [ ] 24. Step 2 (Evidence upload)
  - Create `frontend/src/features/createCase/StepEvidence.tsx`: accept CSV/JSON/TXT (display accepted formats); each accepted file as a compact row with a source icon via `POST /cases/{caseId}/evidence`; also submit the analyst note from Step 1 as an `Evidence_Item` here; client-side reject wrong type and >10 MB as `Client_Rejected_Upload` tracked **only in client state**; backend 400 → per-file malformed-record error (not a totals summary); backend 404 → case-not-found with no false success; advanced fields hidden until ≥1 accepted; gate Step 3 on ≥1 accepted file
  - _Requirements: 9.4, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

- [ ] 25. Step 3 (Evidence Review)
  - Create `frontend/src/features/createCase/StepReview.tsx`: accepted record count and detected sources derived from `GET /cases/{caseId}/evidence` (or `item_count`/`evidence_ids` of each `EvidenceUploadResult`), shown exactly as returned, never fabricated; client-rejected counts come from client state and are labelled client-side, never attributed to the backend; SHA-256 + ingestion status shown only on explicit request; require a review confirm; changing evidence clears the confirm; gate Step 4 with reason on the disabled step
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

### (h) Case Workspace shell + tab machine + Overview (frontend)

- [ ] 26. Case Workspace tab-availability machine (pure)
  - Create `frontend/src/lib/caseWorkspace/tabAvailability.ts`: `CaseFacts`, `TabStatus`, `tabAvailability(facts, prev?)` with Overview always on, Evidence/Timeline **latching** (never relock once available), Analysis/Plan/Approvals/Report gated and relockable; `resolveSelectedTab` falls back to Overview when the requested non-Overview tab is unavailable
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.11_

- [ ] 27. Unit test tabAvailability (MANDATORY — Req 34.3)
  - Create `frontend/src/lib/caseWorkspace/tabAvailability.test.ts`: each transition (15.2–15.7); Evidence/Timeline **never relock** latch (15.10); `resolveSelectedTab` fallback to Overview when the selected non-Overview tab is disabled (15.11)
  - _Requirements: 34.3, 15.10, 15.11_

- [ ] 28. Case Workspace shell, underline tabs, and Overview tab
  - [ ] 28.1 Workspace header and underline tab bar
    - Create `frontend/src/features/caseWorkspace/CaseWorkspace.tsx`, `CaseHeader.tsx`, `UnderlineTabs.tsx`; **replace the `/cases/:caseId` placeholder** in `frontend/src/app/App.tsx` with the workspace route and nested tab routes (`overview`, `evidence`, `timeline`, `analysis`, `plan`, `approvals`, `report`) rendering through `<Outlet/>`
    - Persistent header from `CaseHeaderVM` (title, derived severity, incident status, derived current stage, last-updated, compact agent state) shown **once** (not repeated per tab); underline (not pill) tabs; disabled tabs non-focusable (`aria-disabled`, removed from tab order) with prerequisite tooltip on hover/focus; direct navigation to a disabled tab URL redirects to overview
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 15.8, 15.9_
  - [ ] 28.2 Overview tab content
    - Create `frontend/src/features/caseWorkspace/tabs/OverviewTab.tsx`: one-sentence summary, affected-entities count, evidence-source count, current hypothesis, current stage, missing-evidence indicator, compact agent-progress — each from current backend data; links to detail tabs instead of reproducing content; no long paragraphs
    - _Requirements: 16.1, 16.2, 16.3_

- [ ] 29. Checkpoint — Create Case + Workspace shell complete
  - Ensure `tsc --strict` and `vitest` pass, `vite build` succeeds, `pytest` still passes, and routing works end to end; ask the user if questions arise.

### (i) Real planning run (Plan v1)

- [ ] 30. Step 4 (Start Analysis) → real planning run
  - Create `frontend/src/features/createCase/StepStart.tsx`: summary with case details, evidence sources, accepted record count, and current `State_Version` (from `GET /cases/{caseId}/state`); primary action "Start analysis" calls `POST /cases/{caseId}/runs` **once** (guarded by `runStarted`); render the returned Plan v1 (full actions) from the run response; a failed run shows an honest error and keeps `runStarted` false with no false success
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

### (j) Analysis + Response Plan (minimum-viable), fed by real endpoints

- [ ] 31. Analysis tab (minimum-viable)
  - Create `frontend/src/features/caseWorkspace/tabs/AnalysisTab.tsx`: concise sections for classification, confidence with evidence basis (labelled advisory), affected entities, ATT&CK techniques, missing evidence, active hypotheses — derived from `IncidentState` findings/attack_mapping/hypotheses/missing_evidence; expandable detailed reasoning rather than one text block
  - _Requirements: 19.1, 19.2, 19.3_

- [ ] 32. Response Plan tab (minimum-viable) and six-state badge
  - Create `frontend/src/features/caseWorkspace/tabs/ResponsePlanTab.tsx` and a `PlanActionStateBadge` extending the `StatusBadge` tone system: stage navigation (Assessment→Restoration, selected stage's actions only, explicit empty-stage indication); rows show tool, target, risk, approval requirement, current `Action_State`; detail side panel (rationale, policy refs, expected effect, validation checks); exactly one of the six mutually exclusive `PlanActionState`s; `simulated` and `validated_effective` never collapsed; lime only on `validated_effective`; every action presented as a recommendation, never claiming real modification
  - Source complete action detail from the `POST /cases/{id}/runs` response for the just-run plan and from the **real** plan-detail endpoint (`getPlanDetail` → `GET /cases/{id}/plans/{plan_id}`) for any historical plan; `action_state` is read authoritatively from the backend action doc, never computed client-side
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 32.1, 32.3, 32.4_

### (k) Human decision — Approvals (frontend, real decision endpoint)

- [ ] 33. Approval binding and stale pre-warn (pure, client-side only)
  - Create `frontend/src/lib/approvals/binding.ts`: `ApprovalBinding` (actionId + actionVersion + basedOnStateVersion) and `isApprovalStalePrewarn(binding, currentStateVersion)` returning `currentStateVersion > binding.basedOnStateVersion`; used **only** to warn/disable in the UI — the backend is the authoritative source of truth and re-enforces staleness server-side
  - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [ ] 34. Unit test stale-approval pre-warn (MANDATORY — Req 34.6 frontend side)
  - Create `frontend/src/lib/approvals/binding.test.ts`: an approval bound to an earlier `basedOnStateVersion` is flagged stale after a later relevant `IncidentState` change and is used only to warn/disable, never to authorize simulation
  - _Requirements: 34.6, 21.2, 21.3_

- [ ] 35. Approvals experience (case tab + minimum-viable global page) over the real decision endpoint
  - Create `frontend/src/features/caseWorkspace/tabs/CaseApprovalsTab.tsx` and a minimum-viable `frontend/src/features/approvals/ApprovalsPage.tsx` (route `/approvals`): review view shows recommendation, target, supporting evidence, policy reference, expected effect, risk, required approver, `Stored_Action` version, and `based_on_state_version` (the approval binding); Approve/Reject/Request-more-investigation controls; Reject/Request require a non-whitespace comment (block submission + validation message otherwise)
  - Submit decisions to the **real** `POST /cases/{id}/actions/{action_id}/decision` via `submitDecision`; reflect the authoritative backend state (approve → `approved`; a stale `approve` returns 409 and is shown as invalidated); display a stale/invalidated approval honestly (warn/disable via the client pre-warn), never authorizing simulation; source action detail from the run response for the just-run plan and from the real plan-detail endpoint for historical plans
  - _Requirements: 23.1, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.9, 23.10, 21.1, 21.2, 21.3, 21.4, 32.3, 32.4_

- [ ] 36. Checkpoint — vertical slice to a real human decision works
  - Ensure `tsc --strict` and `vitest` pass, `vite build` succeeds, `pytest` passes; create → evidence → review → run → analysis → plan → approvals (real decision persisted + audited) renders honest states; ask the user if questions arise.

### (l) Batch 2 / replan (Plan v2 + MECE diff) + real approve→simulate→validate

- [ ] 37. Infostealer scenario engine (pure, real-backend orchestration)
  - [ ] 37.1 Scenario types and engine
    - Create `frontend/src/lib/scenario/types.ts` and `frontend/src/lib/scenario/engine.ts`: `ScenarioEngine` with `revealedIndex`, `revealNext`/`revealBatch` (idempotent re-reveal leaves evidence/plan/diff unchanged), `canRevealBatch` (honours partner-portal flag for Batch 3), `computeDiff` (client-side MECE over all Plan v2 actions), `approveAndSimulate` (drives the **real** `submitDecision` → `executeAction` → `validateAction` path and renders the authoritative resulting `Action_State`), `submitEvidenceReference`; advancement **only** via explicit presenter control, never a timer; `useScenario` hook in `frontend/src/lib/scenario/useScenario.ts`; `OfflineFallback` used only when the backend is unreachable and marked synthetic
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.6, 22.8, 22.9, 22.10, 22.12_
  - [ ] 37.2 Infostealer declarative scenario data
    - Create `frontend/src/lib/scenario/infostealer.ts`: Batch 1 initial evidence + Plan v1 via real `POST /runs`; Batch 2 exact announcement "New evidence received" + session replay with the 1,200 CRM record export + Plan v2 via a second real `POST /runs`; the diff assigns every Plan v2 action to exactly one of unchanged | added | replaced_or_insufficient | policy_triggered; exact re-plan explanation "Re-imaging the laptop was necessary but not sufficient: the stolen session is still valid."; Batch 3 gated by partner-portal flag; held-back timeline evidence gated by `revealedIndex`; org label "Caventas Demo Organisation" from one config value (`frontend/src/lib/scenario/config.ts`); no real-execution claims
    - _Requirements: 22.1, 22.2, 22.5, 22.6, 22.7, 22.9, 22.10, 22.11, 13.3_

- [ ] 38. Unit test scenario batch advancement (MANDATORY — Req 34.4)
  - Create `frontend/src/lib/scenario/engine.test.ts`: advancement presenter-driven only (never a timer); idempotent re-reveal of an already-revealed batch (22.4); partner-portal Batch-3 gate (22.9–22.10)
  - _Requirements: 34.4, 22.3, 22.4, 22.9, 22.10_

- [ ] 39. Unit test plan-diff completeness (MANDATORY — Req 34.5)
  - Add to `frontend/src/lib/scenario/engine.test.ts` (or `planDiff.test.ts`): every real Plan v2 action is assigned to exactly one of the four MECE categories unchanged/added/replaced-or-insufficient/policy-triggered over the actual Plan v2 actions
  - _Requirements: 34.5, 22.6_

- [ ] 40. Wire the Infostealer demo through the Core workspace surfaces (incl. real approve→simulate→validate)
  - Bind a scenario-backed `DataProvider` so the **already-built Core** Evidence/State, Analysis, and Response Plan surfaces render from revealed batches; add the presenter batch-reveal control; on Batch 2 upload/reveal via `POST /cases/{id}/evidence` → rely on Incident_State v2 → `POST /cases/{id}/runs` again → render Plan v2 and the client-side diff; the approve → simulate → validate path exercises the **real** `POST .../decision` → `POST .../execute` → `POST .../validate` endpoints end-to-end, rendering the authoritative `approved` → `simulated` → `validated_*` states; keep Plans append-only with version history retained and viewable; never claim real infrastructure was modified; offline → `OfflineFallback` with `Synthetic_Data_Indicator`
  - _Requirements: 22.1, 22.5, 22.6, 22.7, 22.8, 22.11, 22.12, 21.4_

### (m) Simulation / validation surfacing (frontend, authoritative backend state)

- [ ] 41. Surface simulation and validation states from authoritative backend data
  - In the Response Plan and Approvals surfaces, render `simulated` and `validated_effective` as **distinct** states (never collapsed either way) from the authoritative `ActionResult`/`action_state` the real `execute`/`validate` endpoints return; surface from `GET /cases/{id}/audit` that each decision/simulation/validation is audit-recorded, and show absence honestly where no record exists; never display a fabricated simulation result or a result derived from a stale/invalidated approval
  - _Requirements: 20.6, 21.3, 21.5, 21.6, 21.7_

### (n) Report tab (minimum-viable, real structured-report endpoints)

- [ ] 42. Report tab (minimum-viable) over the real report endpoints
  - Create `frontend/src/features/caseWorkspace/tabs/ReportTab.tsx`: collapsible sections (executive summary, classification, timeline, affected assets/identities, evidence, ATT&CK mapping, decisions/approvals, recommended+simulated actions, validation results, unresolved gaps, lessons/hardening); generate via the **real** `POST /cases/{id}/reports` (`generateReport`) and retrieve via `GET /cases/{id}/reports/{report_id}` (`getReport`); render each section only from the returned `StructuredReport` (empty sections render empty, no fabrication); completeness indicator from record-backed sections present vs total (**no** invented numeric accuracy %); a failed report request shows an honest error and never a fabricated report; the PDF export control is rendered **disabled + labelled unavailable** and activating it does nothing and shows no fabricated success (full PDF export is Follow-on)
  - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 24.8_

### (o) Timeline + Evidence tabs (minimum-viable)

- [ ] 43. Timeline tab (minimum-viable)
  - Create `frontend/src/features/caseWorkspace/tabs/TimelineTab.tsx`: Incident_State timeline events in chronological order, each with icon + short label; distinguish observed vs inferred relationships; held-back events gated via the scenario `revealedIndex`; selecting an event with associated evidence opens the evidence detail panel; selecting an event with no evidence shows a no-evidence indication and does not open the panel
  - _Requirements: 18.1, 18.2, 18.3, 18.4_

- [ ] 44. Evidence tab (minimum-viable) and side panel
  - Create `frontend/src/features/caseWorkspace/tabs/EvidenceTab.tsx` and an evidence side panel: list `GET /cases/{id}/evidence` rows (source icon, event_time, concise title, kind, observed/inferred); selecting a row opens a side panel (fields content, sha256, source_file, source_location, related entities, ATT&CK mapping, State_Version); selecting another row swaps content without closing; dismiss closes and clears selection; failed request → error state, never fabricated items (deeper filters are Follow-on)
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

### (p) Dashboard polish (frontend)

- [ ] 45. Dashboard selector functions (pure)
  - Create `frontend/src/lib/selectors/dashboard.ts`: `openCaseCount`, `attentionCaseCount`, `attentionItems` (≤3, earliest waiting-since, ties by descending escalation then ascending title), `sevenDayActivity` (7 trailing day buckets ending today), `syntheticRunCounts` (active/blocked flagged **synthetic**, **never inferred from Stage**), `stageDistribution` (grouped, ordered by workflow Stage sequence), `humanDecisions` (awaiting, escalations at highest level, oldest-waiting as single largest whole unit, **null not zero**, distribution), `recentCases` (≤5, most-recent updated, ties by ascending title)
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.4, 4.1, 4.2, 4.3, 5.1, 6.1_

- [ ]* 46. Unit test dashboard selectors
  - Create `frontend/src/lib/selectors/dashboard.test.ts`: 7-day bucket boundaries and empty-range handling (2.2); stage ordering (3.4); oldest-waiting single-largest-unit and null-not-zero (4.2, 4.3); attention selection/ordering/cap ≤3 (5.1); recent ordering/cap ≤5 (6.1)
  - _Requirements: 2.2, 3.4, 4.2, 4.3, 5.1, 6.1_

- [ ] 47. Dashboard header, overview cards, lists, and relocated-detail removal
  - [ ] 47.1 Dashboard header and synthetic-data labelling
    - Create `frontend/src/features/dashboard/DashboardHeader.tsx`: eyebrow "SOC OPERATIONS", heading "Dashboard", sentence "Incident activity and decisions requiring attention.", a Synthetic_Data_Indicator, and the existing Create New Case action; wire into `frontend/src/features/dashboard/DashboardPage.tsx`; ensure the dashboard does not show steppers, descriptions, full approval cards, long audit text, plan tools/targets, evidence IDs, State_Version metadata, or full rationale
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 31.5_
  - [ ] 47.2 Three overview cards
    - Create `CaseActivityCard.tsx` (open-case count, attention count, static non-animated 7-day chart; loading/empty/error), `AgentPlanningCard.tsx` (active/blocked run counts **explicitly synthetic + labelled**, not inferred from Stage; stage distribution in workflow order; loading/empty/error), `HumanDecisionsCard.tsx` (awaiting count, highest-level escalation count, oldest-waiting absent-not-zero, risk-and-state distribution; loading/empty/error); compose in `OverviewCards.tsx` (3-col ≥1024px); all values from current data, no hardcoding
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [ ] 47.3 Needs Attention and Recent Cases
    - Create/rework `NeedsAttentionSection.tsx` (≤3 rows via `attentionItems`; each row icon + title + one status label + relative time + arrow; no paragraphs/Case ID/State_Version/rationale; "View all"; loading/empty/error) and `RecentCasesTable.tsx` (≤5 rows via `recentCases` from the synthetic cases list; columns title, classification, current stage, updated time, status; honest absent for missing derived values; no description paragraphs; loading/empty/error)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [ ] 47.4 Remove relocated detail from the dashboard
    - Retire/trim `ApprovalsRegion.tsx`, `WorkflowSnapshot.tsx`, `CaseStatusOverview.tsx`, `SummaryTiles.tsx`, `ActivityRegion.tsx` content that moved to overview cards/case surfaces; the dashboard shows exactly one aggregate awaiting-approval count and at most one urgent shortcut, with no per-action detail or approve/reject control
    - _Requirements: 1.4, 23.2_

- [ ] 48. Checkpoint — dashboard redesign complete
  - Ensure `tsc --strict` and `vitest` pass, `vite build` succeeds, `pytest` passes, and the dashboard renders honest states; ask the user if questions arise.

### (q) Icons, About/Credits, PRODUCT.md, cross-cutting, verification

- [ ] 49. CoreUI Icons Free local registry and Icon component
  - [ ] 49.1 Create the CoreUI Icons Free local registry and `Icon` component
    - Create `frontend/src/components/icons/coreuiPaths.ts` holding the curated **local** inlined subset of CoreUI Icons Free **linear `cil-*`** path data sourced from the official `@coreui/icons` package (preserve the relevant attribution comments on the copied path data; **never** bundle or load the whole set; **never** use CoreUI Pro icons) and `frontend/src/components/icons/Icon.tsx` exporting the `IconName` union and `Icon` ({ name, size?: 18|20|24, title?, className? }); strokes use `currentColor`; nav 20px, workflow/empty-state 24px, never below 18px; one icon family per surface
    - Provide the full semantic → `cil-*` set: dashboard (`cil-speedometer`), cases (`cil-folder`), approvals (`cil-check-circle`), guidance (`cil-book`), reports (`cil-file`), activity (`cil-list`), settings (`cil-settings`), evidence (`cil-folder-open`), timeline (`cil-clock`), analysis (`cil-chart`), responsePlan (`cil-list-rich`), humanDecision (`cil-user-follow`), report (`cil-description`), endpoint (`cil-laptop`), identity (`cil-user`), network (`cil-globe-alt`), email (`cil-envelope-closed`), file (`cil-file`), warning (`cil-warning`), success (`cil-check-circle`), blocked (`cil-ban`), running (`cil-loop-circular`)
    - _Requirements: 27.1, 27.2, 27.4, 27.7, 27.8, 27.9, 27.12, 27.13_
  - [ ] 49.2 Migrate call sites from lucide-react to Icon and remove lucide
    - Replace `lucide-react` usages across `frontend/src/components/shell/*` and `frontend/src/features/dashboard/*` with `<Icon name=... />`; pair every icon with a text label; icon-only buttons get an accessible name + tooltip; remove `lucide-react` from `frontend/package.json` once no call sites remain; **remove all Streamline references** anywhere they appear
    - _Requirements: 27.3, 27.10, 27.11, 30.1, 33.1_

- [ ] 50. About/Credits attribution surface
  - Create `frontend/src/app/AboutPage.tsx` and add the `/about` route in `frontend/src/app/App.tsx`; render the exact text "CoreUI Icons Free by the CoreUI Team — licensed under CC BY 4.0", a link to https://github.com/coreui/coreui-icons, and a link to https://creativecommons.org/licenses/by/4.0/; document the CoreUI Icons Free dependency in the repository's third-party notices / frontend documentation, attributing the icon artwork to **CC BY 4.0** and never describing it as MIT-licensed
  - _Requirements: 27.5, 27.6_

- [ ] 51. Update PRODUCT.md
  - Edit `PRODUCT.md`: record durable decisions for **Information Architecture**, **Progressive Disclosure**, **Scenario-Based Demonstration**, and **Action Boundary**; state interface typography as **Barlow** and remove the stale "IBM Plex Sans" note (keep IBM Plex Mono for identifiers); keep icon filenames, route metadata, and component specs out of PRODUCT.md
  - _Requirements: 35.1, 35.2, 35.3, 35.4_

- [ ] 52. Cross-cutting: motion, honest states, responsive, accessibility
  - [ ] 52.1 Restrained motion utility and reduced-motion handling
    - Create `frontend/src/lib/motion.ts` (tab fade 120–160ms, panel enter 180–220ms, step complete ≤300ms, single evidence pulse ≤500ms no repeat) and a global `@media (prefers-reduced-motion: reduce)` rule in `frontend/src/index.css` that **removes** (not shortens) these; no continuously-animated charts
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6_
  - [ ] 52.2 Honest data states and visual restraint pass
    - Ensure every data-driven surface provides loading, empty, error, offline, and notification states (reuse `Region`/`EmptyState`/`ErrorState`/`PendingBackendNote`/`ConnectionBanner`); offline distinguished from backend failure; any defensive 501 state plain; no fabricated data; `Synthetic_Data_Indicator` adjacent to the synthetic cases list and synthetic run counts only; no gradients/neon/glow; preserve navy/lime tokens, Barlow + IBM Plex Mono, and the FastAPI-only boundary
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 30.1, 30.2, 30.3_
  - [ ] 52.3 Responsive layout pass
    - Ensure ≥1024px persistent sidebar + 3-col overview cards + optional right panel; 768–1023px collapsible sidebar + reflowed cards + horizontally scrollable tabs; ≤767px off-canvas nav + one card per row + scrollable tabs + full-screen detail sheets + compact lists; no horizontal overflow 320–1920px
    - _Requirements: 29.1, 29.2, 29.3, 29.4_
  - [ ] 52.4 Accessibility pass
    - Icon-only controls have accessible names; navigation and decision controls keyboard operable with visible focus; status never by colour alone (every status hue paired with label or icon)
    - _Requirements: 33.1, 33.2, 33.3, 33.4_

- [ ] 53. Core verification checkpoint
  - Run `tsc --strict`, the Vite production build (`npm run build`), and `vitest` for the frontend, and `pytest` for the backend; ensure all pass (all twelve mandatory tests — five backend, seven frontend — green)
  - Record manual checks in frontend docs: responsive at 320/768/1024/1920px with no horizontal overflow (29.4); `prefers-reduced-motion` removes motion (28.5); keyboard operability + visible focus, icon-only accessible names, status not colour-alone (33.1–33.4)
  - _Requirements: 29.4, 28.5, 33.2, 33.3, 33.4, 34.1_

---

## Follow-on tasks (subsequent increments — optional for first slice)

- [ ]* 54. Phishing scenario
  - Create `frontend/src/lib/scenario/phishing.ts`: Batch 1 Plan v1 via real backend run (labelled Offline_Fallback only when unreachable); presenter-only advancement, idempotent re-reveal; Batch 2 expanded scope + Plan v2 differing by ≥1 action; no real-execution claims
  - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_

- [ ]* 55. False-alarm scenario and CHG-2026-118 gate
  - Create `frontend/src/lib/scenario/falseAlarm.ts`: initial evidence revealed without auto-closing the case; agent Evidence Request "Was there an approved change for FS-01 last night?"; stay open and show "did not match" for any input != "CHG-2026-118"; on exact match classify false positive, present/trigger no defensive action, show evidence-backed report; no real-execution claims
  - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6_

- [ ] 56. Unit test the false-alarm gate (MANDATORY — Req 34.11)
  - Create `frontend/src/lib/scenario/falseAlarm.test.ts`: the case closes as a false positive only on an exact match of "CHG-2026-118" and never on a non-matching input (which keeps the case open and shows a did-not-match indication)
  - _Requirements: 34.11, 26.3, 26.4, 26.5_

- [ ]* 57. PDF export
  - Implement PDF export on the Report tab once backend PDF rendering supports it; keep the control disabled + labelled unavailable until then
  - _Requirements: 24.7_

- [ ]* 58. Deeper Evidence tab richness
  - Add the secondary filters All/Endpoint/Identity/Network/Application/Analyst Notes and agent-usage detail in the side panel
  - _Requirements: 17.6_

- [ ]* 59. Deeper Timeline, Analysis, Overview, Plan, Approvals, Report richness
  - Timeline: decoy-benign, analyst-added, held-back/newly-introduced distinctions and demo-stage gating (18.5); Analysis: deeper reasoning + cross-linking (19.4); Overview: richer visualisation (16.4); Response Plan: richer presentation + cross-stage comparison (20.9); Approvals: richer workflow, bulk decisions, cross-case queue (23.11); Report: richer composition/formatting (24.9)
  - _Requirements: 16.4, 17.6, 18.5, 19.4, 20.9, 23.11, 24.9_

- [ ]* 60. Responsive and motion polish pass
  - Tune breakpoint behaviours and motion across the new tabs and scenarios; re-verify no horizontal overflow 320–1920px and reduced-motion removal
  - _Requirements: 29.1, 29.2, 29.3, 29.4, 28.5_

- [ ]* 61. Follow-on verification checkpoint
  - Re-run `tsc --strict`, `npm run build`, `vitest`, and `pytest`; re-check responsive and a11y across the new tabs and scenarios
  - _Requirements: 29.4, 34.1_

## Notes

- Tasks marked with `*` are optional. Core tasks (1–53) form the first shippable vertical-demo slice; Follow-on tasks (54–61) are subsequent increments.
- The twelve Req 34 tests are **required** and carry no `*`: five backend pytest tests (tasks 14, 15, 16, 17, 18) and seven frontend Vitest tests (tasks 7, 22, 27, 34, 38, 39, 56). Other unit tests (5, 46) remain optional. Property-based testing is not used (UI redesign plus CRUD/state-transition backend logic per the design Testing Strategy).
- Each task references specific requirement sub-clauses and names concrete files/directories under `backend/app`, `backend/tests`, or `frontend/src`.
- Checkpoints (tasks 19, 29, 36, 48, 53) each require `tsc --strict`, `vite build`, and `pytest` to pass; task 53 also records manual responsive (320/768/1024/1920, no horizontal overflow) and a11y checks.
- The contracts/types (tasks 2–4) and API boundary (tasks 6–7) are built first; the Core backend endpoints (tasks 8–13) are implemented next, so every frontend surface that calls a backend endpoint is sequenced — and depends in the graph — on the backend task that implements it: Response Plan (task 32) after plan-detail (task 12); Approvals (task 35) after the decision endpoint (task 10); simulation/validation surfacing (tasks 40, 41) after execute/validate (task 11); the Report tab (task 42) after the report endpoints (task 13); the Infostealer approve→simulate→validate integration (task 40) after all three backend action endpoints (tasks 10, 11).
- Backend gaps that remain are handled honestly in the frontend: PDF export is Follow-on (control disabled/labelled); the optional run-status endpoint is absent so run counts are synthetic and never inferred from Stage; the optional global cases-list/audit are absent so the dashboard uses a synthetic, flagged cases fixture; `PATCH /cases` does not exist by decision, so title + description are read-only after creation and no PATCH is ever called.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "8.1"] },
    { "id": 1, "tasks": ["3", "6", "8.2"] },
    { "id": 2, "tasks": ["4", "7", "9"] },
    { "id": 3, "tasks": ["5", "10.1", "11.1", "12", "13.1"] },
    { "id": 4, "tasks": ["10.2", "11.2", "13.2"] },
    { "id": 5, "tasks": ["14", "15", "16", "17", "18"] },
    { "id": 6, "tasks": ["20.1", "20.2", "21", "26", "33"] },
    { "id": 7, "tasks": ["22", "23", "27", "34", "49.1"] },
    { "id": 8, "tasks": ["24", "28.1", "37.1", "45", "49.2"] },
    { "id": 9, "tasks": ["25", "28.2", "30", "37.2", "50"] },
    { "id": 10, "tasks": ["31", "32", "38", "39", "46"] },
    { "id": 11, "tasks": ["35", "40", "43", "44"] },
    { "id": 12, "tasks": ["41", "42", "47.1", "47.2", "47.3"] },
    { "id": 13, "tasks": ["47.4", "51", "52.1", "52.2", "52.3", "52.4"] },
    { "id": 14, "tasks": ["54", "55", "56", "57", "58", "59", "60"] }
  ]
}
```
