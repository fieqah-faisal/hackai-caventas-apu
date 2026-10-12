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
