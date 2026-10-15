"""Validation and persistence for analyst reviews."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from app.database import repositories
from app.schemas.analyst_review import AnalystReview, AnalystReviewCreate
from app.services import audit_service

SUPPORTED_TARGETS = {"case", "plan"}


def create(case_id: str, body: AnalystReviewCreate) -> AnalystReview:
    case = repositories.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    if body.target_type not in SUPPORTED_TARGETS:
        raise HTTPException(status_code=422, detail=f"review target type is not supported yet: {body.target_type}")
    if body.state_version != case.get("current_state_version", 0):
        raise HTTPException(status_code=409, detail="review state version is not current")

    if body.target_type == "case":
        if body.target_id not in (None, case_id):
            raise HTTPException(status_code=422, detail="case review target_id must match the case")
    elif not body.target_id:
        raise HTTPException(status_code=422, detail="plan reviews require target_id")
    else:
        plan = repositories.get_plan(case_id, body.target_id)
        if plan is None:
            raise HTTPException(status_code=404, detail=f"plan not found: {body.target_id}")
        if plan.get("based_on_state_version") != body.state_version:
            raise HTTPException(status_code=409, detail="plan is not based on the reviewed state version")

    review = AnalystReview(
        review_id=f"REVIEW-{uuid.uuid4().hex[:12].upper()}",
        case_id=case_id,
        created_at=datetime.now(timezone.utc),
        **body.model_dump(),
    )
    repositories.add_analyst_review(case_id, review.review_id, review.model_dump(mode="json"))
    audit_service.record(case_id, "analyst_review_recorded", {
        "review_id": review.review_id,
        "target_type": review.target_type,
        "target_id": review.target_id,
        "review_type": review.review_type,
        "analyst": review.analyst,
        "state_version": review.state_version,
        "plan_version": review.plan_version,
    })
    return review


def list_for_case(case_id: str) -> list[AnalystReview]:
    if not repositories.case_exists(case_id):
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    reviews = [AnalystReview(**data) for data in repositories.list_analyst_reviews(case_id)]
    return sorted(reviews, key=lambda review: (review.created_at, review.review_id))
