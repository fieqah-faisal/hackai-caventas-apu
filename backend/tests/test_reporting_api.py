"""Report endpoint tests (BL-003).

POST /cases/{case_id}/reports             -> v1.2 JSON + PDF from stored records
GET  /cases/{case_id}/reports/{report_id} -> retrieve a stored report
"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from app.ai.planner_adapter import FakePlannerAdapter
from app.database import repositories
from app.schemas.plan import PlanAnalysis, PlanProposal, ProposedFinding, Stage
from app.simulator.simulator_adapter import FakeSimulatorAdapter

FIXTURE = (
    Path(__file__).resolve().parent.parent / "fixtures" / "planner_smoke_evidence.json"
)
PLANNER_PATH = "app.services.planning_service.get_planner_adapter"
SIMULATOR_PATH = "app.services.execution_service.get_simulator_adapter"
SETTINGS_PATH = "app.services.reporting.get_settings"


def _case_with_history(client, monkeypatch) -> str:
    monkeypatch.setattr(PLANNER_PATH, lambda: FakePlannerAdapter())
    monkeypatch.setattr(SIMULATOR_PATH, lambda: FakeSimulatorAdapter())
    case_id = client.post("/cases", json={"title": "report demo"}).json()["case_id"]
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", FIXTURE.read_bytes(), "application/json")},
    )
    assert resp.status_code == 200, resp.text
    plan = client.post(f"/cases/{case_id}/runs").json()
    action_id = plan["actions"][0]["action_id"]
    client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "approve", "analyst": "aida"},
    )
    client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    return case_id


def test_generate_report_from_stored_records(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = _case_with_history(client, monkeypatch)

    resp = client.post(f"/cases/{case_id}/reports")
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["report_id"].startswith("RPT-")
    assert report["incident_id"] == case_id
    assert report["status"] == "draft"
    assert report["classification"]["current_phase"] == "containment"
    assert report["evidence_index"], "evidence index must list stored evidence"
    assert isinstance(report["open_questions"], list)

    assert len(report["actions"]) == 1
    action = report["actions"][0]
    assert action["status"] == "failed"  # executed but ineffective
    assert action["decided_by"] == "aida"
    assert action["result_source"] == "simulator"

    descriptions = " ".join(row["event"] for row in report["timeline"])
    assert "isolate_host" in descriptions

    pdf_path = Path(report["pdf_path"])
    assert pdf_path.exists(), "PDF should be written to the report dir"
    assert pdf_path.suffix == ".pdf"

    events = {e["event_type"] for e in client.get(f"/cases/{case_id}/audit").json()}
    assert "report_generated" in events


def test_get_report_roundtrip(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = _case_with_history(client, monkeypatch)
    generated = client.post(f"/cases/{case_id}/reports").json()

    fetched = client.get(
        f"/cases/{case_id}/reports/{generated['report_id']}"
    )
    assert fetched.status_code == 200
    assert fetched.json()["report_id"] == generated["report_id"]


def test_report_uses_newest_plan_not_stream_order(client, monkeypatch, tmp_path):
    """Real Firestore streams plans in document-ID order, not creation order.

    The fake keeps insertion order, so the newest plan is written FIRST here:
    picking ``list_plans()[-1]`` would report the older plan's phase and gaps.
    """
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = client.post("/cases", json={"title": "plan order"}).json()["case_id"]
    plans = [
        ("PLAN-newest", "eradication", ["newest gap"], "2026-10-12T02:45:53.467460+00:00"),
        ("PLAN-oldest", "containment", ["oldest gap"], "2026-10-12T02:43:38.195695+00:00"),
        ("PLAN-middle", "preservation", ["middle gap"], "2026-10-12T02:45:53.460138Z"),
    ]
    for plan_id, stage, gaps, created_at in plans:
        repositories.add_plan(
            case_id,
            plan_id,
            {
                "plan_id": plan_id,
                "case_id": case_id,
                "based_on_state_version": 1,
                "stage": stage,
                "missing_evidence": gaps,
                "action_ids": [],
                "created_at": created_at,
            },
        )

    report = client.post(f"/cases/{case_id}/reports").json()

    assert report["classification"]["current_phase"] == "eradication"
    assert [q["question"] for q in report["open_questions"]] == ["newest gap"]


def test_generate_report_unknown_case_404(client):
    assert client.post("/cases/CASE-NOPE/reports").status_code == 404


def test_get_unknown_report_404(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = client.post("/cases", json={"title": "empty"}).json()["case_id"]
    assert client.get(f"/cases/{case_id}/reports/RPT-NOPE").status_code == 404


def test_report_fills_classification_findings_and_attack(client, monkeypatch, tmp_path):
    class AnalysisPlanner:
        def generate_plan(self, incident_state, approved_guidance=None):
            return PlanProposal(
                based_on_state_version=incident_state.version,
                stage=Stage.CONTAINMENT,
                actions=[],
                analysis=PlanAnalysis(
                    incident_type="infostealer_session_hijack",
                    scope="one laptop",
                    severity="high",
                    confidence=0.7,
                    findings=[
                        ProposedFinding(
                            summary="Unsigned installer ran on the endpoint.",
                            evidence_ids=["EV-1"],
                            confidence=0.8,
                        )
                    ],
                    attack_techniques=["T1204.002", "T1555.003"],
                ),
            )

    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    monkeypatch.setattr(PLANNER_PATH, lambda: AnalysisPlanner())
    case_id = client.post("/cases", json={"title": "analysis report"}).json()["case_id"]
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", FIXTURE.read_bytes(), "application/json")},
    )
    assert resp.status_code == 200, resp.text
    assert client.post(f"/cases/{case_id}/runs").status_code == 200

    report = client.post(f"/cases/{case_id}/reports").json()

    assert report["classification"]["incident_type"] == "infostealer_session_hijack"
    assert report["classification"]["severity"] == "high"
    assert report["classification"]["confidence"] == 0.7
    assert report["classification"]["attack_techniques"] == ["T1204.002", "T1555.003"]
    assert report["classification"]["severity_reason"] == (
        "Assessed by the planner from stored evidence."
    )
    assert report["findings"][0]["finding_id"] == "FND-01"
    assert report["findings"][0]["summary"] == "Unsigned installer ran on the endpoint."
    assert report["findings"][0]["evidence_ids"] == ["EV-1"]
    assert report["findings"][0]["confidence"] == 0.8
    assert Path(report["pdf_path"]).exists()
