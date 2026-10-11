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
- BL-014 — Policy check: enforce required_approver in approval_service
  and order rules (POL-01) in execution_service; add approver_role to
  the BL-010 decision payload. — open / Raaj
- BL-015 — Fill report notifications, policy_conformance and asset
  criticality from guidance.json. — open / Raaj
- BL-016 — Drop planner policy_refs not in policy_rules (e.g.
  "POL-99"). — open / Airil
- BL-017 — Confirm asset host names match the synthetic logs
  (SALES-LT-07, FS-01, …). — open / Aida + Aidan
- BL-018 — Align frontend demo fixture (infostealer.ts) with policy pack
  v1.0: rule IDs, roles, tool names, asset IDs. — open / Syafieqah

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
