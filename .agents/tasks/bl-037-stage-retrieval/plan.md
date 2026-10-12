# BL-037 + BL-034 — Stage-Scoped Guidance Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The planner receives only the guidance relevant to the selected response stage, and returned `policy_refs` are validated — against the selected rules in the adapter (BL-037) and against the pack in the service (BL-034 fold-in).

**Architecture:** A deterministic `retrieve` node runs between `analyze` and `propose` inside `LangGraphPlannerAdapter`. `select_guidance()` keeps rules whose `phase` matches the analyzed stage plus empty-phase (always-on) rules, and narrows `stage_guidance` to that stage; `approved_tools` and `assets` stay complete. `policy_refs` are filtered to the selected rule ids in the adapter; `planning_service` additionally drops refs not present in the pack at all (covers any adapter, the POL-99 case). Trigger-based condition matching is deferred: `IncidentState` has no trigger fields, and deriving them from free text would be fabrication.

**Tech Stack:** Python, LangGraph, Pydantic v2, pytest (run via `../.venv/bin/python -m pytest` from `backend/`).

## Global Constraints

- Work only on branch `feat/bl-037-stage-retrieval`; never commit to `main`.
- Run tests from `backend/`: `cd backend && ../.venv/bin/python -m pytest -q`.
- Do not filter `approved_tools` or `assets` — the tool allowlist is a safety boundary.
- No new dependencies; standard library + existing code only.
- Synthetic data only; no secrets anywhere.
- Follow existing code style; comments only where the code cannot say it.

---

### Task 1: Adapter retrieval — `select_guidance` + `retrieve` node + refs filter

**Files:**
- Modify: `backend/app/ai/langgraph_planner.py`
- Test: `backend/tests/test_planner_adapter.py`

**Interfaces:**
- Consumes: `guidance` dict shape from `backend/fixtures/guidance.json` (`policy_rules[].phase`, `stage_guidance` keyed by stage, `approved_tools`, `assets`); stage string from the analyze step (`PlannerState["stage"]`).
- Produces:
  - `select_guidance(guidance: dict[str, Any], stage: str) -> dict[str, Any]`
  - `PlannerState["selected_rule_ids"]: list[str]`
  - `LangGraphPlannerAdapter._retrieve(state) -> PlannerState`
  - `_validated_action(raw, entity_ids, evidence_ids, allowlist, allowed_refs)` (new 5th parameter)

- [ ] **Step 1: Write the failing tests**

Add `select_guidance` to the import block at the top of `backend/tests/test_planner_adapter.py`:

```python
from app.ai.langgraph_planner import (
    LangGraphPlannerAdapter,
    PlannerError,
    load_guidance,
    select_guidance,
)
```

Append these two tests at the end of the file:

```python
def test_select_guidance_keeps_stage_rules_and_always_on_rules():
    guidance = {
        "policy_rules": [
            {"rule_id": "POL-01", "phase": ["preservation", "eradication"]},
            {"rule_id": "POL-02", "phase": ["containment"]},
            {"rule_id": "POL-15", "phase": []},
        ],
        "stage_guidance": {"assessment": ["assess"], "containment": ["contain"]},
        "approved_tools": ["isolate_host"],
        "assets": [{"asset_id": "CRM"}],
    }
    selected = select_guidance(guidance, "containment")

    assert [r["rule_id"] for r in selected["policy_rules"]] == ["POL-02", "POL-15"]
    assert selected["stage_guidance"] == {"containment": ["contain"]}
    assert selected["approved_tools"] == ["isolate_host"]
    assert selected["assets"] == [{"asset_id": "CRM"}]


def test_off_stage_policy_refs_are_dropped_and_not_shown():
    guidance = {
        "policy_pack_version": "test",
        "policy_rules": [
            {"rule_id": "POL-01", "phase": ["containment"]},
            {"rule_id": "POL-03", "phase": ["assessment"]},
        ],
        "approved_tools": ["isolate_host"],
    }
    llm = ScriptedLLM(
        [
            _analysis(),
            _proposal(actions=[_action(policy_refs=["POL-01", "POL-03", "POL-99"])]),
        ]
    )
    plan = LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), guidance)

    assert plan.actions[0].policy_refs == ["POL-01"]
    proposal_payload = json.dumps(llm.calls[1][0])
    assert "POL-03" not in proposal_payload
    assert "POL-99" not in proposal_payload
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planner_adapter.py -q`
Expected: collection error / ImportError — `select_guidance` does not exist yet.

