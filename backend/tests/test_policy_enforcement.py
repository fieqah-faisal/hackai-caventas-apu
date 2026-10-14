"""Deterministic policy enforcement tests (BL-032/BL-018/BL-019/POL-01).

Covers role/asset/evidence/sequencing enforcement at approval and execution,
plus the pure policy_service helpers. All synthetic; no live LLM, no real infra.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.ai.langgraph_planner import load_guidance
from app.services import policy_service as ps

GUIDANCE = load_guidance()


# --- pure helpers ---------------------------------------------------------

def test_asset_resolution_user_device_and_server():
    assert ps.asset_type_of(GUIDANCE, "HOST::SALES-LT-07") == "user_device"
    assert ps.asset_type_of(GUIDANCE, "HOST::FS-01") == "server"


def test_required_role_by_asset_type():
    assert ps.required_approver(GUIDANCE, "isolate_host", "user_device")[0] == "soc_analyst"
    assert ps.required_approver(GUIDANCE, "isolate_host", "server")[0] == "it_manager"
    assert ps.required_approver(GUIDANCE, "isolate_host", "data_store")[0] == "it_manager"


def test_unknown_asset_fails_closed_for_asset_specific_rule():
    r = ps.evaluate_approval("isolate_host", "HOST::MKT-LT-11", "soc_analyst", guidance=GUIDANCE)
    assert not r.ok
    assert r.checks[0].code == "asset_unresolved"


def test_role_seniority():
    assert ps.role_satisfies("it_manager", "soc_analyst")
    assert not ps.role_satisfies("soc_analyst", "it_manager")
    assert ps.role_satisfies("soc_analyst", "soc_analyst")


def test_empty_evidence_rejected_without_touching_repo():
    called = []
    r = ps.valid_evidence_refs([], lambda c, e: called.append(e) or True, "C")
    assert not r.ok and r.code == "no_evidence"
    assert called == []  # empty list must not pass by vacuous iteration


def test_nonexistent_evidence_rejected():
    r = ps.valid_evidence_refs(["EV-1"], lambda c, e: False, "C")
    assert not r.ok and r.code == "evidence_missing"


def test_preservation_sequencing():
    none_yet = ps.preservation_satisfied("reimage_host", "HOST::SALES-LT-07", [])
    assert not none_yet.ok and none_yet.rule_ids == ["POL-01"]
    done = ps.preservation_satisfied("reimage_host", "HOST::SALES-LT-07", [{
        "tool_name": "preserve_evidence", "target_id": "HOST::SALES-LT-07",
        "execution_status": "completed", "validation_status": "effective",
    }])
    assert done.ok
    # a merely-run-but-ineffective preservation does NOT satisfy POL-01
    ineffective = ps.preservation_satisfied("reimage_host", "HOST::SALES-LT-07", [{
        "tool_name": "preserve_evidence", "target_id": "HOST::SALES-LT-07",
        "execution_status": "failed", "validation_status": "ineffective",
    }])
    assert not ineffective.ok


# --- approval API role enforcement ---------------------------------------

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "planner_smoke_evidence.json"
PLANNER_PATH = "app.services.planning_service.get_planner_adapter"
SIMULATOR_PATH = "app.services.execution_service.get_simulator_adapter"


def _plan_first_action(client, monkeypatch, host="SALES-LT-07", account="farah"):
    from app.ai.planner_adapter import FakePlannerAdapter
    from app.simulator.simulator_adapter import FakeSimulatorAdapter
    monkeypatch.setattr(PLANNER_PATH, lambda: FakePlannerAdapter())
    monkeypatch.setattr(SIMULATOR_PATH, lambda: FakeSimulatorAdapter())
    case_id = client.post("/cases", json={"title": "policy"}).json()["case_id"]
    import json
    records = [{
        "event_time": "2026-10-04T21:42:30+08:00", "event_type": "network_upload",
        "host": host, "account": account, "destination_ip": "203.0.113.45", "bytes": 2400000,
    }]
    client.post(f"/cases/{case_id}/evidence",
                files={"file": ("b.json", json.dumps(records).encode(), "application/json")})
    plan = client.post(f"/cases/{case_id}/runs").json()
    assert plan["actions"], "fake planner should propose isolate_host on the host"
    return case_id, plan["actions"][0]["action_id"]


def _decide(client, case_id, action_id, role, decision="approve"):
    return client.post(f"/cases/{case_id}/actions/{action_id}/decision",
                       json={"decision": decision, "analyst": "aida", "approver_role": role})


def test_soc_analyst_approves_user_device_isolation(client, monkeypatch):
    case_id, action_id = _plan_first_action(client, monkeypatch, host="SALES-LT-07")
    resp = _decide(client, case_id, action_id, "soc_analyst")
    assert resp.status_code == 200, resp.text
    assert resp.json()["approval"]["approver_role"] == "soc_analyst"
    assert resp.json()["approval"]["required_role"] == "soc_analyst"


def test_soc_analyst_rejected_for_server_isolation(client, monkeypatch):
    case_id, action_id = _plan_first_action(client, monkeypatch, host="FS-01")
    resp = _decide(client, case_id, action_id, "soc_analyst")
    assert resp.status_code == 403, resp.text
    assert "it_manager" in resp.json()["detail"]


def test_it_manager_approves_server_isolation(client, monkeypatch):
    case_id, action_id = _plan_first_action(client, monkeypatch, host="FS-01")
    resp = _decide(client, case_id, action_id, "it_manager")
    assert resp.status_code == 200, resp.text
    assert resp.json()["approval"]["required_role"] == "it_manager"


def test_policy_citation_cannot_bypass_backend_enforcement(client, monkeypatch):
    """Even if the stored action cites POL-04, a server target still needs
    it_manager (backend derives policy from the asset, not the citation)."""
    case_id, action_id = _plan_first_action(client, monkeypatch, host="FS-01")
    from app.database import repositories
    action = repositories.get_action(case_id, action_id)
    action["proposal"]["policy_refs"] = ["POL-04"]  # cite the lax rule
    repositories.update_action(case_id, action_id, action)
    resp = _decide(client, case_id, action_id, "soc_analyst")
    assert resp.status_code == 403, "citation must not override asset-derived policy"


# --- execution enforcement ------------------------------------------------

def _approved(client, monkeypatch, host="SALES-LT-07", role="soc_analyst"):
    case_id, action_id = _plan_first_action(client, monkeypatch, host=host)
    assert _decide(client, case_id, action_id, role).status_code == 200
    return case_id, action_id


def test_execute_rejects_action_without_evidence(client, monkeypatch):
    case_id, action_id = _approved(client, monkeypatch)
    from app.database import repositories
    action = repositories.get_action(case_id, action_id)
    action["proposal"]["evidence_ids"] = []  # strip evidence post-approval
    repositories.update_action(case_id, action_id, action)
    resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert resp.status_code == 409
    assert "evidence" in resp.json()["detail"].lower()


def test_execute_rejects_nonexistent_evidence(client, monkeypatch):
    case_id, action_id = _approved(client, monkeypatch)
    from app.database import repositories
    action = repositories.get_action(case_id, action_id)
    action["proposal"]["evidence_ids"] = ["EV-DOES-NOT-EXIST"]
    repositories.update_action(case_id, action_id, action)
    resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert resp.status_code == 409
    assert "not found" in resp.json()["detail"].lower()


def test_reimage_blocked_before_preservation(client, monkeypatch):
    """POL-01: reimage_host cannot execute without an effective prior
    preserve_evidence on the same target."""
    from app.ai.planner_adapter import FakePlannerAdapter
    from app.simulator.simulator_adapter import FakeSimulatorAdapter
    from app.database import repositories
    monkeypatch.setattr(PLANNER_PATH, lambda: FakePlannerAdapter())
    monkeypatch.setattr(SIMULATOR_PATH, lambda: FakeSimulatorAdapter())
    import json
    case_id = client.post("/cases", json={"title": "reimage"}).json()["case_id"]
    records = [{"event_time": "2026-10-04T21:40:00+08:00", "event_type": "process_start",
                "host": "SALES-LT-07", "account": "farah", "process": "x.exe"}]
    client.post(f"/cases/{case_id}/evidence",
                files={"file": ("b.json", json.dumps(records).encode(), "application/json")})
    plan = client.post(f"/cases/{case_id}/runs").json()
    action_id = plan["actions"][0]["action_id"]
    # Rewrite the proposed action into a reimage_host on the host (it_manager, POL-06).
    action = repositories.get_action(case_id, action_id)
    target = action["proposal"]["target_id"]
    action["proposal"]["tool_name"] = "reimage_host"
    repositories.update_action(case_id, action_id, action)
    assert _decide(client, case_id, action_id, "it_manager").status_code == 200
    resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert resp.status_code == 409
    assert "preservation must complete" in resp.json()["detail"].lower()
    # the blocked attempt is audited and no result was created
    events = [e["event_type"] for e in client.get(f"/cases/{case_id}/audit").json()]
    assert "action_blocked" in events
    assert not repositories.list_action_results(case_id)


def test_reimage_allowed_after_valid_preservation(client, monkeypatch):
    from app.database import repositories
    case_id, action_id = _approved(client, monkeypatch, host="SALES-LT-07", role="it_manager")
    target = repositories.get_action(case_id, action_id)["proposal"]["target_id"]
    # Record a successful preservation for the target, then a reimage.
    repositories.add_action_result(case_id, "EXEC-PRESERVE", {
        "execution_id": "EXEC-PRESERVE", "case_id": case_id, "action_id": "ACT-PRE",
        "tool_name": "preserve_evidence", "target_id": target,
        "execution_status": "completed", "validation_status": "effective",
    })
    action = repositories.get_action(case_id, action_id)
    action["proposal"]["tool_name"] = "reimage_host"
    repositories.update_action(case_id, action_id, action)
    resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert resp.status_code == 200, resp.text


def test_stale_approval_still_requires_replanning(client, monkeypatch):
    """Preserved GAS-lite behaviour: new evidence invalidates the v1 approval."""
    case_id, action_id = _approved(client, monkeypatch)
    import json
    client.post(f"/cases/{case_id}/evidence",
                files={"file": ("b2.json", json.dumps([{
                    "event_time": "2026-10-04T22:00:00+08:00", "event_type": "process_start",
                    "host": "SALES-LT-07", "account": "farah", "process": "y.exe"}]).encode(),
                    "application/json")})
    resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert resp.status_code == 409
    assert "newer incident state" in resp.json()["detail"].lower()
