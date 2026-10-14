"""Case endpoints: create and retrieve incidents."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.database import repositories
from app.schemas.case import Case, CaseCreate
from app.services import audit_service

router = APIRouter(prefix="/cases", tags=["cases"])


def _new_case_id() -> str:
    return f"CASE-{uuid.uuid4().hex[:8].upper()}"


@router.post("", response_model=Case, status_code=201)
def create_case(body: CaseCreate) -> Case:
    now = datetime.now(timezone.utc)
    case = Case(
        case_id=_new_case_id(),
        title=body.title,
        description=body.description,
        created_at=now,
        updated_at=now,
    )
    repositories.create_case(case.case_id, case.model_dump(mode="json"))
    audit_service.record(case.case_id, "case_created", {"title": case.title})
    return case


@router.get("", response_model=list[Case])
def list_cases() -> list[Case]:
    cases = [Case(**data) for data in repositories.list_cases()]
    return sorted(cases, key=lambda case: (case.updated_at, case.case_id), reverse=True)


@router.get("/{case_id}", response_model=Case)
def get_case(case_id: str) -> Case:
    data = repositories.get_case(case_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"case not found: {case_id}")
    return Case(**data)
