"""Typed read model for incident chronology."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

TimelineRelationshipStatus = Literal["observed", "inferred"]
TimelineRelevance = Literal["attack", "defensive", "context", "observed", "unknown"]
TimelineSeverity = Literal["low", "medium", "high", "critical"]


class StructuredTimelineEvent(BaseModel):
    event_id: str
    occurred_at: datetime | None = None
    event_type: str
    source: str | None = None
    actor: str | None = None
    subject: str | None = None
    action: str | None = None
    result: str | None = None
    summary: str
    details: dict[str, str] = Field(default_factory=dict)
    evidence_ids: list[str] = Field(default_factory=list)
    entity_ids: list[str] = Field(default_factory=list)
    relationship_status: TimelineRelationshipStatus = "observed"
    relevance: TimelineRelevance = "unknown"
    severity: TimelineSeverity | None = None
    raw_description: str = ""


class TimelineResponse(BaseModel):
    case_id: str
    state_version: int
    events: list[StructuredTimelineEvent] = Field(default_factory=list)
