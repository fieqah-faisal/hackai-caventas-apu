# Decisions

> DEC-nnn records, appended. Format and rules: [README.md](README.md).

## DEC-001: Firestore as the incident-state store (2026-10-06)

**Context:** The original proposal (§9) specified SQLite + JSON; the repo
implements Firestore and `.kiro/steering/tech.md` explicitly prohibits
SQLite. Recorded so future sessions do not re-litigate it.

**Options considered:** Not captured in the steering docs (proposal:
SQLite + JSON; implemented: Firestore).

**Decision:** Google Cloud Firestore via Firebase Admin SDK; versioned JSON
state documents; originals on the local filesystem with path + SHA-256 in
Firestore.

**Tradeoff:** Cloud dependency and a Firestore emulator for local dev; the
Admin SDK bypasses client security rules, so backend validation is the
security boundary (`.kiro/steering/security.md`).

**Links:** `.kiro/steering/tech.md`, `backend/README.md`.

## DEC-002: Session notebook lives in docs/session/ (2026-10-06)

**Context:** Agents and teammates lose context across sessions; Kiro's
built-in memory is per-user and not visible to teammates. A shared,
tool-neutral notebook was needed.

**Options considered:** (1) repo root (tool default), (2) inside `.kiro/`,
(3) `docs/session/` with thin triggers — chosen to keep the notebook
tool-neutral and separate from Kiro config.

**Decision:** Adopt `docs/session/` as the canonical notebook location,
with thin triggers (`.kiro/steering/session-notebook.md`, `AGENTS.md`,
copy-paste prompt).

**Tradeoff:** The notebook is not at the tool-default root path; discovery
depends on triggers/links being read.

**Links:** `docs/superpowers/specs/2026-10-06-session-notebook-design.md`.

## DEC-003: DeepSeek V4.1 Flash as the AI planner model (2026-10-06)

**Context:** The proposal's tech stack originally said "DeepSeek V4 Pro";
review comments proposed V4.1 and the OpenCode Go subscription; the updated
proposal (§9) now specifies **DeepSeek V4.1 Flash**, noting it outperforms
V4 and V4 Pro on performance and cost.

**Options considered:** DeepSeek V4 Pro (original) · DeepSeek V4.1 (early
comment) · DeepSeek V4.1 Flash via the OpenCode Go subscription (chosen).

**Decision:** `LangGraph + DeepSeek V4.1 Flash`, model slug
`deepseek-v4.1-flash`; API key provided by Airil from his OpenCode Go
subscription; the key lives in `backend/.env` only (never committed).
Gateway confirmed from the OpenCode Go docs on 2026-10-06:
`https://opencode.ai/zen/go/v1` (OpenAI-compatible `chat/completions`).
Config env vars follow the provider naming: `OPENCODE_GO_API_KEY`,
`OPENCODE_GO_MODEL`, `OPENCODE_GO_ENDPOINT`, plus optional request tuning
(`MAX_TOKENS`, `TEMPERATURE`, `TIMEOUT_SECONDS`).
Provider guidance: send a specific user agent and a stable
`x-opencode-session` header per conversation; traffic is monitored for
abuse (the service is documented for coding-agent-style clients).

**Tradeoff:** Subscription pricing is far cheaper than direct API (per the
proposal comment, ~10 USD ≈ 60 USD of direct API), but access depends on
the subscription's terms (the comment thread notes the key targets agent
coding; the team assessed it as usable for data processing/reasoning).

**Links:** updated proposal §9; `.kiro/steering/tech.md`;
`backend/.env.example`; `backend/app/config.py`;
`backend/app/ai/planner_adapter.py`.

## DEC-004: Python floor raised to 3.10+ (2026-10-06)

**Context:** The backend was documented and tested on Python 3.9. LangGraph
— the agreed agent-orchestration framework (DEC-003, `tech.md`) — requires
Python >=3.10 on current releases, and Python 3.9 is EOL.

