# Design: Shared Session Notebook

- **Date:** 2026-10-06
- **Status:** Draft — awaiting user review
- **Owner of process:** Airil (AI). Protocol applies to all contributors.
- **Scope:** Add a tool-neutral, committed session notebook to the Caventas IR Planner repo.

## 1. Problem

Agents and teammates lose context between sessions:

- Every agent session starts from zero; chat history is not shared.
- Kiro's built-in memory is per-user and invisible to teammates.
- Git records *what changed in code*, but not *why*, what is blocked, what is next, or non-code events (mentor feedback, demo decisions, deadlines).
- Concrete existing risk: the submission proposal specifies SQLite, while the repo implements Firestore (`.kiro/steering/tech.md`). Without a decision record, future sessions will re-litigate or silently assume the wrong thing.

## 2. Goal

A committed, tool-neutral notebook under `docs/session/` that any teammate or agent can read and update. It is the canonical cross-session team memory. Success: a new agent (any tool) can resume work from the notebook alone, and every completed task leaves a traceable update.

## 3. Locked Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Notebook lives in `docs/session/` — not repo root, not `.kiro/` | Tool-neutral, human-navigable, separates Kiro config from team workflow, keeps root clean |
| D2 | `.kiro/` is not renamed or restructured | Kiro auto-loads `.kiro/steering/*.md`; renaming breaks discovery for zero benefit |
| D3 | Full 4-file notebook: `SessionContext.md`, `SessionLog.md`, `Decisions.md`, `Backlog.md` | Approved by team; each file has exactly one concern |
| D4 | Committed & shared in git | Team visibility; Kiro memory is per-user only |
| D5 | No role-specific duties in repo docs | Team role assignments live in the team's shared Word doc; the repo protocol is role-agnostic |
| D6 | Branch discipline: never commit to `main`; always use a feature branch | Team decision 2026-10-06; keeps main deployable and enables review |
| D7 | No vendored `SKILL.md`; `docs/session/README.md` is the single canonical protocol | Avoids protocol drift across multiple copies; a thin skill wrapper is deferred (BL-006) |
| D8 | Triggers: Kiro steering file, root `AGENTS.md`, copy-paste prompt | Covers all tool classes without duplicating protocol rules |

## 4. File Map (final)

```text
docs/session/
  README.md            ← canonical protocol: why / how / role-agnostic rules / templates / agent prompt
  SessionContext.md    ← living snapshot of current project state
  SessionLog.md        ← dated history, newest first
  Decisions.md         ← DEC-nnn decision records
  Backlog.md           ← BL-nnn issues, deferrals, follow-ups

.kiro/steering/session-notebook.md   ← thin Kiro trigger → docs/session/README.md
AGENTS.md (new, repo root)           ← thin tool-neutral trigger → docs/session/README.md
README.md (existing)                 ← add one "Project memory / session notebook" link
.gitignore                           ← add `.code-review-graph/`
```

Protocol rules exist in exactly one place (`docs/session/README.md`); every other file only points to it.

## 5. Deliverables Specification

### 5.1 `docs/session/README.md` (canonical protocol)

Sections, in order:

1. **Why this exists** — the problem in §1, brief.
2. **Read this first** — read order at session start: `SessionContext.md` → last 3 `SessionLog.md` entries → `Backlog.md` → `Decisions.md` (only when touching architecture, data model, APIs, or AI behavior).
3. **The four files** — table of file → purpose → what belongs there → what does NOT belong there (e.g., history never goes in Context).
4. **When to update** — after each completed task, decision, deferral, test-result change, merge/push. Never batched at session end.
5. **Entry templates** — inline templates for SessionLog entry, Decision record, Backlog item, and Context update (examples in §7).
6. **Branch discipline** — never work on `main`; branch naming `feat/`, `fix/`, `refactor/`, `docs/`; commit notebook changes together with the work.
7. **Conflict rules** — SessionLog append-only, newest first; on conflict keep both sides and order by date; Context edits scoped to your own bullet; shared files are never force-pushed.
8. **Archiving** — when `SessionLog.md` exceeds 500 lines, move entries older than 2 weeks to `docs/session/archive/SessionLog-YYYY-MM.md`; keep a link at the top.
9. **Common mistakes** — table adapted from the session-notebook skill (history in Context, batched updates, editing others' entries, stale notebook, committing to main, missing test results in log entries).
10. **Copy-paste agent prompt** — verbatim block from §6.

Constraint: README is the only place with full rules; Kiro steering and `AGENTS.md` stay thin.

### 5.2 `docs/session/SessionContext.md`

- Sections: Project overview (name, track, team); how to run (backend venv/uvicorn, Firestore emulator, pytest); current state; architecture summary (short, links to `.kiro/steering/structure.md`); config defaults; user rules; links (Backlog, steering docs).
- **User rules must include:** 1) never work on `main` — always a feature branch; 2) synthetic evidence only; 3) no secrets/PII in any file; 4) update the notebook after every task.
- Kept under ~150 lines. No history.

