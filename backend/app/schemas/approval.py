"""Schemas for analyst decisions on proposed actions (BL-003).

Approval is created by the backend after an explicit analyst decision. It is
never derived from AI output and binds to the exact (action_id,
action_version, incident_state_version) tuple.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from typing import Optional

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Decision(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"


class ApproverRole(str, Enum):
    """Declared analyst role for an approval (prototype RBAC).

    This is a *declared* role on the decision request, not an authenticated
    identity: Caventas has no auth / identity-provider integration yet, so the
    role is asserted by the caller. The backend still enforces that the declared
    role satisfies the policy pack's required_approver for the action."""

    SOC_ANALYST = "soc_analyst"
    IT_MANAGER = "it_manager"
    DPO = "dpo"


class DecisionRequest(BaseModel):
    decision: Decision
    analyst: str = Field(min_length=1)
    approver_role: ApproverRole = ApproverRole.SOC_ANALYST
    reason: str = ""


class ApprovalRecord(BaseModel):
    approval_id: str
    case_id: str
    action_id: str
    action_version: int
    state_version: int
    decision: str
    analyst: str
    approver_role: str = ApproverRole.SOC_ANALYST.value
    required_role: Optional[str] = None
    reason: str = ""
    created_at: datetime = Field(default_factory=_now)
