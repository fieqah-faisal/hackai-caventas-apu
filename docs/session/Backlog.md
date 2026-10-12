# Backlog

> BL-nnn items. Format: `BL-nnn (P1/P2/P3) — description — status/owner`.
> Completed items are removed (their history lives in `SessionLog.md`).
> Protocol: [README.md](README.md).
>
> **ID registry (2026-10-12):** BL-014..BL-024 and DEC-006/DEC-007 are
> claimed on unmerged branches `feat/policy-pack-v1` (BL-014..018, DEC-006)
> and `security-scenario-simulation-evaluation-lead` (BL-014..024, DEC-006,
> DEC-007); the two branches collide with each other.
> `feat/gas-lite-state-fieqah` claims BL-020 and DEC-010. `link` uses
> BL-024 (npm audit), BL-025, BL-026, DEC-008 and DEC-009. `link`'s BL-024
> also collides with security-lead's BL-024 (approval invalidation); it is
> not renumbered here and must be resolved when the branches merge. Next
> free IDs: **BL-027** and **DEC-011**.
> API-mode frontend↔backend gaps are tracked in BL-013.

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
- BL-025 — Report read endpoint: `GET /cases/{id}/reports` (list or
  latest). Without it, the Report tab shows only reports generated in the
  current page session, and after a reload the analyst must regenerate,
  which stores a new version (DEC-009). — open / Raaj
- BL-026 — API-mode UI follow-ups from the `link` emulator run, deferred
  because each changes what the analyst sees. Do (a) first, because its
  label is untrue:
  - (a) Create case: "Analyst note (captured as evidence)" is held in form
    state only and never sent. Send it as evidence, or change the label.
  - (b) The Start step shows the file count as "Accepted records".
  - (c) The dashboard summary cards show a generic "Could not load …"
    instead of the unsupported reason.
  - (d) Overview says "start a planning run" when a run exists but wrote
    no findings.
  - (e) Evidence categorisation puts nearly every row under Endpoint,
    because every row has a `host` field.
  - (f) API mode shows no synthetic flag (`RealProvider.synthetic = false`)
    although all data is synthetic by rule. This is a product call.
  - (g) `mapActionState` shows unknown statuses as "proposed"; the
    security-lead branch's `not_applicable` would be mislabelled after
    merge. Evidence detail shows a placeholder "State version v0".

  — open / frontend

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
