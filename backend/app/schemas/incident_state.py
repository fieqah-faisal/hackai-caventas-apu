"""Pydantic schemas for the STAIR-inspired versioned incident state."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class EntityType(str, Enum):
    HOST = "host"
    ACCOUNT = "account"
    PROCESS = "process"
    FILE = "file"
    IP = "ip"
    DOMAIN = "domain"
    OTHER = "other"


class Entity(BaseModel):
    id: str
    type: EntityType
    name: str
    attributes: dict[str, Any] = Field(default_factory=dict)


class RelationshipStatus(str, Enum):
    OBSERVED = "observed"   # directly supported by evidence
    INFERRED = "inferred"   # hypothesized, not directly observed


class Relationship(BaseModel):
    source: str
    relation: str
    target: str
    evidence_ids: list[str] = Field(default_factory=list)
    status: RelationshipStatus = RelationshipStatus.OBSERVED


class TimelineEvent(BaseModel):
    timestamp: Optional[datetime] = None
    description: str
    evidence_ids: list[str] = Field(default_factory=list)


class Finding(BaseModel):
    summary: str
    evidence_ids: list[str] = Field(default_factory=list)


class RecoveryStatus(str, Enum):
    INVESTIGATING = "investigating"
    CONTAINING = "containing"
    ERADICATING = "eradicating"
    RECOVERING = "recovering"
    RESOLVED = "resolved"


class IncidentState(BaseModel):
    """A versioned snapshot of the incident. Never overwritten in place."""

    case_id: str
    version: int
    entities: list[Entity] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)
    timeline: list[TimelineEvent] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    attack_mapping: list[str] = Field(default_factory=list)  # MITRE ATT&CK IDs
    hypotheses: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)         # action ids
    action_results: list[str] = Field(default_factory=list)  # execution ids
    recovery_status: RecoveryStatus = RecoveryStatus.INVESTIGATING
    created_at: datetime = Field(default_factory=_now)
