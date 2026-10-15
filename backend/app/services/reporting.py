"""Reporting service (BL-003).

Generates the structured incident-report JSON (schema v1.3 shape) from stored
case records, then renders it to PDF with ReportLab. Reports reference a
specific incident-state version and may only contain facts supported by
stored records; sections the prototype cannot source stay empty or are
explicitly "unknown".
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.ai.langgraph_planner import ATTACK_TECHNIQUE_ID, load_guidance
from app.config import get_settings
from app.database import repositories
from app.schemas.report import (
    AnalystReport,
    ReportAction,
    ReportAppendices,
    ReportEntity,
    ReportEvidenceReference,
    ReportFinding,
    ReportImpact,
    ReportNextStep,
    ReportOverview,
    ReportProvenance,
    ReportTimelineEvent,
)
from app.services import audit_service, policy_service, state_manager
from app.services.report_document import render_report_pdf

ORGANISATION = "Caventas Demo Organisation"


class ReportingError(RuntimeError):
    """Kind is one of: not_found."""

    def __init__(self, message: str, kind: str) -> None:
        super().__init__(message)
        self.kind = kind


def _created_at_key(doc: dict[str, Any]) -> datetime:
    """Sort key: a stored document's ``created_at`` as an aware datetime.

    Stored values are ISO strings in mixed forms (``Z`` from Pydantic,
    ``+00:00`` from ``isoformat()``); ``Z`` is rewritten so Python 3.10's
    ``fromisoformat`` accepts it. Missing or unparsable values sort first.
    """
    try:
        parsed = datetime.fromisoformat(str(doc.get("created_at")).replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _float_or_zero(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(number):
        return 0.0
    return min(max(number, 0.0), 1.0)


def _finding_rows(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    raw_findings = analysis.get("findings")
    findings = raw_findings if isinstance(raw_findings, list) else []
    for index, finding in enumerate(findings, start=1):
        if not isinstance(finding, dict):
            continue
        raw_evidence = finding.get("evidence_ids")
        evidence = (
            [e for e in raw_evidence if isinstance(e, str)]
            if isinstance(raw_evidence, list)
            else []
        )
        rows.append(
            {
                "finding_id": f"FND-{index:02d}",
                "summary": str(finding.get("summary", "")),
                "status": "hypothesis",
                "evidence_ids": evidence,
                "confidence": _float_or_zero(finding.get("confidence")),
            }
        )
    return rows


def _plans_newest_last(case_id: str) -> list[dict[str, Any]]:
    # Real Firestore streams documents in document-ID order (random hex ids),
    # not insertion order like the test fake, so sort by creation time.
    return sorted(repositories.list_plans(case_id), key=_created_at_key)


def _action_rows(
    case_id: str,
    plans_by_id: dict[str, dict[str, Any]],
    guidance: dict[str, Any],
) -> list[dict[str, Any]]:
    results = {
        result.get("action_id"): result
        for result in repositories.list_action_results(case_id)
    }
    approvals = {
        approval.get("action_id"): approval
        for approval in sorted(repositories.list_approvals(case_id), key=_created_at_key)
    }
    blocked = {
        event.get("details", {}).get("action_id"): event.get("details", {})
        for event in repositories.list_audit_events(case_id)
        if event.get("event_type") == "action_blocked"
        and isinstance(event.get("details"), dict)
    }
    rows: list[dict[str, Any]] = []
    for action in sorted(repositories.list_actions(case_id), key=_created_at_key):
        proposal = action.get("proposal", {}) or {}
        result = results.get(action.get("action_id"), {})
        approval = approvals.get(action.get("action_id"), {})
        action_id = action.get("action_id")
        plan_id = action.get("plan_id")
        plan = plans_by_id.get(str(plan_id), {})
        tool = str(proposal.get("tool_name", ""))
        target = str(proposal.get("target_id", ""))
        approver_role = action.get("decided_by_role")
        policy = policy_service.evaluate_approval(
            tool, target, approver_role, guidance=guidance
        )
        policy_reasons = [check.detail for check in policy.checks if check.detail]
        blocked_event = blocked.get(action_id)
        if blocked_event and not result:
            detail = blocked_event.get("detail") or blocked_event.get("reason")
            if detail:
                policy_reasons.append(str(detail))
        rows.append(
            {
                "action_id": action_id,
                "plan_id": plan_id,
                "based_on_state_version": action.get("based_on_state_version"),
                "playbook_step_id": "",
                "phase": plan.get("stage", "assessment"),
                "tool_name": tool,
                "target_id": target,
                "recommendation": proposal.get("rationale")
                or f"{tool} on {target}",
                "evidence_ids": list(proposal.get("evidence_ids") or []),
                "policy_refs": list(proposal.get("policy_refs") or []),
                "required_approver": action.get("required_role")
                or policy.required_role,
                "approver_role": approval.get("approver_role") or approver_role,
                "approval_id": approval.get("approval_id"),
                "approval_decision": approval.get("decision"),
                "approval_state_version": approval.get("state_version"),
                "approval_action_version": approval.get("action_version"),
                "policy_check": {
                    "result": "pass"
                    if policy.ok and not (blocked_event and not result)
                    else "blocked",
                    "reasons": policy_reasons,
                },
                "status": action.get("status", "recommended"),
                "replaces_action_id": None,
                "decided_by": action.get("decided_by"),
                "decided_at": action.get("decided_at"),
                "reason": action.get("reason"),
                "executed_by": None,
                "execution_id": result.get("execution_id"),
                "execution_status": result.get("execution_status"),
                "validation_status": result.get("validation_status"),
                "simulated_at": result.get("simulated_at"),
                "services": dict(result.get("services") or {}),
                "side_effects": list(result.get("side_effects") or []),
                "result": result.get("observed_effect"),
                "result_source": result.get("result_source") if result else None,
            }
        )
    return rows


def _timeline_rows(state: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for event in state.timeline if state else []:
        description = event.description
        rows.append(
            {
                "time": event.timestamp.isoformat() if event.timestamp else None,
                "event": description,
                "source": "analyst_note",
                "side": "defender" if description.startswith("defender:") else "attacker",
                "attack_technique": None,
                "evidence_ids": list(event.evidence_ids),
            }
        )
    return rows


def _affected_rows(state: Any, guidance: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for entity in state.entities if state else []:
        asset = policy_service.resolve_asset(guidance, entity.id)
        rows.append(
            {
                "asset_id": entity.id,
                "name": entity.name,
                "type": asset.get("type", entity.type.value)
                if asset
                else entity.type.value,
                "owner": "",
                "criticality": asset.get("criticality", "unknown")
                if asset
                else "unknown",
                "how_affected": "",
                "data_classification": (
                    "personal_data"
                    if asset and asset.get("holds_personal_data")
                    else "internal"
                    if asset
                    else "unknown"
                ),
                "evidence_ids": list(entity.evidence_ids),
            }
        )
    return rows


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _string_list(value: Any) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


def _is_non_incident(incident_type: str) -> bool:
    return incident_type.strip().lower() in {
        "not_an_incident",
        "false_positive",
        "benign",
        "benign_activity",
    }


def _event_summary(fields: dict[str, Any], event_type: str) -> str:
    label = event_type.replace("_", " ").strip().capitalize() or "Observed event"
    detail = next(
        (
            str(fields[key])
            for key in ("alert", "note", "subject", "process", "query", "application", "result", "verdict", "change_id")
            if fields.get(key) not in (None, "")
        ),
        "",
    )
    actors = [str(fields[key]) for key in ("host", "account") if fields.get(key)]
    actor_text = f" on {' / '.join(actors)}" if actors else ""
    summary = f"{label}{actor_text}{f': {detail}' if detail else ''}"
    return f"{summary[:297]}..." if len(summary) > 300 else summary


def _raw_evidence_detail(fields: dict[str, Any]) -> str:
    parts: list[str] = []
    for key, value in fields.items():
        if value in (None, ""):
            continue
        text = str(value).replace("\r", " ").replace("\n", " ")
        if len(text) > 160:
            text = f"{text[:157]}..."
        parts.append(f"{key}={text}")
    detail = ", ".join(parts)
    return f"{detail[:797]}..." if len(detail) > 800 else detail


def _event_entities(evidence_id: str, state: Any) -> list[str]:
    return sorted(
        entity.id
        for entity in (state.entities if state else [])
        if evidence_id in entity.evidence_ids
    )


def _severity_for_evidence(evidence_ids: list[str], evidence_by_id: dict[str, dict[str, Any]]) -> str:
    rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    values = [
        str((evidence_by_id.get(evidence_id, {}).get("fields") or {}).get("severity", "")).lower()
        for evidence_id in evidence_ids
    ]
    valid = [value for value in values if value in rank]
    return max(valid, key=lambda value: rank[value]).title() if valid else "Observed"


def _structured_findings(
    analysis: dict[str, Any],
    evidence_by_id: dict[str, dict[str, Any]],
    state: Any,
    plan: dict[str, Any] | None,
) -> list[ReportFinding]:
    raw = analysis.get("findings")
    candidates = raw if isinstance(raw, list) else []
    grouped: dict[tuple[str, tuple[str, ...]], dict[str, Any]] = {}
    for original_index, finding in enumerate(candidates, start=1):
        if not isinstance(finding, dict):
            continue
        evidence_ids = [
            item for item in _string_list(finding.get("evidence_ids")) if item in evidence_by_id
        ]
        summary = str(finding.get("summary", "")).strip()
        if not summary or not evidence_ids:
            continue
        entity_ids = sorted(
            {
                entity_id
                for evidence_id in evidence_ids
                for entity_id in _event_entities(evidence_id, state)
            }
        )
        raw_dump = "=" in summary and ":" in summary
        event_types = sorted(
            {
                str((evidence_by_id[evidence_id].get("fields") or {}).get("event_type", "event"))
                for evidence_id in evidence_ids
            }
        )
        key = ((event_types[0] if len(event_types) == 1 and raw_dump else summary), tuple(entity_ids))
        item = grouped.setdefault(
            key,
            {
                "summary": summary,
                "raw_dump": raw_dump,
                "event_type": event_types[0] if event_types else "event",
                "evidence_ids": [],
                "entity_ids": entity_ids,
                "confidence": 0.0,
                "index": original_index,
            },
        )
        item["evidence_ids"] = list(dict.fromkeys([*item["evidence_ids"], *evidence_ids]))
        item["confidence"] = max(item["confidence"], _float_or_zero(finding.get("confidence")))

    rows: list[ReportFinding] = []
    for item in grouped.values():
        cited = [evidence_by_id[evidence_id] for evidence_id in item["evidence_ids"]]
        times = sorted(
            parsed
            for parsed in (_parse_datetime(record.get("event_time")) for record in cited)
            if parsed is not None
        )
        if item["raw_dump"]:
            if len(cited) == 1:
                summary = _event_summary(cited[0].get("fields") or {}, item["event_type"])
            else:
                summary = (
                    f"{len(cited)} stored {item['event_type'].replace('_', ' ')} records "
                    "were cited by the analysis."
                )
            title = f"{item['event_type'].replace('_', ' ').title()} observations"
        else:
            summary = item["summary"]
            title = summary.split(".", 1)[0][:90]
        explicit_techniques = sorted(
            {
                str((record.get("fields") or {}).get("technique"))
                for record in cited
                if ATTACK_TECHNIQUE_ID.match(
                    str((record.get("fields") or {}).get("technique", ""))
                )
            }
        )
        rows.append(
            ReportFinding(
                id=f"FND-{len(rows) + 1:02d}",
                title=title,
                summary=summary,
                severity=_severity_for_evidence(item["evidence_ids"], evidence_by_id),
                confidence=item["confidence"],
                affected_entity_ids=item["entity_ids"],
                evidence_ids=item["evidence_ids"],
                attack_techniques=explicit_techniques,
                first_seen=times[0] if times else None,
                last_seen=times[-1] if times else None,
                plan_id=(plan or {}).get("plan_id"),
                state_version=(plan or {}).get("based_on_state_version"),
            )
        )
    severity_rank = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Observed": 4}
    return sorted(
        rows,
        key=lambda row: (
            severity_rank.get(row.severity, 5),
            -len(row.evidence_ids),
            -(row.confidence or 0),
            row.id,
        ),
    )


def _event_category(
    event_type: str,
    source: str,
    evidence_id: str,
    attack_evidence_ids: set[str],
    incident_type: str,
) -> str:
    if source == "analyst_note" or event_type == "analyst_note":
        return "analyst"
    if source == "itsm" or event_type in {"change_record", "change_ticket"}:
        return "context"
    if not _is_non_incident(incident_type) and evidence_id in attack_evidence_ids:
        return "attack"
    return "observed"


def _structured_timeline(
    evidence: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    state: Any,
    findings: list[ReportFinding],
    incident_type: str,
) -> list[ReportTimelineEvent]:
    finding_evidence_ids = {
        evidence_id for finding in findings for evidence_id in finding.evidence_ids
    }
    relationship_attack_evidence_ids = {
        evidence_id
        for relationship in (state.relationships if state else [])
        if relationship.category.value == "attack"
        for evidence_id in relationship.evidence_ids
    }
    technique_backed_evidence_ids = {
        evidence_id
        for finding in findings
        if finding.attack_techniques
        for evidence_id in finding.evidence_ids
    }
    attack_evidence_ids = technique_backed_evidence_ids.union(
        finding_evidence_ids.intersection(relationship_attack_evidence_ids)
    )
    finding_by_evidence = {
        evidence_id: finding.id
        for finding in findings
        for evidence_id in finding.evidence_ids
    }
    rows: list[ReportTimelineEvent] = []
    for record in evidence:
        evidence_id = str(record.get("evidence_id", ""))
        fields = record.get("fields") if isinstance(record.get("fields"), dict) else {}
        event_type = str(fields.get("event_type") or record.get("kind") or "event")
        source = str(fields.get("source") or "unknown").lower()
        category = _event_category(
            event_type, source, evidence_id, attack_evidence_ids, incident_type
        )
        severity = str(fields.get("severity", "")).lower()
        finding_id = finding_by_evidence.get(evidence_id)
        significance = (
            f"Supports current-state finding {finding_id}."
            if finding_id
            else "Analyst-supplied context."
            if category == "analyst"
            else "Change-management context."
            if category == "context"
            else f"Source severity: {severity}."
            if severity in {"high", "critical"}
            else "Observed record; significance not determined."
        )
        rows.append(
            ReportTimelineEvent(
                timestamp=_parse_datetime(record.get("event_time")),
                category=category,
                event_type=event_type,
                summary=_event_summary(fields, event_type),
                significance=significance,
                entity_ids=_event_entities(evidence_id, state),
                evidence_ids=[evidence_id] if evidence_id else [],
                source=source,
                material=bool(
                    finding_id
                    or category in {"analyst", "context", "attack"}
                    or severity in {"high", "critical"}
                ),
                raw_detail=_raw_evidence_detail(fields),
            )
        )
    for action in actions:
        if action.get("decided_at"):
            decision = action.get("approval_decision") or (
                "rejected" if action.get("status") == "rejected" else "approved"
            )
            rows.append(
                ReportTimelineEvent(
                    timestamp=_parse_datetime(action.get("decided_at")),
                    category="defensive",
                    event_type="action_decision",
                    summary=f"Action {action.get('action_id')} was {decision} for {action.get('target_id') or 'an unrecorded target'}.",
                    significance="Analyst decision recorded.",
                    entity_ids=[str(action.get("target_id"))] if action.get("target_id") else [],
                    evidence_ids=_string_list(action.get("evidence_ids")),
                    source="analyst_decision",
                    material=True,
                )
            )
        if action.get("execution_id"):
            rows.append(
                ReportTimelineEvent(
                    timestamp=_parse_datetime(action.get("simulated_at") or action.get("decided_at")),
                    category="defensive",
                    event_type="action_result",
                    summary=f"Simulated {action.get('tool_name') or 'action'} on {action.get('target_id') or 'an unrecorded target'}.",
                    significance=(
                        f"Execution {action.get('execution_status') or 'unknown'}; "
                        f"validation {action.get('validation_status') or 'unknown'}."
                    ),
                    entity_ids=[str(action.get("target_id"))] if action.get("target_id") else [],
                    evidence_ids=_string_list(action.get("evidence_ids")),
                    source=str(action.get("result_source") or "simulator"),
                    material=True,
                )
            )
    return sorted(
        rows,
        key=lambda row: (
            row.timestamp is None,
            row.timestamp or datetime.max.replace(tzinfo=timezone.utc),
            row.event_type,
            row.evidence_ids[0] if row.evidence_ids else "",
        ),
    )


def _structured_entities(
    state: Any,
    guidance: dict[str, Any],
    findings: list[ReportFinding],
    incident_type: str,
) -> list[ReportEntity]:
    non_incident = _is_non_incident(incident_type)
    finding_evidence = {
        evidence_id for finding in findings for evidence_id in finding.evidence_ids
    }
    finding_entities = {
        entity_id for finding in findings for entity_id in finding.affected_entity_ids
    }
    attack_entities = {
        endpoint
        for relationship in (state.relationships if state else [])
        if relationship.category.value == "attack"
        for endpoint in (relationship.source, relationship.target)
    }
    technique_entities = {
        entity_id
        for finding in findings
        if finding.attack_techniques
        for entity_id in finding.affected_entity_ids
    }
    rows: list[ReportEntity] = []
    for entity in state.entities if state else []:
        asset = policy_service.resolve_asset(guidance, entity.id)
        in_finding = entity.id in finding_entities or bool(
            set(entity.evidence_ids).intersection(finding_evidence)
        )
        condition = str(entity.condition or "").strip().lower()
        affected_condition = condition in {
            "affected",
            "compromised",
            "contained",
            "degraded",
            "isolated",
            "recovered",
        }
        if not non_incident and affected_condition:
            relevance = "confirmed_affected"
            reason = "Supported by the entity's validated current condition."
        elif (
            not non_incident
            and in_finding
            and entity.id in attack_entities.union(technique_entities)
            and entity.type.value in {"ip", "domain", "file", "process"}
        ):
            relevance = "malicious_indicator"
            reason = (
                "Linked to a current-state finding and an attack relationship."
                if entity.id in attack_entities
                else "Linked to a current-state finding with evidence-level ATT&CK mapping."
            )
        elif not non_incident and in_finding:
            relevance = "suspected_affected"
            reason = (
                "Linked to a current-state finding; an affected condition is not confirmed."
            )
        else:
            relevance = "contextual"
            reason = "Observed in stored evidence without an authoritative affected-state determination."
        role = (
            f"Managed {asset.get('type', 'asset')}"
            if asset
            else {
                "host": "Observed endpoint",
                "account": "Observed identity",
                "ip": "Network address",
                "domain": "Network domain",
                "process": "Observed process",
                "file": "Observed file",
                "session": "Observed session",
            }.get(entity.type.value, "Observed entity")
        )
        rows.append(
            ReportEntity(
                id=entity.id,
                type=entity.type.value,
                display_name=entity.name,
                role=role,
                condition=entity.condition or "unknown",
                relevance=relevance,
                relevance_reason=reason,
                first_seen=entity.first_seen,
                last_seen=entity.last_seen,
                evidence_count=len(entity.evidence_ids),
                evidence_ids=list(entity.evidence_ids),
            )
        )
    order = {
        "confirmed_affected": 0,
        "suspected_affected": 1,
        "malicious_indicator": 2,
        "contextual": 3,
    }
    return sorted(rows, key=lambda row: (order[row.relevance], -row.evidence_count, row.id))


def _structured_actions(actions: list[dict[str, Any]]) -> list[ReportAction]:
    rows: list[ReportAction] = []
    for action in actions:
        validation = str(action.get("validation_status") or "not_validated")
        effectiveness = (
            validation
            if validation in {"effective", "ineffective", "not_applicable"}
            else "unknown"
        )
        approval = str(
            action.get("approval_decision")
            or ("rejected" if action.get("status") == "rejected" else "pending")
        )
        rows.append(
            ReportAction(
                action_id=str(action.get("action_id") or ""),
                action_type=str(action.get("tool_name") or ""),
                target=str(action.get("target_id") or ""),
                recommendation=str(action.get("recommendation") or ""),
                proposed_status=str(action.get("status") or "recommended"),
                approval_status=approval,
                execution_status=str(action.get("execution_status") or "not_started"),
                validation_status=validation,
                effectiveness=effectiveness,
                outcome=str(action.get("result") or ""),
                state_version=action.get("based_on_state_version"),
                timestamp=_parse_datetime(
                    action.get("simulated_at") or action.get("decided_at")
                ),
                plan_id=action.get("plan_id"),
                phase=str(action.get("phase") or "assessment"),
                approval_id=action.get("approval_id"),
                decided_by=action.get("decided_by"),
                approver_role=action.get("approver_role"),
                decision_reason=action.get("reason"),
                execution_id=action.get("execution_id"),
                result_source=action.get("result_source"),
                evidence_ids=_string_list(action.get("evidence_ids")),
                policy_refs=_string_list(action.get("policy_refs")),
            )
        )
    return rows


def _evidence_references(evidence: list[dict[str, Any]]) -> list[ReportEvidenceReference]:
    rows: list[ReportEvidenceReference] = []
    for item in evidence:
        location = item.get("source_location") or {}
        location_text = (
            f"line {location.get('line')}"
            if location.get("line") is not None
            else f"row {location.get('row')}"
            if location.get("row") is not None
            else ""
        )
        fields = item.get("fields") if isinstance(item.get("fields"), dict) else {}
        rows.append(
            ReportEvidenceReference(
                evidence_id=str(item.get("evidence_id") or ""),
                source_file=str(item.get("source_file") or "unknown"),
                source_location=location_text,
                timestamp=_parse_datetime(item.get("event_time")),
                event_type=str(fields.get("event_type") or item.get("kind") or "event"),
                source=str(fields.get("source") or "unknown"),
                sha256=str(item.get("sha256") or ""),
            )
        )
    return sorted(
        rows,
        key=lambda row: (
            row.timestamp is None,
            row.timestamp or datetime.max.replace(tzinfo=timezone.utc),
            row.evidence_id,
        ),
    )


def _executive_summary(
    case: dict[str, Any],
    overview: ReportOverview,
    findings: list[ReportFinding],
    actions: list[ReportAction],
    gaps: list[str],
    has_current_analysis: bool,
) -> tuple[str, str]:
    primary = ", ".join(overview.primary_assets[:3]) or "no primary affected asset is confirmed"
    effective = [action for action in actions if action.effectiveness == "effective"]
    ineffective = [action for action in actions if action.effectiveness == "ineffective"]
    if has_current_analysis:
        classification = (
            "classifies the activity as not an incident"
            if _is_non_incident(overview.incident_type)
            else f"classifies the incident as {overview.incident_type.replace('_', ' ')}"
        )
        opening = (
            f"Current-state planner analysis {classification} at {overview.severity} severity. "
            + (f"The prioritized findings record: {findings[0].summary} " if findings else "")
        )
        source = "current_state_analysis"
    else:
        opening = (
            "Record-derived summary: no analytical summary bound to the current incident state is available. "
            f"The case is {case.get('status', 'unknown')} and stored records identify {primary}. "
        )
        source = "record_derived"
    impact = "Confirmed business impact is not recorded. "
    response = (
        f"{len(effective)} simulated response action(s) were validated effective"
        + (f", while {len(ineffective)} were ineffective" if ineffective else "")
        + ". "
        if effective or ineffective
        else "No simulated response action has been validated effective. "
    )
    unresolved = (
        f"{len(gaps)} unresolved evidence question(s) remain."
        if gaps
        else "No explicit evidence question is recorded; analyst review is still required."
    )
    if _is_non_incident(overview.incident_type):
        unresolved += " Analyst closure or false-positive confirmation is not recorded."
    return opening + impact + response + unresolved, source


def _build_analyst_report(
    *,
    case: dict[str, Any],
    state: Any,
    evidence: list[dict[str, Any]],
    plan: dict[str, Any] | None,
    plan_is_stale: bool,
    analysis: dict[str, Any],
    techniques: list[str],
    actions: list[dict[str, Any]],
    guidance: dict[str, Any],
    planner_model: str,
) -> AnalystReport:
    evidence_by_id = {
        str(item.get("evidence_id")): item for item in evidence if item.get("evidence_id")
    }
    has_current_analysis = bool(plan and not plan_is_stale and analysis)
    current_analysis = analysis if has_current_analysis else {}
    incident_type = str(current_analysis.get("incident_type") or "other")
    is_non_incident = _is_non_incident(incident_type)
    severity = str(current_analysis.get("severity") or "unknown").lower()
    if severity not in {"low", "medium", "high", "critical"}:
        severity = "unknown"
    technical_findings = _structured_findings(analysis, evidence_by_id, state, plan)
    current_findings = technical_findings if has_current_analysis else []
    key_findings = current_findings[:6]
    timeline = _structured_timeline(
        evidence, actions, state, key_findings, incident_type
    )
    entities = _structured_entities(state, guidance, current_findings, incident_type)
    structured_actions = _structured_actions(actions)
    primary_assets = [
        entity.display_name
        for entity in entities
        if entity.relevance in {"confirmed_affected", "suspected_affected"}
        and entity.type in {"host", "account"}
    ][:4]
    plan_status = "stale" if plan_is_stale else "current" if plan else "not_available"
    overview = ReportOverview(
        case_id=str(case.get("case_id") or ""),
        case_status=str(case.get("status") or "unknown"),
        incident_status="not_an_incident" if is_non_incident else "suspected",
        severity=severity,
        incident_type=incident_type,
        current_phase=(
            "reanalysis_required"
            if plan_is_stale
            else str((plan or {}).get("stage") or "assessment")
        ),
        primary_assets=primary_assets,
        state_version=state.version if state else None,
        plan_id=(plan or {}).get("plan_id"),
        plan_state_version=(plan or {}).get("based_on_state_version"),
        plan_status=plan_status,
        planner_model=planner_model or None,
    )
    gaps = _string_list((plan or {}).get("missing_evidence")) if not plan_is_stale else []
    summary, summary_source = _executive_summary(
        case, overview, key_findings, structured_actions, gaps, has_current_analysis
    )
    remaining_risk = [
        f"Action {action.action_id} was validated ineffective."
        for action in structured_actions
        if action.effectiveness == "ineffective"
    ]
    if plan_is_stale:
        remaining_risk.insert(
            0,
            "Re-analysis is required because the latest plan is bound to an earlier incident-state version.",
        )
    remaining_risk.extend(f"Unresolved evidence question: {gap}" for gap in gaps)
    next_steps: list[ReportNextStep] = []
    if plan_is_stale:
        next_steps.append(
            ReportNextStep(
                priority="High",
                text="Re-run analysis against the current incident-state version.",
                status="Required",
            )
        )
    next_steps.extend(
        ReportNextStep(
            priority="High" if "required" in gap.lower() else "Medium",
            text=gap,
            status="Open",
        )
        for gap in gaps
    )
    next_steps.extend(
        ReportNextStep(
            priority="Medium",
            text=action.recommendation or f"Review action {action.action_id}.",
            owner=action.approver_role or "Unassigned",
            status="Awaiting approval",
            related_ids=[action.action_id],
        )
        for action in structured_actions
        if action.approval_status == "pending"
    )
    return AnalystReport(
        overview=overview,
        executive_summary=summary,
        executive_summary_source=summary_source,
        key_findings=key_findings,
        key_timeline=[event for event in timeline if event.material],
        entities=entities,
        response_actions=structured_actions,
        impact=ReportImpact(remaining_risk=remaining_risk),
        next_steps=next_steps,
        appendices=ReportAppendices(
            evidence_index=_evidence_references(evidence),
            raw_chronology=timeline,
            technical_findings=technical_findings,
            attack_mapping=techniques,
            provenance=ReportProvenance(
                state_version=state.version if state else None,
                state_parent_version=state.parent_version if state else None,
                state_created_from=state.created_from.value
                if state and state.created_from
                else None,
                state_change_reason=state.change_reason if state else None,
                plan_id=(plan or {}).get("plan_id"),
                plan_state_version=(plan or {}).get("based_on_state_version"),
                plan_is_stale=plan_is_stale,
                action_ids=[action.action_id for action in structured_actions],
                execution_ids=[
                    action.execution_id
                    for action in structured_actions
                    if action.execution_id
                ],
            ),
        ),
    )


def _render_pdf(report: dict[str, Any]) -> Path:
    report_dir = Path(get_settings().report_path)
    return render_report_pdf(report, report_dir / f"{report['report_id']}.pdf")


def generate_report(case_id: str) -> dict[str, Any]:
    case = repositories.get_case(case_id)
    if case is None:
        raise ReportingError(f"case not found: {case_id}", "not_found")

    state = state_manager.get_current_state(case_id)
    evidence = repositories.list_evidence(case_id)
    stored_evidence_ids = {item.get("evidence_id") for item in evidence}
    plans = _plans_newest_last(case_id)
    plan = plans[-1] if plans else None
    current_state_version = state.version if state else None
    plan_state_version = (plan or {}).get("based_on_state_version")
    plan_is_stale = bool(plan and plan_state_version != current_state_version)
    # A plan remains part of the historical record after an action result creates
    # a newer state. Keep its analysis, but expose the exact binding and stale bit
    # so consumers never mistake it for analysis of the current state.
    phase = (plan or {}).get("stage", "assessment")
    gaps = list((plan or {}).get("missing_evidence", []))
    analysis = (plan or {}).get("analysis")
    if not isinstance(analysis, dict):
        analysis = {}
    incident_type = analysis.get("incident_type")
    incident_type = incident_type if isinstance(incident_type, str) and incident_type else "other"
    severity = analysis.get("severity")
    severity = severity if isinstance(severity, str) and severity else "unknown"
    raw_techniques = analysis.get("attack_techniques")
    analysis_techniques = (
        [t for t in raw_techniques if isinstance(t, str) and ATTACK_TECHNIQUE_ID.match(t)]
        if isinstance(raw_techniques, list)
        else []
    )
    guidance = load_guidance()
    techniques = list(
        dict.fromkeys(
            [
                technique
                for technique in [
                    *(state.attack_mapping if state else []),
                    *analysis_techniques,
                ]
                if ATTACK_TECHNIQUE_ID.match(technique)
            ]
        )
    )
    settings = get_settings()
    now = datetime.now(timezone.utc).isoformat()
    report_id = f"RPT-{uuid.uuid4().hex[:12]}"

    plans_by_id = {
        str(item.get("plan_id")): item for item in plans if item.get("plan_id")
    }
    actions = _action_rows(case_id, plans_by_id, guidance)
    entity_count = len(state.entities) if state else 0
    summary = (
        f"Draft generated from stored case records: {entity_count} entities "
        f"observed, {len(evidence)} evidence records, {len(actions)} proposed "
        f"actions, {len(gaps)} open questions."
    )

    report: dict[str, Any] = {
        "template_schema_version": "2.0",
        "report_id": report_id,
        "incident_id": case_id,
        "version": max(
            [int(item.get("version", 0)) for item in repositories.list_reports(case_id)]
            or [0]
        )
        + 1,
        "status": "draft",
        "title": case.get("title", ""),
        "organisation": ORGANISATION,
        "playbook": {
            "id": guidance["playbook"]["id"],
            "version": guidance["playbook"]["version"],
        },
        "policy_pack_version": guidance["policy_pack_version"],
        "planner_model": getattr(settings, "opencode_go_model", "unknown"),
        "current_state_version": current_state_version,
        "recovery_status": state.recovery_status.value if state else None,
        "plan_id": (plan or {}).get("plan_id"),
        "plan_based_on_state_version": plan_state_version,
        "plan_is_stale": plan_is_stale,
        "created_at": now,
        "updated_at": now,
        "executive_summary": {"text": summary, "finding_ids": []},
        "classification": {
            "incident_type": incident_type,
            "status": "suspected",
            "closure_reason": None,
            "closure_evidence_ids": [],
            "severity": severity,
            "severity_reason": (
                "Assessed by the planner from stored evidence."
                if analysis
                else "Not assessed by the prototype."
            ),
            "confidence": _float_or_zero(analysis.get("confidence")),
            "current_phase": phase,
            "attack_techniques": list(techniques),
            "confirmed_by_analyst": False,
        },
        "affected": _affected_rows(state, guidance),
        "exposed_credentials": [],
        "timeline": _timeline_rows(state),
        "findings": [
            row
            for row in _finding_rows(analysis)
            if stored_evidence_ids.intersection(row["evidence_ids"])
        ],
        "root_cause": {"text": "", "finding_ids": [], "status": "hypothesis"},
        "impact": {
            "operational": "",
            "personal_data_involved": "unknown",
            "compliance": "",
            "financial": "not assessed",
            "overall_rating": "unknown",
        },
        "actions": actions,
        "evidence_preservation": [],
        "notifications": [],
        "recommendations": [],
        "open_questions": [
            {
                "question": gap,
                "reason": "missing_evidence",
                "answer": None,
                "related_ids": [],
            }
            for gap in gaps
        ],
        "metrics": {
            "time_to_detect": None,
            "time_to_contain": None,
            "time_to_report": None,
            "analyst_decisions": len(repositories.list_approvals(case_id)),
        },
        "policy_conformance": [],
        "sign_off": None,
        "evidence_index": [
            {
                "evidence_id": item.get("evidence_id"),
                "source_file": item.get("source_file"),
                "line": (item.get("source_location") or {}).get("line")
                if (item.get("source_location") or {}).get("line") is not None
                else (item.get("source_location") or {}).get("row"),
                "time": item.get("event_time"),
                "sha256": item.get("sha256"),
                "untrusted": True,
            }
            for item in evidence
        ],
    }

    analyst_report = _build_analyst_report(
        case={**case, "case_id": case_id},
        state=state,
        evidence=evidence,
        plan=plan,
        plan_is_stale=plan_is_stale,
        analysis=analysis,
        techniques=techniques,
        actions=actions,
        guidance=guidance,
        planner_model=str(getattr(settings, "opencode_go_model", "unknown")),
    )
    report["analyst_report"] = analyst_report.model_dump(mode="json")
    report["executive_summary"] = {
        "text": analyst_report.executive_summary,
        "finding_ids": [finding.id for finding in analyst_report.key_findings],
    }

    pdf_path = _render_pdf(report)
    report["pdf_path"] = str(pdf_path)
    repositories.add_report(case_id, report_id, report)
    audit_service.record(
        case_id, "report_generated", {"report_id": report_id, "pdf_path": str(pdf_path)}
    )
    return report


def get_report(case_id: str, report_id: str) -> dict[str, Any]:
    if not repositories.case_exists(case_id):
        raise ReportingError(f"case not found: {case_id}", "not_found")
    report = repositories.get_report(case_id, report_id)
    if report is None:
        raise ReportingError(f"report not found: {report_id}", "not_found")
    return report


def get_latest_report(case_id: str) -> dict[str, Any]:
    if not repositories.case_exists(case_id):
        raise ReportingError(f"case not found: {case_id}", "not_found")
    reports = sorted(
        repositories.list_reports(case_id),
        key=lambda report: (_created_at_key(report), str(report.get("report_id", ""))),
    )
    if not reports:
        raise ReportingError(f"no reports found for case: {case_id}", "not_found")
    return reports[-1]


def get_report_pdf_path(case_id: str, report_id: str) -> Path:
    get_report(case_id, report_id)
    report_dir = Path(get_settings().report_path).resolve()
    pdf_path = (report_dir / f"{report_id}.pdf").resolve()
    if pdf_path.parent != report_dir or not pdf_path.is_file():
        raise ReportingError(f"report PDF not found: {report_id}", "not_found")
    return pdf_path
