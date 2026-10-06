"""Schemas for the structured incident report (the primary deliverable).

Report JSON is generated first from stored case records, then rendered to
PDF via ReportLab. A report references a specific incident-state version.
Milestone 1 does not generate reports; this defines the target shape.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class IncidentReport(BaseModel):
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
