"""Schemas for the structured incident report (the primary deliverable).

Report JSON is generated first from stored case records, then rendered to
PDF via ReportLab. A report references a specific incident-state version.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.analyst_review import AnalystReview


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ReportOverview(BaseModel):
    case_id: str
    case_status: str = "unknown"
    incident_status: str = "suspected"
    severity: str = "unknown"
    incident_type: str = "other"
    current_phase: str = "assessment"
    primary_assets: list[str] = Field(default_factory=list)
    state_version: int | None = None
    plan_id: str | None = None
    plan_state_version: int | None = None
    plan_status: Literal["current", "stale", "not_available"] = "not_available"
    planner_model: str | None = None
    planner_kind: Literal["live_ai", "deterministic", "unknown"] = "unknown"
    evidence_count: int = 0


class ReportFinding(BaseModel):
    id: str
    title: str
    summary: str
    severity: str = "Observed"
    confidence: float | None = None
    status: str = "hypothesis"
    affected_entity_ids: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    attack_techniques: list[str] = Field(default_factory=list)
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    source: str = "planner_analysis"
    plan_id: str | None = None
    state_version: int | None = None


class ReportTimelineEvent(BaseModel):
    timestamp: datetime | None = None
    category: Literal["attack", "defensive", "analyst", "context", "observed"] = "observed"
    event_type: str = "event"
    summary: str
    significance: str = "Observed record; significance not determined."
    entity_ids: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    source: str = "unknown"
    material: bool = False
    raw_detail: str = ""


class ReportEntity(BaseModel):
    id: str
    type: str
    display_name: str
    role: str = "Observed entity"
    condition: str = "unknown"
    relevance: Literal[
        "confirmed_affected",
        "suspected_affected",
        "malicious_indicator",
        "contextual",
    ] = "contextual"
    relevance_reason: str = "Observed in stored evidence."
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    evidence_count: int = 0
    evidence_ids: list[str] = Field(default_factory=list)


class ReportAction(BaseModel):
    action_id: str
    action_type: str = ""
    target: str = ""
    recommendation: str = ""
    proposed_status: str = "recommended"
    approval_status: str = "pending"
    execution_status: str = "not_started"
    validation_status: str = "not_validated"
    effectiveness: str = "unknown"
    outcome: str = ""
    state_version: int | None = None
    timestamp: datetime | None = None
    plan_id: str | None = None
    phase: str = "assessment"
    approval_id: str | None = None
    decided_by: str | None = None
    approver_role: str | None = None
    decision_reason: str | None = None
    execution_id: str | None = None
    result_source: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    policy_refs: list[str] = Field(default_factory=list)


class ReportImpact(BaseModel):
    confirmed: list[str] = Field(default_factory=list)
    potential: list[str] = Field(default_factory=list)
    remaining_risk: list[str] = Field(default_factory=list)


class ReportNextStep(BaseModel):
    priority: Literal["High", "Medium", "Low"] = "Medium"
    text: str
    owner: str = "Unassigned"
    status: str = "Open"
    related_ids: list[str] = Field(default_factory=list)


class ReportEvidenceReference(BaseModel):
    evidence_id: str
    source_file: str = "unknown"
    source_location: str = ""
    timestamp: datetime | None = None
    event_type: str = "event"
    source: str = "unknown"
    sha256: str = ""
    untrusted: bool = True


class ReportProvenance(BaseModel):
    state_version: int | None = None
    state_parent_version: int | None = None
    state_created_from: str | None = None
    state_change_reason: str | None = None
    plan_id: str | None = None
    plan_state_version: int | None = None
    plan_is_stale: bool = False
    action_ids: list[str] = Field(default_factory=list)
    execution_ids: list[str] = Field(default_factory=list)


class ReportAppendices(BaseModel):
    evidence_index: list[ReportEvidenceReference] = Field(default_factory=list)
    raw_chronology: list[ReportTimelineEvent] = Field(default_factory=list)
    technical_findings: list[ReportFinding] = Field(default_factory=list)
    attack_mapping: list[str] = Field(default_factory=list)
    provenance: ReportProvenance = Field(default_factory=ReportProvenance)


class AnalystReport(BaseModel):
    """Presentation-neutral analyst report used by both UI and PDF renderers."""

    overview: ReportOverview
    analysis_summary: str = "Analysis has not produced a summary yet."
    executive_summary: str = ""
    executive_summary_source: Literal[
        "current_state_analysis", "record_derived"
    ] = "record_derived"
    key_findings: list[ReportFinding] = Field(default_factory=list)
    key_timeline: list[ReportTimelineEvent] = Field(default_factory=list)
    entities: list[ReportEntity] = Field(default_factory=list)
    response_actions: list[ReportAction] = Field(default_factory=list)
    impact: ReportImpact = Field(default_factory=ReportImpact)
    next_steps: list[ReportNextStep] = Field(default_factory=list)
    analyst_reviews: list[AnalystReview] = Field(default_factory=list)
    appendices: ReportAppendices = Field(default_factory=ReportAppendices)


class IncidentReport(BaseModel):
    """Legacy target shape retained for existing consumers."""

    report_id: str
    case_id: str
    based_on_state_version: int
    executive_summary: str = ""
    incident_overview: str = ""
    timeline: list[dict] = Field(default_factory=list)
    affected_assets: list[dict] = Field(default_factory=list)
    findings: list[dict] = Field(default_factory=list)
    attack_mapping: list[str] = Field(default_factory=list)
    recommendations: list[dict] = Field(default_factory=list)
    analyst_decisions: list[dict] = Field(default_factory=list)
    performed_actions: list[dict] = Field(default_factory=list)
    observed_effects: list[dict] = Field(default_factory=list)
    recovery_status: str = ""
    unresolved_gaps: list[str] = Field(default_factory=list)
    evidence_references: list[str] = Field(default_factory=list)
    audit_summary: list[dict] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=_now)
    pdf_path: Optional[str] = None
