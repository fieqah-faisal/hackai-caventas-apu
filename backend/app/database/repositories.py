"""Firestore data-access layer.

All Firestore reads/writes go through here so services never touch the SDK
directly. This keeps the collection/subcollection layout in one place and
makes the services easy to reason about.

Firestore layout (see .kiro/steering/structure.md):

    cases/{case_id}
        evidence/{evidence_id}
        state_versions/{state_id}      # state_id = "STATE-{version:03d}"
        plans/{plan_id}
        actions/{action_id}
        approvals/{approval_id}
        action_results/{exec_id}
        audit_events/{audit_id}
        reports/{report_id}
"""
from __future__ import annotations

from typing import Any

from app.database.firebase import get_db

CASES = "cases"
EVIDENCE = "evidence"
STATE_VERSIONS = "state_versions"
AUDIT_EVENTS = "audit_events"


def _case_ref(case_id: str):
    return get_db().collection(CASES).document(case_id)


# --- Cases ---------------------------------------------------------------

def create_case(case_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).set(data)


def get_case(case_id: str) -> dict[str, Any] | None:
    snap = _case_ref(case_id).get()
    return snap.to_dict() if snap.exists else None


def update_case(case_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).update(data)


def case_exists(case_id: str) -> bool:
    return _case_ref(case_id).get().exists


# --- Evidence ------------------------------------------------------------

def add_evidence(case_id: str, evidence_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).collection(EVIDENCE).document(evidence_id).set(data)


def list_evidence(case_id: str) -> list[dict[str, Any]]:
    docs = _case_ref(case_id).collection(EVIDENCE).stream()
    return [d.to_dict() for d in docs]


def evidence_exists(case_id: str, evidence_id: str) -> bool:
    return (
        _case_ref(case_id)
        .collection(EVIDENCE)
        .document(evidence_id)
        .get()
        .exists
    )


# --- Incident state versions --------------------------------------------

def _state_doc_id(version: int) -> str:
    return f"STATE-{version:03d}"


def add_state_version(case_id: str, version: int, data: dict[str, Any]) -> None:
    _case_ref(case_id).collection(STATE_VERSIONS).document(
        _state_doc_id(version)
    ).set(data)


def get_state_version(case_id: str, version: int) -> dict[str, Any] | None:
    snap = (
        _case_ref(case_id)
        .collection(STATE_VERSIONS)
        .document(_state_doc_id(version))
        .get()
    )
    return snap.to_dict() if snap.exists else None


# --- Audit events --------------------------------------------------------

def add_audit_event(case_id: str, audit_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).collection(AUDIT_EVENTS).document(audit_id).set(data)


def list_audit_events(case_id: str) -> list[dict[str, Any]]:
    docs = _case_ref(case_id).collection(AUDIT_EVENTS).stream()
    return [d.to_dict() for d in docs]
