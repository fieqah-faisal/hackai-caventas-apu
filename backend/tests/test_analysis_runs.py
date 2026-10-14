"""Persisted deterministic analysis runs against in-memory Firestore."""
from __future__ import annotations

import json

import pytest
from app.ai.planner_adapter import FakePlannerAdapter
from app.database import repositories
from app.services import analysis_runs, planning_service


@pytest.fixture(autouse=True)
def deterministic_planner(monkeypatch):
    # Never allow test configuration from a local .env to select a live adapter.
    monkeypatch.setattr(planning_service, "get_planner_adapter", lambda: FakePlannerAdapter())


def _case(client):
    case_id = client.post("/cases", json={"title": "Synthetic analysis run"}).json()["case_id"]
    response = client.post(f"/cases/{case_id}/evidence", files={"file": (
        "batch.json", json.dumps([{"host": "DEMO-LT-01", "account": "demo",
                                   "event_type": "network_upload", "destination_ip": "203.0.113.50"}]),
        "application/json")})
    assert response.status_code == 200
    return case_id


def test_async_run_created_queued_and_duplicate_prevented(client):
    case_id = _case(client)
    first = analysis_runs.create(case_id)
    assert first.status == "queued" and first.based_on_state_version == 1
    assert analysis_runs.read(case_id, first.run_id).stage == "queued"
    assert client.get(f"/cases/{case_id}/analysis-runs/active").json()["run_id"] == first.run_id
    duplicate = client.post(f"/cases/{case_id}/analysis-runs")
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == {
        "message": "analysis already in progress",
        "run_id": first.run_id,
    }
    analysis_runs.execute(first)
    done = client.get(f"/cases/{case_id}/analysis-runs/{first.run_id}").json()
    assert done["status"] == done["stage"] == "completed"
    assert done["plan_id"] in {p["plan_id"] for p in repositories.list_plans(case_id)}
    assert done["based_on_state_version"] == 1
    assert client.get(f"/cases/{case_id}/analysis-runs/active").json() is None
    assert client.post(f"/cases/{case_id}/runs").status_code == 200


def test_active_run_lookup_rejects_unknown_case(client):
    response = client.get("/cases/CASE-missing/analysis-runs/active")
    assert response.status_code == 404


def test_run_reports_real_boundaries_and_failure_is_sanitized(client, monkeypatch):
    case_id = _case(client)
    run = analysis_runs.create(case_id)
    stages = []
    original = repositories.update_analysis_run

    def capture(case, run_id, fields):
        stages.append(fields["stage"])
        original(case, run_id, fields)

    monkeypatch.setattr(repositories, "update_analysis_run", capture)
    analysis_runs.execute(run)
    assert stages == ["loading_state", "loading_guidance", "running_planner", "persisting_plan", "completed"]

    failing = analysis_runs.create(case_id)
    from app.services import planning_service

    def broken(*args, **kwargs):
        raise planning_service.PlanningError("Bearer forbidden-token provider body", "planner")

    monkeypatch.setattr(planning_service, "run_planning", broken)
    analysis_runs.execute(failing)
    result = client.get(f"/cases/{case_id}/analysis-runs/{failing.run_id}").json()
    assert result["status"] == "failed" and result["plan_id"] is None
    assert "forbidden-token" not in json.dumps(result)
    assert analysis_runs.create(case_id).status == "queued"  # slot released


def test_evidence_arriving_before_worker_starts_fails_without_unbound_plan(client):
    case_id = _case(client)
    run = analysis_runs.create(case_id)
    response = client.post(f"/cases/{case_id}/evidence", files={"file": (
        "next.json", b'{"host":"NEW-LT-02"}', "application/json")})
    assert response.json()["new_state_version"] == 2
    analysis_runs.execute(run)
    assert analysis_runs.read(case_id, run.run_id).status == "failed"
    assert repositories.list_plans(case_id) == []
    assert client.get(f"/cases/{case_id}/states/1").json()["version"] == 1


def test_upstream_502_is_classified_without_exposing_the_provider_response(client, monkeypatch):
    case_id = _case(client)
    run = analysis_runs.create(case_id)

    def broken(*args, **kwargs):
        try:
            raise RuntimeError("HTTP 502; upstream body has private material")
        except RuntimeError as cause:
            raise planning_service.PlanningError("planner request failed", "planner") from cause

    monkeypatch.setattr(planning_service, "run_planning", broken)
    analysis_runs.execute(run)
    result = analysis_runs.read(case_id, run.run_id)
    assert result.status == "failed"
    assert result.error == "planner request failed (upstream HTTP 502)"
