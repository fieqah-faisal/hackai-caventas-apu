"""Immutable analyst reviews, separate from action approval decisions."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ReviewTargetType = Literal["case", "plan", "finding", "action", "report"]
ReviewType = Literal["note", "confirm", "dispute", "request_more_evidence", "sign_off"]


class AnalystReviewCreate(BaseModel):
    target_type: ReviewTargetType
    target_id: str | None = Field(default=None, max_length=200)
    review_type: ReviewType
    analyst: str = Field(..., min_length=1, max_length=200)
    analyst_role: str = Field(..., min_length=1, max_length=200)
    comment: str = Field(..., min_length=1, max_length=5000)
    state_version: int = Field(..., ge=0)
    plan_version: int | None = Field(default=None, ge=1)

    @field_validator("target_id", "analyst", "analyst_role", "comment")
    @classmethod
    def strip_nonblank_values(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("value cannot be blank")
        return value


class AnalystReview(AnalystReviewCreate):
    review_id: str
    case_id: str
    created_at: datetime
