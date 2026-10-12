"""Incident State Manager.

Builds and persists versioned incident-state snapshots. State is NEVER
overwritten: each change appends a new version. The case document tracks
``current_state_version`` as a pointer to the latest.

Graph construction (entities, typed relationships, ATT&CK mappings, response
edges, validated effects) is delegated to the pure ``gas_lite`` service
(BL-030, DEC-010). This module keeps all Firestore I/O and still owns the
timeline reconstruction — including the record-field descriptions the planner
grounds on and PR #9's timezone-aware sort / ``simulated_at`` ordering — so the
existing ``GET /cases/{id}/state`` contract and tests are preserved.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.database import repositories
from app.schemas.case import CaseStatus
from app.schemas.incident_state import (
    CreatedFrom,
    IncidentState,
    StateVersionMeta,
    TimelineEvent,
)
from app.services import audit_service, gas_lite


def _timeline_key(event: TimelineEvent) -> tuple[bool, datetime]:
    """Sort key that tolerates timezone-naive evidence times (assumed UTC).

    Uploaded logs are untrusted: mixing naive and aware timestamps must not
    crash the state rebuild (it would also poison every later rebuild).
    """
    ts = event.timestamp
    if ts is None:
        return (True, datetime.min.replace(tzinfo=timezone.utc))
    return (False, ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc))


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


def _build_timeline(
    evidence: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    action_results: list[dict[str, Any]],
) -> list[TimelineEvent]:
    """Reconstruct the timeline from evidence + defender events.

    Unchanged behaviour: evidence descriptions carry the salient record fields
    (so the planner can ground on them, pinned by test_state_detail), defender
    approve/reject/result events are appended, result events prefer
    ``simulated_at`` over ``created_at`` (PR #9), and the whole timeline is
    sorted with a naive-timestamp-tolerant key (PR #9).
    """
    timeline: list[TimelineEvent] = []

    for ev in evidence:
        fields = ev.get("fields", {}) or {}
        ev_id = ev.get("evidence_id")
        parsed_time = _parse_time(ev.get("event_time")) if ev.get("event_time") else None
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
        # Simulated results carry the simulated time the action ran, which
        # keeps defender events in order with the synthetic evidence.
        timeline.append(
            TimelineEvent(
                timestamp=_parse_time(
                    result.get("simulated_at") or result.get("created_at")
                ),
                description=(
                    f"defender: action result — {result.get('tool_name')} on "
                    f"{result.get('target_id')}: "
                    f"execution={result.get('execution_status')}, "
                    f"validation={result.get('validation_status')} "
                    f"({result.get('observed_effect', '')})"
                ),
            )
        )

    timeline.sort(key=_timeline_key)
    return timeline


def _reconstruct(
    case_id: str,
    version: int,
    *,
    parent_version: int | None,
    created_from: CreatedFrom,
    change_reason: str | None,
) -> IncidentState:
    """Derive a state snapshot from the case's stored evidence and actions.

    The entity/relationship graph (hosts, accounts, IPs, domains, processes,
    files, sessions; typed observed relations; response edges; validated
    effects; ATT&CK ids) is built by the pure ``gas_lite`` layer. The timeline
    is built here to preserve the record-field descriptions and ordering the
    planner and existing tests depend on.
    """
    evidence = repositories.list_evidence(case_id)
    actions = repositories.list_actions(case_id)
    action_results = repositories.list_action_results(case_id)

    entities, relationships, attack_mapping = gas_lite.build_graph(
        evidence, actions, action_results
    )
    timeline = _build_timeline(evidence, actions, action_results)

    return IncidentState(
        case_id=case_id,
        version=version,
        parent_version=parent_version,
        created_from=created_from,
        change_reason=change_reason,
        entities=entities,
        relationships=relationships,
        timeline=timeline,
        attack_mapping=attack_mapping,
        actions=[str(a.get("action_id")) for a in actions],
        action_results=[str(r.get("execution_id")) for r in action_results],
    )


def _is_material(
    created_from: CreatedFrom,
    prior_state: IncidentState | None,
    next_state: IncidentState,
) -> bool:
    """Decide whether a trigger warrants a new state version.

    Core always versions on every supported trigger (evidence_upload,
    action_result, initial_reconstruction), so this returns True unconditionally.
    Non-material suppression (e.g. an upload that changes nothing) will live here
    but is explicitly Follow-on, not Core (DEC-010, tasks.md Task 4.4).
    """
    return True


def rebuild_and_version(
    case_id: str,
    created_from: CreatedFrom = CreatedFrom.INITIAL_RECONSTRUCTION,
    change_reason: str | None = None,
) -> IncidentState:
    """Append a new immutable state version reflecting current records.

    Prior-state handling has three cases (DEC-010 R11.8):
      1. Unknown case -> abort (ValueError), create nothing.
      2. ``current_state_version == 0`` -> create version 1, parent_version=None.
      3. pointer >= 1 but the referenced snapshot is missing -> abort as a
         data-integrity error, leave the pointer unchanged.
    Returns the newly created IncidentState.
    """
    case = repositories.get_case(case_id)
    if case is None:
        raise ValueError(f"case not found: {case_id}")

    current = int(case.get("current_state_version", 0))
    if current >= 1 and repositories.get_state_version(case_id, current) is None:
        # Pointer claims a prior version that is not stored: refuse to
        # reconstruct over a missing snapshot and leave the pointer untouched.
        raise ValueError(
            f"incident state v{current} for case {case_id} is missing; "
            "aborting rebuild to avoid overwriting history"
        )

    parent_version = current if current >= 1 else None
    next_version = current + 1

    state = _reconstruct(
        case_id,
        next_version,
        parent_version=parent_version,
        created_from=created_from,
        change_reason=change_reason,
    )

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
        {
            "version": next_version,
            "parent_version": parent_version,
            "created_from": created_from.value,
            "entity_count": len(state.entities),
        },
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


def list_states(case_id: str) -> list[StateVersionMeta] | None:
    """Version-ordered lightweight metadata for a case's stored state history.

    Returns an empty list for a known case with no versions yet, and ``None``
    when the case itself does not exist (so the API can return a 404). Does not
    load or mutate the full snapshots — counts are read directly from the stored
    version documents.
    """
    if repositories.get_case(case_id) is None:
        return None
    versions = repositories.list_state_versions(case_id)
    metas = [
        StateVersionMeta(
            version=int(doc.get("version", 0)),
            parent_version=doc.get("parent_version"),
            created_from=doc.get("created_from"),
            change_reason=doc.get("change_reason"),
            created_at=doc.get("created_at"),
            entity_count=len(doc.get("entities", []) or []),
            relationship_count=len(doc.get("relationships", []) or []),
            timeline_count=len(doc.get("timeline", []) or []),
        )
        for doc in versions
    ]
    metas.sort(key=lambda m: m.version)
    return metas
