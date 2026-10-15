"""Planning service: run the AI planner and persist its proposal.

The backend never treats AI output as authorization. A run stores a plan and
its proposed actions; approval is a later milestone (``approval_service``).
Safety rules are enforced here as well as inside the adapter: proposals must
reference the current state version and targets must exist in the state.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from app.ai.langgraph_planner import PlannerError, get_planner_adapter, load_guidance
from app.database import repositories
from app.schemas.plan import PlannerIdentity, StoredAction
from app.services import audit_service, state_manager


class PlanningError(RuntimeError):
    """Kind is one of: not_found, no_state, planner."""

    def __init__(self, message: str, kind: str) -> None:
        super().__init__(message)
        self.kind = kind


def run_planning(
    case_id: str,
    progress: Callable[[str, int], None] | None = None,
    expected_state_version: int | None = None,
) -> dict[str, Any]:
    """Run the planner for a case and persist the resulting plan + actions."""
    case = repositories.get_case(case_id)
    if case is None:
        raise PlanningError(f"case not found: {case_id}", "not_found")

    version = int(case.get("current_state_version", 0))
    if version < 1:
        raise PlanningError(
            "case has no incident state yet; upload evidence first", "no_state"
        )
    if expected_state_version is not None and version != expected_state_version:
        raise PlanningError("incident state changed before analysis began", "no_state")
    if progress:
        progress("loading_state", version)
    state = state_manager.get_current_state(case_id)
    if state is None:
        raise PlanningError("incident state not available", "no_state")

    if progress:
        progress("loading_guidance", state.version)
    guidance = load_guidance()
    adapter = get_planner_adapter()
    if progress:
        progress("running_planner", state.version)
    try:
        proposal = adapter.generate_plan(state, guidance)
    except PlannerError as exc:
        raise PlanningError("planner request failed", "planner") from exc

    if proposal.based_on_state_version != state.version:
        raise PlanningError(
            "planner proposal is based on a stale state version", "planner"
        )
    if progress:
        progress("persisting_plan", state.version)

    plan_id = f"PLAN-{uuid.uuid4().hex[:12]}"
    entity_ids = {entity.id for entity in state.entities}
    pack_rule_ids = {
        str(rule.get("rule_id")) for rule in guidance.get("policy_rules", [])
    }
    actions: list[dict[str, Any]] = []
    for proposed in proposal.actions:
        if proposed.target_id not in entity_ids:
            continue
        proposed.policy_refs = [
            ref for ref in proposed.policy_refs if ref in pack_rule_ids
        ]
        action_id = f"ACT-{uuid.uuid4().hex[:12]}"
        stored = StoredAction(
            action_id=action_id,
            case_id=case_id,
            plan_id=plan_id,
            version=1,
            based_on_state_version=proposal.based_on_state_version,
            proposal=proposed,
        )
        doc = stored.model_dump(mode="json")
        repositories.add_action(case_id, action_id, doc)
        actions.append(doc)

    plan_doc = {
        "plan_id": plan_id,
        "case_id": case_id,
        "based_on_state_version": proposal.based_on_state_version,
        "stage": proposal.stage.value,
        "missing_evidence": list(proposal.missing_evidence),
        "action_ids": [action["action_id"] for action in actions],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "planner": (
            adapter.identity.model_dump(mode="json")
            if isinstance(getattr(adapter, "identity", None), PlannerIdentity)
            else PlannerIdentity(
                kind="unknown", adapter=type(adapter).__name__
            ).model_dump(mode="json")
        ),
    }
    if proposal.analysis is not None:
        plan_doc["analysis"] = proposal.analysis.model_dump(mode="json")
    repositories.add_plan(case_id, plan_id, plan_doc)
    audit_service.record(
        case_id,
        "plan_created",
        {
            "plan_id": plan_id,
            "stage": plan_doc["stage"],
            "action_count": len(actions),
            "missing_evidence_count": len(plan_doc["missing_evidence"]),
        },
    )
    return {**plan_doc, "actions": actions}
