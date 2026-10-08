"""Report endpoints (BL-003).

POST /cases/{case_id}/reports              -> generate structured report + PDF
GET  /cases/{case_id}/reports/{report_id}  -> retrieve a stored report
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services import reporting

router = APIRouter(prefix="/cases", tags=["reports"])

_STATUS_FOR_KIND = {"not_found": 404}


def _raise_http(exc: reporting.ReportingError) -> None:
    status = _STATUS_FOR_KIND.get(exc.kind, 500)
    raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.post("/{case_id}/reports")
def generate_report(case_id: str):
    try:
        return reporting.generate_report(case_id)
    except reporting.ReportingError as exc:
        _raise_http(exc)


@router.get("/{case_id}/reports/{report_id}")
def get_report(case_id: str, report_id: str):
    try:
        return reporting.get_report(case_id, report_id)
    except reporting.ReportingError as exc:
        _raise_http(exc)
