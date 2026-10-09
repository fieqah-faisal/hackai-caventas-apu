# Implementation Plan: Caventas IA Progressive-Disclosure Redesign

## Overview

This plan extends the existing Caventas frontend (React 18 + Vite 5 + TypeScript
strict + Tailwind 3 under `frontend/`); it does not rebuild it. The existing
`AppShell` (TopBar + Sidebar + drawer + ConnectionBanner), UI primitives
(`Button`, `StatusBadge`, `Region`/`EmptyState`/`ErrorState`/`PendingBackendNote`,
`Skeleton`, `Mono`, `Toast`), `createBrowserRouter` routing in
`src/app/App.tsx`, Barlow + IBM Plex Mono typography, and the navy/lime CSS-token
palette are all preserved.

Tasks are sequenced by the design's **[Core] first shippable slice** then
**[Follow-on]** depth. Core order: foundations (icons, data-access layer,
selectors, types) → dashboard redesign → Create New Case stepper → Case
Workspace shell + tab machine + Overview → Infostealer main demo → About/Credits
attribution → PRODUCT.md. Follow-on tabs, scenarios, and polish passes follow
and are marked optional with `*`.

Property-based testing is **not** used (per design Testing Strategy — a UI
redesign over an existing backend). Unit tests (Vitest) cover the pure logic;
test sub-tasks are optional and marked with `*`.

## Tasks

