# Backlog

> BL-nnn items. Format: `BL-nnn (P1/P2/P3) — description — status/owner`.
> Completed items are removed (their history lives in `SessionLog.md`).
> Protocol: [README.md](README.md).

## Open Items

### P1

- BL-001 — Reconcile proposal (SQLite + JSON) vs repo (Firestore); confirm
  and record the change. — open / team
- BL-002 — Wire the real `PlannerAdapter` (LangGraph + DeepSeek V4 Pro)
  behind the existing interface. — open / Airil
- BL-003 — Implement approvals → bounded simulated execution → reporting
  (currently HTTP 501). — open / Raaj + Aidan

### P2

- BL-004 — Smoke-test the backend against the Firestore emulator (tests use
  an in-memory fake only). — open / Raaj
- BL-005 — Decide DeepSeek V4 Pro vs 4.1 (proposal comment, p.35); record
  in `Decisions.md`. — open / Airil + team

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
