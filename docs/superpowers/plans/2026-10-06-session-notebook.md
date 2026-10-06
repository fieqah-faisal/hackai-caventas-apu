# Shared Session Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a committed, tool-neutral session notebook (`docs/session/`) plus thin agent triggers (`.kiro/steering/session-notebook.md`, `AGENTS.md`) so any teammate or agent can resume work from the repo alone.

**Architecture:** Markdown-only change set. Five notebook files under `docs/session/`; the protocol (rules, templates, prompt) lives only in `docs/session/README.md`; Kiro steering and root `AGENTS.md` are thin triggers that point to it. No backend code changes.

**Tech Stack:** Markdown, git, shell checks. Documentation-only plan (no unit tests); verification = file/section/link/line-count checks and commit hygiene.

## Global Constraints

- Work only on branch `docs/session-notebook`. Never commit to `main`.
- Rules live only in `docs/session/README.md`; triggers must not duplicate rules.
- `SessionContext.md` ≤ ~150 lines; `SessionLog.md` newest-first; `Decisions.md`/`Backlog.md` append-only.
- Relative markdown links only inside `docs/session/`.
- No secrets, credentials, PII, or real incident data anywhere.
- Do not modify existing `.kiro/steering/*.md` files; only add `session-notebook.md`.
- No backend code changes.

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `docs/session/README.md` | Canonical protocol + templates + agent prompt |
| Create | `docs/session/SessionContext.md` | Current state snapshot |
| Create | `docs/session/SessionLog.md` | Dated history |
| Create | `docs/session/Decisions.md` | DEC records (DEC-001, DEC-002) |
| Create | `docs/session/Backlog.md` | BL items |
| Create | `.kiro/steering/session-notebook.md` | Kiro trigger |
| Create | `AGENTS.md` | Tool-neutral trigger |
| Modify | `README.md` | Add "Project memory" link |
| Modify | `.gitignore` | Ignore `.code-review-graph/` |

---

### Task 1: Commit the design spec and this plan

**Files:**
- Add: `docs/superpowers/specs/2026-10-06-session-notebook-design.md` (already written)
- Add: `docs/superpowers/plans/2026-10-06-session-notebook.md` (this file)

**Interfaces:**
- Consumes: nothing.
- Produces: a clean branch history; later tasks build on it.

- [ ] **Step 1: Stage both documents**

Run:
```bash
git add docs/superpowers/specs/2026-10-06-session-notebook-design.md docs/superpowers/plans/2026-10-06-session-notebook.md
```

- [ ] **Step 2: Commit**

Run:
```bash
git commit -m "Add session notebook design spec and implementation plan"
```

- [ ] **Step 3: Verify**

Run:
```bash
git log --oneline -1 && git status --short
```
Expected: one new commit; working tree shows no staged leftovers.

---

### Task 2: Create the notebook files (`docs/session/`)

