"""Response/effect integration through the real execution flow (Task 6).

6.1: drive approve->execute (FakeSimulatorAdapter returns completed/ineffective)
     and assert the next state version carries an action_attempted_on response
     edge with action_id/execution_id, while NO target entity condition is
     improved; the proposal, approval and action-result records stay intact.
6.2: focused unit \u2014 a synthetic effective result mutates ONLY the target
     entity's condition and nothing else.
"""
from __future__ import annotations

from pathlib import Path

from app.ai.planner_adapter import FakePlannerAdapter
from app.schemas.incident_state import Entity, EntityType, RelationshipType
from app.services import gas_lite
from app.simulator.simulator_adapter import FakeSimulatorAdapter

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "planner_smoke_evidence.json"
PLANNER_PATH = "app.services.planning_service.get_planner_adapter"
SIMULATOR_PATH = "app.services.execution_service.get_simulator_adapter"


def _approved_action(client, monkeypatch):
    monkeypatch.setattr(PLANNER_PATH, lambda: FakePlannerAdapter())
    monkeypatch.setattr(SIMULATOR_PATH, lambda: FakeSimulatorAdapter())
    case_id = client.post("/cases", json={"title": "response edge"}).json()["case_id"]
    client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", FIXTURE.read_bytes(), "application/json")},
    )
    plan = client.post(f"/cases/{case_id}/runs").json()
    action_id = plan["actions"][0]["action_id"]
    client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "approve", "analyst": "aida"},
    )
    return case_id, action_id


def test_execute_adds_response_edge_without_improving_condition(client, monkeypatch):
    """6.1: completed+ineffective execution produces a response edge but no
    positive condition change, and the stored records remain intact."""
    case_id, action_id = _approved_action(client, monkeypatch)
    exec_resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert exec_resp.status_code == 200, exec_resp.text
    result = exec_resp.json()["result"]
    execution_id = result["execution_id"]
    assert result["execution_status"] == "completed"
    assert result["validation_status"] == "ineffective"

    state = client.get(f"/cases/{case_id}/state").json()

    # a response edge exists, carrying action_id + execution_id
    response_edges = [
        r for r in state["relationships"]
        if r["relation"] == RelationshipType.ACTION_ATTEMPTED_ON.value
    ]
    assert response_edges, "expected an action_attempted_on response edge"
    edge = response_edges[0]
    assert edge["category"] == "response"
    assert edge["action_id"] == action_id
    assert edge["execution_id"] == execution_id

    # ineffective: no target entity condition is improved (all remain unset)
    assert all(e.get("condition") in (None, "") for e in state["entities"]), \
        "ineffective execution must not improve any entity condition"

    # the stored proposal/approval/result records remain intact (read via the
    # repositories layer; there is no public single-action GET endpoint)
    from app.database import repositories
    stored_action = repositories.get_action(case_id, action_id)
    assert stored_action["proposal"]["target_id"]
    assert repositories.list_approvals(case_id), "approval record must persist"
    stored_results = repositories.list_action_results(case_id)
    assert any(r["execution_id"] == execution_id for r in stored_results)
    assert any(
        r["validation_status"] == "ineffective" for r in stored_results
    ), "action-result record keeps its distinct validation_status"
    audit = client.get(f"/cases/{case_id}/audit").json()
    assert any(e["event_type"] == "action_executed" for e in audit)


def test_effective_result_mutates_only_target_condition():
    """6.2 (obligation 15.12): a synthetic effective result changes only the
    target entity's condition and nothing else."""
    target = "HOST::SALES-LT-07"
    other = "ACCOUNT::farah"
    entities = {
        target: Entity(id=target, type=EntityType.HOST, name="SALES-LT-07"),
        other: Entity(id=other, type=EntityType.ACCOUNT, name="farah"),
    }
    results = [{
        "action_id": "ACT-1", "execution_id": "EXEC-1",
        "tool_name": "isolate_host", "target_id": target,
        "execution_status": "completed", "validation_status": "effective",
    }]
    out = gas_lite.apply_validated_effects(entities, results)
    assert out[target].condition == "isolated"
    assert out[other].condition is None


def test_ineffective_result_leaves_condition_unchanged():
    """6.1 unit mirror (obligation 15.11): ineffective leaves condition unset."""
    target = "HOST::SALES-LT-07"
    entities = {target: Entity(id=target, type=EntityType.HOST, name="SALES-LT-07")}
    results = [{
        "action_id": "ACT-1", "execution_id": "EXEC-1",
        "tool_name": "isolate_host", "target_id": target,
        "execution_status": "completed", "validation_status": "ineffective",
    }]
    out = gas_lite.apply_validated_effects(entities, results)
    assert out[target].condition is None
