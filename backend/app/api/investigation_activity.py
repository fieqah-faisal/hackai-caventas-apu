"""Read-only unified investigation activity endpoint."""
from fastapi import APIRouter, HTTPException

from app.database import repositories
from app.schemas.investigation_activity import InvestigationActivityResponse
from app.services import audit_service
from app.services.investigation_activity import project_activity

router = APIRouter(prefix="/cases/{case_id}/investigation-activity", tags=["investigation"])


@router.get("", response_model=InvestigationActivityResponse)
def get_investigation_activity(case_id: str) -> InvestigationActivityResponse:
    if not repositories.case_exists(case_id):
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    return InvestigationActivityResponse(
        case_id=case_id,
        events=project_activity(
            repositories.list_analyst_reviews(case_id),
            repositories.list_approvals(case_id),
            repositories.list_action_results(case_id),
            audit_service.list_events(case_id),
            repositories.list_actions(case_id),
        ),
    )