- [ ] 1. Set up Vitest and foundational test harness
  - Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`,
    `@testing-library/user-event`, `jsdom` to `frontend/package.json` devDependencies
  - Add a `test` script and Vitest config (jsdom environment, `@` alias matching Vite) in `frontend/vite.config.ts` or `frontend/vitest.config.ts`
  - Create `frontend/src/test/setup.ts` registering jest-dom matchers
  - Add one trivial passing smoke test to confirm the harness runs
  - _Requirements: 28.1_

- [ ] 2. CoreUI icon module and Icon component (lucide migration)
  - [ ] 2.1 Create the CoreUI Icon module and `Icon` component
    - Add `@coreui/icons` dependency; create `frontend/src/components/icons/coreuiPaths.ts` holding the curated inlined SVG path subset for all semantic names in the design mapping
    - Create `frontend/src/components/icons/Icon.tsx` exporting `IconName` union and `Icon` ({ name, size?: 18|20|24, title?, className? }); strokes use `currentColor`; nav 20px, workflow/empty-state 24px; never below 18px
    - Provide the full semantic set: dashboard, cases, approvals, guidance, reports, activity, settings, evidence, timeline, analysis, responsePlan, humanDecision, report, endpoint, identity, network, email, file, warning, success, blocked, running
    - _Requirements: 25.1, 25.3, 25.4, 25.5, 25.9_
  - [ ] 2.2 Migrate call sites from lucide-react to Icon and remove lucide
    - Replace `lucide-react` usages across `frontend/src/components/shell/*` and `frontend/src/features/dashboard/*` with `<Icon name=... />`
    - Pair every icon with a text label; give icon-only buttons an accessible name + tooltip (one icon family per surface)
    - Remove `lucide-react` from `frontend/package.json` once no call sites remain
    - _Requirements: 25.6, 25.7, 25.8, 30.1_

- [ ] 3. Extend domain and UI types
  - Edit `frontend/src/lib/types.ts`: add `Severity`; extend `CaseSummary` with `classification?`, `severity?`, `stage?`; add `CaseDetail`, `EvidenceCategory`, `EvidenceItemView`, `PlanningRunRef`, `Plan`, `StoredActionView`, `DayBucket`, `Duration`, `AttentionItem`, `AttentionReason`
  - Add the six-state `PlanActionState` union (`proposed | approved | simulated | validated_effective | validated_ineffective | superseded`) kept separate from the existing four/five-state `ActionState`
  - Add `TabId`, `StepId`, and scenario shapes (`ScenarioDef`, `BatchDef`, `DiffCategory`, `PlanDiff`, `EvidenceRequestGate`) referenced by later tasks
  - Preserve all existing backend-mirroring types unchanged
  - _Requirements: 6.3, 13.1, 16.1, 19.5_

- [ ] 4. Data-access layer: apiClient
  - [ ] 4.1 Implement the typed fetch wrapper
    - Create `frontend/src/lib/api/apiClient.ts` with `ApiResult<T>` (`ok | http_error | not_implemented(501) | network_error | offline`) and `ApiClient` ({ get, post, postForm })
    - Base path `/api`; map HTTP 501 to `not_implemented` before generic `http_error`; return `offline` when `navigator.onLine` is false and `network_error` on request failure
    - _Requirements: 28.2, 28.3, 29.1, 29.2, 29.3_
  - [ ]* 4.2 Unit test apiClient result mapping
    - Create `frontend/src/lib/api/apiClient.test.ts`: 501 → `not_implemented`, offline vs network_error distinction, ok passthrough
    - _Requirements: 29.2, 29.3_

- [ ] 5. Data-access layer: DataProvider + real/fixture providers
  - [ ] 5.1 Define the DataProvider interface and real provider
    - Create `frontend/src/lib/api/provider.ts` (`DataProvider`, `Sourced<T>`) and `frontend/src/lib/api/realProvider.ts` wiring the real endpoints: `GET /cases/{id}`, `POST /cases`, evidence upload/list, `GET /cases/{id}/state`, `POST /cases/{id}/runs`, `GET /cases/{id}/plans`; marks `source: "real"`
    - 501-stub methods (`submitDecision`, `generateReport`) return `not_implemented` honestly
    - _Requirements: 28.2, 28.3, 29.3_
  - [ ] 5.2 Implement the synthetic fixture provider
    - Create `frontend/src/lib/api/fixtureProvider.ts` providing `listCases()` and `listAuditEvents()` (no backend endpoint exists) returning `source: "synthetic"`; migrate/extend existing `frontend/src/lib/mock-data.ts` fixtures as the synthetic data source
    - Every synthetic payload is flagged so surfaces can attach a Synthetic_Data_Indicator
    - _Requirements: 29.4, 29.5_

- [ ] 6. Dashboard selector functions (pure)
  - [ ] 6.1 Implement dashboard aggregate selectors
    - Create `frontend/src/lib/selectors/dashboard.ts`: `openCaseCount`, `attentionItems` (≤3, earliest waiting-since, ties by descending escalation then ascending title), `sevenDayActivity` (7 trailing day buckets ending today), `stageDistribution` (grouped, ordered by workflow Stage sequence), `humanDecisions` (awaiting, escalations at highest level, oldest-waiting as single largest whole unit, null not zero, distribution), `recentCases` (≤5, most-recent updated, ties by ascending title)
    - _Requirements: 2.2, 3.2, 4.1, 4.2, 4.3, 5.1, 6.1_
  - [ ]* 6.2 Unit test dashboard selectors
    - Create `frontend/src/lib/selectors/dashboard.test.ts`: 7-day bucket boundaries and empty-range handling (2.2), stage ordering (3.2), oldest-waiting single-largest-unit and null-not-zero (4.2, 4.3), attention selection/ordering/cap ≤3 (5.1), recent ordering/cap ≤5 (6.1)
    - _Requirements: 2.2, 3.2, 4.2, 4.3, 5.1, 6.1_

- [ ] 7. Checkpoint — foundations build and tests pass
  - Ensure `tsc` strict passes, `vitest` passes, and the app still builds; ask the user if questions arise.

- [ ] 8. Dashboard header and synthetic-data labelling
  - Create `frontend/src/features/dashboard/DashboardHeader.tsx`: eyebrow "SOC OPERATIONS", heading "Dashboard", sentence "Incident activity and decisions requiring attention.", a Synthetic_Data_Indicator, and the existing Create New Case action
  - Wire it into `frontend/src/features/dashboard/DashboardPage.tsx`; ensure the dashboard does not show steppers, descriptions, full approval cards, long audit text, plan tools/targets, evidence IDs, State_Version metadata, or full rationale
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 29.5_

- [ ] 9. Dashboard overview cards
  - [ ] 9.1 Case Activity overview card
    - Create `frontend/src/features/dashboard/CaseActivityCard.tsx`: open-case count, attention count, and a static (non-animated) 7-day bucket chart from `sevenDayActivity`; loading, honest empty, and error states; all values from current data, no hardcoding
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [ ] 9.2 Agent Planning overview card
    - Create `frontend/src/features/dashboard/AgentPlanningCard.tsx`: active vs blocked run counts, stage distribution (workflow order), loading/empty/error states, no hardcoded values
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - [ ] 9.3 Human Decisions overview card
    - Create `frontend/src/features/dashboard/HumanDecisionsCard.tsx`: awaiting count, highest-level escalation count, oldest-waiting (absent not zero when none), risk-and-state distribution, loading/empty/error states, no hardcoded values
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [ ] 9.4 Compose overview cards in a responsive 3-column layout
    - Create `frontend/src/features/dashboard/OverviewCards.tsx` and render the three cards (3-col ≥1024px); feed them from `useDashboardData` / provider + selectors
    - _Requirements: 27.1_

- [ ] 10. Dashboard Needs Attention and Recent Cases
  - [ ] 10.1 Needs Attention section
    - Rework `frontend/src/features/dashboard/AttentionRegion.tsx` (or add `NeedsAttentionSection.tsx`): ≤3 rows via `attentionItems`; each row shows icon, title, one status label, relative time, arrow; no paragraphs/Case ID/State_Version/rationale; "View all" affordance; loading/empty/error states
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_
  - [ ] 10.2 Recent Cases table
    - Create `frontend/src/features/dashboard/RecentCasesTable.tsx`: ≤5 rows via `recentCases`; columns title, classification, current stage, updated time, status; no description paragraphs; loading/empty/error states
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  - [ ] 10.3 Remove relocated detail from the dashboard
    - Retire/trim `ApprovalsRegion.tsx`, `WorkflowSnapshot.tsx`, `CaseStatusOverview.tsx`, `SummaryTiles.tsx`, `ActivityRegion.tsx` content that moved to overview cards/case surfaces; dashboard shows exactly one aggregate awaiting-approval count and at most one urgent shortcut, no per-action controls
    - _Requirements: 1.4, 23.2_

- [ ] 11. Checkpoint — dashboard redesign complete
  - Ensure all tests pass and the dashboard renders honest states; ask the user if questions arise.

- [ ] 12. Create New Case step machine (pure)
  - [ ] 12.1 Implement the setup step machine
    - Create `frontend/src/lib/setup/stepMachine.ts`: `StepId`, `StepStatus`, `SetupState`, `stepStatuses`, `prerequisiteReason`, `editEarlier` (invalidate containing step and all later), one-active-step reveal, future-steps visible-but-disabled, completed steps revisitable, backward nav preserving confirmed values, duplicate-run guard flag
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 11.4_
  - [ ]* 12.2 Unit test the step machine
    - Create `frontend/src/lib/setup/stepMachine.test.ts`: title validation gate (8.3), edit-earlier invalidation (7.6), backward-nav value preservation (7.7), duplicate-run guard (11.4)
    - _Requirements: 7.6, 7.7, 8.3, 11.4_

- [ ] 13. Create New Case flow UI and route
  - [ ] 13.1 Setup panel shell and Step 1 (Case Details)
    - Create `frontend/src/features/createCase/CreateCasePage.tsx` and `SetupPanel.tsx`; add route `/cases/new` in `frontend/src/app/App.tsx`
    - Step 1 fields: title, short description, analyst note, optional scenario-template selector; title validation gates Step 2 with reason shown on the disabled step; `POST /cases` on transition into Step 2 to obtain `caseId`
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_
  - [ ] 13.2 Step 2 (Evidence upload)
    - Create `frontend/src/features/createCase/StepEvidence.tsx`: accept CSV/JSON/TXT (display accepted formats), each accepted file as compact row with source icon via `POST /cases/{caseId}/evidence`; client-side reject wrong type and >10 MB; backend 400 → malformed-record error; advanced fields hidden until ≥1 accepted; gate Step 3
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
  - [ ] 13.3 Step 3 (Evidence Review)
    - Create `frontend/src/features/createCase/StepReview.tsx`: show accepted count, detected sources, rejected/malformed counts exactly from `GET /cases/{caseId}/evidence`; SHA-256 + ingestion status only on explicit request; require confirm; changing evidence clears confirm; gate Step 4
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [ ] 13.4 Step 4 (Start Analysis)
    - Create `frontend/src/features/createCase/StepStart.tsx`: summary with case details, evidence sources, accepted count, current State_Version (from `GET /cases/{caseId}/state`); primary "Start analysis" → `POST /cases/{caseId}/runs` once (duplicate guard); failed run shows honest error, no false success
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 14. Demo scenario templates shell
  - Create `frontend/src/features/createCase/DemoScenarioPicker.tsx`: "Load demo scenario" helper marked demonstration-only; three cards — "Infostealer to Session Hijack"/Main demo, "Phishing to Account Takeover"/Light scenario, "Planned Backup Migration"/False alarm — each with one-sentence description; org label "Caventas Demo Organisation" read from one config value (`frontend/src/lib/scenario/config.ts`); populated fields stay editable and retain manual overrides; exclude unrelated placeholder incidents from primary fixtures
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 15. Case Workspace tab-availability machine (pure)
  - [ ] 15.1 Implement tabAvailability and selected-tab resolver
    - Create `frontend/src/lib/caseWorkspace/tabAvailability.ts`: `CaseFacts`, `TabStatus`, `tabAvailability(facts, prev?)` with Overview always on, Evidence/Timeline latching (never relock), Analysis/Plan/Approvals/Report gated and relockable; `resolveSelectedTab` falls back to Overview when the requested tab is unavailable
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.10, 14.11_
  - [ ]* 15.2 Unit test tabAvailability
    - Create `frontend/src/lib/caseWorkspace/tabAvailability.test.ts`: each transition (14.2–14.7), Evidence/Timeline latch (14.10), relock + fallback-to-Overview (14.11)
    - _Requirements: 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.10, 14.11_

- [ ] 16. Case Workspace shell, underline tabs, and Overview tab
  - [ ] 16.1 Workspace header and underline tab bar
    - Create `frontend/src/features/caseWorkspace/CaseWorkspace.tsx`, `CaseHeader.tsx`, `UnderlineTabs.tsx`; replace the `/cases/:caseId` placeholder in `frontend/src/app/App.tsx` with the workspace route and nested tab routes (`overview`, `evidence`, `timeline`, `analysis`, `plan`, `approvals`, `report`) rendering through `<Outlet/>`
    - Persistent header (title, severity, incident status, current stage, last-updated, compact agent state) shown once; underline (not pill) tabs; disabled tabs are non-focusable (`aria-disabled`, removed from tab order) with prerequisite tooltip; direct navigation to a disabled tab URL redirects to overview
    - _Requirements: 13.1, 13.2, 13.3, 14.8, 14.9_
  - [ ] 16.2 Overview tab content
    - Create `frontend/src/features/caseWorkspace/tabs/OverviewTab.tsx`: one-sentence summary, affected-entities count, evidence-source count, current hypothesis, current stage, missing-evidence indicator, compact agent-progress; links to detail tabs instead of reproducing content; no long paragraphs
    - _Requirements: 15.1, 15.2, 15.3_

- [ ] 17. Checkpoint — Create Case and Workspace shell complete
  - Ensure all tests pass and routing works end to end; ask the user if questions arise.

- [ ] 18. Infostealer scenario engine (pure)
  - [ ] 18.1 Scenario types and engine
    - Create `frontend/src/lib/scenario/types.ts` and `frontend/src/lib/scenario/engine.ts`: `ScenarioEngine` with `revealedIndex`, `revealNext`/`revealBatch` (idempotent), `canRevealBatch` (honours partner-portal flag), `submitEvidenceReference`; advancement only via explicit presenter control, never a timer; `useScenario` hook in `frontend/src/lib/scenario/useScenario.ts`
    - _Requirements: 20.2, 20.3, 20.7, 20.8_
  - [ ] 18.2 Infostealer declarative scenario data
    - Create `frontend/src/lib/scenario/infostealer.ts`: Batch 1 initial evidence + Plan v1 (exactly isolate laptop, preserve memory and disk, block domain, re-image after preservation); Batch 2 "New evidence received" announcement + session replay with 1,200 CRM record export + Plan v2 with a MECE diff over all v2 actions (unchanged | added | replaced_or_insufficient | policy_triggered) + exact re-plan explanation "Re-imaging the laptop was necessary but not sufficient: the stolen session is still valid."; Batch 3 gated by partner-portal flag; held-back evidence gated by revealedIndex; no real-execution claims
    - _Requirements: 20.1, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9_
  - [ ]* 18.3 Unit test the scenario engine
    - Create `frontend/src/lib/scenario/engine.test.ts`: idempotent re-reveal (20.3), presenter-only advancement/no timer (20.2), Batch-2 diff MECE over v2 actions (20.5), exact strings (20.4, 20.6), partner-portal Batch-3 gate (20.7, 20.8)
    - _Requirements: 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8_
  - [ ] 18.4 Wire the Infostealer scenario through the workspace
    - Bind a scenario-backed `DataProvider` so Evidence/Timeline/Analysis/Response-Plan surfaces render from revealed batches; add the presenter batch-reveal control; ensure no interface text claims real infrastructure was modified
    - _Requirements: 20.1, 20.4, 20.9_

- [ ] 19. About/Credits attribution surface
  - Create `frontend/src/app/AboutPage.tsx` and add the `/about` route in `frontend/src/app/App.tsx`; render CoreUI attribution (CoreUI Icons Free artwork is CC BY 4.0; code packages MIT)
  - _Requirements: 25.2_

- [ ] 20. Update PRODUCT.md
  - Edit `PRODUCT.md`: record durable decisions for Information Architecture, Progressive Disclosure, Scenario-Based Demonstration, and Action Boundary; state interface typography as Barlow and remove the stale "IBM Plex Sans" note (keep IBM Plex Mono for identifiers); keep icon filenames, route metadata, and component specs out of PRODUCT.md
  - _Requirements: 31.1, 31.2, 31.3, 31.4_

- [ ] 21. Cross-cutting: motion, responsive, honest states, accessibility
  - [ ] 21.1 Restrained motion utility and reduced-motion handling
    - Create `frontend/src/lib/motion.ts` (tab fade 120–160ms, panel enter 180–220ms, step complete ≤300ms, single evidence pulse ≤500ms no repeat) and a global `@media (prefers-reduced-motion: reduce)` rule in `frontend/src/index.css` that removes (not shortens) these; no continuously-animated charts
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6_
  - [ ] 21.2 Honest data states and visual restraint pass
    - Ensure every data-driven surface provides loading, empty, error, offline, and notification states (reuse `Region`/`EmptyState`/`ErrorState`/`PendingBackendNote`/`ConnectionBanner`); offline distinguished from backend failure; 501 states plain; no fabricated data; Synthetic_Data_Indicator adjacent to synthetic data; no gradients/neon/glow
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6_
  - [ ] 21.3 Accessibility pass
    - Icon-only controls have accessible names; navigation and decision controls keyboard operable with visible focus; status never by colour alone (every status hue paired with label or icon)
    - _Requirements: 30.1, 30.2, 30.3, 30.4_

- [ ] 22. Core verification checkpoint
  - Run `tsc` strict and the Vite production build (`npm run build`) and ensure both pass; run `vitest`
  - Record manual checks in frontend docs: responsive at 320/768/1024/1920px with no horizontal overflow (27.1–27.4); `prefers-reduced-motion` removes motion (26.5); keyboard operability + visible focus, icon-only accessible names, status not colour-alone (30.1–30.4)
  - _Requirements: 27.1, 27.2, 27.3, 27.4, 28.1_

---

## Follow-on tasks (subsequent increments — optional for first slice)

- [ ]* 23. Evidence tab
  - Create `frontend/src/features/caseWorkspace/tabs/EvidenceTab.tsx` and an evidence side panel: filters All/Endpoint/Identity/Network/Application/Analyst Notes; rows with source icon, timestamp, title, type, observed/inferred; selecting a row opens a side panel (full content, SHA-256, source file, related entities, ATT&CK, agent usage, State_Version); selecting another row swaps content without closing; dismiss closes and clears selection
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [ ]* 24. Timeline tab
  - Create `frontend/src/features/caseWorkspace/tabs/TimelineTab.tsx`: chronological events with icon + short label; support relevant, decoy-benign, analyst-added, held-back/newly-introduced events; distinguish observed vs inferred; hide held-back evidence until the demo stage is reached; selecting an event with evidence opens the evidence panel; selecting an event with no evidence shows a no-evidence indication and does not open the panel
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ]* 25. Analysis tab
  - Create `frontend/src/features/caseWorkspace/tabs/AnalysisTab.tsx`: concise sections for classification, confidence with evidence basis (labelled advisory), affected entities, ATT&CK techniques, missing evidence, active hypotheses; expandable detailed reasoning rather than one text block
  - _Requirements: 18.1, 18.2, 18.3_

- [ ]* 26. Response Plan tab and six action states
  - Create `frontend/src/features/caseWorkspace/tabs/ResponsePlanTab.tsx` and a `PlanActionStateBadge` extending the tone system: stage navigation (Assessment→Restoration, selected stage's actions only, empty-stage indication); rows show action, target, risk, approval requirement, current Action_State; detail side panel (rationale, policy refs, expected effect, validation checks); exactly one of the six mutually exclusive `PlanActionState`s; Simulated and Validated-effective never collapsed; lime only on validated-effective; every action presented as a recommendation, never claiming real modification
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

- [ ]* 27. Approvals experience (case tab + global page depth)
  - Create `frontend/src/features/caseWorkspace/tabs/CaseApprovalsTab.tsx` and flesh out `frontend/src/features/approvals/ApprovalsPage.tsx` (route `/approvals`): review view shows recommendation, target, supporting evidence, policy reference, expected effect, risk, required approver, State_Version; Approve/Reject/Request-more-investigation controls; Reject/Request require a non-whitespace comment (block + validation message otherwise); 501 → plain "not yet available", no fabricated success
  - _Requirements: 23.1, 23.3, 23.4, 23.5, 23.6, 23.7_

- [ ]* 28. Report tab
  - Create `frontend/src/features/caseWorkspace/tabs/ReportTab.tsx`: collapsible sections (executive summary, classification, timeline, affected assets/identities, evidence, ATT&CK, decisions/approvals, recommended+simulated actions, validation results, unresolved gaps, lessons/hardening); completeness indicator from record-backed sections present vs total (no invented accuracy %); PDF export control disabled + labelled unavailable while 501, activating it does nothing and shows no fabricated success; every section populated only from record-backed data, empty where none
  - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

- [ ]* 29. Phishing scenario
  - Create `frontend/src/lib/scenario/phishing.ts`: Batch 1 Plan v1; presenter-only advancement, idempotent re-reveal; Batch 2 expanded scope + Plan v2 differing by ≥1 action; no real-execution claims
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

- [ ]* 30. False-alarm scenario and CHG-2026-118 gate
  - Create `frontend/src/lib/scenario/falseAlarm.ts`: initial evidence revealed without auto-closing the case; agent Evidence Request "Was there an approved change for FS-01 last night?"; stay open and show "did not match" for any input != "CHG-2026-118"; on exact match classify false positive, present/trigger no defensive action, show evidence-backed report; no real-execution claims
  - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6_

- [ ]* 31. Unit test the false-alarm gate
  - Create `frontend/src/lib/scenario/falseAlarm.test.ts`: exact-match classification only on "CHG-2026-118", no-match retention and indication
  - _Requirements: 22.3, 22.4, 22.5_

- [ ]* 32. Responsive and motion polish pass
  - Tune breakpoint behaviours in the workspace and dashboard: ≥1024px persistent sidebar + 3-col + optional right panel; 768–1023px collapsible sidebar + reflowed cards + horizontally scrollable tabs; ≤767px off-canvas nav + one card per row + scrollable tabs + full-screen detail sheets + compact lists; no horizontal overflow 320–1920px
  - _Requirements: 27.1, 27.2, 27.3, 27.4_

- [ ]* 33. Follow-on verification checkpoint
  - Re-run `tsc` strict, `npm run build`, and `vitest`; re-check responsive and a11y across the new tabs and scenarios
  - _Requirements: 27.4, 28.1_

## Notes

- Tasks marked with `*` are optional. Core tasks (1–22) form the first shippable slice; Follow-on tasks (23–33) are subsequent increments.
- Property-based testing is not used (UI redesign per design Testing Strategy); unit tests use Vitest and are the optional test sub-tasks.
- Each task references specific requirement sub-clauses and names concrete files/directories under `frontend/src`.
- Checkpoints (tasks 7, 11, 17, 22, 33) ensure incremental validation.
- The data-access layer (apiClient + providers + selectors) is a dependency for every data-driven surface and is built first.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1", "3"] },
    { "id": 1, "tasks": ["2.2", "4.1", "6.1", "12.1", "15.1", "18.1", "20"] },
    { "id": 2, "tasks": ["4.2", "5.1", "6.2", "12.2", "15.2", "18.2", "19"] },
    { "id": 3, "tasks": ["5.2", "8", "18.3"] },
    { "id": 4, "tasks": ["9.1", "9.2", "9.3", "13.1", "16.1"] },
    { "id": 5, "tasks": ["9.4", "10.1", "10.2", "13.2", "16.2"] },
    { "id": 6, "tasks": ["10.3", "13.3", "14", "18.4"] },
    { "id": 7, "tasks": ["13.4", "21.1", "21.2", "21.3"] },
    { "id": 8, "tasks": ["23", "24", "25", "26", "27", "28", "29", "30", "31", "32"] }
  ]
}
```

