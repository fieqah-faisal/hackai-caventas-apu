# Backlog

> BL-nnn items. Format: `BL-nnn (P1/P2/P3) — description — status/owner`.
> Completed items are removed (their history lives in `SessionLog.md`).
> Protocol: [README.md](README.md).

## Open Items

### P1

- BL-014 — Run the live evaluation (`python -m evaluation.run_eval
  --planner live`, needs `OPENCODE_GO_API_KEY`) and commit results. — open
  / Airil + Aidan
- BL-015 — Review Aidan's branch changes to backend services (PR #9):
  simulator wiring, naive-timestamp crash fix, re-approval of stale
  approvals (DEC-007); the approval UI must offer "Re-approve" on a 409
  (extends the BL-010 decision contract). — open / Raaj + Syafieqah
- BL-001 — Reconcile proposal (SQLite + JSON) vs repo (Firestore); confirm
  and record the change. — open / team
- BL-003 — Approvals → bounded simulated execution → reporting implemented;
  PR open for review/merge. — in review / Airil

### P2

- BL-004 — Emulator smoke executed and passing (script + `firebase.py`
  anonymous-credential fix in PR #7). — in review / Airil
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
- BL-016 — Extract DOMAIN/IP entities into the incident state so
  `block_domain` can be proposed. — open / Raaj
- BL-017 — Persist planner analysis (type, severity, confidence) and fill
  report findings + ATT&CK (ground truth ready in `scenarios/`). — open /
  Airil + Raaj
- BL-018 — Approver roles so POL-02 (IT manager) is enforced. — open /
  Raaj + Syafieqah
- BL-019 — Refuse execution of actions that cite no evidence. — open / Raaj
- BL-020 — Mark evidence as untrusted data in planner prompts (sc02
  prompt-injection test). — open / Airil

### P3

- BL-021 — Align frontend fixtures with the scenario package
  (SALES-LT-07, `.example` domains, no T1566.002 for the infostealer). —
  open / Syafieqah
- BL-022 — Re-check ATT&CK technique IDs on attack.mitre.org (blocked in
  the build environment), esp. T1213.004. — open / Aidan
- BL-023 — Decide whether POL-03 gets a record-only `notify_dpo` action
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
