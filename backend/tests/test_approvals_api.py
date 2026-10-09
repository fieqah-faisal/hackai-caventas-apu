"""Approval endpoint tests (BL-003).

POST /cases/{case_id}/actions/{action_id}/decision

The approval path: planner proposes -> analyst approves/rejects. Approval is
created by the backend (never by AI output) and binds to the exact action
version.
"""
from __future__ import annotations

from pathlib import Path

from app.ai.planner_adapter import FakePlannerAdapter

FIXTURE = (
    Path(__file__).resolve().parent.parent / "fixtures" / "planner_smoke_evidence.json"
)
ADAPTER_PATH = "app.services.planning_service.get_planner_adapter"


def _case_with_action(client, monkeypatch) -> tuple[str, str]:
    monkeypatch.setattr(ADAPTER_PATH, lambda: FakePlannerAdapter())
    case_id = client.post("/cases", json={"title": "approval demo"}).json()["case_id"]
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", FIXTURE.read_bytes(), "application/json")},
    )
    assert resp.status_code == 200, resp.text
    plan = client.post(f"/cases/{case_id}/runs").json()
    assert plan["actions"], "fake planner should propose at least one action"
    return case_id, plan["actions"][0]["action_id"]


def test_approve_action(client, monkeypatch):
    case_id, action_id = _case_with_action(client, monkeypatch)

    resp = client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "approve", "analyst": "aida", "reason": "contain now"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["action"]["status"] == "approved"
    assert body["action"]["decided_by"] == "aida"
    assert body["approval"]["decision"] == "approved"
    assert body["approval"]["action_id"] == action_id

    events = {e["event_type"] for e in client.get(f"/cases/{case_id}/audit").json()}
    assert "action_approved" in events


def test_reject_action_records_reason(client, monkeypatch):
    case_id, action_id = _case_with_action(client, monkeypatch)

    resp = client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "reject", "analyst": "raaj", "reason": "too disruptive"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["action"]["status"] == "rejected"
    assert body["action"]["reason"] == "too disruptive"

    events = {e["event_type"] for e in client.get(f"/cases/{case_id}/audit").json()}
    assert "action_rejected" in events


def test_decide_twice_conflicts(client, monkeypatch):
    case_id, action_id = _case_with_action(client, monkeypatch)
    first = client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "approve", "analyst": "aida"},
    )
    assert first.status_code == 200

    second = client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "reject", "analyst": "aida"},
    )
    assert second.status_code == 409


def test_decide_unknown_action_404(client, monkeypatch):
    case_id, _ = _case_with_action(client, monkeypatch)
    resp = client.post(
        f"/cases/{case_id}/actions/ACT-NOPE/decision",
        json={"decision": "approve", "analyst": "aida"},
    )
    assert resp.status_code == 404


def test_decide_unknown_case_404(client):
    resp = client.post(
        "/cases/CASE-NOPE/actions/ACT-NOPE/decision",
        json={"decision": "approve", "analyst": "aida"},
    )
    assert resp.status_code == 404


def test_invalid_decision_value_422(client, monkeypatch):
    case_id, action_id = _case_with_action(client, monkeypatch)
    resp = client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "maybe", "analyst": "aida"},
    )
    assert resp.status_code == 422