**Files:**
- Create: `docs/session/README.md`
- Create: `docs/session/SessionContext.md`
- Create: `docs/session/SessionLog.md`
- Create: `docs/session/Decisions.md`
- Create: `docs/session/Backlog.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical protocol (README §read-first, templates, prompt) and the four notebook files that every trigger and agent will reference.

- [ ] **Step 1: Create `docs/session/README.md` with exactly this content**

````markdown
# Session Notebook — Shared Team Protocol

This `docs/session/` folder is the team's canonical cross-session memory.
It exists because every agent session and every teammate starts with partial
context: chat history is not shared, and git records what changed but not
why, what is blocked, or what comes next.

**Rules live in this file only.** `.kiro/steering/session-notebook.md`,
`AGENTS.md`, and the copy-paste prompt at the bottom of this file are thin
triggers that point here.

## Read this first

At the start of every session:

1. `SessionContext.md` — current project state.
2. The 3 most recent entries in `SessionLog.md` — what just happened.
3. `Backlog.md` — open work, priorities, deferrals.
4. `Decisions.md` — only when your task touches architecture, data model,
   APIs, or AI behavior.

If the notebook contradicts the code or `.kiro/steering/*`, the code wins:
inspect it, fix the notebook, and note the fix in `SessionLog.md`.

## The four files

| File | Purpose | Belongs there | Does NOT belong there |
|------|---------|---------------|-----------------------|
| `SessionContext.md` | Living snapshot of current state | Project overview, run/test commands, current state, user rules | History, task logs, decisions |
| `SessionLog.md` | Dated history, newest first | What changed, branch/commits, files, test results, next steps | Long explanations, decisions, future plans |
| `Decisions.md` | Why the project is the way it is | Context, options, decision, tradeoff (DEC-nnn) | Task status, history |
| `Backlog.md` | Work not done yet | Issues, deferrals, follow-ups (BL-nnn, P1/P2/P3) | Completed work, history |

One topic per file. If you are unsure where something belongs, ask — never
leave the notebook stale.

## When to update

Update **immediately after each** completed task, decision, deferral,
test-result change, or merge/push. Never batch updates to the end of the
session.

- Completed task → `SessionLog.md` (+ `SessionContext.md` if state changed)
- Decision → `Decisions.md`
- Issue / deferral / follow-up → `Backlog.md`
- Test suite result change → `SessionLog.md`
- Project state changed → `SessionContext.md`

## Entry templates

**SessionLog entry** (add at the top):

```markdown
### YYYY-MM-DD Short title (STATUS)

- What changed
- Branch + commit SHAs
- Files touched
- Test command + result
- Next steps
```

STATUS is one of: DONE, IN PROGRESS, BLOCKED.

**Decision record** (append):

```markdown
## DEC-nnn: Title (YYYY-MM-DD)

**Context:** Why the decision was needed.
**Options considered:** ...
**Decision:** ...
**Tradeoff:** ...
**Links:** ...
```

**Backlog item:**

```markdown
- BL-nnn (P1/P2/P3) — description — status/owner
```

**Context update:** edit only the relevant bullet under "Current state".
Keep `SessionContext.md` under ~150 lines.

## Branch discipline

Never work on `main`. Create a feature branch first:

- `feat/<name>` — new features
- `fix/<name>` — bug fixes
- `refactor/<name>` — restructuring
- `docs/<name>` — documentation

Commit notebook changes together with the work that caused them, on the
same branch.

## Conflict rules

- `SessionLog.md` is append-only and newest-first. On a merge conflict,
  keep both entries and order them by date.
- `SessionContext.md` — edit only your own component bullet.
- `Decisions.md` / `Backlog.md` — append; never reuse or renumber IDs.
- Never force-push shared notebook files.

## Archiving

When `SessionLog.md` exceeds 500 lines, move entries older than 2 weeks to
`docs/session/archive/SessionLog-YYYY-MM.md` and keep a link at the top of
`SessionLog.md`. (Archive files are created only when needed.)

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Putting history in `SessionContext.md` | Move it to `SessionLog.md` |
| Batching updates at session end | Update after each task |
| Rewriting someone else's log entry | Append-only; add a correction entry |
| Committing straight to `main` | Feature branch first |
| Log entry without test results | Always include command + result |
| Copying content between files | Link to it instead |
| Secrets or real data in the notebook | Synthetic data only; no credentials or PII |

## Copy-paste agent prompt

Use this when your agent does not automatically read `AGENTS.md` or the Kiro
steering file:

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
   b. SessionContext.md — update "Current state" only if the project state
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
````

- [ ] **Step 2: Verify README**

Run:
```bash
grep -c '^## ' docs/session/README.md
grep -n 'MANDATORY SESSION NOTEBOOK PROTOCOL' docs/session/README.md
grep -n '## Copy-paste agent prompt' docs/session/README.md
```
Expected: 9 section headings; both greps match exactly once.

- [ ] **Step 3: Create `docs/session/SessionContext.md` with exactly this content**

````markdown
# Session Context

> Living snapshot. History goes in `SessionLog.md`. Decisions in
> `Decisions.md`. Open work in `Backlog.md`. Last reviewed: 2026-10-06.

## Project

Caventas Incident Response Planner — HackAI 2026, Track 1 (Agentic Cyber
Defense), Problem Statement 04. Five-person APU team. Human-in-the-loop:
the system recommends, analysts approve, and all execution is simulated.

## How to run

Backend (FastAPI + Firestore):

```bash
cd backend
python3 -m venv ../.venv
../.venv/bin/pip install -r requirements.txt
cp .env.example .env   # fill values; or use the Firestore emulator
# firebase emulators:start --only firestore
#   → set FIRESTORE_EMULATOR_HOST=localhost:8080 in .env
../.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000/docs
```

Tests: `cd backend && ../.venv/bin/python -m pytest -q` (in-memory fake
Firestore; no credentials needed).

## Current state

- Milestone 1 backend complete at `950873c`: cases, evidence ingestion,
  versioned incident state, audit trail.
- Planning / approvals / execution / reports are HTTP 501 stubs;
  `FakePlannerAdapter` and `FakeSimulatorAdapter` fix the integration
  contracts.
- Storage: Google Cloud Firestore via Firebase Admin SDK; uploaded
  originals on the local filesystem (`backend/uploads/`, gitignored) with
  SHA-256 recorded in Firestore.
- Code-review graph built (148 nodes / 658 edges); local data in
  `.code-review-graph/` (gitignored).
- Timeline: internal feature freeze 8/10; submission 15/10 (root README).

## Architecture

- `backend/app/api/` — FastAPI routers
- `backend/app/services/` — ingestion, state_manager, audit; approval /
  execution / reporting stubs
- `backend/app/database/` — Firestore client + repositories
- `backend/app/ai/planner_adapter.py` — AI boundary (LangGraph + DeepSeek)
- `backend/app/simulator/` — action simulator boundary
- Full tree and Firestore data model: `.kiro/steering/structure.md`
- Stack rules: `.kiro/steering/tech.md`; security: `.kiro/steering/security.md`;
  product: `.kiro/steering/product.md`

## User rules

1. Never work on `main` — always a feature branch.
2. Synthetic incident data only — never real systems, people, or data.
3. No secrets, credentials, or PII in any file.
4. Update the session notebook after every task; never batch.
5. `.kiro/steering/*.md` is the current implementation truth; known
   divergence from the original proposal is tracked in `Backlog.md` (BL-001).

## Links

- Open work: [Backlog.md](Backlog.md)
- History: [SessionLog.md](SessionLog.md)
- Decisions: [Decisions.md](Decisions.md)
- Protocol: [README.md](README.md)
````

- [ ] **Step 4: Verify SessionContext**

Run:
```bash
wc -l docs/session/SessionContext.md
grep -n 'Never work on' docs/session/SessionContext.md
```
Expected: ≤ 150 lines; branch rule present.

- [ ] **Step 5: Create `docs/session/SessionLog.md` with exactly this content**

````markdown
# Session Log

> Newest first. Append-only. Protocol: [README.md](README.md).
> Archived entries: none yet.

### 2026-10-06 Backend base layer + session notebook adoption (DONE)

- Backend Milestone 1 committed: cases, evidence ingestion, versioned
  incident state, audit trail (`950873c`).
- Planning / approvals / execution / reports remain HTTP 501 stubs with
  fake adapters (contracts fixed).
- Code-review graph built (148 nodes / 658 edges); `.code-review-graph/`
  now gitignored.
- Session notebook adopted under `docs/session/` (see DEC-001, DEC-002);
  agent triggers added (`.kiro/steering/session-notebook.md`, `AGENTS.md`).
- Next: BL-002 (real PlannerAdapter), BL-003 (approval → execution →
  reporting), BL-001 (proposal vs repo stack reconciliation).
````

- [ ] **Step 6: Create `docs/session/Decisions.md` with exactly this content**

````markdown
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
````

- [ ] **Step 7: Create `docs/session/Backlog.md` with exactly this content**

````markdown
# Backlog

> BL-nnn items. Format: `BL-nnn (P1/P2/P3) — description — status/owner`.
> Completed items are removed (their history lives in `SessionLog.md`).
> Protocol: [README.md](README.md).

## Open Items

### P1

- BL-001 — Reconcile proposal (SQLite + JSON) vs repo (Firestore); confirm
  and record the change. — open / team
- BL-002 — Wire the real `PlannerAdapter` (LangGraph + DeepSeek V4.1 Flash)
  behind the existing interface. — open / Airil
- BL-003 — Implement approvals → bounded simulated execution → reporting
  (currently HTTP 501). — open / Raaj + Aidan

### P2

- BL-004 — Smoke-test the backend against the Firestore emulator (tests use
  an in-memory fake only). — open / Raaj
- BL-005 — DeepSeek model version — resolved: V4.1 Flash (DEC-003).

### P3

- (none open)

## Deferred

- BL-006 (P3) — Add a thin `SKILL.md` wrapper pointing to
  `docs/session/README.md` only if a teammate's agent supports project
  skills and is not covered by `AGENTS.md` / steering. — deferred until a
  concrete tool need appears / Airil.

## Follow-ups

| Task | Owner | Ref |
|------|-------|-----|
| Feature-freeze checklist | team | root `README.md` timeline |
| Submission packaging | team | root `README.md` timeline |
````

- [ ] **Step 8: Verify the four seed files**

Run:
```bash
ls docs/session/
grep -o 'BL-[0-9]*' docs/session/Backlog.md | sort -u | wc -l
grep -c '^## DEC-' docs/session/Decisions.md
```
Expected: 5 files listed (README + 4); 6 unique BL IDs; 2 DEC records.

- [ ] **Step 9: Commit the notebook**

Run:
```bash
git add docs/session/
git commit -m "Add shared session notebook (docs/session)"
```

---

### Task 3: Triggers and repo integration

**Files:**
- Create: `.kiro/steering/session-notebook.md`
- Create: `AGENTS.md`
- Modify: `README.md` (insert a "Project memory" section)
- Modify: `.gitignore` (append `.code-review-graph/`)

**Interfaces:**
- Consumes: `docs/session/README.md` path (Task 2).
- Produces: automatic discovery for Kiro (steering), AGENTS.md-aware tools, and humans (root README link).

- [ ] **Step 1: Create `.kiro/steering/session-notebook.md` with exactly this content**

```markdown
# Session Notebook

The team keeps a shared, committed session notebook at `docs/session/`.
It is the canonical cross-session memory for all teammates and agents.

## Mandatory

1. At the start of every session, read:
   - `docs/session/SessionContext.md`
   - the 3 most recent entries in `docs/session/SessionLog.md`
   - `docs/session/Backlog.md`
   - `docs/session/Decisions.md` when touching architecture, data model,
     APIs, or AI behavior.
2. Follow the full protocol in `docs/session/README.md`.
3. Update the notebook immediately after each completed task or decision —
   never batch updates to the end of the session.
4. Never commit to `main`; always work on a feature branch.

Kiro's built-in memory is per-user and is not visible to teammates. The
notebook is the shared source of truth; if it conflicts with the code, the
code wins — fix the notebook and log the fix.
```

- [ ] **Step 2: Create `AGENTS.md` with exactly this content**

```markdown
# Agent Instructions — Caventas IR Planner

## Session notebook (mandatory)

This repo keeps a shared session notebook at `docs/session/`. Before any
work: read `docs/session/SessionContext.md`, the 3 most recent entries in
`docs/session/SessionLog.md`, and `docs/session/Backlog.md`. Follow the full
protocol in `docs/session/README.md`. Update the notebook immediately after
each completed task — never batch.

## Repo rules

- Never commit to `main`; always work on a feature branch.
- `.kiro/steering/*.md` are the current architecture, stack and security
  rules (`tech.md`, `structure.md`, `security.md`, `product.md`).
- Synthetic incident data only; no secrets or personal data anywhere.
- The product is human-in-the-loop: the AI recommends, analysts approve,
  and all execution is simulated.
```

- [ ] **Step 3: Add the "Project memory" section to root `README.md`**

Insert this section at the very top of the file (before `## Project Timeline`):

```markdown
## Project memory

Team state, session history, decisions and backlog live in
[`docs/session/`](docs/session/README.md). Read it before starting work.
```

- [ ] **Step 4: Append the local tool data entry to `.gitignore`**

Append at the end of the file:

```text

# --- Local code review graph ---
.code-review-graph/
```

- [ ] **Step 5: Verify triggers and integration**

Run:
```bash
head -8 README.md
grep -n 'code-review-graph' .gitignore
grep -n 'docs/session/README.md' .kiro/steering/session-notebook.md AGENTS.md
```
Expected: "Project memory" is at the top of README; `.gitignore` contains
`.code-review-graph/`; both triggers reference `docs/session/README.md`.

- [ ] **Step 6: Commit**

Run:
```bash
git add .kiro/steering/session-notebook.md AGENTS.md README.md .gitignore
git commit -m "Add session notebook agent triggers and repo integration"
```

---

### Task 4: Final verification

**Files:** none (checks only).

**Interfaces:**
- Consumes: everything above.
- Produces: evidence that the work package is complete and consistent.

- [ ] **Step 1: Structure check**

Run:
```bash
find docs/session -type f | sort
wc -l docs/session/SessionContext.md
```
Expected: exactly the 5 notebook files; SessionContext ≤ 150 lines.

- [ ] **Step 2: Relative link check**

Run:
```bash
for f in docs/session/README.md docs/session/SessionContext.md docs/session/SessionLog.md docs/session/Decisions.md docs/session/Backlog.md; do
  grep -o '](\([^)]*\))' "$f" | sed 's/](//;s/)//' | while read -r link; do
    case "$link" in http*|'') continue;; esac
    [ -e "docs/session/$link" ] || echo "BROKEN: $f -> $link"
  done
done
echo "link check done"
```
Expected: prints only `link check done` (no `BROKEN:` lines).

- [ ] **Step 3: ID uniqueness check**

Run:
```bash
grep -o 'BL-[0-9]*' docs/session/Backlog.md | sort | uniq -d
grep -o 'DEC-[0-9]*' docs/session/Decisions.md | sort | uniq -d
```
Expected: no duplicate IDs printed.

- [ ] **Step 4: Secret/PII scan**

Run:
```bash
grep -rniE '(password|secret|api[_-]?key|token)[[:space:]]*[:=]' docs/session/ AGENTS.md .kiro/steering/session-notebook.md || echo "clean"
```
Expected: `clean`.

- [ ] **Step 5: Commit hygiene check**

Run:
```bash
git log --oneline main..HEAD
git status --short
```
Expected: three commits (spec+plan, notebook, triggers); clean tree.

- [ ] **Step 6: Post-merge dry run (manual, after merge)**

Maintainer opens the repo in Kiro and in an AGENTS.md-aware tool and
confirms each reads the notebook at session start and updates it after a
trivial task. This cannot be executed from the current session; it is the
manual acceptance test recorded here so it is not forgotten.
