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


class PlanProposal(BaseModel):
    """Returned by the PlannerAdapter. Validated by the backend before store."""

    based_on_state_version: int
    stage: Stage
    actions: list[ProposedAction] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)


class StoredAction(BaseModel):
    """A proposed action after backend validation and persistence.

    ``version`` lets approvals bind to an exact action revision: approving
    version 1 must never authorize version 2.
    """

    action_id: str
    case_id: str
    plan_id: str
    version: int = 1
    based_on_state_version: int
    proposal: ProposedAction
    created_at: datetime = Field(default_factory=_now)
