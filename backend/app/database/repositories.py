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
PLANS = "plans"
ACTIONS = "actions"
APPROVALS = "approvals"
ACTION_RESULTS = "action_results"
REPORTS = "reports"
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


def list_state_versions(case_id: str) -> list[dict[str, Any]]:
    """Return every stored state-version document for a case.

    Streams the ``state_versions`` subcollection; the caller is responsible for
    ordering (by ``version``). Returns an empty list when the case has no stored
    versions. Read-only; the ``STATE-{version:03d}`` doc-id scheme is unchanged.
    """
    docs = _case_ref(case_id).collection(STATE_VERSIONS).stream()
    return [d.to_dict() for d in docs]

# --- Plans and actions ---------------------------------------------------

def add_plan(case_id: str, plan_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).collection(PLANS).document(plan_id).set(data)


def list_plans(case_id: str) -> list[dict[str, Any]]:
    docs = _case_ref(case_id).collection(PLANS).stream()
    return [d.to_dict() for d in docs]


def add_action(case_id: str, action_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).collection(ACTIONS).document(action_id).set(data)


def get_action(case_id: str, action_id: str) -> dict[str, Any] | None:
    snap = _case_ref(case_id).collection(ACTIONS).document(action_id).get()
    return snap.to_dict() if snap.exists else None


def update_action(case_id: str, action_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).collection(ACTIONS).document(action_id).update(data)


def list_actions(case_id: str) -> list[dict[str, Any]]:
    docs = _case_ref(case_id).collection(ACTIONS).stream()
    return [d.to_dict() for d in docs]


# --- Approvals and action results ----------------------------------------

def add_approval(case_id: str, approval_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).collection(APPROVALS).document(approval_id).set(data)


def list_approvals(case_id: str) -> list[dict[str, Any]]:
    docs = _case_ref(case_id).collection(APPROVALS).stream()
    return [d.to_dict() for d in docs]


def add_action_result(case_id: str, exec_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).collection(ACTION_RESULTS).document(exec_id).set(data)


def list_action_results(case_id: str) -> list[dict[str, Any]]:
    docs = _case_ref(case_id).collection(ACTION_RESULTS).stream()
    return [d.to_dict() for d in docs]


def add_report(case_id: str, report_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).collection(REPORTS).document(report_id).set(data)


def get_report(case_id: str, report_id: str) -> dict[str, Any] | None:
    snap = _case_ref(case_id).collection(REPORTS).document(report_id).get()
    return snap.to_dict() if snap.exists else None


# --- Audit events --------------------------------------------------------

def add_audit_event(case_id: str, audit_id: str, data: dict[str, Any]) -> None:
    _case_ref(case_id).collection(AUDIT_EVENTS).document(audit_id).set(data)


def list_audit_events(case_id: str) -> list[dict[str, Any]]:
    docs = _case_ref(case_id).collection(AUDIT_EVENTS).stream()
    return [d.to_dict() for d in docs]