**Options considered:** (1) keep 3.9 compatibility and pin an old LangGraph
release — outdated APIs, fragile; (2) split AI dependencies into an
optional requirements file — extra complexity for the team; (3) raise the
floor to 3.10+ and develop on 3.12 — chosen.

**Decision:** Python 3.10+; the development venv uses 3.12. The
`from __future__ import annotations` style stays; runtime `X | None` unions
are acceptable now, but existing models keep `typing.Optional`.

**Tradeoff:** Any environment still on 3.9 must upgrade (none known);
supersedes Raaj's original 3.9 constraint — accepted by Airil on
2026-10-06 without waiting for Raaj's explicit confirmation.

**Links:** `.kiro/steering/tech.md`, `backend/README.md`, DEC-003.

## DEC-005: Frontend stack — React + Vite + Tailwind (2026-10-07)

**Context:** The analyst dashboard needs a bespoke dark operational shell
(persistent top nav, compact sidebar, selected states, thin borders,
restrained lime accent). `.kiro/steering/structure.md` describes a
Streamlit -> FastAPI UI flow, which does not give clean control over that
layout and interaction detail.

**Options considered:** (1) keep Streamlit per the steering note — poor fit
for the custom shell and selected-state control; (2) plain static HTML/CSS
— lean but manual for interactive state; (3) React + Vite + Tailwind —
chosen for full shell/interaction control while the backend is unchanged.

**Decision:** Build the frontend as a `frontend/` React + Vite + Tailwind
app that talks to FastAPI over HTTP (dev proxy `/api` -> `:8000`); the UI
never touches Firestore directly. HTB-inspired dark-navy palette with lime
reserved for primary action / confirmed / selected, recorded as
authoritative tokens in `PRODUCT.md` and `frontend/src/index.css`.

**Tradeoff:** Diverges from the steering's Streamlit note (flagged for team
veto in PRODUCT.md `## Stack`); adds a Node/npm toolchain alongside the
Python backend. If vetoed, revisit before investing further in the shell.

**Links:** `PRODUCT.md`, `frontend/`, `.kiro/steering/structure.md`, BL-009.

## DEC-006: Simulator, scenarios and evaluation live in backend/, no new store (2026-10-11)

**Context:** Aidan's WBS deliverables (bounded simulator, synthetic
incidents, ground truth, evaluation) were first designed as a standalone
`security_eval/` folder with its own SQLite store, approval table and
guessed HTTP routes. That folder never reached the repo, `tech.md` forbids
SQLite, and the backend already owns approvals and action results.

**Options considered:** (1) standalone folder + SQLite (conflicts with
`tech.md`, duplicates approvals); (2) a Firestore collection for simulator
state (duplicates `action_results`); (3) a stateless simulator that reads
the case's stored evidence and action results, plus `backend/scenarios/` and
`backend/evaluation/` running against the real endpoints - chosen.

**Decision:** Option 3. The simulator catalogue adopts the planner's tool
names (resolves BL-008). Simulated time = latest evidence + 5 min per
executed action. A `demo` fault profile injects the CRM-maintenance failure.

**Tradeoff:** The simulator's behaviour depends on stored records (so it is
only as correct as they are); evaluation tooling imports the test fake
Firestore. Evaluator answer keys sit in the repo, guarded by a test that
`app/` never reads them.

**Links:** `backend/app/simulator/`, `backend/scenarios/README.md`,
`backend/evaluation/SCORING_SHEET.md`.

## DEC-007: Approvals stay bound to the original state version for now (2026-10-12)

**Context:** Executing an approved action rebuilds the incident state, so
every other approval in the same plan goes stale (execute answers 409
"re-approval required") and an approved action cannot be decided again:
only one action per plan can run. Aidan's branch first added re-approval of
stale approvals bound to the current state version.

**Options considered:** (1) re-approval bound to the current state
(prototyped in `abab1c4`); (2) only new evidence invalidates approvals;
(3) keep approvals bound to the action's `based_on_state_version` and
re-plan after each execution until GAS-lite records state lineage -
chosen.

