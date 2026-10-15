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
from app.schemas.agent_decision_trace import TraceStep, TraceStepDraft
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
    trace: Callable[[TraceStepDraft], None] | None = None,
) -> dict[str, Any]:
    """Run the planner for a case and persist the resulting plan + actions."""
    state_started = datetime.now(timezone.utc)
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
    if trace:
        completed = datetime.now(timezone.utc)
        trace(TraceStepDraft(
            step=TraceStep.LOADING_STATE,
            message="Loaded the exact incident-state snapshot for this run.",
            started_at=state_started,
            completed_at=completed,
            duration_ms=max(0, int((completed - state_started).total_seconds() * 1000)),
            evidence_ids=sorted({item for event in state.timeline for item in event.evidence_ids}),
            decision_summary=f"Loaded State v{state.version} without mutating history.",
        ))

    guidance_started = datetime.now(timezone.utc)
    if progress:
        progress("loading_guidance", state.version)
    guidance = load_guidance()
    adapter = get_planner_adapter()
    identity = adapter.identity if isinstance(getattr(adapter, "identity", None), PlannerIdentity) else PlannerIdentity(kind="unknown", adapter=type(adapter).__name__)
    if trace:
        completed = datetime.now(timezone.utc)
        trace(TraceStepDraft(
            step=TraceStep.LOADING_GUIDANCE,
            message="Loaded approved guidance and selected the configured planner.",
            started_at=guidance_started,
            completed_at=completed,
            duration_ms=max(0, int((completed - guidance_started).total_seconds() * 1000)),
            guidance_ids=sorted(str(rule.get("rule_id")) for rule in guidance.get("policy_rules", []) if rule.get("rule_id")),
            decision_summary=f"Selected {identity.kind} planner adapter.",
            planner_kind=identity.kind,
            planner_adapter=identity.adapter,
            planner_model=identity.model,
        ))
        setter = getattr(adapter, "set_trace_callback", None)
        if callable(setter):
            setter(trace)
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
    filtered_targets = 0
    filtered_policy_refs = 0
    for proposed in proposal.actions:
        if proposed.target_id not in entity_ids:
            filtered_targets += 1
            continue
        original_ref_count = len(proposed.policy_refs)
        proposed.policy_refs = [
            ref for ref in proposed.policy_refs if ref in pack_rule_ids
        ]
        filtered_policy_refs += original_ref_count - len(proposed.policy_refs)
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
    if trace:
        completed = datetime.now(timezone.utc)
        trace(TraceStepDraft(
            step=TraceStep.VALIDATE_PROPOSAL,
            message="Applied backend state, target and policy-reference checks.",
            started_at=completed,
            completed_at=completed,
            output_refs=[action["action_id"] for action in actions],
            decision_summary=f"Accepted {len(actions)} action(s); filtered {filtered_targets} action(s) with unknown targets.",
            validation_summary=f"Removed {filtered_policy_refs} unknown policy reference(s).",
            planner_kind=identity.kind,
            planner_adapter=identity.adapter,
            planner_model=identity.model,
        ))
        trace(TraceStepDraft(
            step=TraceStep.PERSIST_PLAN,
            message="Persisted the state-bound plan and accepted actions.",
            started_at=completed,
            completed_at=datetime.now(timezone.utc),
            output_refs=[plan_id, *[action["action_id"] for action in actions]],
            decision_summary=f"Stored plan {plan_id} on State v{state.version}.",
            planner_kind=identity.kind,
            planner_adapter=identity.adapter,
            planner_model=identity.model,
        ))
    return {**plan_doc, "actions": actions}
