"""Report endpoint tests (BL-003).

POST /cases/{case_id}/reports             -> v1.2 JSON + PDF from stored records
GET  /cases/{case_id}/reports/{report_id} -> retrieve a stored report
"""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

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
    assert report["current_state_version"] == 2
    assert report["plan_based_on_state_version"] == 1
    assert report["plan_is_stale"] is True
    assert report["template_schema_version"] == "2.0"
    assert report["analyst_report"]["overview"]["plan_status"] == "stale"
    assert report["analyst_report"]["key_findings"] == []
    assert report["analyst_report"]["appendices"]["technical_findings"]
    assert report["classification"]["current_phase"] == "containment"
    assert report["evidence_index"], "evidence index must list stored evidence"
    assert any(row["evidence_ids"] for row in report["affected"])
    assert isinstance(report["open_questions"], list)

    assert len(report["actions"]) == 1
    action = report["actions"][0]
    assert action["status"] == "failed"  # executed but ineffective
    assert action["decided_by"] == "aida"
    assert action["result_source"] == "simulator"
    assert action["plan_id"] == report["plan_id"]
    assert action["based_on_state_version"] == 1
    assert action["tool_name"] == "isolate_host"
    assert action["target_id"]
    assert action["evidence_ids"]
    assert action["required_approver"] == "soc_analyst"
    assert action["approver_role"] == "soc_analyst"
    assert action["policy_check"]["result"] == "pass"

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


def test_latest_report_and_pdf_survive_a_later_read(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = _case_with_history(client, monkeypatch)
    first = client.post(f"/cases/{case_id}/reports").json()
    second = client.post(f"/cases/{case_id}/reports").json()

    latest = client.get(f"/cases/{case_id}/reports/latest")
    assert latest.status_code == 200
    assert latest.json()["report_id"] == second["report_id"]
    assert latest.json()["report_id"] != first["report_id"]
    assert first["version"] == 1
    assert second["version"] == 2

    pdf = client.get(f"/cases/{case_id}/reports/{second['report_id']}/pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert second["report_id"] in pdf.headers["content-disposition"]
    assert pdf.content.startswith(b"%PDF-")
    assert len(pdf.content) > 100


def test_latest_report_and_pdf_missing_404(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = client.post("/cases", json={"title": "empty"}).json()["case_id"]
    assert client.get(f"/cases/{case_id}/reports/latest").status_code == 404

    generated = client.post(f"/cases/{case_id}/reports").json()
    Path(generated["pdf_path"]).unlink()
    assert client.get(
        f"/cases/{case_id}/reports/{generated['report_id']}/pdf"
    ).status_code == 404


def test_report_pdf_bounds_long_untrusted_record_fields(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = client.post("/cases", json={"title": "long evidence"}).json()["case_id"]
    payload = [{
        "event_time": "2026-10-07T10:12:00+08:00",
        "event_type": "analyst_note",
        "source": "analyst_note",
        "host": "SYNTH-LT-01",
        "note": "x" * 10_000,
    }]
    upload = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("long.json", json.dumps(payload).encode(), "application/json")},
    )
    assert upload.status_code == 200, upload.text

    response = client.post(f"/cases/{case_id}/reports")
    assert response.status_code == 200, response.text
    report = response.json()
    chronology = report["analyst_report"]["appendices"]["raw_chronology"]
    assert len(chronology[0]["raw_detail"]) <= 800
    assert Path(report["pdf_path"]).read_bytes().startswith(b"%PDF-")


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
    assert report["plan_id"] == "PLAN-newest"
    assert report["plan_based_on_state_version"] == 1
    assert report["plan_is_stale"] is True


def test_report_actions_keep_their_own_plan_phase_and_state(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = client.post("/cases", json={"title": "action provenance"}).json()["case_id"]
    upload = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", FIXTURE.read_bytes(), "application/json")},
    )
    assert upload.status_code == 200, upload.text
    target = client.get(f"/cases/{case_id}/state").json()["entities"][0]["id"]
    evidence_id = client.get(f"/cases/{case_id}/evidence").json()[0]["evidence_id"]

    for index, phase in enumerate(("preservation", "containment"), start=1):
        plan_id = f"PLAN-{index}"
        action_id = f"ACT-{index}"
        repositories.add_plan(
            case_id,
            plan_id,
            {
                "plan_id": plan_id,
                "case_id": case_id,
                "based_on_state_version": 1,
                "stage": phase,
                "missing_evidence": [],
                "action_ids": [action_id],
                "created_at": f"2026-10-13T11:00:0{index}+00:00",
            },
        )
        repositories.add_action(
            case_id,
            action_id,
            {
                "action_id": action_id,
                "case_id": case_id,
                "plan_id": plan_id,
                "version": 1,
                "based_on_state_version": 1,
                "proposal": {
                    "tool_name": "preserve_evidence",
                    "target_id": target,
                    "evidence_ids": [evidence_id],
                    "policy_refs": ["POL-05"],
                    "rationale": f"{phase} action",
                },
                "status": "awaiting_approval",
                "created_at": f"2026-10-13T11:00:0{index}+00:00",
            },
        )

    report = client.post(f"/cases/{case_id}/reports").json()

    assert [(row["plan_id"], row["phase"]) for row in report["actions"]] == [
        ("PLAN-1", "preservation"),
        ("PLAN-2", "containment"),
    ]
    assert all(row["based_on_state_version"] == 1 for row in report["actions"])


def test_generate_report_unknown_case_404(client):
    assert client.post("/cases/CASE-NOPE/reports").status_code == 404


def test_get_unknown_report_404(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = client.post("/cases", json={"title": "empty"}).json()["case_id"]
    assert client.get(f"/cases/{case_id}/reports/RPT-NOPE").status_code == 404


def test_report_fills_classification_findings_and_attack(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = client.post("/cases", json={"title": "analysis report"}).json()["case_id"]
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", FIXTURE.read_bytes(), "application/json")},
    )
    assert resp.status_code == 200, resp.text
    evidence_id = client.get(f"/cases/{case_id}/evidence").json()[0]["evidence_id"]

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
                            evidence_ids=[evidence_id],
                            confidence=0.8,
                        )
                    ],
                    attack_techniques=["T1204.002", "T1555.003"],
                ),
            )

    monkeypatch.setattr(PLANNER_PATH, lambda: AnalysisPlanner())
    assert client.post(f"/cases/{case_id}/runs").status_code == 200

    report = client.post(f"/cases/{case_id}/reports").json()

    assert report["classification"]["incident_type"] == "infostealer_session_hijack"
    assert report["classification"]["severity"] == "high"
    assert report["classification"]["confidence"] == 0.7
    assert set(report["classification"]["attack_techniques"]) >= {
        "T1204.002",
        "T1555.003",
    }
    assert report["classification"]["severity_reason"] == (
        "Assessed by the planner from stored evidence."
    )
    assert report["findings"][0]["finding_id"] == "FND-01"
    assert report["findings"][0]["summary"] == "Unsigned installer ran on the endpoint."
    assert report["findings"][0]["status"] == "hypothesis"
    assert report["findings"][0]["evidence_ids"] == [evidence_id]
    assert report["findings"][0]["confidence"] == 0.8
    assert report["analyst_report"]["key_findings"][0]["evidence_ids"] == [
        evidence_id
    ]
    assert any(
        row["category"] == "observed"
        for row in report["analyst_report"]["key_timeline"]
        if evidence_id in row["evidence_ids"]
    )
    assert Path(report["pdf_path"]).exists()


