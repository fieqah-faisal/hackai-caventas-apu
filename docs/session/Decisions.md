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
`details` → `payload`. Report action rows carry the action lifecycle
`status`, which is never printed as a decision. `verified`/`failed` imply
an approval, and `failed` reads "approved, simulated, not validated
effective"; the row can't tell an ineffective result from a failed
execution. Data a provider cannot load is marked as such, never returned
as an empty fact: `PlanVM.actionsUnavailable` carries the real action
count when `GET /plans` lists only action IDs. Narrative such as a re-plan
explanation is shown only when the provider supplies it, which today means
fixture mode; API mode never borrows fixture copy. List order: real
Firestore streams collections in
document-ID order (random hex) where the test fake keeps insertion order,
so the frontend sorts `GET /plans` by `created_at` (compared as instants,
because the backend mixes `Z`, `+00:00` and local offsets) before deriving
the latest plan or 1-based plan versions. The backend is changed only where
its own logic is wrong. The one such case is `reporting._latest_plan`,
which took `list_plans()[-1]`; it now sorts by `created_at` in Python, so
the test fake stays compatible. `GET /plans` keeps its unordered response.
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