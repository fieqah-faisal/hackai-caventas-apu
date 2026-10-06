# Backlog

> BL-nnn items. Format: `BL-nnn (P1/P2/P3) — description — status/owner`.
> Completed items are removed (their history lives in `SessionLog.md`).
> Protocol: [README.md](README.md).

## Open Items

### P1

- BL-001 — Reconcile proposal (SQLite + JSON) vs repo (Firestore); confirm
  and record the change. — open / team
- BL-002 — Planner adapter (LangGraph + DeepSeek V4.1 Flash) and
  `/runs` + `/plans` endpoints implemented (23 tests pass); live smoke test
  pending the OpenCode Go key. — code complete / Airil
- BL-003 — Implement approvals → bounded simulated execution → reporting
  (currently HTTP 501). — open / Raaj + Aidan

### P2

- BL-004 — Smoke-test the backend against the Firestore emulator (tests use
  an in-memory fake only). — open / Raaj
- BL-007 — OpenCode Go API key for the live adapter smoke test; gateway and
  slug confirmed 2026-10-06 (`https://opencode.ai/zen/go/v1`,
  `deepseek-v4.1-flash`). — open / Airil
- BL-008 — Sync the planner's proposed action vocabulary with Aidan's
  approved simulator catalogue (defer to system integration, 6–8 Oct). —
  open / Airil + Aidan

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
