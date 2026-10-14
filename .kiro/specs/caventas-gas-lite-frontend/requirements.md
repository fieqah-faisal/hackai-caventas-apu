# GAS-lite analyst integration: requirements

## Core outcomes

1. A case header and overview display the stored case ID, latest incident-state version, plan version and its state binding, recovery/stage, persisted classification/severity/confidence (if present), graph/evidence/gap counts, ATT&CK mappings and last update. Copying the case ID has accessible feedback. An existing plan without analysis must never be described as a run that has not started.
2. An Incident Graph tab reads immutable `GET /states`, `GET /state`, and `GET /states/{version}` through the selected provider. It renders every stored entity and relationship with provenance, a version selector and a pure parent comparison; selecting cannot mutate Firestore. Stored source/target direction is shown in deterministic left-to-right ranks with explicit node handles, large closed arrowheads, semantic relationship styles, a legend, fit controls, and selected-neighbourhood emphasis. It remains accessible with a keyboard-operable textual list, mobile fallback, loading/empty/error/retry states.
3. Evidence may be added to an existing case via the existing endpoint. CSV/JSON/TXT, 10 MiB per file; accepted/rejected progress and errors must be explicit. On success refetch the case, evidence, graph and state; show the confirmed increased state version. A plan bound to an earlier state is visibly stale; re-analysis requires an explicit click.
4. A persisted asynchronous analysis run exposes only real backend stages: queued, loading_state, loading_guidance, running_planner, persisting_plan, completed, failed. An active-run endpoint is the recovery source of truth. Duplicate submissions return the existing active run identifier and never execute the planner twice. Application-level frontend state is keyed by case ID, owns one polling loop per active run, and survives route changes and refresh recovery. A persistent indicator opens a minimisable accessible robot dialog showing real case/run/stage identifiers and elapsed time; CSS/SVG motion is presentational and disabled for reduced motion. Completion requires a persisted plan ID, and failure contains no upstream body or credential.
5. The original synchronous `/runs` and all approval, simulation and report preconditions remain intact. Additional evidence during planning does not make the resulting state-bound plan current. API mode never borrows fixtures; fixture mode remains visibly synthetic and supports two versioned graph snapshots with provenance/diff.

## Acceptance and quality

- Backend fake-Firestore tests cover run creation, status transitions, failure, duplicate recovery with the existing run ID, active-run discovery, state binding, synchronous compatibility, graph deduplication and immutable history.
- Frontend tests cover typed snapshot/history mapping, plan analysis precedence/absence, stale detection, deterministic directed layout, provider endpoint calls, global run navigation/refresh recovery, modal minimisation, UI upload and progress, graph direction/highlighting/detail and responsive textual fallback.
- Run backend targeted/full pytest, frontend typecheck/Vitest/build, Compose config, deterministic API/browser walkthrough and diff/status checks. Never use evaluator-only scenario files or the live provider for deterministic verification.

## Explicit exclusions

Neo4j, graph-maker/knowledge-graph-maker, Graph RAG, arbitrary model-created graph edges, graph editing, real infrastructure execution, new auth, cloud deployment, live model retries, global search and settings.
