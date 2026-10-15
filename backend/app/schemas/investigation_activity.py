"""Read-only projection of authoritative analyst and system activity."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class ActivityEventType(str, Enum):
    REVIEW_NOTE = "review_note"
    REVIEW_CONFIRMED = "review_confirmed"
    REVIEW_DISPUTED = "review_disputed"
    EVIDENCE_REQUESTED = "evidence_requested"
    SIGNED_OFF = "signed_off"
    ACTION_APPROVED = "action_approved"
    ACTION_REJECTED = "action_rejected"
    ACTION_EXECUTED = "action_executed"
    ACTION_VALIDATED = "action_validated"
    STATE_VERSION_CREATED = "state_version_created"
    PLAN_CREATED = "plan_created"


class InvestigationActivityEvent(BaseModel):
    event_id: str
    timestamp: datetime | None = None
    actor_type: Literal["analyst", "agent", "system"]
    actor: str | None = None
    role: str | None = None
    event_type: ActivityEventType
    target_type: str
    target_id: str | None = None
    state_version: int | None = None
    plan_id: str | None = None
    action_id: str | None = None
    summary: str
    reason: str | None = None
    outcome: str | None = None
    references: list[str] = Field(default_factory=list)
    action_name: str | None = None
    action_target: str | None = None
    replacement_plan_id: str | None = None


class InvestigationActivityResponse(BaseModel):
    case_id: str
    events: list[InvestigationActivityEvent] = Field(default_factory=list)
