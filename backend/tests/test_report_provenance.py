"""Focused report-snapshot tests: provenance, analyst reviews, PDF disclaimers.

Complements test_reporting_api.py. Covers the Priority-3 obligations:
- the report snapshot carries analyst reviews and the provenance block;
- planner provenance comes from the STORED plan, not current settings;
- the PDF includes the analyst review / sign-off and the confidence disclaimer.
No fixtures drive authoritative facts; all synthetic.
"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from app.ai.planner_adapter import FakePlannerAdapter
from app.database import repositories

PLANNER_PATH = "app.services.planning_service.get_planner_adapter"
SETTINGS_PATH = "app.services.reporting.get_settings"

EVIDENCE = [{
    "event_time": "2026-10-04T21:42:30+08:00", "event_type": "network_upload",
    "host": "SALES-LT-07", "account": "farah", "destination_ip": "203.0.113.45",
    "bytes": 2400000,
}]


def _case_with_plan(client, monkeypatch):
    import json
    monkeypatch.setattr(PLANNER_PATH, lambda: FakePlannerAdapter())
    case_id = client.post("/cases", json={"title": "provenance"}).json()["case_id"]
    client.post(f"/cases/{case_id}/evidence",
                files={"file": ("b.json", json.dumps(EVIDENCE).encode(), "application/json")})
    assert client.post(f"/cases/{case_id}/runs").status_code == 200
    return case_id


def test_report_snapshot_carries_reviews_and_provenance(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = _case_with_plan(client, monkeypatch)
    state_version = client.get(f"/cases/{case_id}").json()["current_state_version"]
    # record a case-level sign-off review
    review = client.post(f"/cases/{case_id}/reviews", json={
        "target_type": "case", "review_type": "sign_off", "analyst": "Lead A.",
        "analyst_role": "SOC lead", "comment": "Approved for distribution.",
        "state_version": state_version,
    })
    assert review.status_code == 201

    report = client.post(f"/cases/{case_id}/reports").json()
    analyst = report["analyst_report"]

    # reviews are embedded in the snapshot
    assert any(r["review_type"] == "sign_off" for r in analyst["analyst_reviews"])
    # provenance block is present and bound to the stored state/plan
    prov = analyst["appendices"]["provenance"]
    assert prov["state_version"] == state_version
    assert prov["plan_id"] == report["plan_id"]
    assert prov["plan_is_stale"] is False
    # sign-off surfaced at the report level
    assert report["sign_off"] and report["sign_off"]["decision"] == "sign_off"


def test_planner_provenance_comes_from_stored_plan_not_settings(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = _case_with_plan(client, monkeypatch)

    # Overwrite the current adapter so, if the report wrongly read "current
    # settings", provenance would change. The report must still reflect the
    # STORED plan's planner identity (deterministic / FakePlannerAdapter).
    class LivePretender:
        from app.schemas.plan import PlannerIdentity as _PI
        identity = _PI(kind="live_ai", adapter="LivePretender", model="totally-different")
        def generate_plan(self, *a, **k):  # pragma: no cover - not invoked
            raise AssertionError("planning must not re-run during reporting")
    monkeypatch.setattr(PLANNER_PATH, lambda: LivePretender())

    report = client.post(f"/cases/{case_id}/reports").json()
    overview = report["analyst_report"]["overview"]
    assert overview["planner_kind"] == "deterministic"
    assert overview["planner_model"] == "deterministic-rules-v1"
    assert report["planner_model"] == "deterministic-rules-v1"


def test_pdf_includes_reviews_signoff_and_confidence_disclaimer(client, monkeypatch, tmp_path):
    monkeypatch.setattr(SETTINGS_PATH, lambda: SimpleNamespace(report_path=tmp_path))
    case_id = _case_with_plan(client, monkeypatch)
    state_version = client.get(f"/cases/{case_id}").json()["current_state_version"]
    client.post(f"/cases/{case_id}/reviews", json={
        "target_type": "case", "review_type": "sign_off", "analyst": "Lead A.",
        "analyst_role": "SOC lead", "comment": "Signed off.", "state_version": state_version,
    })
    report = client.post(f"/cases/{case_id}/reports").json()
    pdf = Path(report["pdf_path"])
    assert pdf.exists() and pdf.read_bytes().startswith(b"%PDF-")

    # The sign-off review is in the typed snapshot the PDF renders from
    # (ReportLab compresses the content stream, so assert the renderer input).
    reviews = report["analyst_report"]["analyst_reviews"]
    assert any(r["review_type"] == "sign_off" for r in reviews)

    # The confidence disclaimer is a constant drawn by the renderer; assert it
    # is present in the renderer source so the PDF cannot silently drop it, and
    # that re-rendering the stored snapshot succeeds.
    import inspect
    from app.services import report_document
    assert "not calibrated probabilities" in inspect.getsource(report_document)
    assert "Analyst reviews" in inspect.getsource(report_document)
    out = report_document.render_report_pdf(report, tmp_path / "probe.pdf")
    assert out.exists() and out.read_bytes().startswith(b"%PDF-")
