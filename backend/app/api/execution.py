"""Execution endpoints (BL-003).

POST /cases/{case_id}/actions/{action_id}/execute -> run an approved action
     through the bounded simulator.
GET  /cases/{case_id}/audit                       -> audit trail
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.database import repositories
from app.services import audit_service, execution_service

router = APIRouter(prefix="/cases", tags=["execution"])

_STATUS_FOR_KIND = {"not_found": 404, "conflict": 409}


@router.post("/{case_id}/actions/{action_id}/execute")
def execute_action(case_id: str, action_id: str):
    try:
        return execution_service.execute(case_id, action_id)
    except execution_service.ExecutionError as exc:
        status = _STATUS_FOR_KIND.get(exc.kind, 500)
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.get("/{case_id}/audit")
def get_audit(case_id: str):
    if not repositories.case_exists(case_id):
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    return audit_service.list_events(case_id)
