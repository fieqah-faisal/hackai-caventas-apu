"""Evidence endpoints: upload, list, and read current incident state.

(The current-state read lives here with evidence because, in Milestone 1,
state is a direct product of ingested evidence.)
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile

from app.schemas.evidence import EvidenceItem, EvidenceUploadResult
from app.schemas.incident_state import IncidentState
from app.services import ingestion, state_manager
from app.services.ingestion import IngestionError

router = APIRouter(prefix="/cases", tags=["evidence"])


@router.post("/{case_id}/evidence", response_model=EvidenceUploadResult)
async def upload_evidence(case_id: str, file: UploadFile) -> EvidenceUploadResult:
    raw = await file.read()
    try:
        return ingestion.ingest(case_id, file.filename or "upload", raw)
    except IngestionError as exc:
        # case-not-found vs malformed input both surface as client errors;
        # distinguish not-found as 404.
        msg = str(exc)
        if msg.startswith("case not found"):
            raise HTTPException(status_code=404, detail=msg) from exc
        raise HTTPException(status_code=400, detail=msg) from exc


@router.get("/{case_id}/evidence", response_model=list[EvidenceItem])
def list_evidence(case_id: str) -> list[EvidenceItem]:
    items = ingestion.list_items(case_id)
    return [EvidenceItem(**i) for i in items]


@router.get("/{case_id}/state", response_model=IncidentState)
def get_current_state(case_id: str) -> IncidentState:
    state = state_manager.get_current_state(case_id)
    if state is None:
        raise HTTPException(
            status_code=404,
            detail=f"no incident state for case: {case_id}",
        )
    return state
