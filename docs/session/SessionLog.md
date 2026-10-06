# Session Log

> Newest first. Append-only. Protocol: [README.md](README.md).
> Archived entries: none yet.

### 2026-10-06 Python floor raised to 3.10+; inputs unblocked (DONE)

- `tech.md` and `backend/README.md` updated: Python 3.10+ (development on
  3.12); 3.9 dropped — see DEC-004. `langgraph` added to
  `backend/requirements.txt`.
- OpenCode Go API structure verified against the official docs: endpoint
  `https://opencode.ai/zen/go/v1/chat/completions`, model
  `deepseek-v4.1-flash`, `Authorization: Bearer sk-...`, OpenAI-compatible
  request body; the adapter will add the recommended user-agent and
  `x-opencode-session` headers.
- Airil approved `IRP_Incident_Scenarios_draft.docx` as the source for the
  v1 guidance fixture and the provisional action vocabulary.
- Next: BL-002 implementation (adapter + LangGraph graph + planning
  endpoints).

### 2026-10-06 OpenCode Go gateway resolved from official docs (DONE)

- BL-007 confirmed via the OpenCode Go docs: base URL
  `https://opencode.ai/zen/go/v1`, OpenAI-compatible `/chat/completions`,
  model ID `deepseek-v4.1-flash` (matches DEC-003).
- Provider guidance noted for the adapter: specific user-agent +
  `x-opencode-session` header; the service is documented for
  coding-agent-style traffic (low-volume reasoning use; subscription is
  Airil's, flagged for awareness).
- Remaining input: the API key itself (Airil) before the live smoke test;
  mocked tests do not need it.
- Branch `feat/ai-planner-adapter`; next: BL-002 environment + adapter.

### 2026-10-06 Model references updated to DeepSeek V4.1 Flash (DONE)

- AI planner model aligned to the updated proposal §9: `LangGraph +
  DeepSeek V4.1 Flash` (`deepseek-v4.1-flash`) in `.kiro/steering/tech.md`,
  `backend/app/config.py`, `backend/.env.example`, `backend/README.md`, and
  the `planner_adapter.py` docstring.
- Resolved BL-005 via DEC-003 (V4.1 Flash via Airil's OpenCode Go
  subscription key; endpoint/model slug to confirm as BL-007). Added BL-008
  for the simulator action-catalogue sync (deferred to system integration).
- Historical spec/plan references updated for consistency.
- Branch `chore/deepseek-v4-1-flash`, commit `5cc12b2`.
- Next: BL-002 — implement the real planner adapter (LangGraph + V4.1
  Flash) on `feat/ai-planner-adapter`.

### 2026-10-06 Backend base layer + session notebook adoption (DONE)

- Backend Milestone 1 committed: cases, evidence ingestion, versioned
  incident state, audit trail (`950873c`).
- Planning / approvals / execution / reports remain HTTP 501 stubs with
  fake adapters (contracts fixed).
- Code-review graph built (148 nodes / 658 edges); `.code-review-graph/`
  now gitignored.
- Session notebook adopted under `docs/session/` (see DEC-001, DEC-002);
  agent triggers added (`.kiro/steering/session-notebook.md`, `AGENTS.md`).
- Next: BL-002 (real PlannerAdapter), BL-003 (approval → execution →
  reporting), BL-001 (proposal vs repo stack reconciliation).