### 5.3 `docs/session/SessionLog.md`

- Newest entries first. Entry template:

```markdown
### YYYY-MM-DD Short title (STATUS)

- What changed
- Branch + commit SHAs
- Files touched
- Test command + result
- Next steps
```

- STATUS ∈ {DONE, IN PROGRESS, BLOCKED}.

### 5.4 `docs/session/Decisions.md`

- Decision template:

```markdown
## DEC-nnn: Title (YYYY-MM-DD)

**Context:** Why the decision was needed.
**Options considered:** ...
**Decision:** ...
**Tradeoff:** ...
**Links:** ...
```

- Appended only; IDs sequential.

### 5.5 `docs/session/Backlog.md`

- Sections: **Open Items** grouped P1/P2/P3; **Deferred** (with reason); **Follow-ups** table (task → owner → issue/ref).
- Item format: `BL-nnn (P1/P2/P3) — description — status/owner`.

### 5.6 `.kiro/steering/session-notebook.md` (thin trigger)

Content outline (~15 lines): notebook location; mandatory read at session start; follow `docs/session/README.md`; update immediately after each task; Kiro's built-in memory is not visible to teammates — the notebook is the shared source of truth; never commit to `main`.

### 5.7 `AGENTS.md` (repo root, new)

Content outline: session notebook trigger (same as 5.6, tool-neutral wording); repo rules (feature branches only; synthetic data only; no secrets per `.kiro/steering/security.md`); pointer to `.kiro/steering/*.md` as current architecture/stack rules.

### 5.8 `README.md` (existing) — small addition

One short "Project memory" section linking to `docs/session/` (human discovery). No rule duplication.

### 5.9 `.gitignore` — addition

Add `.code-review-graph/` (local code-graph tool data created during review; not team content).

## 6. Agent Prompt (final, verbatim)

This exact block goes into `docs/session/README.md`. Kiro users normally don't need it (steering auto-loads); it is the guaranteed fallback for any tool.

```text
You are working in the Caventas Incident Response Planner repo (HackAI 2026, Track 1).

MANDATORY SESSION NOTEBOOK PROTOCOL:

1. BEFORE any other work, read:
   - docs/session/SessionContext.md
   - the 3 most recent entries in docs/session/SessionLog.md
   - docs/session/Backlog.md
   - docs/session/Decisions.md (only if your task touches architecture, data
     model, APIs or AI behavior)
   Then state the current project state back to me in 3 bullets.

2. Treat the notebook as the team's source of truth. If it contradicts the
   code or .kiro/steering/*, inspect the code, fix the notebook, and note the
   fix in SessionLog.md.

3. NEVER work on main. Create a feature branch first
   (feat/<name>, fix/<name>, refactor/<name>, docs/<name>).

4. AFTER EACH completed task or decision — before starting the next task,
   never batched at the end:
   a. SessionLog.md — add a dated entry at the top: title, status
      (DONE / IN PROGRESS / BLOCKED), what changed, branch + commit SHAs,
      files, test command + result, next steps.
   b. SessionContext.md — update "Current State" only if the project state
      changed. Never put history here; keep the file under ~150 lines.
   c. Decisions.md — append a DEC-nnn record: context, options considered,
      decision, tradeoff.
   d. Backlog.md — add/update a BL-nnn item for any issue, deferral or
      follow-up (priority P1/P2/P3 + status).

5. RULES: SessionLog is append-only (never rewrite someone else's entry);
   one topic per file; link files/commits instead of duplicating content;
   no secrets, credentials or personal data; max ~6 bullets per entry;
   commit notebook changes together with the work on your feature branch.

6. If unsure where something belongs, ask me — never leave the notebook stale.
```

## 7. Seed Content Plan (first population)

Project facts used below are the current verified repo state.

### SessionContext.md — seed facts

