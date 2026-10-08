"""Schemas for analyst decisions on proposed actions (BL-003).

Approval is created by the backend after an explicit analyst decision. It is
never derived from AI output and binds to the exact (action_id,
action_version, incident_state_version) tuple.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Decision(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"


class DecisionRequest(BaseModel):
    decision: Decision
    analyst: str = Field(min_length=1)
    reason: str = ""


class ApprovalRecord(BaseModel):
    approval_id: str
    case_id: str
    action_id: str
    action_version: int
    state_version: int
    decision: str
    analyst: str
    reason: str = ""
    created_at: datetime = Field(default_factory=_now)
