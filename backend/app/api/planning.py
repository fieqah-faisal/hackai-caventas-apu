"""Planning endpoints (later milestone).

POST /cases/{case_id}/runs   -> request AI analysis (PlannerAdapter)
GET  /cases/{case_id}/plans  -> list proposed plans

Not implemented in Milestone 1.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/cases", tags=["planning"])


@router.post("/{case_id}/runs", status_code=501)
def request_analysis(case_id: str):
    raise HTTPException(status_code=501, detail="planning: not implemented yet")


@router.get("/{case_id}/plans", status_code=501)
def list_plans(case_id: str):
    raise HTTPException(status_code=501, detail="planning: not implemented yet")
