"""Planner adapter: the backend's boundary with the AI planner (Airil).

Contract:

    generate_plan(incident_state, approved_guidance) -> PlanProposal

The backend validates every id in the returned proposal (state version,
targets, evidence, tool names, policy refs) BEFORE persisting it, and never
treats the proposal as authorization.

``FakePlannerAdapter`` lets the backend be developed and integration-tested
without DeepSeek or LangGraph. Airil's real adapter (LangGraph + DeepSeek
V4.1 Flash, model ``deepseek-v4.1-flash``) drops in behind the same interface
later. These are defined now so later milestones build against a stable
shape; Milestone 1 does not call them.
"""
from __future__ import annotations

from typing import Protocol

from app.schemas.incident_state import IncidentState
from app.schemas.plan import (
    PlanAnalysis,
    PlannerIdentity,
    PlanProposal,
    ProposedAction,
    ProposedFinding,
    Stage,
)


class PlannerAdapter(Protocol):
    @property
    def identity(self) -> PlannerIdentity: ...

    def generate_plan(
        self, incident_state: IncidentState, approved_guidance: dict | None = None
    ) -> PlanProposal: ...


class FakePlannerAdapter:
    """Deterministic planner for integration testing without an LLM."""

    @property
    def identity(self) -> PlannerIdentity:
        return PlannerIdentity(
            kind="deterministic",
            adapter=type(self).__name__,
            model="deterministic-rules-v1",
        )

    def generate_plan(
        self, incident_state: IncidentState, approved_guidance: dict | None = None
    ) -> PlanProposal:
        hosts = [e for e in incident_state.entities if e.type.value == "host"]
        # Use the most evidenced host rather than arbitrary lexical order:
        # multi-host synthetic batches include benign background workstations.
        host = sorted(hosts, key=lambda e: (-len(e.evidence_ids), e.id))[0] if hosts else None
        actions: list[ProposedAction] = []
        # A signed process launched by an administrator-created scheduled task
        # warrants verification before disruption in the synthetic backup case.
        # This does not weaken the backend's role/evidence policy checks.
        needs_verification = (
            any("scheduled_task_created" in e.description for e in incident_state.timeline)
            and any("signed=true" in e.description for e in incident_state.timeline)
        )
        if host is not None and not needs_verification:
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
        # Deterministic synthetic analysis derived only from stored timeline
        # records. This exercises the same persisted contract as the live
        # planner without changing its prompts or validation path.
        findings = [
            ProposedFinding(summary=event.description, evidence_ids=event.evidence_ids,
                            confidence=0.6)
            for event in incident_state.timeline if event.evidence_ids
        ]
        signal = any("network_upload" in event.description for event in incident_state.timeline)
        summary = (
            f"Stored evidence includes network upload activity involving {host.name}; "
            "the evidence-linked findings require analyst review."
            if signal and host
            else (
                f"Stored evidence produced {len(findings)} evidence-linked observation(s); "
                "no supported incident classification was established."
                if findings
                else ""
            )
        )
        return PlanProposal(
            based_on_state_version=incident_state.version,
            stage=Stage.CONTAINMENT,
            actions=actions,
            analysis=PlanAnalysis(
                incident_type="other" if signal else "",
                summary=summary,
                scope=f"Primary observed host: {host.name}" if host else "",
                severity="medium" if signal else "",
                confidence=0.6 if signal else 0.0,
                findings=findings,
                attack_techniques=incident_state.attack_mapping,
            ),
        )
