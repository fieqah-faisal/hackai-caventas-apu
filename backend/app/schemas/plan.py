"""Schemas for AI-proposed plans and actions.

Defines the contract between the backend (Raaj) and the AI planner (Airil):

    generate_plan(incident_state, approved_guidance) -> PlanProposal

IMPORTANT: AI output is a PROPOSAL only. It must never carry authoritative
approval. Approval is created separately by the backend after an analyst
decision (see approval schemas / approval_service). Milestone 1 does not
use these yet; they define the shape later milestones build against.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from typing import Literal

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Stage(str, Enum):
    ASSESSMENT = "assessment"
    PRESERVATION = "preservation"
    CONTAINMENT = "containment"
    ERADICATION = "eradication"
    HARDENING = "hardening"
    RESTORATION = "restoration"


class ProposedAction(BaseModel):
    tool_name: str
    target_id: str
    evidence_ids: list[str] = Field(default_factory=list)
    policy_refs: list[str] = Field(default_factory=list)
    rationale: str = ""
    prerequisites: list[str] = Field(default_factory=list)
    risk: str = ""
    expected_effect: str = ""
    validation_checks: list[str] = Field(default_factory=list)


class ProposedFinding(BaseModel):
    """One analysis finding; summary + the stored evidence ids that support it."""

    summary: str
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = 0.0


class PlannerIdentity(BaseModel):
    """Immutable provenance for the adapter that produced a stored plan."""

    kind: Literal["live_ai", "deterministic", "unknown"] = "unknown"
    adapter: str
    model: str | None = None


class PlanAnalysis(BaseModel):
    """The planner's persisted analysis (BL-017); the report reads this."""

    incident_type: str = ""
    summary: str = ""
    scope: str = ""
    severity: str = ""
    confidence: float = 0.0
    findings: list[ProposedFinding] = Field(default_factory=list)
    attack_techniques: list[str] = Field(default_factory=list)


class PlanProposal(BaseModel):
    """Returned by the PlannerAdapter. Validated by the backend before store."""

    based_on_state_version: int
    stage: Stage
    actions: list[ProposedAction] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    analysis: PlanAnalysis | None = None


class StoredAction(BaseModel):
    """A proposed action after backend validation and persistence.

    ``version`` lets approvals bind to an exact action revision: approving
    version 1 must never authorize version 2. ``status`` follows the report
    schema v1.2 action lifecycle.
    """

    action_id: str
    case_id: str
    plan_id: str
    version: int = 1
    based_on_state_version: int
    proposal: ProposedAction
    status: str = "awaiting_approval"
    decided_by: str | None = None
    decided_at: datetime | None = None
    reason: str | None = None
    created_at: datetime = Field(default_factory=_now)
