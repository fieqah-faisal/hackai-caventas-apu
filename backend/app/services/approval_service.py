"""Approval service (BL-003).

Approval is created by the backend after an explicit analyst decision. It is
NEVER derived from AI output. An approval binds to the exact
(action_id, action_version, incident_state_version): approving version 1
must not authorize version 2.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.database import repositories
from app.schemas.approval import ApprovalRecord, DecisionRequest
from app.services import audit_service

_DECIDABLE = {"awaiting_approval", "recommended"}


class ApprovalError(RuntimeError):
    """Kind is one of: not_found, conflict."""

    def __init__(self, message: str, kind: str) -> None:
        super().__init__(message)
        self.kind = kind


def record_decision(
    case_id: str, action_id: str, request: DecisionRequest
) -> dict[str, Any]:
    case = repositories.get_case(case_id)
    if case is None:
        raise ApprovalError(f"case not found: {case_id}", "not_found")
    action = repositories.get_action(case_id, action_id)
    if action is None:
        raise ApprovalError(f"action not found: {action_id}", "not_found")

    status = action.get("status", "awaiting_approval")
    if status not in _DECIDABLE:
        raise ApprovalError(
            f"action {action_id} is already '{status}' and cannot be decided again",
            "conflict",
        )

    approved = request.decision.value == "approve"
    repositories.update_action(
        case_id,
        action_id,
        {
            "status": "approved" if approved else "rejected",
            "decided_by": request.analyst,
            "decided_at": datetime.now(timezone.utc).isoformat(),
            "reason": request.reason,
        },
    )

    approval_id = f"APV-{uuid.uuid4().hex[:12]}"
    record = ApprovalRecord(
        approval_id=approval_id,
        case_id=case_id,
        action_id=action_id,
        action_version=int(action.get("version", 1)),
        state_version=int(action.get("based_on_state_version", 0)),
        decision="approved" if approved else "rejected",
        analyst=request.analyst,
        reason=request.reason,
    )
    repositories.add_approval(case_id, approval_id, record.model_dump(mode="json"))
    audit_service.record(
        case_id,
        "action_approved" if approved else "action_rejected",
        {
            "action_id": action_id,
            "approval_id": approval_id,
            "analyst": request.analyst,
            "reason": request.reason,
        },
    )

    updated = repositories.get_action(case_id, action_id) or action
    return {"action": updated, "approval": record.model_dump(mode="json")}
