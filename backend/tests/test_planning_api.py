"""Planning endpoint tests (BL-002).

Covers:
    POST /cases/{id}/runs   -> run the planner, persist proposal + actions
    GET  /cases/{id}/plans  -> list stored plans

The planner is monkeypatched: these tests exercise the API/service wiring,
while ``test_planner_adapter.py`` covers the real adapter with a scripted LLM.
"""
from __future__ import annotations

from pathlib import Path

from app.ai.langgraph_planner import PlannerError
from app.ai.planner_adapter import FakePlannerAdapter
from app.schemas.plan import (
    PlanAnalysis,
    PlanProposal,
    ProposedAction,
    ProposedFinding,
    Stage,
)

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "login_logs.csv"

ADAPTER_PATH = "app.services.planning_service.get_planner_adapter"


def _create_case(client, title: str = "Infostealer demo") -> str:
    resp = client.post("/cases", json={"title": title})
    assert resp.status_code == 201, resp.text
    return resp.json()["case_id"]


def _create_case_with_evidence(client) -> str:
    case_id = _create_case(client)
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("login_logs.csv", FIXTURE.read_bytes(), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    return case_id


def test_run_planning_creates_plan_and_persists_actions(client, monkeypatch):
    monkeypatch.setattr(ADAPTER_PATH, lambda: FakePlannerAdapter())
    case_id = _create_case_with_evidence(client)

    resp = client.post(f"/cases/{case_id}/runs")
    assert resp.status_code == 200, resp.text
    plan = resp.json()
    assert plan["plan_id"].startswith("PLAN-")
    assert "analysis" not in plan  # the fake adapter produces no analysis
    assert plan["case_id"] == case_id
    assert plan["based_on_state_version"] == 1
    assert plan["stage"] == "containment"
    assert len(plan["actions"]) == 1
    assert plan["actions"][0]["proposal"]["tool_name"] == "isolate_host"
    assert plan["actions"][0]["action_id"].startswith("ACT-")

    listed = client.get(f"/cases/{case_id}/plans").json()
    assert [p["plan_id"] for p in listed] == [plan["plan_id"]]

    audit_types = {
        e["event_type"] for e in client.get(f"/cases/{case_id}/audit").json()
    }
    assert "plan_created" in audit_types


def test_run_planning_without_state_conflicts(client, monkeypatch):
    monkeypatch.setattr(ADAPTER_PATH, lambda: FakePlannerAdapter())
    case_id = _create_case(client, title="no evidence yet")
    assert client.post(f"/cases/{case_id}/runs").status_code == 409


def test_run_planning_unknown_case_404(client):
    assert client.post("/cases/CASE-NOPE/runs").status_code == 404


def test_run_planning_planner_error_maps_to_502(client, monkeypatch):
    class BrokenAdapter:
        def generate_plan(self, incident_state, approved_guidance=None):
            raise PlannerError("provider down")

    monkeypatch.setattr(ADAPTER_PATH, lambda: BrokenAdapter())
    case_id = _create_case_with_evidence(client)
    assert client.post(f"/cases/{case_id}/runs").status_code == 502


def test_list_plans_unknown_case_404(client):
    assert client.get("/cases/CASE-NOPE/plans").status_code == 404


def test_list_plans_empty_for_new_case(client):
    case_id = _create_case(client, title="fresh")
    assert client.get(f"/cases/{case_id}/plans").json() == []


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


def test_plan_analysis_is_persisted(client, monkeypatch):
    class AnalysisAdapter:
        def generate_plan(self, incident_state, approved_guidance=None):
            return PlanProposal(
                based_on_state_version=incident_state.version,
                stage=Stage.CONTAINMENT,
                actions=[],
                analysis=PlanAnalysis(
                    incident_type="infostealer_session_hijack",
                    scope="one laptop and the CRM session",
                    severity="high",
                    confidence=0.7,
                    findings=[
                        ProposedFinding(
                            summary="Unsigned installer ran on SALES-LT-07.",
                            evidence_ids=["EV-1"],
                            confidence=0.8,
                        )
                    ],
                    attack_techniques=["T1204.002"],
                ),
            )

    monkeypatch.setattr(ADAPTER_PATH, lambda: AnalysisAdapter())
    case_id = _create_case_with_evidence(client)

    resp = client.post(f"/cases/{case_id}/runs")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["analysis"]["severity"] == "high"
    assert body["analysis"]["attack_techniques"] == ["T1204.002"]
    assert body["analysis"]["findings"][0]["summary"] == (
        "Unsigned installer ran on SALES-LT-07."
    )

    listed = client.get(f"/cases/{case_id}/plans").json()
    assert listed[0]["analysis"]["incident_type"] == "infostealer_session_hijack"