def test_report_does_not_apply_global_attack_mapping_to_unrelated_findings(
    client, monkeypatch, tmp_path
):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = client.post("/cases", json={"title": "mixed findings"}).json()["case_id"]
    upload = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", FIXTURE.read_bytes(), "application/json")},
    )
    assert upload.status_code == 200, upload.text
    stored = client.get(f"/cases/{case_id}/evidence").json()
    contextual_id = next(
        item["evidence_id"]
        for item in stored
        if item["fields"].get("event_type") == "dns_query"
    )
    attack_id = next(
        item["evidence_id"]
        for item in stored
        if item["fields"].get("technique") == "T1555.003"
    )

    class MixedPlanner:
        def generate_plan(self, incident_state, approved_guidance=None):
            return PlanProposal(
                based_on_state_version=incident_state.version,
                stage=Stage.ASSESSMENT,
                actions=[],
                analysis=PlanAnalysis(
                    incident_type="other",
                    severity="medium",
                    confidence=0.8,
                    findings=[
                        ProposedFinding(
                            summary="A DNS record requires contextual review.",
                            evidence_ids=[contextual_id],
                            confidence=0.7,
                        ),
                        ProposedFinding(
                            summary="Credential-store access is security relevant.",
                            evidence_ids=[attack_id],
                            confidence=0.9,
                        ),
                    ],
                    attack_techniques=["T1555.003"],
                ),
            )

    monkeypatch.setattr(PLANNER_PATH, lambda: MixedPlanner())
    assert client.post(f"/cases/{case_id}/runs").status_code == 200
    timeline = client.post(f"/cases/{case_id}/reports").json()["analyst_report"][
        "key_timeline"
    ]
    categories = {
        row["evidence_ids"][0]: row["category"]
        for row in timeline
        if row["evidence_ids"]
    }

    assert categories[contextual_id] == "observed"
    assert categories[attack_id] == "attack"


