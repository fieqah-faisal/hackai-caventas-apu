"""Pydantic schemas for incident cases."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator


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


class CaseUpdate(BaseModel):
    """Mutable case metadata. Incident state and reports are unaffected."""

    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="before")
    @classmethod
    def require_supported_field(cls, value):
        if not isinstance(value, dict) or not value:
            raise ValueError("at least one of title or description is required")
        if any(key not in {"title", "description"} for key in value):
            raise ValueError("only title and description can be updated")
        if any(field in value and value[field] is None for field in ("title", "description")):
            raise ValueError("title and description cannot be null")
        return value

    @field_validator("title", "description")
    @classmethod
    def require_nonblank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("value cannot be blank")
        return value


class Case(BaseModel):
    """A single cybersecurity incident. The system of record root."""

    case_id: str
    title: str
    description: str = ""
    status: CaseStatus = CaseStatus.OPEN
    current_state_version: int = 0
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
