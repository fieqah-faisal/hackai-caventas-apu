"""Report endpoints (later milestone).

POST /cases/{case_id}/reports              -> generate structured report + PDF
GET  /cases/{case_id}/reports/{report_id}  -> retrieve a report

Not implemented in Milestone 1.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/cases", tags=["reports"])


@router.post("/{case_id}/reports", status_code=501)
def generate_report(case_id: str):
    raise HTTPException(status_code=501, detail="reports: not implemented yet")


@router.get("/{case_id}/reports/{report_id}", status_code=501)
def get_report(case_id: str, report_id: str):
    raise HTTPException(status_code=501, detail="reports: not implemented yet")
