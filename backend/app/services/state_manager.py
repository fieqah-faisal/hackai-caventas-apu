"""Incident State Manager.

Builds and persists versioned incident-state snapshots. State is NEVER
overwritten: each change appends a new version. The case document tracks
``current_state_version`` as a pointer to the latest.

Milestone 1 scope: create an initial state version and rebuild entities /
relationships / timeline from the normalized evidence currently stored for
a case. Richer reconstruction (findings, ATT&CK mapping, hypotheses) is
layered in by later milestones.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from app.database import repositories
from app.schemas.case import CaseStatus
from app.schemas.incident_state import (
    Entity,
    EntityType,
    IncidentState,
    Relationship,
    RelationshipStatus,
    TimelineEvent,
)
from app.services import audit_service


def _coerce_entity_type(raw: str) -> EntityType:
    try:
        return EntityType(raw)
    except ValueError:
        return EntityType.OTHER


def _parse_time(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


_DESCRIPTION_SKIP_KEYS = {"host", "account", "event_type"}


def _describe_fields(fields: dict[str, Any]) -> str:
    """Compact, planner-readable summary of a record's non-entity fields."""
    parts = [
        f"{key}={value}"
        for key, value in fields.items()
        if key not in _DESCRIPTION_SKIP_KEYS and value not in (None, "")
    ]
    return ", ".join(parts)[:300]


def _reconstruct(case_id: str, version: int) -> IncidentState:
    """Derive a state snapshot from all evidence stored for the case.

    Observed facts only: hosts and accounts become entities, and a
    'logged_into' relationship is recorded when an evidence record carries
    both an account and a host. Everything here is evidence-backed and
    marked OBSERVED; inference is deferred to the AI/analysis layer.
    """
    evidence = repositories.list_evidence(case_id)

    entities: dict[str, Entity] = {}
    relationships: list[Relationship] = []
    timeline: list[TimelineEvent] = []

    for ev in evidence:
        fields = ev.get("fields", {}) or {}
        ev_id = ev.get("evidence_id")

        host = fields.get("host")
        account = fields.get("account")

        host_id = None
        if host:
            host_id = f"HOST::{host}"
            entities.setdefault(
                host_id, Entity(id=host_id, type=EntityType.HOST, name=str(host))
            )

        account_id = None
        if account:
            account_id = f"ACCOUNT::{account}"
            entities.setdefault(
                account_id,
                Entity(id=account_id, type=EntityType.ACCOUNT, name=str(account)),
            )

        if host_id and account_id:
            relationships.append(
                Relationship(
                    source=account_id,
                    relation="logged_into",
                    target=host_id,
                    evidence_ids=[ev_id] if ev_id else [],
                    status=RelationshipStatus.OBSERVED,
                )
            )

        event_time = ev.get("event_time")
        parsed_time = None
        if event_time:
            try:
                parsed_time = datetime.fromisoformat(event_time)
            except (TypeError, ValueError):
                parsed_time = None

        event_type = fields.get("event_type", ev.get("kind", "event"))
        detail = _describe_fields(fields)
        description = f"{event_type}: {detail}" if detail else str(event_type)
        timeline.append(
            TimelineEvent(
                timestamp=parsed_time,
                description=f"{description} ({ev.get('source_file', 'unknown')})",
                evidence_ids=[ev_id] if ev_id else [],
            )
        )

    actions = repositories.list_actions(case_id)
    action_results = repositories.list_action_results(case_id)

    for action in actions:
        proposal = action.get("proposal", {}) or {}
        tool = proposal.get("tool_name", "action")
        target = proposal.get("target_id", "?")
        status = action.get("status")
        if status == "rejected":
            reason = action.get("reason") or ""
            timeline.append(
                TimelineEvent(
                    timestamp=_parse_time(action.get("decided_at")),
                    description=(
                        f"defender: action rejected — {tool} on {target} ({reason})"
                    ),
                )
            )
        elif status == "approved":
            timeline.append(
                TimelineEvent(
                    timestamp=_parse_time(action.get("decided_at")),
                    description=f"defender: action approved — {tool} on {target}",
                )
            )

    for result in action_results:
        timeline.append(
            TimelineEvent(
                timestamp=_parse_time(result.get("created_at")),
                description=(
                    f"defender: action result — {result.get('tool_name')} on "
                    f"{result.get('target_id')}: "
                    f"execution={result.get('execution_status')}, "
                    f"validation={result.get('validation_status')} "
                    f"({result.get('observed_effect', '')})"
                ),
            )
        )

    timeline.sort(key=lambda t: (t.timestamp is None, t.timestamp or datetime.min))

    return IncidentState(
        case_id=case_id,
        version=version,
        entities=list(entities.values()),
        relationships=relationships,
        timeline=timeline,
        actions=[str(a.get("action_id")) for a in actions],
        action_results=[str(r.get("execution_id")) for r in action_results],
    )


def rebuild_and_version(case_id: str) -> IncidentState:
    """Create a new state version reflecting current evidence.

    Returns the newly created IncidentState.
    """
    case = repositories.get_case(case_id)
    if case is None:
        raise ValueError(f"case not found: {case_id}")

    next_version = int(case.get("current_state_version", 0)) + 1
    state = _reconstruct(case_id, next_version)

    repositories.add_state_version(
        case_id, next_version, state.model_dump(mode="json")
    )
    repositories.update_case(
        case_id,
        {
            "current_state_version": next_version,
            "status": CaseStatus.INVESTIGATING.value,
            "updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    audit_service.record(
        case_id,
        "state_version_created",
        {"version": next_version, "entity_count": len(state.entities)},
    )
    return state


def get_current_state(case_id: str) -> IncidentState | None:
    case = repositories.get_case(case_id)
    if case is None:
        return None
    version = int(case.get("current_state_version", 0))
    if version < 1:
        return None
    data = repositories.get_state_version(case_id, version)
    return IncidentState(**data) if data else None


def get_state(case_id: str, version: int) -> IncidentState | None:
    data = repositories.get_state_version(case_id, version)
    return IncidentState(**data) if data else None
