"""Pure projection over reviews, approvals, results and selected audit events."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.schemas.investigation_activity import ActivityEventType, InvestigationActivityEvent

_REVIEW_EVENT = {
    "note": ActivityEventType.REVIEW_NOTE,
    "confirm": ActivityEventType.REVIEW_CONFIRMED,
    "dispute": ActivityEventType.REVIEW_DISPUTED,
    "request_more_evidence": ActivityEventType.EVIDENCE_REQUESTED,
    "sign_off": ActivityEventType.SIGNED_OFF,
}


def _time(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def project_activity(
    reviews: list[dict[str, Any]],
    approvals: list[dict[str, Any]],
    results: list[dict[str, Any]],
    audits: list[dict[str, Any]],
    actions: list[dict[str, Any]],
) -> list[InvestigationActivityEvent]:
    actions_by_id = {str(item.get("action_id")): item for item in actions if item.get("action_id")}
    rows: list[InvestigationActivityEvent] = []

    for review in reviews:
        review_id = str(review.get("review_id") or "")
        review_type = str(review.get("review_type") or "note")
        rows.append(InvestigationActivityEvent(
            event_id=f"ACTIVITY-REVIEW-{review_id}",
            timestamp=_time(review.get("created_at")),
            actor_type="analyst",
            actor=review.get("analyst"),
            role=review.get("analyst_role"),
            event_type=_REVIEW_EVENT.get(review_type, ActivityEventType.REVIEW_NOTE),
            target_type=str(review.get("target_type") or "case"),
            target_id=review.get("target_id"),
            state_version=review.get("state_version"),
            plan_id=review.get("target_id") if review.get("target_type") == "plan" else None,
            summary=f"Analyst {review_type.replace('_', ' ')} review recorded.",
            reason=review.get("comment"),
            references=[review_id] if review_id else [],
        ))

    for approval in approvals:
        approval_id = str(approval.get("approval_id") or "")
        action_id = str(approval.get("action_id") or "")
        action = actions_by_id.get(action_id, {})
        proposal = action.get("proposal") if isinstance(action.get("proposal"), dict) else {}
        decision = str(approval.get("decision") or "")
        rows.append(InvestigationActivityEvent(
            event_id=f"ACTIVITY-APPROVAL-{approval_id}",
            timestamp=_time(approval.get("created_at")),
            actor_type="analyst",
            actor=approval.get("analyst"),
            role=approval.get("approver_role"),
            event_type=ActivityEventType.ACTION_REJECTED if decision == "rejected" else ActivityEventType.ACTION_APPROVED,
            target_type="action",
            target_id=action_id or None,
            state_version=approval.get("state_version"),
            plan_id=action.get("plan_id"),
            action_id=action_id or None,
            summary=f"Action {action_id or 'with unrecorded ID'} was {decision or 'decided'}.",
            reason=approval.get("reason") or None,
            outcome=decision or None,
            references=[item for item in (approval_id, action_id, action.get("plan_id")) if item],
            action_name=proposal.get("tool_name"),
            action_target=proposal.get("target_id"),
            replacement_plan_id=None,
        ))

    for result in results:
        execution_id = str(result.get("execution_id") or "")
        action_id = str(result.get("action_id") or "")
        action = actions_by_id.get(action_id, {})
        base = {
            "timestamp": _time(result.get("simulated_at") or result.get("created_at")),
            "actor_type": "system",
            "actor": "Bounded simulator",
            "target_type": "action",
            "target_id": action_id or None,
            "state_version": action.get("based_on_state_version"),
            "plan_id": action.get("plan_id"),
            "action_id": action_id or None,
            "references": [item for item in (execution_id, action_id, action.get("plan_id")) if item],
            "action_name": result.get("tool_name"),
            "action_target": result.get("target_id"),
        }
        execution_status = str(result.get("execution_status") or "unknown")
        validation_status = str(result.get("validation_status") or "unknown")
        rows.append(InvestigationActivityEvent(
            event_id=f"ACTIVITY-EXECUTION-{execution_id}",
            event_type=ActivityEventType.ACTION_EXECUTED,
            summary=f"Simulated action {action_id or 'with unrecorded ID'} executed.",
            outcome=execution_status,
            **base,
        ))
        rows.append(InvestigationActivityEvent(
            event_id=f"ACTIVITY-VALIDATION-{execution_id}",
            event_type=ActivityEventType.ACTION_VALIDATED,
            summary=f"Simulated action {action_id or 'with unrecorded ID'} validation recorded.",
            reason=result.get("observed_effect") or None,
            outcome=validation_status,
            **base,
        ))

    for audit in audits:
        event_type = str(audit.get("event_type") or "")
        if event_type not in {"state_version_created", "plan_created"}:
            continue
        details = audit.get("details") if isinstance(audit.get("details"), dict) else {}
        audit_id = str(audit.get("audit_id") or "")
        is_plan = event_type == "plan_created"
        plan_id = details.get("plan_id") if is_plan else None
        rows.append(InvestigationActivityEvent(
            event_id=f"ACTIVITY-AUDIT-{audit_id}",
            timestamp=_time(audit.get("timestamp")),
            actor_type="agent" if is_plan else "system",
            actor="Planner service" if is_plan else "Incident state manager",
            event_type=ActivityEventType.PLAN_CREATED if is_plan else ActivityEventType.STATE_VERSION_CREATED,
            target_type="plan" if is_plan else "state",
            target_id=plan_id or (str(details.get("version")) if details.get("version") is not None else None),
            state_version=details.get("version"),
            plan_id=plan_id,
            summary="State-bound response plan stored." if is_plan else "Immutable incident-state version created.",
            references=[item for item in (audit_id, plan_id) if item],
        ))

    return sorted(rows, key=lambda row: (
        row.timestamp is None,
        row.timestamp or datetime.max.replace(tzinfo=timezone.utc),
        row.event_id,
    ))
