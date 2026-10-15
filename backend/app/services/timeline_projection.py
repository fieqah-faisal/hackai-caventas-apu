"""Pure, allowlisted projection of stored records into readable chronology."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from app.schemas.incident_state import IncidentState
from app.schemas.timeline import StructuredTimelineEvent

_ACTOR_KEYS = ("actor", "account", "user", "username")
_SUBJECT_KEYS = ("subject", "host", "device", "process", "query", "domain", "target", "application", "object", "file")
_RESULT_KEYS = ("result", "verdict", "outcome", "answer", "status")
_DETAIL_KEYS = (
    "query", "answer", "process", "command_line", "application", "object",
    "bytes", "destination_ip", "destination_port", "change_id", "alert", "note",
)
_SEVERITIES = {"low", "medium", "high", "critical"}


def _time(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _value(fields: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = fields.get(key)
        if value not in (None, ""):
            return str(value)
    return None


def _bounded(value: Any, limit: int = 240) -> str:
    text = str(value).replace("\r", " ").replace("\n", " ")
    return f"{text[:limit - 3]}..." if len(text) > limit else text


def _stable_id(prefix: str, authoritative_id: Any, fallback: dict[str, Any]) -> str:
    if authoritative_id:
        return f"TL-{prefix}-{authoritative_id}"
    encoded = json.dumps(fallback, sort_keys=True, default=str).encode("utf-8")
    return f"TL-{prefix}-{hashlib.sha256(encoded).hexdigest()[:16].upper()}"


def _summary(event_type: str, actor: str | None, subject: str | None, result: str | None) -> str:
    label = event_type.replace("_", " ").strip().capitalize() or "Observed event"
    context = " / ".join(item for item in (actor, subject) if item)
    return _bounded(f"{label}{f' involving {context}' if context else ''}{f': {result}' if result else ''}", 300)


def _state_maps(state: IncidentState | None) -> tuple[dict[str, str], dict[str, list[str]], dict[str, str]]:
    raw_by_evidence: dict[str, str] = {}
    entities_by_evidence: dict[str, list[str]] = {}
    relationship_by_evidence: dict[str, str] = {}
    if not state:
        return raw_by_evidence, entities_by_evidence, relationship_by_evidence
    for event in state.timeline:
        for evidence_id in event.evidence_ids:
            raw_by_evidence.setdefault(evidence_id, event.description)
    for entity in state.entities:
        for evidence_id in entity.evidence_ids:
            entities_by_evidence.setdefault(evidence_id, []).append(entity.id)
    for relationship in state.relationships:
        category = relationship.category.value
        status = relationship.status.value
        for evidence_id in relationship.evidence_ids:
            if category == "attack":
                relationship_by_evidence[evidence_id] = "attack"
            elif evidence_id not in relationship_by_evidence and status == "inferred":
                relationship_by_evidence[evidence_id] = "inferred"
    return raw_by_evidence, entities_by_evidence, relationship_by_evidence


def project_timeline(
    evidence: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    action_results: list[dict[str, Any]],
    state: IncidentState | None,
) -> list[StructuredTimelineEvent]:
    raw_by_evidence, entities_by_evidence, relationship_by_evidence = _state_maps(state)
    rows: list[StructuredTimelineEvent] = []
    represented_evidence: set[str] = set()

    for record in evidence:
        fields = record.get("fields") if isinstance(record.get("fields"), dict) else {}
        evidence_id = str(record.get("evidence_id") or "")
        if evidence_id:
            represented_evidence.add(evidence_id)
        event_type = str(fields.get("event_type") or record.get("kind") or "event")
        actor = _value(fields, _ACTOR_KEYS)
        subject = _value(fields, _SUBJECT_KEYS)
        result = _value(fields, _RESULT_KEYS)
        source = _value(fields, ("source",)) or (str(record.get("source_file")) if record.get("source_file") else None)
        severity_value = str(fields.get("severity") or "").lower()
        severity = severity_value if severity_value in _SEVERITIES else None
        details = {key: _bounded(fields[key]) for key in _DETAIL_KEYS if fields.get(key) not in (None, "")}
        relation = relationship_by_evidence.get(evidence_id)
        relevance = "attack" if relation == "attack" else "context" if event_type in {"change_record", "change_ticket"} else "observed"
        rows.append(StructuredTimelineEvent(
            event_id=_stable_id("EVIDENCE", evidence_id, {"source": source, "time": record.get("event_time"), "type": event_type, "details": details}),
            occurred_at=_time(record.get("event_time")),
            event_type=event_type,
            source=source,
            actor=actor,
            subject=subject,
            action=_value(fields, ("action", "operation")),
            result=result,
            summary=_summary(event_type, actor, subject, result),
            details=details,
            evidence_ids=[evidence_id] if evidence_id else [],
            entity_ids=sorted(set(entities_by_evidence.get(evidence_id, []))),
            relationship_status="inferred" if relation == "inferred" else "observed",
            relevance=relevance,
            severity=severity,
            raw_description=raw_by_evidence.get(evidence_id, ""),
        ))

    for stored in actions:
        proposal = stored.get("proposal") if isinstance(stored.get("proposal"), dict) else stored
        action_id = stored.get("action_id")
        status = str(stored.get("approval_decision") or stored.get("status") or "")
        if status not in {"approved", "approve", "rejected", "reject"} or not stored.get("decided_at"):
            continue
        decision = "rejected" if status in {"rejected", "reject"} else "approved"
        tool = str(proposal.get("tool_name") or stored.get("tool_name") or "action")
        target = str(proposal.get("target_id") or stored.get("target_id") or "") or None
        reason = stored.get("reason") or stored.get("decision_reason")
        details = {"reason": _bounded(reason)} if reason else {}
        rows.append(StructuredTimelineEvent(
            event_id=_stable_id("DECISION", action_id, {"time": stored.get("decided_at"), "tool": tool, "target": target}),
            occurred_at=_time(stored.get("decided_at")),
            event_type="action_decision",
            source="analyst_decision",
            actor=str(stored.get("decided_by")) if stored.get("decided_by") else None,
            subject=target,
            action=tool,
            result=decision,
            summary=f"Action {action_id or tool} was {decision}{f' for {target}' if target else ''}.",
            details=details,
            evidence_ids=[str(item) for item in proposal.get("evidence_ids", stored.get("evidence_ids", []))],
            entity_ids=[target] if target else [],
            relevance="defensive",
            raw_description="",
        ))

    for result_record in action_results:
        execution_id = result_record.get("execution_id")
        tool = str(result_record.get("tool_name") or "action")
        target = str(result_record.get("target_id") or "") or None
        execution = str(result_record.get("execution_status") or "unknown")
        validation = str(result_record.get("validation_status") or "unknown")
        evidence_ids = [str(item) for item in result_record.get("evidence_ids", [])]
        rows.append(StructuredTimelineEvent(
            event_id=_stable_id("RESULT", execution_id, {"time": result_record.get("simulated_at") or result_record.get("created_at"), "tool": tool, "target": target}),
            occurred_at=_time(result_record.get("simulated_at") or result_record.get("created_at")),
            event_type="action_result",
            source=str(result_record.get("result_source") or "simulator"),
            subject=target,
            action=tool,
            result=f"execution={execution}; validation={validation}",
            summary=f"Simulated {tool}{f' on {target}' if target else ''}.",
            details={"observed_effect": _bounded(result_record.get("observed_effect"))} if result_record.get("observed_effect") else {},
            evidence_ids=evidence_ids,
            entity_ids=[target] if target else [],
            relevance="defensive",
            raw_description="",
        ))

    if state:
        for legacy in state.timeline:
            if legacy.evidence_ids and all(item in represented_evidence for item in legacy.evidence_ids):
                continue
            rows.append(StructuredTimelineEvent(
                event_id=_stable_id("LEGACY", None, {"time": legacy.timestamp, "description": legacy.description, "evidence": legacy.evidence_ids}),
                occurred_at=_time(legacy.timestamp),
                event_type="legacy_event",
                summary=_bounded(legacy.description, 300),
                evidence_ids=legacy.evidence_ids,
                relationship_status="observed",
                relevance="unknown",
                raw_description=legacy.description,
            ))

    return sorted(rows, key=lambda row: (
        row.occurred_at is None,
        row.occurred_at or datetime.max.replace(tzinfo=timezone.utc),
        row.event_id,
    ))