- [ ] **Step 3: Implement `select_guidance`**

In `backend/app/ai/langgraph_planner.py`, add directly above `load_guidance`:

```python
def select_guidance(guidance: dict[str, Any], stage: str) -> dict[str, Any]:
    """Retrieve the guidance relevant to the selected response stage.

    Keeps policy rules whose ``phase`` matches the stage (an empty ``phase``
    applies to every stage) and narrows ``stage_guidance`` to that stage.
    ``approved_tools`` and ``assets`` stay complete: the tool allowlist is a
    safety boundary and the asset list is reference data.
    """
    rules = [
        rule
        for rule in guidance.get("policy_rules", [])
        if not rule.get("phase") or stage in rule["phase"]
    ]
    return {
        **guidance,
        "policy_rules": rules,
        "stage_guidance": {stage: guidance.get("stage_guidance", {}).get(stage, [])},
    }
```

- [ ] **Step 4: Wire the `retrieve` node**

In the same file:

1. Add `selected_rule_ids: list[str]` to `PlannerState` (after `guidance`).
2. Add this method to the adapter, after `_route_after_analyze`:

```python
    def _retrieve(self, state: PlannerState) -> PlannerState:
        guidance = select_guidance(state.get("guidance", {}), state.get("stage", ""))
        return {
            "guidance": guidance,
            "selected_rule_ids": sorted(
                str(rule.get("rule_id")) for rule in guidance.get("policy_rules", [])
            ),
        }
```

3. In `__init__`, wire `analyze -> retrieve -> propose`:

```python
        graph.add_node("analyze", self._analyze)
        graph.add_node("retrieve", self._retrieve)
        graph.add_node("propose", self._propose)
        graph.add_edge(START, "analyze")
        graph.add_conditional_edges(
            "analyze",
            self._route_after_analyze,
            {"retrieve": "retrieve", "end": END},
        )
        graph.add_edge("retrieve", "propose")
        graph.add_edge("propose", END)
```

4. Change `_route_after_analyze` to `return "retrieve" if state.get("sufficient") else "end"`.

- [ ] **Step 5: Filter refs in `_validated_action` and pass the selected set**

1. Change the signature to:

```python
def _validated_action(
    raw: dict[str, Any],
    entity_ids: set[str],
    evidence_ids: set[str],
    allowlist: set[str],
    allowed_refs: set[str],
) -> Optional[ProposedAction]:
```

2. Change the `policy_refs` line in the returned `ProposedAction` to:

```python
        policy_refs=[
            ref for ref in _str_list(raw.get("policy_refs")) if ref in allowed_refs
        ],
```

3. In `generate_plan`, read the set from the final graph state and pass it:

```python
        allowlist = _allowed_tools(guidance)
        allowed_refs = set(final.get("selected_rule_ids", []))
        actions: list[ProposedAction] = []
        for raw_action in final.get("actions", []):
            action = _validated_action(
                raw_action, entity_ids, evidence_ids, allowlist, allowed_refs
            )
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planner_adapter.py -q`
Expected: all pass, including the two new tests. The existing tests keep passing because their fixture rule `POL-01` has no `phase` (always-on) and the module fixture keeps `isolate_host` allowed.

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && ../.venv/bin/python -m pytest -q`
Expected: all pass (previous count + 2 new tests).

- [ ] **Step 8: Commit**

```bash
git add backend/app/ai/langgraph_planner.py backend/tests/test_planner_adapter.py
git commit -m "feat(planner): retrieve stage-relevant guidance and filter policy refs" \
  -m "Deterministic retrieve node between analyze and propose: rules filtered by
phase (empty phase = always on), stage_guidance narrowed to the stage; tools
and assets unchanged. Returned policy_refs are kept only when they cite a
selected rule. BL-037."
```

---

### Task 2: Service-level pack-refs net (BL-034)

**Files:**
- Modify: `backend/app/services/planning_service.py`
- Test: `backend/tests/test_planning_api.py`

**Interfaces:**
- Consumes: `select_guidance`/adapter from Task 1 (unchanged); `load_guidance()` returns the full pack.
- Produces: stored actions whose `proposal.policy_refs` are a subset of the pack's `rule_id`s, for any adapter (fake included).

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_planning_api.py`, add the import:

```python
from app.schemas.plan import PlanProposal, ProposedAction, Stage
```

and append:

