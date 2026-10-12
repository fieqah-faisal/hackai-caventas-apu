"""Execution endpoint tests (BL-003).

POST /cases/{case_id}/actions/{action_id}/execute

Routes approved actions through the bounded simulator, records the result
separately from effectiveness, and rebuilds the incident state so re-planning
can see the outcome.
"""
from __future__ import annotations

from pathlib import Path

from app.ai.planner_adapter import FakePlannerAdapter
from app.simulator.simulator_adapter import FakeSimulatorAdapter

FIXTURE = (
    Path(__file__).resolve().parent.parent / "fixtures" / "planner_smoke_evidence.json"
)
PLANNER_PATH = "app.services.planning_service.get_planner_adapter"
SIMULATOR_PATH = "app.services.execution_service.get_simulator_adapter"


def _plan_action(client, monkeypatch, title: str = "execution demo") -> tuple[str, str]:
    monkeypatch.setattr(PLANNER_PATH, lambda: FakePlannerAdapter())
    monkeypatch.setattr(SIMULATOR_PATH, lambda: FakeSimulatorAdapter())
    case_id = client.post("/cases", json={"title": title}).json()["case_id"]
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", FIXTURE.read_bytes(), "application/json")},
    )
    assert resp.status_code == 200, resp.text
    plan = client.post(f"/cases/{case_id}/runs").json()
    assert plan["actions"], "fake planner should propose at least one action"
    return case_id, plan["actions"][0]["action_id"]


def _approved_action(client, monkeypatch) -> tuple[str, str]:
    case_id, action_id = _plan_action(client, monkeypatch)
    decision = client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "approve", "analyst": "aida"},
    )
    assert decision.status_code == 200, decision.text
    return case_id, action_id


def test_execute_records_outcome_and_versions_state(client, monkeypatch):
    case_id, action_id = _approved_action(client, monkeypatch)

    resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    result = body["result"]
    assert result["execution_id"].startswith("EXEC-")
    assert result["execution_status"] == "completed"
    assert result["validation_status"] == "ineffective"
    assert result["result_source"] == "simulator"
    # completed execution but ineffective outcome: not verified
    assert body["action"]["status"] == "failed"

    events = {e["event_type"] for e in client.get(f"/cases/{case_id}/audit").json()}
    assert "action_executed" in events

    state = client.get(f"/cases/{case_id}/state").json()
    assert state["version"] == 2
    descriptions = " ".join(ev["description"] for ev in state["timeline"])
    assert "isolate_host" in descriptions
    assert "ineffective" in descriptions
    assert state["action_results"], "state should reference the recorded result"


def test_execute_without_approval_conflicts(client, monkeypatch):
    case_id, action_id = _plan_action(client, monkeypatch, title="no approval")
    resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert resp.status_code == 409


def test_execute_rejected_action_conflicts(client, monkeypatch):
    case_id, action_id = _plan_action(client, monkeypatch, title="rejected")
    client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "reject", "analyst": "aida", "reason": "no"},
    )
    resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert resp.status_code == 409


def test_execute_after_new_state_requires_reapproval(client, monkeypatch):
    case_id, action_id = _approved_action(client, monkeypatch)
    # new evidence creates state v2, invalidating the v1-bound approval
    client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch2.json", FIXTURE.read_bytes(), "application/json")},
    )
    resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert resp.status_code == 409


def test_execute_is_idempotent(client, monkeypatch):
    case_id, action_id = _approved_action(client, monkeypatch)
    first = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    second = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert first.status_code == 200 and second.status_code == 200
    assert (
        first.json()["result"]["execution_id"]
        == second.json()["result"]["execution_id"]
    )
    assert client.get(f"/cases/{case_id}/state").json()["version"] == 2


def test_execute_unknown_case_404(client):
    assert client.post("/cases/CASE-NOPE/actions/ACT-NOPE/execute").status_code == 404
