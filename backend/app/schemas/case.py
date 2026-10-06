"""Pydantic schemas for incident cases."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CaseStatus(str, Enum):
    OPEN = "open"
    INVESTIGATING = "investigating"
    CONTAINED = "contained"
    RECOVERED = "recovered"
    CLOSED = "closed"


class CaseCreate(BaseModel):
    """Request body for creating a case."""

    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)


class Case(BaseModel):
    """A single cybersecurity incident. The system of record root."""

    case_id: str
    title: str
    description: str = ""
    status: CaseStatus = CaseStatus.OPEN
    current_state_version: int = 0
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