```python
def test_policy_refs_outside_the_pack_are_dropped(client, monkeypatch):
    class RefAdapter:
        def generate_plan(self, incident_state, approved_guidance=None):
            return PlanProposal(
                based_on_state_version=incident_state.version,
                stage=Stage.CONTAINMENT,
                actions=[
                    ProposedAction(
                        tool_name="isolate_host",
                        target_id=incident_state.entities[0].id,
                        policy_refs=["POL-99", "POL-04"],
                    )
                ],
            )

    monkeypatch.setattr(ADAPTER_PATH, lambda: RefAdapter())
    case_id = _create_case_with_evidence(client)

    resp = client.post(f"/cases/{case_id}/runs")
    assert resp.status_code == 200, resp.text
    refs = resp.json()["actions"][0]["proposal"]["policy_refs"]
    assert refs == ["POL-04"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planning_api.py::test_policy_refs_outside_the_pack_are_dropped -q`
Expected: FAIL — `refs == ["POL-99", "POL-04"]` (the service stores the refs unfiltered today).

- [ ] **Step 3: Implement the net**

In `backend/app/services/planning_service.py`:

1. Hoist guidance into a local and pass it to the adapter:

```python
    adapter = get_planner_adapter()
    guidance = load_guidance()
    try:
        proposal = adapter.generate_plan(state, guidance)
    except PlannerError as exc:
        raise PlanningError(f"planner failed: {exc}", "planner") from exc
```

2. Extend the persistence loop:

```python
    plan_id = f"PLAN-{uuid.uuid4().hex[:12]}"
    entity_ids = {entity.id for entity in state.entities}
    pack_rule_ids = {
        str(rule.get("rule_id")) for rule in guidance.get("policy_rules", [])
    }
    actions: list[dict[str, Any]] = []
    for proposed in proposal.actions:
        if proposed.target_id not in entity_ids:
            continue
        proposed.policy_refs = [
            ref for ref in proposed.policy_refs if ref in pack_rule_ids
        ]
        action_id = f"ACT-{uuid.uuid4().hex[:12]}"
```

