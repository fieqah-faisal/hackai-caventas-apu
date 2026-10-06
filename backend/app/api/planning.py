"""Planning endpoints.

    POST /cases/{case_id}/runs   -> run the AI planner, persist the proposal
    GET  /cases/{case_id}/plans  -> list stored plans for the case
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.database import repositories
from app.services import planning_service

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
