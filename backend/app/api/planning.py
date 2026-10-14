"""Planning endpoints.

    POST /cases/{case_id}/runs     -> run the AI planner, persist the proposal
    GET  /cases/{case_id}/plans    -> list stored plans for the case
    GET  /cases/{case_id}/actions  -> list stored actions, oldest first (read-only)
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.database import repositories
from app.services import planning_service
from app.services.reporting import _created_at_key

router = APIRouter(prefix="/cases", tags=["planning"])

_STATUS_FOR_KIND = {"not_found": 404, "no_state": 409, "planner": 502}


@router.post("/{case_id}/runs")
def request_analysis(case_id: str):
    try:
        return planning_service.run_planning(case_id)
    except planning_service.PlanningError as exc:
        status = _STATUS_FOR_KIND.get(exc.kind, 500)
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.get("/{case_id}/plans")
def list_plans(case_id: str):
    if not repositories.case_exists(case_id):
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    return repositories.list_plans(case_id)


@router.get("/{case_id}/actions")
def list_actions(case_id: str):
    """Stored actions as persisted (StoredAction docs), oldest first.

    Read-only: deciding and executing stay on their own endpoints with their
    own preconditions. Real Firestore streams in document-ID order, so the
    list is sorted by ``created_at`` here (in Python, so the test fake works).
    """
    if not repositories.case_exists(case_id):
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    return sorted(repositories.list_actions(case_id), key=_created_at_key)
