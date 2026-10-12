# Backlog

> BL-nnn items. Format: `BL-nnn (P1/P2/P3) — description — status/owner`.
> Completed items are removed (their history lives in `SessionLog.md`).
> Protocol: [README.md](README.md).

## Open Items

### P1

- BL-001 — Reconcile proposal (SQLite + JSON) vs repo (Firestore); confirm
  and record the change. — open / team
- BL-003 — Approvals → bounded simulated execution → reporting implemented;
  PR open for review/merge. — in review / Airil
- BL-024 — GAS-lite incident-state slice: specification complete at
  `.kiro/specs/caventas-gas-lite/` (DEC-010); implementation in progress on
  branch `feat/gas-lite-state-fieqah`. Core = enriched Entity/Relationship
  schemas + pure `app/services/gas_lite.py` + three-case prior-state
  handling + additive `GET /cases/{id}/states[/{version}]`. Core Tasks 1-3
  (schema, pure graph service, repository read) proceed now; Tasks 4.x
  (state_manager integration) and 6.x (execution-flow integration) are
  BLOCKED on PR #9 (modifies `state_manager.py`): merge PR #9 and rebase
  this branch onto the updated `main` first, preserving PR #9's
  timezone-aware timeline sorting and simulator-result behaviour. Numbering
  (DEC-010/BL-024) chosen to avoid collision with PR #9/#10; reconcile on
  next `main` sync. — impl in progress (Tasks 1-3) / Syafieqah

### P2
- BL-004 — Emulator smoke executed and passing (script + `firebase.py`
  anonymous-credential fix in PR #7). — in review / Airil
- BL-008 — Sync the planner's proposed action vocabulary with Aidan's
  approved simulator catalogue (defer to system integration, 6–8 Oct). —
  open / Airil + Aidan
- BL-009 — Confirm with Syafieqah whether the cloud Firebase project was
  created; if so, obtain the project ID and have the service-account key
  placed at `backend/secrets/serviceAccount.json` (gitignored) to enable an
  optional cloud-Firestore run path; ask her to preserve the emulator
  config in `firebase.json` when initializing. — open / team
- BL-010 — Share the BL-003 decision payload contract (`decision`,
  `analyst`, `reason`) with Syafieqah's approval UI work. — open / Airil
- BL-011 — Frontend branch (`feat/frontend-workspace-fieqah`): pull `main`
  and resolve conflicts before opening the PR, wire approvals/activity to
  the live BL-003 endpoints, align action-state/audit names, fix the BL-009
  numbering collision, update the stale "stubs" notes. Merge order agreed:
  frontend branch first; PR #7 rebased onto `main` afterwards (its only
  overlap with the frontend branch is `docs/session/`). — open /
  Syafieqah + Airil
- BL-012 — Ratify or veto DEC-005 (React + Vite + Tailwind vs the
  steering's Streamlit note); if ratified, update `.kiro/steering/tech.md`
  + `structure.md` and the proposal §9 row. — open / team
- BL-013 — API-mode read endpoints the frontend needs: global `GET /cases`
  (dashboard), `GET /cases/{id}/actions` (stored actions for the approvals
  queue), plan-detail, execution-results list; align the frontend audit DTO
  to the real fields (`event_type`/`timestamp`/`audit_id`). — open /
  Airil + Syafieqah

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
