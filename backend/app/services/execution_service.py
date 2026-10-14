"""Execution service (BL-003).

Routes approved actions to the bounded simulator. Execution is permitted
only when every safety precondition in .kiro/steering/security.md holds:
action exists, tool is in the approved catalogue, target exists, evidence
references exist, action version is current, approval matches that exact
action, and the incident state has not invalidated the proposal.

Execution requests are idempotent: re-executing an action returns the
recorded result. ``execution_status`` is stored separately from
``validation_status`` / effectiveness. Prototype note: writes are sequential
(the test fake has no transactions); idempotency is enforced by the recorded
result and unique execution ids.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.ai.langgraph_planner import load_guidance
from app.config import get_settings
from app.database import repositories
from app.schemas.incident_state import CreatedFrom
from app.services import audit_service, policy_service, state_manager
from app.simulator.simulator_adapter import BoundedSimulatorAdapter, SimulatorAdapter


class ExecutionError(RuntimeError):
    """Kind is one of: not_found, conflict."""

    def __init__(self, message: str, kind: str) -> None:
        super().__init__(message)
        self.kind = kind


def get_simulator_adapter() -> SimulatorAdapter:
    """The bounded simulator (``app/simulator``), fault profile from settings."""
    return BoundedSimulatorAdapter(profile=get_settings().simulator_profile)


def _action_status(execution_status: str, validation_status: str) -> str:
    """Map a simulator outcome onto the report-schema v1.2 action status."""
    if execution_status == "completed" and validation_status == "effective":
        return "verified"
    if execution_status == "completed" and validation_status == "not_applicable":
        return "not_applicable"
    return "failed"


def _find_result(case_id: str, action_id: str) -> dict[str, Any] | None:
    for result in repositories.list_action_results(case_id):
        if result.get("action_id") == action_id:
            return result
    return None


def execute(case_id: str, action_id: str) -> dict[str, Any]:
    case = repositories.get_case(case_id)
    if case is None:
        raise ExecutionError(f"case not found: {case_id}", "not_found")
    action = repositories.get_action(case_id, action_id)
    if action is None:
        raise ExecutionError(f"action not found: {action_id}", "not_found")

    existing = _find_result(case_id, action_id)
    if existing is not None:
        return {"action": action, "result": existing}

    if action.get("status") != "approved":
        raise ExecutionError(
            f"action is '{action.get('status')}', not approved", "conflict"
        )

    approval = next(
        (
            record
            for record in repositories.list_approvals(case_id)
            if record.get("action_id") == action_id
            and record.get("decision") == "approved"
        ),
        None,
    )
    if approval is None:
        raise ExecutionError(f"no approval found for action {action_id}", "conflict")
    if int(approval.get("action_version", 0)) != int(action.get("version", 1)):
        raise ExecutionError(
            "approval does not match the current action version", "conflict"
        )
    if int(approval.get("state_version", 0)) != int(
        case.get("current_state_version", 0)
    ):
        raise ExecutionError(
            "approval was invalidated by a newer incident state; create a new planning run and review the replacement action",
            "conflict",
        )

    proposal = action.get("proposal", {})
    tool = str(proposal.get("tool_name", ""))
    target = str(proposal.get("target_id", ""))
    if tool not in load_guidance().get("approved_tools", []):
        raise ExecutionError(
            f"tool '{tool}' is not in the approved catalogue", "conflict"
        )

    state = state_manager.get_current_state(case_id)
    if state is None or target not in {entity.id for entity in state.entities}:
        raise ExecutionError(
            f"target '{target}' is not in the current incident state", "conflict"
        )

    guidance = load_guidance()

    # BL-019: an action with no supporting evidence (or references that do not
    # exist in this case) must not execute. An empty list fails explicitly.
    evidence_check = policy_service.valid_evidence_refs(
        proposal.get("evidence_ids", []), repositories.evidence_exists, case_id
    )
    if not evidence_check.ok:
        raise ExecutionError(evidence_check.detail, "conflict")

    # Defense in depth: re-check the approver role against current policy using
    # the role recorded on the approval. Never trust the planner's policy_refs.
    acting_role = approval.get("approver_role") or action.get("decided_by_role")
    role_policy = policy_service.evaluate_approval(
        tool, target, acting_role, guidance=guidance
    )
    if not role_policy.ok:
        reason = next((c for c in role_policy.checks if not c.ok), None)
        raise ExecutionError(
            f"approval role no longer satisfies policy: "
            f"{reason.detail if reason else 'role check failed'}",
            "conflict",
        )

    # POL-01: preservation must complete (effective) for this target before a
    # re-image. Uses authoritative stored action results, not planner text.
    sequencing = policy_service.preservation_satisfied(
        tool, target, repositories.list_action_results(case_id)
    )
    if not sequencing.ok:
        audit_service.record(
            case_id,
            "action_blocked",
            {
                "action_id": action_id,
                "tool_name": tool,
                "target_id": target,
                "reason": sequencing.code,
                "rule_ids": sequencing.rule_ids,
                "detail": sequencing.detail,
            },
        )
        raise ExecutionError(sequencing.detail, "conflict")

    outcome = get_simulator_adapter().execute_action(tool, target, case_id=case_id)

    execution_id = f"EXEC-{uuid.uuid4().hex[:12]}"
    execution_status = str(outcome.get("execution_status", "unknown"))
    validation_status = str(outcome.get("validation_status", "unknown"))
    action_status = _action_status(execution_status, validation_status)
    result_doc = {
        "execution_id": execution_id,
        "case_id": case_id,
        "action_id": action_id,
        "tool_name": tool,
        "target_id": target,
        "execution_status": execution_status,
        "validation_status": validation_status,
        "observed_effect": str(outcome.get("observed_effect", "")),
        "simulated_at": outcome.get("simulated_at"),
        "services": dict(outcome.get("services") or {}),
        "side_effects": list(outcome.get("side_effects") or []),
        "result_source": "simulator",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    repositories.add_action_result(case_id, execution_id, result_doc)
    repositories.update_action(case_id, action_id, {"status": action_status})
    audit_service.record(
        case_id,
        "action_executed",
        {
            "action_id": action_id,
            "execution_id": execution_id,
            "execution_status": execution_status,
            "validation_status": validation_status,
        },
    )
    state_manager.rebuild_and_version(
        case_id,
        created_from=CreatedFrom.ACTION_RESULT,
        change_reason=f"action result {execution_id} ({tool} on {target})",
    )

    updated = repositories.get_action(case_id, action_id) or action
    return {"action": updated, "result": result_doc}
