"""Planners the harness can evaluate.

- ``live``   the real LangGraph planner (needs OPENCODE_GO_API_KEY)
- ``fake``   the backend's FakePlannerAdapter (what runs without a key)
- ``oracle`` CALIBRATION ONLY: reads the ground truth and proposes it. It
             proves each checkpoint is achievable through the real backend
             (entity ids, evidence ids, validation) and that the scorer
             gives full marks for a correct plan. It is not an agent.
- ``unsafe`` CALIBRATION ONLY: obeys the injected instruction, re-images
             before preserving, acts on uninvolved accounts, cites nothing.
             Every safety gate should catch it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.schemas.incident_state import IncidentState
from app.schemas.plan import PlanProposal, ProposedAction, Stage
from scenarios.conditions import select

POLICY_FOR_TOOL = {"reimage_host": "POL-01", "disable_account": "POL-02", "isolate_host": "POL-04"}


@dataclass
class RunContext:
    """What the harness knows while a scenario runs (shared with planners)."""

    scenario: dict[str, Any]
    checkpoint: Optional[dict[str, Any]] = None
    results: list[dict[str, Any]] = field(default_factory=list)
    revealed: set[str] = field(default_factory=set)
    evidence_map: dict[str, str] = field(default_factory=dict)  # EV id -> record id


def _evidence_ids(state: IncidentState) -> list[str]:
    return [e for event in state.timeline for e in event.evidence_ids]


class OraclePlanner:
    """Proposes exactly the checkpoint ground truth (calibration only)."""

    def __init__(self, context: RunContext) -> None:
        self.context = context

    def generate_plan(self, incident_state: IncidentState, approved_guidance=None) -> PlanProposal:
        ctx, cp = self.context, self.context.checkpoint
        pick = lambda items: select(items, ctx.results, ctx.revealed)  # noqa: E731
        entities = {e.id for e in incident_state.entities}
        state_evidence = set(_evidence_ids(incident_state))
        by_record: dict[str, list[str]] = {}
        for ev_id, record_id in ctx.evidence_map.items():
            if ev_id in state_evidence:
                by_record.setdefault(record_id, []).append(ev_id)

        triggers = [c["trigger"] for c in pick([c for c in cp["policy_checks"] if "trigger" in c])]
        items = pick(cp["required_actions"]) + [
            i for i in pick(cp["recommended_actions"]) if not i.get("informational")
        ]
        actions: list[ProposedAction] = []
        seen: set[tuple[str, str]] = set()
        for item in items:
            done = any(
                r.get("tool_name") in item["tools"] and r.get("target_id") in item["targets"]
                and r.get("validation_status") == "effective"
                for r in ctx.results
            )
            target = next((t for t in item["targets"] if t in entities), None)
            if done or target is None or (item["tools"][0], target) in seen:
                continue
            tool = item["tools"][0]
            seen.add((tool, target))
            cited = [ev for rid in item["key_records"] for ev in by_record.get(rid, [])]
            refs = [POLICY_FOR_TOOL[tool]] if tool in POLICY_FOR_TOOL else []
            actions.append(ProposedAction(
                tool_name=tool, target_id=target, evidence_ids=cited,
                policy_refs=refs + triggers, rationale=item["why"],
                expected_effect="See ground truth.", validation_checks=["Confirm in next batch."],
            ))
        stage_option = next(iter(pick(cp["stage"])))
        return PlanProposal(
            based_on_state_version=incident_state.version,
            stage=Stage(stage_option["preferred"][0]),
            actions=actions,
            missing_evidence=[f"{q['why']} ({q['any'][0]})" for q in pick(cp["questions"])],
        )


class UnsafePlanner:
    """Everything a planner must not do (calibration only)."""

    def __init__(self, context: RunContext) -> None:
        self.context = context

    def generate_plan(self, incident_state: IncidentState, approved_guidance=None) -> PlanProposal:
        actions = []
        for entity in incident_state.entities:
            tool = {"host": "reimage_host", "account": "disable_account"}.get(entity.type.value)
            if tool:
                actions.append(ProposedAction(tool_name=tool, target_id=entity.id,
                                              rationale="Close the case quickly."))
        return PlanProposal(
            based_on_state_version=incident_state.version,
            stage=Stage.RESTORATION,
            actions=actions,
        )


PLANNERS = ("live", "fake", "oracle", "unsafe")


def make_planner(name: str, context: RunContext):
    if name == "oracle":
        return OraclePlanner(context)
    if name == "unsafe":
        return UnsafePlanner(context)
    if name == "fake":
        from app.ai.planner_adapter import FakePlannerAdapter

        return FakePlannerAdapter()
    if name == "live":
        from app.ai.langgraph_planner import LangGraphPlannerAdapter
        from app.config import get_settings

        if not get_settings().opencode_go_api_key:
            raise SystemExit("planner 'live' needs OPENCODE_GO_API_KEY in backend/.env")
        return LangGraphPlannerAdapter()
    raise ValueError(f"unknown planner '{name}'; choose one of {PLANNERS}")
