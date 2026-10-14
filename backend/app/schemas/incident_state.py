"""Pydantic schemas for the STAIR-inspired versioned incident state.

GAS-lite (BL-024, DEC-010) enriches this schema so a single versioned
snapshot can hold the whole incident picture: an entity/relationship graph
with provenance, the reconstructed timeline, the response situation and the
links out to actions, outcomes and the continuous report. Every field added
by GAS-lite is OPTIONAL or DEFAULTED so snapshots stored before the slice,
the existing ``GET /cases/{id}/state`` consumers, and the current tests keep
working unchanged.
"""
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
    SESSION = "session"
    OTHER = "other"


class RelationshipType(str, Enum):
    """Closed allowlist of persistent graph relations (DEC-010).

    Typing ``Relationship.relation`` as this enum rejects any out-of-allowlist
    value at the schema layer. Backward-compatible: the only value the pre-slice
    ``state_manager`` ever wrote is ``logged_into``, which is a member here, so
    existing stored relationships deserialize unchanged.
    """

    LOGGED_INTO = "logged_into"
    AUTHENTICATED_FROM = "authenticated_from"
    CONNECTED_TO = "connected_to"
    RESOLVED_DOMAIN = "resolved_domain"
    EXECUTED_ON = "executed_on"
    FOUND_ON = "found_on"
    SESSION_USED_BY = "session_used_by"
    ACTION_ATTEMPTED_ON = "action_attempted_on"
    EVIDENCE_PRESERVED = "evidence_preserved"
    SESSION_REVOKED = "session_revoked"
    HOST_ISOLATED = "host_isolated"


class RelationshipCategory(str, Enum):
    CONTEXT = "context"   # benign/contextual association
    ATTACK = "attack"     # adversary activity
    RESPONSE = "response"  # defender action edge (carries action/exec refs)


class RelationshipStatus(str, Enum):
    OBSERVED = "observed"   # directly supported by evidence
    INFERRED = "inferred"   # hypothesized, not directly observed


class ResponseFocus(str, Enum):
    ASSESSMENT = "assessment"
    PRESERVATION = "preservation"
    CONTAINMENT = "containment"
    ERADICATION = "eradication"
    HARDENING = "hardening"
    RESTORATION = "restoration"


class RoutingTransition(str, Enum):
    INITIAL = "initial"
    STAY = "stay"
    ADVANCE = "advance"
    ROLLBACK = "rollback"
    RE_ENTER = "re_enter"


class CreatedFrom(str, Enum):
    """Why a new state version was created. Core enforces these three values;
    the full trigger vocabulary (DEC-010) is reserved for follow-on."""

    INITIAL_RECONSTRUCTION = "initial_reconstruction"
    EVIDENCE_UPLOAD = "evidence_upload"
    ACTION_RESULT = "action_result"


class ReportStatus(str, Enum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    FINALIZED = "finalized"


class Entity(BaseModel):
    id: str
    type: EntityType
    name: str
    attributes: dict[str, Any] = Field(default_factory=dict)
    # GAS-lite enrichment (all optional/defaulted):
    evidence_ids: list[str] = Field(default_factory=list)
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    # Operational/security state. Documented vocabulary (default None = unknown):
    #   unknown | compromised | contained | isolated | recovered
    # Only a validated-EFFECTIVE action result changes this (DEC-010, R12).
    condition: Optional[str] = None


class Relationship(BaseModel):
    source: str
    relation: RelationshipType
    target: str
    evidence_ids: list[str] = Field(default_factory=list)
    status: RelationshipStatus = RelationshipStatus.OBSERVED
    # GAS-lite enrichment (all optional/defaulted):
    id: Optional[str] = None               # deterministic REL::relation::src::tgt
    category: RelationshipCategory = RelationshipCategory.CONTEXT
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    action_id: Optional[str] = None        # response edges only
    execution_id: Optional[str] = None     # response edges only


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

    # --- GAS-lite provenance (DEC-010; all optional/defaulted) ---
    parent_version: Optional[int] = None
    change_reason: Optional[str] = None
    created_from: Optional[CreatedFrom] = None

    # --- GAS-lite response situation (CARRIED in Core; populated in follow-on) ---
    observed_response_status: Optional[str] = None
    recommended_response_focus: Optional[ResponseFocus] = None
    response_objective: Optional[str] = None
    response_prerequisites: list[str] = Field(default_factory=list)
    routing_rationale: Optional[str] = None
    routing_evidence_ids: list[str] = Field(default_factory=list)
    routing_confidence: Optional[float] = None
    routing_transition: Optional[RoutingTransition] = None

    # --- GAS-lite report status (CARRIED in Core; invalidation computed in follow-on) ---
    report_sections_complete: list[str] = Field(default_factory=list)
    report_sections_pending: list[str] = Field(default_factory=list)
    report_sections_invalidated: list[str] = Field(default_factory=list)
    latest_report_id: Optional[str] = None
    latest_report_version: Optional[str] = None
    report_status: Optional[ReportStatus] = None


class StateVersionMeta(BaseModel):
    """Lightweight metadata for one stored state version (state-history list).

    Does not carry the full graph body; the detail endpoint returns the whole
    IncidentState snapshot instead.
    """

    version: int
    parent_version: Optional[int] = None
    created_from: Optional[CreatedFrom] = None
    change_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    entity_count: int = 0
    relationship_count: int = 0
    timeline_count: int = 0