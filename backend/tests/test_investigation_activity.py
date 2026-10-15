"""Unified investigation activity projection tests."""
from app.database import repositories
from app.services import audit_service
from app.services.investigation_activity import project_activity


def test_projection_preserves_analyst_role_rejection_reason_and_result():
    actions = [{
        "action_id": "ACT-1", "plan_id": "PLAN-1", "based_on_state_version": 2,
        "proposal": {"tool_name": "isolate_host", "target_id": "HOST::SYNTH"},
    }]
    rows = project_activity(
        reviews=[{
            "review_id": "REVIEW-1", "created_at": "2026-01-01T00:00:00Z",
            "review_type": "request_more_evidence", "target_type": "case", "target_id": None,
            "analyst": "A. Analyst", "analyst_role": "SOC analyst", "comment": "Need identity logs.", "state_version": 2,
        }],
        approvals=[{
            "approval_id": "APV-1", "created_at": "2026-01-02T00:00:00Z", "action_id": "ACT-1",
            "state_version": 2, "decision": "rejected", "analyst": "R. Reviewer",
            "approver_role": "it_manager", "reason": "Host owner is not established.",
        }],
        results=[{
            "execution_id": "EXEC-1", "created_at": "2026-01-03T00:00:00Z", "action_id": "ACT-1",
            "tool_name": "isolate_host", "target_id": "HOST::SYNTH", "execution_status": "completed",
            "validation_status": "ineffective", "observed_effect": "Synthetic host remained reachable.",
        }],
        audits=[],
        actions=actions,
    )
    assert [row.event_type.value for row in rows] == [
        "evidence_requested", "action_rejected", "action_executed", "action_validated"
    ]
    rejected = rows[1]
    assert rejected.actor == "R. Reviewer" and rejected.role == "it_manager"
    assert rejected.reason == "Host owner is not established."
    assert rejected.action_name == "isolate_host" and rejected.action_target == "HOST::SYNTH"
    assert rejected.plan_id == "PLAN-1" and rejected.state_version == 2
    assert rejected.replacement_plan_id is None
    assert rows[-1].outcome == "ineffective"


def test_projection_sort_is_stable_and_does_not_infer_replacement():
    rows = project_activity(
        reviews=[],
        approvals=[{
            "approval_id": "APV-Z", "created_at": None, "action_id": "ACT-OLD",
            "state_version": 1, "decision": "rejected", "analyst": "A", "approver_role": "soc_analyst",
        }],
        results=[],
        audits=[{
            "audit_id": "AUDIT-A", "event_type": "plan_created", "timestamp": None,
            "details": {"plan_id": "PLAN-LATER"},
        }],
        actions=[{"action_id": "ACT-OLD", "plan_id": "PLAN-OLD", "proposal": {}}],
    )
    assert [row.event_id for row in rows] == sorted(row.event_id for row in rows)
    assert all(row.replacement_plan_id is None for row in rows)


def test_activity_endpoint_is_read_only_and_handles_unknown_case(client):
    case = client.post("/cases", json={"title": "Synthetic activity case"}).json()
    case_id = case["case_id"]
    repositories.add_analyst_review(case_id, "REVIEW-1", {
        "review_id": "REVIEW-1", "case_id": case_id, "target_type": "case", "target_id": None,
        "review_type": "confirm", "analyst": "A. Analyst", "analyst_role": "SOC analyst",
        "comment": "Current synthetic evidence reviewed.", "state_version": 0, "plan_version": None,
        "created_at": "2026-01-01T00:00:00Z",
    })
    before = audit_service.list_events(case_id)
    response = client.get(f"/cases/{case_id}/investigation-activity")
    assert response.status_code == 200
    assert response.json()["events"][0]["event_type"] == "review_confirmed"
    assert audit_service.list_events(case_id) == before
    assert client.get("/cases/CASE-MISSING/investigation-activity").status_code == 404
