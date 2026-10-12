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

## DEC-010: GAS-lite incident-state model (STAIR-inspired) (2026-10-09)

**Context:** The incident state needed to become the complete, versioned
understanding of an incident (entities, relationships, timeline, response
situation, action outcomes, report status) rather than a thin snapshot, to
support the Caventas Observe->Reconstruct->Analyze->Route->Propose->Approve
->Validate->Re-plan->Report pipeline. STAIR (arXiv 2608.09524) is the
conceptual reference; we adopt its Graph-as-State, immutable evolving state,
and effect-validation ideas without copying its source or reproducing its
six-agent / experience-DB machinery.

**Options considered:** (1) a second/separate state system or a graph DB
(Neo4j) — rejected, violates the Firestore decision (DEC-001) and the
"extend, don't rebuild" constraint; (2) collapse observed status and
recommended focus into the existing single `stage`-like field — rejected,
conflates "what the org is doing" with "what we recommend"; (3) a
backward-compatible extension of the existing `IncidentState` +
`state_manager` + a new PURE `gas_lite.py` builder — chosen.

**Decision:** Extend `app/schemas/incident_state.py` with optional/defaulted
fields only: enriched `Entity` (evidence_ids, first/last_seen, condition)
and `Relationship` (deterministic id, `RelationshipType` closed-allowlist
enum, context/attack/response category, action/execution refs); provenance
(`parent_version`, `change_reason`, `created_from`); and response-situation
+ report-status blocks that Core CARRIES but does not COMPUTE. Build the
graph in a pure, deterministic, LLM-free `app/services/gas_lite.py`
(entity extraction, type-aware deterministic ids, dedupe/merge, response
edges, effect application, snapshot assembly). Rules: entity ids are
type-aware normalized (host UPPER, account/domain lower, ip canonical,
process/file path-normalized) with the readable value kept in `Entity.name`;
SESSION only from an explicit `session_id`/`session_cookie_id` (never
fabricated); a completed execution is never automatically effective —
only a validated-effective action-result mutates the target entity
`condition`; immutable append-only versions with three-case prior-state
handling (unknown case -> abort; `current_state_version==0` -> create v1
with `parent_version=None`; pointer>=1 with a missing prior snapshot ->
abort as a data-integrity error, pointer unchanged). `created_from` uses an
enum (Core: initial_reconstruction, evidence_upload, action_result);
`RoutingTransition` uses the value `re_enter`. Action lifecycle is
represented via separate decision/execution/validation fields that map to
the existing backend status model (`awaiting_approval -> approved|rejected
-> verified|failed`); the action-result record carries both
`execution_status` and `validation_status` (there is no separate
"validation record"), and the approval stays authoritative in the approvals
collection, traceable via `action_id`.

**Tradeoff:** Adds schema surface and a new service, and defers the
behaviour that populates assessment/routing, computes report-section
invalidation, projects the full action lifecycle, and suppresses
non-material versions to Follow-on — so some new fields exist before they
are populated. Accepted to keep Core small, backward-compatible and
test-provable. Integration depends on PR #9 (state_manager.py); its
timezone-aware timeline sorting and simulator-result behaviour must be
preserved on rebase.

**Numbering note:** DEC-010 (and BL-024) were chosen with a deliberate gap
to avoid colliding with DEC/BL numbers introduced by PR #9 / PR #10, which
are not yet in this local tree. Reconcile on next `main` sync.

**Links:** `.kiro/specs/caventas-gas-lite/` (requirements.md, design.md,
tasks.md); `.kiro/steering/structure.md`, `.kiro/steering/tech.md`;
DEC-001; BL-024; arXiv 2608.09524.
