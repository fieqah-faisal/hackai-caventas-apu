# GAS-lite frontend integration tasks

Legend: `[x]` completed, `[~]` in progress, `[!]` blocked, `[ ]` pending; follow-on and out of scope are labeled separately.

## Core

- [x] Repair analysis-run ownership: add active-run discovery/duplicate recovery, move polling above routes, and provide a persistent minimisable robot dialog/indicator.
- [x] Repair graph presentation: deterministic left-to-right ranks, explicit handles/arrowheads, semantic styles, neighbourhood emphasis, legend and fit behaviour.
- [x] Add backend/frontend/browser regressions for navigation and refresh recovery, duplicate suppression, modal controls, and graph direction/highlighting; rerun all gates. Backend 223; frontend 95 in 17 files; typecheck/build/Compose/diff and isolated deterministic browser acceptance green.

- [x] Preflight: verify branch, worktree, instructions, ownership and existing contracts.
- [x] Create requirements/design/task specification; link GAS-lite Core follow-on.
- [x] Add typed state history/snapshot and analysis mapping to both providers, plus stable diff/layout and focused tests.
- [x] Implement read-only Incident Graph, version selector, provenance details and accessible fallback.
- [x] Repair case identity and authoritative Overview/Analysis summaries.
- [x] Add continuous evidence upload and stale-plan warning with explicit re-analysis.
- [x] Add persisted async run-status API, sanitized failure and deduplication; preserve synchronous endpoint.
- [x] Connect UI robot/status polling and refresh on confirmed plan completion.
- [x] Add synthetic two-version fixture history and response edge/condition example.
- [x] Complete component tests, targeted/full tests, deterministic API/browser acceptance, Compose and documentation. Backend 223; frontend 95 in 17 files; typecheck/build/Compose green. Browser workflow used only synthetic agent_inputs and an isolated deterministic backend; the live planner remains unverified (BL-043).

## Follow-on

- [ ] Cross-process crash recovery for in-flight FastAPI background tasks (requires a durable worker).
- [ ] Non-material state-version suppression and new GAS-lite relation extraction rules (separate contract).

## Out of scope

- [ ] Neo4j, graph-maker, second LLM, Graph RAG or arbitrary persistent edges.
- [ ] Real infrastructure actions, global search, settings, auth or graph editing.
