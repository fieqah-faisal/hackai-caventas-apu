"""Approval endpoints (later milestone).

POST /cases/{case_id}/actions/{action_id}/decision -> analyst approve/reject

Approval is created by the backend, never by AI output. Not implemented in
Milestone 1.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/cases", tags=["approvals"])


@router.post("/{case_id}/actions/{action_id}/decision", status_code=501)
def record_decision(case_id: str, action_id: str):
    raise HTTPException(status_code=501, detail="approvals: not implemented yet")
