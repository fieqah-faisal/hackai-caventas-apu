# Backlog

> BL-nnn items. Format: `BL-nnn (P1/P2/P3) — description — status/owner`.
> Completed items are removed (their history lives in `SessionLog.md`).
> Protocol: [README.md](README.md).
>
> **ID registry (2026-10-12):** BL-014..BL-023 and DEC-006/DEC-007 are
> claimed on unmerged branches `feat/policy-pack-v1` (BL-014..018, DEC-006)
> and `security-scenario-simulation-evaluation-lead` (BL-014..023, DEC-006,
> DEC-007); the two branches collide with each other. BL-024 is used on
> `link`; next free IDs: **BL-025** and **DEC-008**. API-mode
> frontend↔backend gaps are tracked in BL-013.

## Open Items

### P1

- BL-001 — Reconcile proposal (SQLite + JSON) vs repo (Firestore); confirm
  and record the change. — open / team

### P2

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

- BL-024 — `npm audit --omit=dev` (2026-10-12): 2 moderate runtime
  advisories in `react-router` / `react-router-dom` 6.x (GHSA-wrjc-x8rr-h8h6
  open redirect via backslash in `<Link>`/`useNavigate`; GHSA-337j-9hxr-rhxg
  SSR hydration, which should not apply to this client-rendered SPA). Fix
  needs react-router-dom 7.x (breaking); not fixed on `link`. The other 13
  `npm audit` findings are dev-only tooling. — open / frontend

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
