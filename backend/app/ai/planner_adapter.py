"""Planner adapter: the backend's boundary with the AI planner (Airil).

Contract:

    generate_plan(incident_state, approved_guidance) -> PlanProposal

The backend validates every id in the returned proposal (state version,
targets, evidence, tool names, policy refs) BEFORE persisting it, and never
treats the proposal as authorization.

``FakePlannerAdapter`` lets the backend be developed and integration-tested
without DeepSeek or LangGraph. Airil's real adapter (LangGraph + DeepSeek
V4 Pro, model ``deepseek-v4-pro``) drops in behind the same interface
later. These are defined now so later milestones build against a stable
shape; Milestone 1 does not call them.
"""
from __future__ import annotations

from typing import Protocol

from app.schemas.incident_state import IncidentState
from app.schemas.plan import PlanProposal, ProposedAction, Stage


class PlannerAdapter(Protocol):
    def generate_plan(
        self, incident_state: IncidentState, approved_guidance: dict | None = None
    ) -> PlanProposal: ...


class FakePlannerAdapter:
    """Deterministic planner for integration testing without an LLM."""

    def generate_plan(
        self, incident_state: IncidentState, approved_guidance: dict | None = None
    ) -> PlanProposal:
        host = next(
            (e for e in incident_state.entities if e.type.value == "host"), None
        )
        actions: list[ProposedAction] = []
        if host is not None:
            ev_ids = [
                ev_id
                for rel in incident_state.relationships
                if rel.target == host.id
                for ev_id in rel.evidence_ids
            ]
            actions.append(
                ProposedAction(
                    tool_name="isolate_host",
                    target_id=host.id,
                    evidence_ids=ev_ids,
                    rationale="Host shows suspicious activity in current state.",
                    risk="Temporary workstation connectivity loss.",
                    expected_effect="Prevent further outbound communication.",
                    validation_checks=["Verify suspicious outbound traffic stops."],
                )
            )
        return PlanProposal(
            based_on_state_version=incident_state.version,
            stage=Stage.CONTAINMENT,
            actions=actions,
        )
