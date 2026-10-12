"""Read-only list endpoints for API-mode approvals and results (BL-027).

GET /cases/{case_id}/actions        -> stored actions, oldest first
GET /cases/{case_id}/action-results -> recorded simulator results, oldest first

Both only read: they never decide, execute, or write audit events.
"""
from __future__ import annotations

from pathlib import Path

from app.ai.planner_adapter import FakePlannerAdapter
from app.database import repositories
from app.simulator.simulator_adapter import FakeSimulatorAdapter

FIXTURE = (
    Path(__file__).resolve().parent.parent / "fixtures" / "planner_smoke_evidence.json"
)
PLANNER_PATH = "app.services.planning_service.get_planner_adapter"
SIMULATOR_PATH = "app.services.execution_service.get_simulator_adapter"


def _planned_case(client, monkeypatch) -> tuple[str, dict]:
    monkeypatch.setattr(PLANNER_PATH, lambda: FakePlannerAdapter())
    monkeypatch.setattr(SIMULATOR_PATH, lambda: FakeSimulatorAdapter())
    case_id = client.post("/cases", json={"title": "read endpoints"}).json()["case_id"]
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", FIXTURE.read_bytes(), "application/json")},
    )
    assert resp.status_code == 200, resp.text
    run = client.post(f"/cases/{case_id}/runs").json()
    assert run["actions"], "fake planner should propose at least one action"
    return case_id, run


def _audit_count(client, case_id: str) -> int:
    return len(client.get(f"/cases/{case_id}/audit").json())


def test_list_actions_returns_stored_actions_as_run_returned_them(client, monkeypatch):
    case_id, run = _planned_case(client, monkeypatch)
    audit_before = _audit_count(client, case_id)

    resp = client.get(f"/cases/{case_id}/actions")

    assert resp.status_code == 200, resp.text
    assert resp.json() == run["actions"]
    assert resp.json()[0]["status"] == "awaiting_approval"
    # A read writes nothing.
    assert _audit_count(client, case_id) == audit_before


def test_list_actions_reflects_decisions_without_changing_them(client, monkeypatch):
    case_id, run = _planned_case(client, monkeypatch)
    action_id = run["actions"][0]["action_id"]
    client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "approve", "analyst": "aida"},
    )

    first = client.get(f"/cases/{case_id}/actions").json()
    second = client.get(f"/cases/{case_id}/actions").json()

    assert first[0]["status"] == "approved"
    assert first[0]["decided_by"] == "aida"
    assert second == first
    # Listing is not execution: no result was recorded.
    assert client.get(f"/cases/{case_id}/action-results").json() == []


def test_list_actions_sorted_by_created_at_not_stream_order(client, monkeypatch):
    """Real Firestore streams in document-ID order; the fake keeps insertion.

    The newest action is written FIRST, so stream order would be wrong.
    """
    case_id = client.post("/cases", json={"title": "action order"}).json()["case_id"]
    for action_id, created_at in [
        ("ACT-newest", "2026-10-12T02:45:53.467460+00:00"),
        ("ACT-oldest", "2026-10-12T02:43:38.195695Z"),
        ("ACT-middle", "2026-10-12T02:45:53.460138Z"),
    ]:
        repositories.add_action(
            case_id,
            action_id,
            {"action_id": action_id, "case_id": case_id, "created_at": created_at},
        )

    ids = [a["action_id"] for a in client.get(f"/cases/{case_id}/actions").json()]

    assert ids == ["ACT-oldest", "ACT-middle", "ACT-newest"]


def test_list_action_results_keeps_execution_and_validation_separate(client, monkeypatch):
    case_id, run = _planned_case(client, monkeypatch)
    action_id = run["actions"][0]["action_id"]
    client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "approve", "analyst": "aida"},
    )
    executed = client.post(f"/cases/{case_id}/actions/{action_id}/execute").json()
    audit_before = _audit_count(client, case_id)

    resp = client.get(f"/cases/{case_id}/action-results")

    assert resp.status_code == 200, resp.text
    assert resp.json() == [executed["result"]]
    assert resp.json()[0]["execution_status"] == "completed"
    assert resp.json()[0]["validation_status"] == "ineffective"
    assert _audit_count(client, case_id) == audit_before


def test_list_action_results_sorted_by_created_at(client):
    case_id = client.post("/cases", json={"title": "result order"}).json()["case_id"]
    for exec_id, created_at in [
        ("EXEC-newest", "2026-10-12T03:00:00+00:00"),
        ("EXEC-oldest", "2026-10-12T01:00:00Z"),
    ]:
        repositories.add_action_result(
            case_id, exec_id, {"execution_id": exec_id, "created_at": created_at}
        )

    ids = [r["execution_id"] for r in client.get(f"/cases/{case_id}/action-results").json()]

    assert ids == ["EXEC-oldest", "EXEC-newest"]


def test_read_endpoints_unknown_case_404(client):
    for path in ("actions", "action-results"):
        resp = client.get(f"/cases/CASE-MISSING/{path}")
        assert resp.status_code == 404, path
        assert "case not found" in resp.json()["detail"]


def test_read_endpoints_empty_case_returns_empty_lists(client):
    case_id = client.post("/cases", json={"title": "empty"}).json()["case_id"]
    assert client.get(f"/cases/{case_id}/actions").json() == []
    assert client.get(f"/cases/{case_id}/action-results").json() == []