(The rest of the loop body is unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_planning_api.py::test_policy_refs_outside_the_pack_are_dropped -q`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && ../.venv/bin/python -m pytest -q`
Expected: all pass (previous count + 1 new test).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/planning_service.py backend/tests/test_planning_api.py
git commit -m "feat(planner): drop stored policy refs outside the guidance pack" \
  -m "Defense-in-depth for any adapter: refs not in the pack's policy_rules
never reach storage (the POL-99 case). Folds BL-034 into BL-037."
```

---

### Task 3: Notebook — BL-037 done, BL-034 folded, register BL-038/BL-039, DEC-013

**Files:**
- Modify: `docs/session/Backlog.md`
- Modify: `docs/session/Decisions.md`
- Modify: `docs/session/SessionLog.md`
- Modify: `docs/session/SessionContext.md`

**Interfaces:**
- Consumes: Tasks 1–2 landed; real test counts from Step 7/5 above.
- Produces: notebook state consistent with the branch; BL-038 and BL-039 registered; next free IDs BL-040 / DEC-014.

- [ ] **Step 1: Backlog.md — remove completed items, register new ones**

Remove the `BL-034` bullet and the `BL-037` bullet from the open items (protocol: completed items are removed; history lives in SessionLog).

Add to the P2 section (after BL-031):

```markdown
- BL-038 — Rerun `planner_smoke.py` (plus a scoped live eval if time) after
  the policy pack v1.0 merge: the live calibration numbers (8/12 checkpoints,
  2/5 scenarios, mean 86.4) predate the pack; the prompt grew ~2k tokens
  (DEC-012). Feeds BL-031. — open / Airil
```

Add to the P2 section (after BL-036):

```markdown
- BL-039 — Align the simulator catalogue with policy pack v1.0: trigger
  event types and tool gaps (`purge_email`, `restore_host`). — open / Aidan
```

In the registry note at the top, replace `Next free IDs: **BL-038** and **DEC-013**.` with:

```markdown
> `feat/bl-037-stage-retrieval` adds DEC-013 and registers BL-038/BL-039.
> Next free IDs: **BL-040** and **DEC-014**.
```

In the `**Closed (removed):**` block, append: `BL-034 folded into BL-037; both done (retrieval branch).`

- [ ] **Step 2: Decisions.md — append DEC-013**

Append at the end of `docs/session/Decisions.md`:

```markdown
## DEC-013: Stage-scoped guidance retrieval and policy-ref validation (2026-10-13)

**Context:** The planner received the complete guidance fixture (19 rules
since the v1.0 pack), although the proposal specifies a Retrieve stage that
selects organization-approved guidance relevant to the response focus and
current incident conditions (pp. 12/26/33/42). The response stage is produced
inside the adapter by the analyze step, so selection cannot happen in
`planning_service` before `generate_plan`.

**Options considered:** (1) pre-filter in `planning_service` on incident
signals without the stage; (2) a deterministic `retrieve` node between
`analyze` and `propose`; (3) an extra LLM call to rank rules. (2) chosen:
stage-aware, deterministic, no added model cost.

**Decision:** `select_guidance()` keeps rules whose `phase` matches the
selected stage plus empty-phase (always-on) rules, and narrows
`stage_guidance` to that stage; tools and assets stay complete. Returned
`policy_refs` are filtered to the selected rule ids in the adapter, and
`planning_service` drops any ref not present in the pack (covers any adapter;
the POL-99 case). Trigger-based condition matching is deferred: not
derivable from the current `IncidentState` schema.

**Tradeoff:** stage-pure filtering hides assessment-phase rules (e.g. POL-03
DPO notification) from containment-stage prompts; revisit if live runs show
missed notifications.

**Links:** `backend/app/ai/langgraph_planner.py`,
`backend/app/services/planning_service.py`, BL-037, BL-034, BL-038.
```

- [ ] **Step 3: SessionLog.md — prepend the entry**

Prepend (below the `> Archived entries` header line, before the current newest entry). The full suite starts at 137 tests and Tasks 1–2 add 3, so the expected count is 140 — record the exact number the run reports:

```markdown
### 2026-10-13 BL-037 + BL-034: stage-scoped guidance retrieval (DONE)

- Added `select_guidance()` and a deterministic `retrieve` node between
  `analyze` and `propose` in `langgraph_planner.py`: rules filtered by the
  analyzed stage (empty `phase` = always on), `stage_guidance` narrowed to
  the stage; tools and assets unchanged. The proposal prompt now carries only
  the selected passages — the post-pack prompt shrinks by roughly half.
- Returned `policy_refs` are filtered to the selected rule ids in the adapter;
  `planning_service` additionally drops refs not in the pack at all (BL-034's
  POL-99 case; covers any adapter). DEC-013. Trigger matching deferred (no
  trigger fields in `IncidentState`).
- Registered BL-038 (post-pack `planner_smoke` rerun — live numbers predate
  the pack) and BL-039 (Aidan: trigger event types + tool gaps). Registry
  next free: BL-040 / DEC-014.
- Checks: backend `../.venv/bin/python -m pytest -q` → **140 passed** (the
  exact number the post-Task-2 run reports; expected 137 + 3 new tests).
  Live rerun is BL-038. Next: merge this branch; then BL-038.
```

- [ ] **Step 4: SessionContext.md — refresh the policy-pack paragraph**

Replace the paragraph that ends `Enforcement follow-ups are BL-032..BL-034; asset/fixture alignment BL-035 and BL-036.` with:

```markdown
- Policy pack v1.0 (Aida, DEC-012) merged in PR #10 (`bae3f66`): 19
  structured rules (ten fields) + 8-asset list in
  `backend/fixtures/guidance.json` (`policy_pack_version` 1.0). The planner
  now retrieves stage-relevant rules and passages (deterministic retrieve
  node between analyze and propose, DEC-013); stored `policy_refs` are
  validated against the selected set, and refs outside the pack are dropped.
  Enforcement follow-ups are BL-032/BL-033; asset/fixture alignment BL-035
  and BL-036; the post-pack planner rerun is BL-038.
```

- [ ] **Step 5: Commit**

```bash
git add docs/session/Backlog.md docs/session/Decisions.md docs/session/SessionLog.md docs/session/SessionContext.md
git commit -m "docs(session): record BL-037 stage retrieval; register BL-038/BL-039" \
  -m "DEC-013 records the retrieval interface. BL-034 folded into BL-037.
Next free IDs: BL-040 / DEC-014."
```

---

### Task 4: Final verification and PR (coordinator only — not a subagent task)

- [ ] **Step 1:** `cd backend && ../.venv/bin/python -m pytest -q` — full suite green.
- [ ] **Step 2:** `git diff --check` — clean; `git status --short` — only intended files.
- [ ] **Step 3:** Push `feat/bl-037-stage-retrieval` and open a PR to `main` with the evidence (test counts, files, BL-037/BL-034 mapping).
- [ ] **Step 4:** Human merges; then BL-038 rerun.
