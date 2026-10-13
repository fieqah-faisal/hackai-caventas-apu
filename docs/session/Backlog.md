# Backlog

> BL-nnn items. Format: `BL-nnn (P1/P2/P3) — description — status/owner`.
> Completed items are removed (their history lives in `SessionLog.md`).
> Protocol: [README.md](README.md).
>
> **ID registry (2026-10-12):** PR #9 (security-lead) is merged: BL-014..024
> and DEC-006/DEC-007 are on `main`; PR #10 adds BL-032..BL-036 and DEC-012.
> `feat/gas-lite-state-fieqah` claims BL-020 (collides with merged BL-020)
> and DEC-010. `link` adds BL-025..BL-030 and DEC-008/009/011; its
> npm-audit item was renumbered BL-024 → BL-030 on that merge because
> main's BL-024 is the approval-invalidation item.
> `feat/bl-037-stage-retrieval` adds DEC-013 and registers BL-038/BL-039;
> `feat/bl-031-verify-before-contain` adds DEC-014.
> Next free IDs: **BL-040** and **DEC-015**.
> API-mode frontend↔backend gaps are tracked in BL-013.
>
> **Closed (removed):** BL-003 merged (PR #6 `b93fa6c`); BL-004 done
> (PR #7 `3cecd3e`, re-confirmed by `link`'s emulator runs); BL-007 done
> (PR #5); BL-008 resolved by PR #9's simulator catalogue (tool names = the
> guidance allowlist, drift pinned by a test); BL-010 payload contract is
> consumed by the frontend; BL-011 superseded by merged PRs #8 and #11;
> BL-034 folded into BL-037; both done (retrieval branch). BL-031 done
> (verification-first skill, DEC-014; live 12/12 · 5/5 · 92.4).

## Open Items

### P1

- BL-015 — Review Aidan's branch changes to backend services (PR #9):
  simulator wiring (default profile `clean`), naive-timestamp crash fix,
  `not_applicable` action status (frontend DTO mapping at integration). —
  open / Raaj + Syafieqah
- BL-001 — Reconcile proposal (SQLite + JSON) vs repo (Firestore); confirm
  and record the change. — open / team

### P2

- BL-009 — Confirm with Syafieqah whether the cloud Firebase project was
  created; if so, obtain the project ID and have the service-account key
  placed at `backend/secrets/serviceAccount.json` (gitignored) to enable an
  optional cloud-Firestore run path; ask her to preserve the emulator
  config in `firebase.json` when initializing. — open / team
- BL-012 — Ratify or veto DEC-005 (React + Vite + Tailwind vs the
  steering's Streamlit note); if ratified, update `.kiro/steering/tech.md`
  + `structure.md` and the proposal §9 row. — open / team
- BL-013 — API-mode read endpoints the frontend needs: global `GET /cases`
  (dashboard) and plan-detail. Stored actions and execution results are
  split out to BL-027 (on `link`); the audit DTO is aligned on `link`
  (DEC-008). — open / Airil + Syafieqah

- BL-024 — Decide which state changes invalidate an approval once
  GAS-lite adds `parent_version`, `change_reason` and `created_from`.
  Today one execution strands the plan's other approvals (only one action
  per plan runs; the next needs a fresh plan). Re-approval prototype kept
  out of PR #9 (commit `abab1c4`, reverted). See DEC-007. — deferred /
  Raaj + Syafieqah + Aidan
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
- BL-032 — Policy check: enforce required_approver in approval_service
  and order rules (POL-01) in execution_service; add approver_role to
  the decision payload. — open / Raaj
- BL-033 — Fill report notifications, policy_conformance and asset
  criticality from guidance.json. — open / Raaj
- BL-035 — Confirm asset host names match the synthetic logs
  (SALES-LT-07, FS-01, …). — open / Aida + Aidan
- BL-036 — Align frontend demo fixture (infostealer.ts) with policy pack
  v1.0: rule IDs, roles, tool names, asset IDs. — open / Syafieqah
- BL-039 — Align the simulator catalogue with policy pack v1.0: trigger
  event types and tool gaps (`purge_email`, `restore_host`). — open / Aidan

### P3

- BL-021 — Align frontend fixtures with the scenario package
  (SALES-LT-07, `.example` domains, no T1566.002 for the infostealer). —
  open / Syafieqah
- BL-022 — Re-check ATT&CK technique IDs on attack.mitre.org (blocked in
  the build environment), esp. T1213.004. — open / Aidan
- BL-023 — Decide whether POL-03 gets a record-only `notify_dpo` action
  (guidance + simulator catalogue together). — open / Aida + Aidan

- BL-030 — `npm audit --omit=dev` (2026-10-12): 2 moderate runtime
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
- BL-027 — Read-only `GET /cases/{id}/actions` and
  `GET /cases/{id}/action-results` (DEC-011) for the API-mode Approvals
  queue. Implemented on `link`, closes on merge to `main`. Follow-ups left
  open, all UI changes:
  - (a) after "Run bounded simulation" the workspace refresh remounts the
    tab and the executed action leaves the queue, so the result card is
    replaced at once; only the toast shows execution / validation. No
    component calls `getExecutionResults` yet.
  - (b) Response Plan still shows "N actions unavailable"; `getPlans` could
    join `GET /actions`.
  - (c) by code reading only, not run: fixture mode lists only `proposed`
    actions, so the same refresh may hide an approved card before it is
    simulated.

  (a) and (b) were seen again in the S6 live re-walk.
  — implemented on `link` / Raaj; (a)–(c) open / frontend
- BL-028 — The Approvals card shows a "Senior approval" badge next to
  "Approver: Any analyst (no approver role in backend)". The badge comes
  from a frontend tool-name regex in `toApprovalItemVM`
  (`isolate|disable|block|revoke|reset`), not from the backend, which
  enforces no approver role. Make it a hint or drop it in API mode. This
  changes what the analyst sees. Seen in S6 on `isolate_host`. — open /
  frontend
- BL-029 — `pytest` writes uploaded copies into the gitignored
  `backend/uploads/` (24 files per run, measured in S6), because the
  evidence tests don't redirect `upload_dir` to `tmp_path` the way the
  report tests redirect `report_path`. — open / Raaj

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