**Decision:** Option 3 for PR #9 (Aidan's review, 2026-10-12): the
re-approval change was reverted; `approval_service.py` matches `main`.
GAS-lite will add `parent_version`, `change_reason` and `created_from`,
which are needed to decide which state changes should invalidate an
approval (BL-024). The evaluation harness re-plans before each further
approved action.

**Tradeoff:** One planner run per additional action (slower demo, more LLM
calls in the live evaluation); approved-but-stale actions stay visible as
`approved` in reports.

**Links:** `backend/app/services/approval_service.py`,
`backend/evaluation/harness.py`, BL-024.
## DEC-008: API-mode contract mismatches are reconciled in the frontend mapping layer (2026-10-12)

**Context:** The `link` API-mode run against the Firestore emulator showed
the merged backend and the frontend DTOs disagree in places. The backend
(BL-003) is merged and other branches are changing its services, and
submission is three days out.

**Options considered:** (1) change the backend to the shapes the frontend
assumed: churns merged, tested code and conflicts with the unmerged
branches; (2) accept both shapes in the frontend: hides the real contract;
(3) make `dto.ts` mirror exactly what the backend returns and translate in
`src/lib/mapping`. Option 3 was chosen.

**Decision:** `dto.ts` describes only what the backend actually returns, and
all vocabulary translation happens in `src/lib/mapping`, pinned by Vitest
tests built from the real bodies. Audit rows: `audit_id` → `eventId`,
`event_type` → `AuditKind` (the backend's `evidence_uploaded` is the view
model's `evidence_ingested`; unknown types → `other`), `timestamp` → `at`,
`details` → `payload`. Evidence titles come from the normalized
`event_type` field.

Report action rows carry the action lifecycle `status`, which is never
printed as a decision. `verified`/`failed` imply an approval, and `failed`
reads "approved, sent to simulator, not validated effective"; the row
can't tell an ineffective result from a failed execution.

Data a provider cannot load is marked as such, never returned as an empty
fact: `PlanVM.actionsUnavailable` carries the real action count when
`GET /plans` lists only action IDs. Narrative such as a re-plan
explanation is shown only when the provider supplies it, which today means
fixture mode; API mode never borrows fixture copy.

List order: real Firestore streams collections in document-ID order
(random hex), while the test fake keeps insertion order. The frontend
sorts `GET /plans` by `created_at` before deriving the latest plan or
1-based plan versions. It compares instants, not strings, because the
backend mixes `Z`, `+00:00` and local offsets. It also restores evidence
upload order (`ingestion_time`, then `row`/`line`), which is the order the
fake returns.

The backend is changed only where its own logic is wrong. The one such
case is `reporting._latest_plan`, which took `list_plans()[-1]`; it now
sorts by `created_at` in Python, so the test fake stays compatible.
`GET /plans` keeps its unordered response.
`execution_service`'s first-matching-approval lookup is unchanged: an
action can be decided only once (pinned by `test_decide_twice_conflicts`),
so at most one approval matches, and the unmerged security-lead branch
rewrites that lookup.

**Tradeoff:** The view-model names can differ from the backend's (for
example `evidence_ingested`), so the mapping tests are the only record of
the correspondence. Any backend rename needs a mapping change and a test.

**Links:** `frontend/src/lib/api/dto.ts`, `frontend/src/lib/mapping/`,
BL-013, `.agents/tasks/link-e2e-2026-10-09/s2-e2e-findings.md` (local).

## DEC-009: Reports are generated only on an explicit analyst action (2026-10-12)

**Context:** In API mode the Report tab called `POST /cases/{id}/reports`
on every load, and twice under React StrictMode in dev. Each call stores a
new report version, renders a PDF into `backend/reports/` and writes a
`report_generated` audit event, so one S2 case collected 9 reports from tab
visits alone. The backend has no endpoint to read back the latest report
without its id.

