"""Execution endpoints (later milestone).

POST /cases/{case_id}/actions/{action_id}/execute -> run approved action
     through the bounded simulator.
GET  /cases/{case_id}/audit                       -> audit trail

Execution is not implemented in Milestone 1. The audit read is wired now
since the audit trail already records case/evidence/state events.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.database import repositories
from app.services import audit_service

router = APIRouter(prefix="/cases", tags=["execution"])


@router.post("/{case_id}/actions/{action_id}/execute", status_code=501)
def execute_action(case_id: str, action_id: str):
    raise HTTPException(status_code=501, detail="execution: not implemented yet")


@router.get("/{case_id}/audit")
def get_audit(case_id: str):
    if not repositories.case_exists(case_id):
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    return audit_service.list_events(case_id)
