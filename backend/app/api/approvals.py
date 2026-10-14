"""Approval endpoints (BL-003).

POST /cases/{case_id}/actions/{action_id}/decision -> analyst approve/reject

Approval is created by the backend, never by AI output.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.approval import DecisionRequest
from app.services import approval_service

router = APIRouter(prefix="/cases", tags=["approvals"])

_STATUS_FOR_KIND = {"not_found": 404, "conflict": 409, "forbidden": 403}


@router.post("/{case_id}/actions/{action_id}/decision")
def record_decision(case_id: str, action_id: str, request: DecisionRequest):
    try:
        return approval_service.record_decision(case_id, action_id, request)
    except approval_service.ApprovalError as exc:
        status = _STATUS_FOR_KIND.get(exc.kind, 500)
        raise HTTPException(status_code=status, detail=str(exc)) from exc