**Options considered:** (1) keep generate-on-load: floods the audit trail
and report store with versions nobody asked for; (2) add a list/latest
report read endpoint: a new backend endpoint, which the brief says must not
be added silently (logged as BL-025); (3) generate only when the analyst
clicks Generate / Regenerate, and keep the latest generated report in
memory for the page session. Option 3 was chosen.

**Decision:** `DataProvider.getReport` only reads and returns
`ReportVM | null`; `generateReport` is the only call that POSTs. The Report
tab shows a "No report generated yet" state with a Generate button, and
shows a report only after the backend confirms it. `RealProvider` keeps the
newest confirmed report per case in memory, never in `localStorage`.
Fixture mode is unchanged apart from the Regenerate button. PDF download
stays disabled.

**Tradeoff:** After a page reload the tab is empty again, and
regenerating stores another report version. BL-025 tracks a read endpoint
that would remove this.

**Links:** `frontend/src/features/caseWorkspace/tabs/ReportTab.tsx`,
`frontend/src/lib/api/realProvider.ts`, BL-025, DEC-008.

## DEC-011: Read-only action and result lists for the API-mode Approvals queue (2026-10-09)

**Context:** In API mode the Approvals tab was "unsupported": only
`POST /runs` returns full actions, and `GET /plans` lists action IDs. So
approve, reject and execute could not be reached from the UI, and the S2
run had to drive them through the proxy. This is after the 8/10 feature
freeze; submission is 15/10. (DEC-010 is claimed on
`feat/gas-lite-state-fieqah`, so this record is DEC-011.)

**Options considered:** (1) keep "unsupported" and demo decisions through
the API: honest, but the central human-in-the-loop step has no UI in API
mode; (2) have the frontend keep `POST /runs` actions in memory: lost on
reload, and statuses go stale after a decision; (3) add read-only
`GET /cases/{id}/actions` and `GET /cases/{id}/action-results` over the
existing `repositories.list_actions` / `list_action_results`. Option 3 was
chosen: two small GETs, with no change to the decision or execute paths or
their preconditions.

**Decision:** Both endpoints return the stored docs as persisted, sorted by
`created_at` in Python (real Firestore streams in document-ID order; the
test fake keeps insertion order). They return 404 for an unknown case and
write nothing, including no audit event. `RealProvider.getApprovals` reads
the case, `GET /actions` and `GET /plans`.

The queue lists `awaiting_approval`/`recommended` actions, plus `approved`
actions not yet simulated, so an approved action can still be run after a
reload or the workspace refresh. Rejected and executed actions are left
out. Each item takes its stage from its plan; if the plan is missing, the
read returns "unsupported" rather than guessing a stage.

Two fields are derived. `stalePrewarn` is set when the action's
`based_on_state_version` is older than the case's `current_state_version`,
which mirrors the backend execute check; the backend still decides. The
approver reads "Any analyst (no approver role in backend)".
`getExecutionResults` maps `GET /action-results`, with execution and
validation status kept separate.

**Tradeoff:** This adds two endpoints after the freeze, both read-only and
covered by 7 backend tests. Fixture mode still lists only `proposed`
actions, so the two modes now differ. Results are not yet shown by any
component, and Response Plan still shows an action count instead of
detail (BL-027 follow-ups).

**Links:** `backend/app/api/planning.py`, `backend/app/api/execution.py`,
`backend/tests/test_read_endpoints.py`,
`frontend/src/lib/api/realProvider.ts`, `frontend/src/lib/mapping/`,
BL-027, BL-013, DEC-008.

## DEC-012: Structured policy pack and asset list (2026-10-11)

**Context:** Policy rules were sentences only, so code couldn't check
approvers, notifications or conformance, and the incident state can't
tell a laptop from a server. (Originally recorded as DEC-006; renumbered
DEC-012 when `feat/policy-pack-v1` merged `main`, where PR #9's
DEC-006/DEC-007 already exist.)

**Options considered:** (1) keep sentences; (2) structured fields plus
an asset list in guidance.json — chosen.

