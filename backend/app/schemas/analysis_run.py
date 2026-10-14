"""Persisted, additive planning-run status contract."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class RunStage(str, Enum):
    QUEUED = "queued"
    LOADING_STATE = "loading_state"
    LOADING_GUIDANCE = "loading_guidance"
    RUNNING_PLANNER = "running_planner"
    PERSISTING_PLAN = "persisting_plan"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisRun(BaseModel):
    run_id: str
    case_id: str
    status: RunStatus = RunStatus.QUEUED
    stage: RunStage = RunStage.QUEUED
    message: str = "Queued for analysis."
    based_on_state_version: int
    plan_id: str | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    completed_at: datetime | None = None
    error: str | None = None
