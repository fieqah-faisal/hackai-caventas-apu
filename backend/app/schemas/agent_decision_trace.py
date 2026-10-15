"""Closed Agent Decision Trace contract; never stores hidden model reasoning."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TraceStep(str, Enum):
    LOADING_STATE = "loading_state"
    LOADING_GUIDANCE = "loading_guidance"
    ANALYZE = "analyze"
    ROUTE = "route"
    RETRIEVE_GUIDANCE = "retrieve_guidance"
    PROPOSE = "propose"
    VALIDATE_PROPOSAL = "validate_proposal"
    PERSIST_PLAN = "persist_plan"
    COMPLETED = "completed"
    FAILED = "failed"


class TraceStepDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step: TraceStep
    status: Literal["completed", "failed"] = "completed"
    message: str = Field(..., min_length=1, max_length=240)
    started_at: datetime = Field(default_factory=_now)
    completed_at: datetime = Field(default_factory=_now)
    duration_ms: int = Field(default=0, ge=0)
    evidence_ids: list[str] = Field(default_factory=list, max_length=500)
    guidance_ids: list[str] = Field(default_factory=list, max_length=500)
    output_refs: list[str] = Field(default_factory=list, max_length=500)
    decision_summary: str = Field(default="", max_length=500)
    validation_summary: str = Field(default="", max_length=500)
    planner_kind: Literal["live_ai", "deterministic", "unknown"] = "unknown"
    planner_adapter: str | None = Field(default=None, max_length=200)
    planner_model: str | None = Field(default=None, max_length=200)


class AgentDecisionTraceStep(TraceStepDraft):
    step_id: str
    case_id: str
    run_id: str
    sequence: int = Field(..., ge=1)
    based_on_state_version: int = Field(..., ge=1)


class AnalysisRunSummary(BaseModel):
    run_id: str
    case_id: str
    status: str
    stage: str
    based_on_state_version: int
    plan_id: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
