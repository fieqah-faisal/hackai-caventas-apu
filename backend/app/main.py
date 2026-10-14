"""IR Planner backend — FastAPI application entrypoint.

Run (dev):
    uvicorn app.main:app --reload   # from the backend/ directory

Point at the local Firestore emulator by setting FIRESTORE_EMULATOR_HOST
(see .env.example) before starting, so no cloud project is required.
"""
from __future__ import annotations

from fastapi import FastAPI

from app.api import approvals, cases, evidence, execution, planning, reports, state

app = FastAPI(
    title="IR Planner Backend",
    description=(
        "Human-in-the-loop incident-response backend: cases, evidence "
        "ingestion, versioned incident state, approvals, bounded simulated "
        "execution, audit trail and reports."
    ),
    version="0.1.0",
)

# All routers below are implemented (none are stubbed).
# Cases, evidence upload/list and the current incident state.
app.include_router(cases.router)
app.include_router(evidence.router)
# GAS-lite state-history (additive, read-only)
app.include_router(state.router)

# Planning runs (BL-002); approvals, simulated execution + the audit read,
# and reports (BL-003).
app.include_router(planning.router)
app.include_router(approvals.router)
app.include_router(execution.router)
app.include_router(reports.router)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