@pytest.mark.parametrize(
    ("scenario", "batches", "incident_type", "severity", "finding_summary"),
    [
        (
            "sc01_infostealer",
            ["batch_01.json"],
            "infostealer_session_hijack",
            "high",
            "Endpoint activity supports an infostealer finding.",
        ),
        (
            "sc03_false_alarm",
            ["batch_01.json", "batch_02.json"],
            "not_an_incident",
            "low",
            "Stored change and analyst records support authorized backup activity.",
        ),
    ],
)
def test_analyst_template_reuses_one_schema_across_distinct_scenarios(
    client,
    monkeypatch,
    tmp_path,
    scenario,
    batches,
    incident_type,
    severity,
    finding_summary,
):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    scenario_dir = Path(__file__).resolve().parent.parent / "scenarios" / scenario / "agent_inputs"
    case_body = json.loads((scenario_dir / "case.json").read_text())
    case_id = client.post("/cases", json=case_body).json()["case_id"]
    for batch in batches:
        response = client.post(
            f"/cases/{case_id}/evidence",
            files={"file": (batch, (scenario_dir / batch).read_bytes(), "application/json")},
        )
        assert response.status_code == 200, response.text

    evidence_ids = [
        item["evidence_id"] for item in client.get(f"/cases/{case_id}/evidence").json()
    ]

    class ScenarioPlanner:
        def generate_plan(self, incident_state, approved_guidance=None):
            return PlanProposal(
                based_on_state_version=incident_state.version,
                stage=Stage.ASSESSMENT,
                actions=[],
                analysis=PlanAnalysis(
                    incident_type=incident_type,
                    scope="scenario evidence",
                    severity=severity,
                    confidence=0.9,
                    findings=[
                        ProposedFinding(
                            summary=finding_summary,
                            evidence_ids=[evidence_ids[-1]],
                            confidence=0.9,
                        )
                    ],
                    attack_techniques=(
                        ["T1555.003"]
                        if incident_type == "infostealer_session_hijack"
                        else []
                    ),
                ),
            )

    monkeypatch.setattr(PLANNER_PATH, lambda: ScenarioPlanner())
    run = client.post(f"/cases/{case_id}/runs")
    assert run.status_code == 200, run.text
    report = client.post(f"/cases/{case_id}/reports").json()
    analyst = report["analyst_report"]

    assert report["template_schema_version"] == "2.0"
    assert set(analyst) == {
        "overview",
        "executive_summary",
        "executive_summary_source",
        "key_findings",
        "key_timeline",
        "entities",
        "response_actions",
        "impact",
        "next_steps",
        "appendices",
    }
    assert analyst["appendices"]["evidence_index"]
    assert Path(report["pdf_path"]).exists()
    assert Path(report["pdf_path"]).read_bytes().startswith(b"%PDF-")

    if incident_type == "not_an_incident":
        assert analyst["overview"]["incident_status"] == "not_an_incident"
        assert "not an incident" in analyst["executive_summary"].lower()
        assert "compromise" not in analyst["executive_summary"].lower()
        assert all(row["category"] != "attack" for row in analyst["key_timeline"])
        assert all(row["relevance"] == "contextual" for row in analyst["entities"])


def test_report_survives_malformed_analysis(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = client.post("/cases", json={"title": "malformed analysis"}).json()["case_id"]
    repositories.add_plan(
        case_id,
        "PLAN-malformed",
        {
            "plan_id": "PLAN-malformed",
            "case_id": case_id,
            "based_on_state_version": 1,
            "stage": "assessment",
            "missing_evidence": [],
            "action_ids": [],
            "created_at": "2026-10-13T10:00:00+00:00",
            "analysis": {
                "findings": [
                    None,
                    {"summary": "Kept.", "evidence_ids": [123, "EV-1"], "confidence": "bad"},
                ],
                "confidence": float("nan"),
                "attack_techniques": [7, "T1204.002", "TXXXX"],
            },
        },
    )

    resp = client.post(f"/cases/{case_id}/reports")
    assert resp.status_code == 200, resp.text
    report = resp.json()

    assert report["classification"]["incident_type"] == "other"
    assert report["classification"]["severity"] == "unknown"
    assert report["classification"]["confidence"] == 0.0
    assert report["classification"]["attack_techniques"] == ["T1204.002"]
    assert report["findings"] == []


def test_report_survives_non_iterable_analysis_fields(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = client.post("/cases", json={"title": "non-iterable analysis"}).json()["case_id"]
    repositories.add_plan(
        case_id,
        "PLAN-non-iterable",
        {
            "plan_id": "PLAN-non-iterable",
            "case_id": case_id,
            "based_on_state_version": 1,
            "stage": "assessment",
            "missing_evidence": [],
            "action_ids": [],
            "created_at": "2026-10-13T11:00:00+00:00",
            "analysis": {"findings": 5, "attack_techniques": "T1204.002", "confidence": 0.5},
        },
    )

    resp = client.post(f"/cases/{case_id}/reports")
    assert resp.status_code == 200, resp.text
    report = resp.json()

    assert report["findings"] == []
    assert report["classification"]["attack_techniques"] == []
    assert report["classification"]["confidence"] == 0.5
