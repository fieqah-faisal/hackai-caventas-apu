# Investigation audit UI tasks

Legend: `[x]` completed, `[~]` in progress, `[!]` blocked, `[ ]` pending. Follow-on and out-of-scope work is separated below.

## Core

- [x] Preflight: verify clean committed base, create `feat/investigation-audit-ui-fieqah`, inspect instructions and map existing contracts.
- [x] Create focused requirements, design and task specification separate from GAS-lite.
- [x] Add typed timeline projection/API and reuse it in report snapshots.
- [x] Add responsive Timeline table/cards, filters, sorting, details and evidence references.
- [x] Convert Analyst Reviews to a collapsed accessible accordion and prevent stale-plan submissions.
- [x] Add append-only Agent Decision Trace schema/repository/instrumentation/read APIs.
- [x] Add unified read-only investigation activity projection/API.
- [x] Snapshot timeline, trace, activity and sign-off in web reports and PDFs.
- [x] Complete targeted tests, documentation, full gates and deterministic acceptance.

## Blocked

- [!] None currently. Live-provider connectivity will remain unverified because paid live calls are prohibited.

## Follow-on

- [ ] Durable worker/lease recovery for interrupted in-process analysis runs.
- [ ] Explicit analyst-established plan/action replacement relationships; do not infer them from rejection timing.
- [ ] Additional planner-node instrumentation changes, if requested by Airil after review.

## Out of scope

- [ ] Hidden reasoning, prompts/responses, provider payloads, new agents, Tree-of-Thought, Neo4j or another graph system.
- [ ] Real infrastructure actions, paid live-model acceptance, unsupported review targets, auth redesign or broad visual redesign.
