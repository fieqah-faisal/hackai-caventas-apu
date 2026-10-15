# Investigation audit UI: requirements

## Outcomes

1. A typed, deterministic timeline projection presents current-state incident chronology without parsing arbitrary strings in React. It preserves evidence references and bounded raw descriptions, uses only allowlisted fields, sorts exact stored timestamps honestly, and keeps old description-only states readable.
2. `GET /cases/{case_id}/timeline` returns the current state version and typed rows. The Timeline tab provides accessible desktop table/mobile cards, sorting, filtering, evidence links and expandable technical details. Reports and PDFs snapshot the same projection.
3. Analyst Reviews is collapsed by default, retains form data, exposes review status/count, and permits only case or current-plan targets. Stale plans remain visible but disabled; case-level requests for evidence remain available.
4. Each asynchronous analysis run has an append-only Agent Decision Trace bound to its run and state version. Closed step/status values record only executed operations, timings, bounded summaries, counts and references. Prompts, responses, hidden reasoning, provider bodies, headers, credentials and evidence dumps are forbidden.
5. Typed read APIs list persisted runs and ordered trace steps. Existing run progress remains the source for the global popup and is not conflated with trace steps or IR lifecycle stages.
6. A pure investigation-activity projection combines authoritative reviews, approvals/rejections, action results and relevant audits without replacing source records or inferring unsupported causation/replacement.
7. New reports immutably snapshot structured timeline, Agent Decision Trace, analyst activity and sign-off. Web and PDF render the same stored contract; old reports use honest empty defaults.

## Quality and safety

- Focused tests cover deterministic timeline extraction, trace ordering/sanitization, activity projection, stale-plan prevention, immutable report snapshots and frontend accessibility.
- Final gates use only fresh synthetic evidence, the deterministic planner and bounded simulator. No live paid-provider request is made.
- Airil-owned planner files receive instrumentation only; planner prompts, routing behavior and graph design are not redesigned.

## Exclusions

Hidden chain-of-thought, raw prompt/response storage, new agents, Tree-of-Thought, Neo4j, graph replacement, real actions, auth redesign, dependency upgrades, unsupported review targets and unrelated UI work.
