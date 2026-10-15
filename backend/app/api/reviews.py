"""Persistent analyst-review endpoints."""
from fastapi import APIRouter

from app.schemas.analyst_review import AnalystReview, AnalystReviewCreate
from app.services import analyst_review_service

router = APIRouter(prefix="/cases/{case_id}/reviews", tags=["reviews"])


@router.post("", response_model=AnalystReview, status_code=201)
def create_review(case_id: str, body: AnalystReviewCreate) -> AnalystReview:
    return analyst_review_service.create(case_id, body)


@router.get("", response_model=list[AnalystReview])
def list_reviews(case_id: str) -> list[AnalystReview]:
    return analyst_review_service.list_for_case(case_id)
