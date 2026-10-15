"""State-history endpoints: immutable, versioned incident-state snapshots.

Two additive read-only routes (GAS-lite, DEC-010):

    GET /cases/{case_id}/states            -> version-ordered StateVersionMeta list
    GET /cases/{case_id}/states/{version}  -> full immutable IncidentState snapshot

The existing ``GET /cases/{case_id}/state`` (current state) stays in
``evidence.py`` unchanged. These routes never mutate stored history and the UI
reaches them through FastAPI, never Firestore directly.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.incident_state import IncidentState, StateVersionMeta
from app.schemas.timeline import TimelineResponse
from app.services import state_manager

router = APIRouter(prefix="/cases", tags=["state"])


@router.get("/{case_id}/timeline", response_model=TimelineResponse)
def get_timeline(case_id: str) -> TimelineResponse:
    timeline = state_manager.get_current_timeline(case_id)
    if timeline is None:
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    return timeline


@router.get("/{case_id}/states", response_model=list[StateVersionMeta])
def list_states(case_id: str) -> list[StateVersionMeta]:
    """List version metadata for a case, oldest version first.

    Returns an empty list (not 404) for a known case with no versions yet;
    returns 404 only when the case itself is unknown.
    """
    metas = state_manager.list_states(case_id)
    if metas is None:
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    return metas


@router.get("/{case_id}/states/{version}", response_model=IncidentState)
def get_state_version(case_id: str, version: int) -> IncidentState:
    """Return the full immutable snapshot for one version.

    Distinct 404s for an unknown case vs an unknown version of a known case.
    """
    if state_manager.list_states(case_id) is None:
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    state = state_manager.get_state(case_id, version)
    if state is None:
        raise HTTPException(
            status_code=404,
            detail=f"state version {version} not found for case: {case_id}",
        )
    return state
