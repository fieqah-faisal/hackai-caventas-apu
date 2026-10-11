# Backlog

> BL-nnn items. Format: `BL-nnn (P1/P2/P3) — description — status/owner`.
> Completed items are removed (their history lives in `SessionLog.md`).
> Protocol: [README.md](README.md).

## Open Items

### P1

- BL-010 — Run the live evaluation (`python -m evaluation.run_eval
  --planner live`, needs `OPENCODE_GO_API_KEY`) and commit results. — open
  / Airil + Aidan
- BL-011 — Review Aidan's branch changes to backend services: simulator
  wiring, naive-timestamp crash fix, re-approval of stale approvals
  (DEC-007); approval UI must offer "Re-approve" on 409. — open / Raaj +
  Syafieqah
- BL-001 — Reconcile proposal (SQLite + JSON) vs repo (Firestore); confirm
  and record the change. — open / team
- BL-003 — Approvals → bounded simulated execution → reporting implemented;
  PR open for review/merge. — in review / Airil

### P2

- BL-004 — Smoke-test the backend against the Firestore emulator (tests use
  an in-memory fake only). — open / Raaj
- BL-012 — Extract DOMAIN/IP entities into the incident state so
  `block_domain` can be proposed. — open / Raaj
- BL-013 — Persist planner analysis (type, severity, confidence) and fill
  report findings + ATT&CK (ground truth ready in `scenarios/`). — open /
  Airil + Raaj
- BL-014 — Approver roles so POL-02 (IT manager) is enforced. — open /
  Raaj + Syafieqah
- BL-015 — Refuse execution of actions that cite no evidence. — open / Raaj
- BL-016 — Mark evidence as untrusted data in planner prompts (sc02
  prompt-injection test). — open / Airil

### P3

- BL-017 — Align frontend fixtures with the scenario package
  (SALES-LT-07, `.example` domains, no T1566.002 for the infostealer). —
  open / Syafieqah
- BL-018 — Re-check ATT&CK technique IDs on attack.mitre.org (blocked in
  the build environment), esp. T1213.004. — open / Aidan
- BL-019 — Decide whether POL-03 gets a record-only `notify_dpo` action
  (guidance + simulator catalogue together). — open / Aida + Aidan

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