- Project: Caventas Incident Response Planner — HackAI 2026, Track 1, Problem Statement 04; 5-person APU team.
- Run: backend venv + `uvicorn app.main:app --reload`; Firestore emulator or `FIRESTORE_EMULATOR_HOST`; tests via `pytest`.
- Current state: Milestone 1 backend complete at `950873c` (cases, evidence ingestion, versioned incident state, audit); planning/approvals/execution/reports are HTTP 501 stubs; `FakePlannerAdapter` / `FakeSimulatorAdapter` fix integration contracts; code-review graph built (148 nodes / 658 edges).
- Timeline: feature freeze 8/10; submission 15/10 (root `README.md`).

### SessionLog.md — first entry

```markdown
### 2026-10-06 Backend base layer + session notebook adoption (DONE)

- Backend Milestone 1 committed: cases, evidence ingestion, versioned incident state (`950873c`).
- Planning / approvals / execution / reports remain HTTP 501 stubs with fake adapters.
- Code-review graph built (148 nodes / 658 edges); `.code-review-graph/` now gitignored.
- Session notebook adopted under `docs/session/` (see DEC-001).
- Next: BL-002 (real PlannerAdapter), BL-003 (approval → execution → reporting), BL-001 (proposal vs repo stack reconciliation).
```

### Decisions.md — first entry

```markdown
## DEC-001: Firestore as the incident-state store (2026-10-06)

**Context:** The proposal (§9) specified SQLite + JSON; the repo implements Firestore and `.kiro/steering/tech.md` explicitly prohibits SQLite. Recorded so future sessions do not re-litigate it.
**Options considered:** Not captured in steering docs (proposal: SQLite + JSON; implemented: Firestore).
**Decision:** Google Cloud Firestore via Firebase Admin SDK; versioned JSON state documents; originals on local filesystem with path + SHA-256 in Firestore.
**Tradeoff:** Cloud dependency + emulator needed for local dev; Admin SDK bypasses client security rules, so backend validation is the security boundary (see `.kiro/steering/security.md`).
**Links:** `.kiro/steering/tech.md`, `backend/README.md`. Owner may enrich options.
```

### Backlog.md — seed items

- BL-001 (P1) Reconcile proposal (SQLite+JSON) vs repo (Firestore); confirm and record change — team.
- BL-002 (P1) Wire real `PlannerAdapter` (LangGraph + DeepSeek V4 Pro) behind existing interface — Airil.
- BL-003 (P1) Implement approvals → bounded simulated execution → reporting (currently 501) — Raaj + Aidan.
- BL-004 (P2) Smoke-test backend against Firestore emulator (tests use in-memory fake) — Raaj.
- BL-005 (P2) Decide DeepSeek V4 Pro vs 4.1 (PDF comment p.35); record in Decisions.md — Airil/team.
- BL-006 (P3, deferred) Add a thin `SKILL.md` wrapper pointing to `docs/session/README.md` only if a teammate's agent supports project skills and is not covered by `AGENTS.md`/steering — Airil.

## 8. Conflict & Hygiene Rules

- SessionLog: append-only, newest first; conflicts → keep both, order by date.
- SessionContext: edit only your own component bullet; keep short.
- Decisions/Backlog: append; IDs never reused or renumbered.
- No secrets, credentials, personal data, or real incident data (synthetic only, per `.kiro/steering/security.md`).
- Notebook updates are committed together with the work on the feature branch.

## 9. Verification Plan

Dry run after implementation (15 min):

1. **Kiro path:** open the repo in Kiro, ask it to state the project state — confirm it reports from the notebook (steering trigger worked).
2. **Non-Kiro path:** open in an AGENTS.md-aware tool, perform a trivial docs task, confirm the agent adds a correct SessionLog entry and a Context update.
3. **Fallback path:** paste the §6 prompt into an agent — confirm it reads the notebook and reports state in 3 bullets.

Mechanical checks:

- All relative links in `docs/session/` resolve on disk.
- `SessionContext.md` stays under ~150 lines; `SessionLog.md` entries use the template.
- Backlog/DEC IDs unique and sequential.
- `git status` clean after the dry-run agents commit.

## 10. Out of Scope / Deferred

- Role-specific duties in repo docs (team Word doc owns these).
- Vendored skill copy (BL-006 covers the conditional thin wrapper).
- SessionLog archive files until the 500-line threshold is reached.
- Any change to `.kiro/` structure beyond adding one steering file.

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Agents ignore pointers and don't update | Three independent triggers + prompt fallback; verification dry run; human review at session end |
| Merge conflicts on shared files | Append-only rules; keep-both conflict policy; small, frequent commits |
| Protocol drift across files | README is canonical; triggers contain no rules, only pointers |
| Two members' agents write conflicting state | Context edits scoped per component; SessionLog entries attributed by date/title |
