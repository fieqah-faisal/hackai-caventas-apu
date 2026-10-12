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
  simulator wiring (default profile `clean`), naive-timestamp crash fix,
  `not_applicable` action status (frontend DTO mapping at integration). —
  open / Raaj + Syafieqah
- BL-001 — Reconcile proposal (SQLite + JSON) vs repo (Firestore); confirm
  and record the change. — open / team
- BL-003 — Approvals → bounded simulated execution → reporting implemented;
  PR open for review/merge. — in review / Airil
- BL-030 — GAS-lite incident-state slice: specification complete at
  `.kiro/specs/caventas-gas-lite/` (DEC-010); implementation in progress on
  branch `feat/gas-lite-state-fieqah`. Core = enriched Entity/Relationship
  schemas + pure `app/services/gas_lite.py` + three-case prior-state
  handling + additive `GET /cases/{id}/states[/{version}]`. Core Tasks 1-3
  (schema, pure graph service, repository read) proceed now; Tasks 4.x
  (state_manager integration) and 6.x (execution-flow integration) are
  GATED on PR #9 for the state-manager (4.x) and execution-flow (6.x)
  integration; PR #9 is now merged into this branch, so those tasks may
  proceed — preserve PR #9's timezone-aware timeline sorting and
  simulator-result behaviour. Renamed BL-020 -> BL-030 at the PR #9 merge
  to avoid colliding with PR #9's BL-014..BL-024. — impl in progress
  (Tasks 1-3 done; 4-8 next) / Syafieqah

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

### P3

- BL-021 — Align frontend fixtures with the scenario package
  (SALES-LT-07, `.example` domains, no T1566.002 for the infostealer). —
  open / Syafieqah
- BL-022 — Re-check ATT&CK technique IDs on attack.mitre.org (blocked in
  the build environment), esp. T1213.004. — open / Aidan
- BL-023 — Decide whether POL-03 gets a record-only `notify_dpo` action
  (guidance + simulator catalogue together). — open / Aida + Aidan

- BL-031 — Repository line-ending portability: on Windows checkouts
  (`core.autocrlf=true`, no `.gitattributes`) scenario `.json`/`.md` files
  are checked out with CRLF, so
  `tests/test_scenarios.py::test_generated_files_are_up_to_date` fails on
  `\n` vs `\r\n` while content is identical (148 passed / 1 failed in the
  PR #9 merge baseline). Evaluate the smallest correct fix — a deterministic
  `.gitattributes` (e.g. `*.json text eol=lf` for `backend/scenarios/`)
  OR make the freshness comparison line-ending-independent while keeping
  content validation. Do not broad-renormalize or edit Aidan's scenario
  artifacts under this item without coordination. — open / Aidan + Syafieqah

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
