"""Reporting service (BL-003).

Generates the structured incident-report JSON (schema v1.2 shape) from stored
case records, then renders it to PDF with ReportLab. Reports reference a
specific incident-state version and may only contain facts supported by
stored records; sections the prototype cannot source stay empty or are
explicitly "unknown".
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.ai.langgraph_planner import load_guidance
from app.config import get_settings
from app.database import repositories
from app.services import audit_service, state_manager

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


def _latest_plan(case_id: str) -> dict[str, Any] | None:
    # Real Firestore streams documents in document-ID order (random hex ids),
    # not insertion order like the test fake, so sort by creation time.
    plans = sorted(repositories.list_plans(case_id), key=_created_at_key)
    return plans[-1] if plans else None


def _action_rows(case_id: str, phase: str) -> list[dict[str, Any]]:
    results = {
        result.get("action_id"): result
        for result in repositories.list_action_results(case_id)
    }
    rows: list[dict[str, Any]] = []
    for action in repositories.list_actions(case_id):
        proposal = action.get("proposal", {}) or {}
        result = results.get(action.get("action_id"), {})
        rows.append(
            {
                "action_id": action.get("action_id"),
                "playbook_step_id": "",
                "phase": phase,
                "recommendation": proposal.get("rationale")
                or f"{proposal.get('tool_name')} on {proposal.get('target_id')}",
                "status": action.get("status", "recommended"),
                "replaces_action_id": None,
                "decided_by": action.get("decided_by"),
                "decided_at": action.get("decided_at"),
                "reason": action.get("reason"),
                "executed_by": None,
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


def _render_pdf(report: dict[str, Any]) -> Path:
    report_dir = Path(get_settings().report_path)
    pdf_path = report_dir / f"{report['report_id']}.pdf"

    styles = getSampleStyleSheet()
    story: list[Any] = []

    def section(title: str, lines: list[str]) -> None:
        story.append(Paragraph(escape(title), styles["Heading2"]))
        for line in lines:
            story.append(Paragraph(escape(line), styles["BodyText"]))
        story.append(Spacer(1, 0.25 * cm))

    story.append(Paragraph(escape(report["title"] or report["incident_id"]), styles["Title"]))
    story.append(
        Paragraph(
            escape(f"{report['organisation']} — {report['report_id']} ({report['status']})"),
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.4 * cm))

    classification = report["classification"]
    techniques = classification.get("attack_techniques") or []
    section(
        "Classification",
        [
            f"Phase: {classification['current_phase']} | Status: {classification['status']} "
            f"| Severity: {classification['severity']}",
            f"Type: {classification['incident_type']} | "
            f"Confidence: {classification['confidence']}"
            + (f" | ATT&CK: {', '.join(techniques)}" if techniques else ""),
        ],
    )
    section("Executive summary", [report["executive_summary"]["text"]])
    finding_lines = [
        f"{finding['finding_id']}: {finding['summary']}"
        + (f" (evidence: {', '.join(finding['evidence_ids'])})" if finding["evidence_ids"] else "")
        for finding in report["findings"]
    ]
    section("Findings", finding_lines or ["None recorded"])
    affected = [f"{a['asset_id']} ({a['type']})" for a in report["affected"]]
    section("Affected entities", affected or ["None recorded"])
    timeline = [f"[{t['side']}] {t['event']}" for t in report["timeline"][:40]]
    section("Timeline", timeline or ["None recorded"])
    actions = [f"{a['status'].upper()}: {a['recommendation']}" for a in report["actions"]]
    section("Response actions", actions or ["None recorded"])
    gaps = [q["question"] for q in report["open_questions"]]
    section("Open questions", gaps or ["None"])
    evidence = [
        f"{e['evidence_id']} — {e['source_file']}" for e in report["evidence_index"][:40]
    ]
    section("Evidence index", evidence or ["None recorded"])

    SimpleDocTemplate(str(pdf_path), pagesize=A4).build(story)
    return pdf_path


def generate_report(case_id: str) -> dict[str, Any]:
    case = repositories.get_case(case_id)
    if case is None:
        raise ReportingError(f"case not found: {case_id}", "not_found")

    state = state_manager.get_current_state(case_id)
    evidence = repositories.list_evidence(case_id)
    plan = _latest_plan(case_id)
    phase = (plan or {}).get("stage", "assessment")
    gaps = list((plan or {}).get("missing_evidence", []))
    analysis = (plan or {}).get("analysis") or {}
    guidance = load_guidance()
    now = datetime.now(timezone.utc).isoformat()
    report_id = f"RPT-{uuid.uuid4().hex[:12]}"

    actions = _action_rows(case_id, phase)
    entity_count = len(state.entities) if state else 0
    summary = (
        f"Draft generated from stored case records: {entity_count} entities "
        f"observed, {len(evidence)} evidence records, {len(actions)} proposed "
        f"actions, {len(gaps)} open questions."
    )

    report: dict[str, Any] = {
        "report_id": report_id,
        "incident_id": case_id,
        "version": 1,
        "status": "draft",
        "title": case.get("title", ""),
        "organisation": ORGANISATION,
        "playbook": {
            "id": guidance["playbook"]["id"],
            "version": guidance["playbook"]["version"],
        },
        "policy_pack_version": guidance["policy_pack_version"],
        "created_at": now,
        "updated_at": now,
        "executive_summary": {"text": summary, "finding_ids": []},
        "classification": {
            "incident_type": analysis.get("incident_type") or "other",
            "status": "suspected",
            "closure_reason": None,
            "severity": analysis.get("severity") or "unknown",
            "severity_reason": (
                "Assessed by the planner from stored evidence."
                if analysis
                else "Not assessed by the prototype."
            ),
            "confidence": float(analysis.get("confidence") or 0.0),
            "current_phase": phase,
            "attack_techniques": list(analysis.get("attack_techniques") or []),
            "confirmed_by_analyst": False,
        },
        "affected": [
            {
                "asset_id": entity.id,
                "name": entity.name,
                "type": entity.type.value,
                "owner": "",
                "criticality": "unknown",
                "how_affected": "",
                "data_classification": "",
                "evidence_ids": [],
            }
            for entity in (state.entities if state else [])
        ],
        "exposed_credentials": [],
        "timeline": _timeline_rows(state),
        "findings": [
            {
                "finding_id": f"FND-{index:02d}",
                "summary": finding.get("summary", ""),
                "evidence_ids": list(finding.get("evidence_ids") or []),
                "confidence": float(finding.get("confidence") or 0.0),
            }
            for index, finding in enumerate(analysis.get("findings") or [], start=1)
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