**Decision:** 19 rules with ten fields and six types; asset_types on
rules plus an `assets` list; roles soc_analyst / it_manager / dpo; DPO
notified within 24 h (fictional internal policy, stricter than PDPA's
72 h to the Commissioner); IT manager within 4 h.

**Tradeoff:** guidance.json grows from ~1.8k to ~8.8k characters (about
2k more prompt tokens); the fields only take effect once BL-032–BL-034
are built.

**Links:** `backend/fixtures/guidance.json`; BL-032–BL-036.

## DEC-013: Stage-scoped guidance retrieval and policy-ref validation (2026-10-13)

**Context:** The planner received the complete guidance fixture (19 rules
since the v1.0 pack), although the proposal specifies a Retrieve stage that
selects organization-approved guidance relevant to the response focus and
current incident conditions (pp. 12/26/33/42). The response stage is produced
inside the adapter by the analyze step, so selection cannot happen in
`planning_service` before `generate_plan`.

**Options considered:** (1) pre-filter in `planning_service` on incident
signals without the stage; (2) a deterministic `retrieve` node between
`analyze` and `propose`; (3) an extra LLM call to rank rules. (2) chosen:
stage-aware, deterministic, no added model cost.

**Decision:** `select_guidance()` keeps rules whose `phase` matches the
selected stage plus empty-phase (always-on) rules, and narrows
`stage_guidance` to that stage; tools and assets stay complete. Returned
`policy_refs` are filtered to the selected rule ids in the adapter, and
`planning_service` drops any ref not present in the pack (covers any adapter;
the POL-99 case). Trigger-based condition matching is deferred: not
derivable from the current `IncidentState` schema.

**Tradeoff:** stage-pure filtering hides assessment-phase rules (e.g. POL-03
DPO notification) from containment-stage prompts; revisit if live runs show
missed notifications.

**Links:** `backend/app/ai/langgraph_planner.py`, `backend/app/services/planning_service.py`, BL-037, BL-034, BL-038.

## DEC-014: Verification-first grounding as a planner skill file (2026-10-13)

**Context:** The two false-alarm checkpoints failed `no_forbidden_actions`:
the planner isolated FS-01 and acted on `svc_backup` before verifying a
signed, scheduled backup (BL-031; BL-038 evidence). Acceptance was defined
by the scenario gates and intent (CP1: "ask for change verification
instead of disrupting").

**Options considered:** (1) a policy-pack rule; (2) inline prompt strings;
(3) a repo skill file loaded into both prompts — chosen. The pack is
versioned and owned (DEC-012) and a stage-phased rule can be filtered out
by the BL-037 retrieval; the skill file keeps the guidance in one
reviewable artifact the planner LLM consumes directly.

**Decision:** `backend/app/ai/skills/verification_first/SKILL.md` holds the
verification-first branch (observable predicates: signed binary,
administrator-created scheduled task, service or backup account,
organization-plausible destination) with its expected outputs (assessment
stage, change-verification questions, non-disruptive actions), scoped to
servers, data stores, network devices, service/administrator accounts and
approved providers; normal progression (eradication, recovery) and
containment of compromised user endpoints are explicitly preserved.
`langgraph_planner.py` embeds it in both system prompts; contract tests pin
the embedding.

**Evidence:** scoped false-alarm runs PASS (CP1s 85!→100); the first full
run exposed a sticky-containment wording bug (messy CP3 62.5) fixed in
`e6dcec6`; the final full run is 12/12 checkpoints, 5/5 scenarios, mean
92.4.

**Tradeoff:** prompt-level behavior is probabilistic — the acceptance
signal is the eval run, not a unit test; contract tests only pin the
embedding. Revisit with the policy pack if enforcement must be
deterministic.

**Links:** `backend/app/ai/skills/verification_first/SKILL.md`,
`backend/app/ai/langgraph_planner.py`,
`backend/tests/test_planner_adapter.py`, BL-031, DEC-013.
