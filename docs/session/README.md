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
