"""Professional ReportLab renderer for the typed analyst report contract."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    LongTable,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas.report import AnalystReport

NAVY = colors.HexColor("#101827")
SURFACE = colors.HexColor("#E9EDF2")
SURFACE_ALT = colors.HexColor("#F6F8FA")
BORDER = colors.HexColor("#BCC6D3")
TEXT = colors.HexColor("#1B2637")
MUTED = colors.HexColor("#53657D")
LIME = colors.HexColor("#84C900")
AMBER = colors.HexColor("#F2B84B")
WHITE = colors.white


def _text(value: Any) -> str:
    return escape(str(value if value not in (None, "") else "Not recorded"))


def _time(value: Any) -> str:
    if value in (None, ""):
        return "Not recorded"
    return str(value).replace("+00:00", "Z")


def _label(value: str) -> str:
    return value.replace("_", " ").strip().title()


class _NumberedCanvas(canvas.Canvas):
    """Replay pages at save-time so the footer can include total pages."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states: list[dict[str, Any]] = []

    def showPage(self) -> None:  # noqa: N802 - ReportLab API
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        page_count = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.setFillColor(MUTED)
            self.setFont("Helvetica", 7.5)
            self.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {self._pageNumber} of {page_count}")
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)


class _IncidentReportDocument(BaseDocTemplate):
    def __init__(self, filename: str, report: dict[str, Any]) -> None:
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=23 * mm,
            bottomMargin=18 * mm,
            title=f"Caventas Incident Response Report - {report['report_id']}",
            author="Caventas",
            subject=f"Incident response report for {report['incident_id']}",
            keywords=f"Caventas, incident response, {report['incident_id']}, {report['report_id']}",
        )
        self.report = report
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="report-body",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(PageTemplate(id="report", frames=[frame], onPage=self._page_chrome))

    def beforeDocument(self) -> None:
        self.canv.setTitle(f"Caventas Incident Response Report - {self.report['report_id']}")
        self.canv.setAuthor("Caventas")
        self.canv.setSubject(f"Incident response report for {self.report['incident_id']}")
        self.canv.setKeywords(
            f"Caventas, incident response, {self.report['incident_id']}, {self.report['report_id']}"
        )
        self.canv.setCreator("Caventas Incident Response Planner")

    def _page_chrome(self, pdf: canvas.Canvas, doc: BaseDocTemplate) -> None:
        pdf.saveState()
        pdf.setFillColor(NAVY)
        pdf.rect(0, A4[1] - 15 * mm, A4[0], 15 * mm, stroke=0, fill=1)
        pdf.setFillColor(WHITE)
        pdf.setFont("Helvetica-Bold", 8.5)
        pdf.drawString(18 * mm, A4[1] - 9.5 * mm, "CAVENTAS  /  INCIDENT RESPONSE REPORT")
        pdf.setFont("Helvetica", 7.5)
        pdf.drawRightString(
            A4[0] - 18 * mm,
            A4[1] - 9.5 * mm,
            f"{self.report['status'].upper()}  |  {self.report['report_id']}",
        )
        pdf.setStrokeColor(BORDER)
        pdf.line(18 * mm, 14 * mm, A4[0] - 18 * mm, 14 * mm)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 7.5)
        pdf.drawString(18 * mm, 10 * mm, f"Case {self.report['incident_id']}")
        pdf.restoreState()


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=23,
            leading=27,
            textColor=NAVY,
            alignment=TA_LEFT,
            spaceAfter=4 * mm,
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=MUTED,
            spaceAfter=5 * mm,
        ),
        "h1": ParagraphStyle(
            "SectionHeading",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=17,
            textColor=NAVY,
            spaceBefore=5 * mm,
            spaceAfter=2.5 * mm,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "SubsectionHeading",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            textColor=TEXT,
            spaceBefore=3 * mm,
            spaceAfter=1.5 * mm,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "ReportBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=13,
            textColor=TEXT,
            spaceAfter=2 * mm,
        ),
        "small": ParagraphStyle(
            "ReportSmall",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.6,
            leading=10,
            textColor=TEXT,
        ),
        "mono": ParagraphStyle(
            "ReportMono",
            parent=base["Code"],
            fontName="Courier",
            fontSize=6.7,
            leading=8.3,
            textColor=TEXT,
            wordWrap="CJK",
        ),
        "table_head": ParagraphStyle(
            "TableHead",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.3,
            leading=9,
            textColor=WHITE,
        ),
        "warning": ParagraphStyle(
            "Warning",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.2,
            leading=13,
            textColor=TEXT,
            borderColor=AMBER,
            borderWidth=1,
            borderPadding=8,
            backColor=colors.HexColor("#FFF5DB"),
            spaceAfter=4 * mm,
        ),
        "empty": ParagraphStyle(
            "Empty",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=11,
            textColor=MUTED,
            spaceAfter=2 * mm,
        ),
        "right": ParagraphStyle(
            "Right",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            alignment=TA_RIGHT,
            textColor=MUTED,
        ),
    }


def _p(value: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(_text(value), style)


def _cell(value: Any, styles: dict[str, ParagraphStyle], *, mono: bool = False) -> Paragraph:
    return _p(_bounded(str(value), 320), styles["mono" if mono else "small"])


def _table(
    headers: list[str],
    rows: Iterable[list[Any]],
    widths: list[float],
    styles: dict[str, ParagraphStyle],
    *,
    mono_columns: set[int] | None = None,
) -> LongTable:
    mono_columns = mono_columns or set()
    data: list[list[Any]] = [[_p(header, styles["table_head"]) for header in headers]]
    for row in rows:
        data.append(
            [
                _cell(
                    _bounded(str(value), max(72, min(320, int(widths[index] * 2)))),
                    styles,
                    mono=index in mono_columns,
                )
                for index, value in enumerate(row)
            ]
        )
    table = LongTable(data, colWidths=widths, repeatRows=1, splitByRow=1, hAlign="LEFT")
    commands: list[tuple[Any, ...]] = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for row_index in range(1, len(data)):
        commands.append(
            ("BACKGROUND", (0, row_index), (-1, row_index), SURFACE_ALT if row_index % 2 else SURFACE)
        )
    table.setStyle(TableStyle(commands))
    return table


def _section(story: list[Any], title: str, styles: dict[str, ParagraphStyle]) -> None:
    story.extend([CondPageBreak(24 * mm), Paragraph(escape(title), styles["h1"])])


def _empty(story: list[Any], message: str, styles: dict[str, ParagraphStyle]) -> None:
    story.append(Paragraph(escape(message), styles["empty"]))


def _refs(values: Iterable[str]) -> str:
    return ", ".join(str(value) for value in values) or "None"


def _bounded(value: str, limit: int = 320) -> str:
    return f"{value[:limit - 3]}..." if len(value) > limit else value


def render_report_pdf(report: dict[str, Any], output_path: Path) -> Path:
    """Render only typed ``analyst_report`` content; never parse display strings."""
    analyst = AnalystReport.model_validate(report["analyst_report"])
    styles = _styles()
    story: list[Any] = []
    width = A4[0] - 36 * mm

    story.append(Paragraph("Caventas Incident Response Report", styles["title"]))
    story.append(Paragraph(_text(report.get("title") or report["incident_id"]), styles["subtitle"]))

    overview = analyst.overview
    overview_rows = [
        ["Case ID", report["incident_id"], "Status", report["status"]],
        ["Report ID", report["report_id"], "Generated", _time(report["created_at"])],
        ["Severity", overview.severity, "Incident type", _label(overview.incident_type)],
        ["Current phase", _label(overview.current_phase), "Primary assets", _refs(overview.primary_assets)],
        ["State version", overview.state_version or "Not recorded", "Plan status", _label(overview.plan_status)],
        ["Latest plan", overview.plan_id or "Not available", "Planner model", overview.planner_model or "Not recorded"],
    ]
    overview_table = Table(
        [[_cell(value, styles, mono=index in {1, 3}) for index, value in enumerate(row)] for row in overview_rows],
        colWidths=[28 * mm, 57 * mm, 28 * mm, width - 113 * mm],
        hAlign="LEFT",
    )
    overview_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE_ALT),
                ("BACKGROUND", (0, 0), (0, -1), SURFACE),
                ("BACKGROUND", (2, 0), (2, -1), SURFACE),
                ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(overview_table)
    story.append(Spacer(1, 4 * mm))

    if overview.plan_status == "stale":
        story.append(
            Paragraph(
                "Re-analysis required: the latest plan is bound to an earlier incident-state version.",
                styles["warning"],
            )
        )

    _section(story, "Executive summary", styles)
    story.append(Paragraph(_text(analyst.executive_summary), styles["body"]))
    story.append(
        Paragraph(
            escape(f"Source: {_label(analyst.executive_summary_source)}"),
            styles["small"],
        )
    )

    _section(story, "Key findings", styles)
    if analyst.key_findings:
        story.append(
            _table(
                ["Severity", "Finding", "Affected asset", "Evidence"],
                [
                    [
                        finding.severity,
                        f"{finding.title}\n{finding.summary}",
                        _refs(finding.affected_entity_ids),
                        _refs(finding.evidence_ids),
                    ]
                    for finding in analyst.key_findings
                ],
                [19 * mm, 75 * mm, 40 * mm, width - 134 * mm],
                styles,
                mono_columns={2, 3},
            )
        )
    else:
        _empty(story, "No current-state prioritized findings are recorded.", styles)

    _section(story, "Key incident timeline", styles)
    if analyst.key_timeline:
        story.append(
            _table(
                ["Time", "Category", "Event", "Asset / actor", "Significance", "Evidence"],
                [
                    [
                        _time(event.timestamp),
                        _label(event.category),
                        event.summary,
                        _refs(event.entity_ids),
                        event.significance,
                        _refs(event.evidence_ids),
                    ]
                    for event in analyst.key_timeline
                ],
                [25 * mm, 18 * mm, 43 * mm, 30 * mm, 38 * mm, width - 154 * mm],
                styles,
                mono_columns={0, 3, 5},
            )
        )
    else:
        _empty(story, "No material timeline events are recorded.", styles)

    _section(story, "Affected and related entities", styles)
    groups = [
        ("confirmed_affected", "Confirmed affected"),
        ("suspected_affected", "Suspected affected"),
        ("malicious_indicator", "Malicious indicators / infrastructure"),
        ("contextual", "Related / contextual entities"),
    ]
    for key, heading in groups:
        entities = [entity for entity in analyst.entities if entity.relevance == key]
        story.append(Paragraph(escape(heading), styles["h2"]))
        if not entities:
            _empty(story, "No record-backed entities in this group.", styles)
            continue
        story.append(
            _table(
                ["Entity", "Type", "Role", "Condition", "Relevance", "Evidence"],
                [
                    [
                        f"{entity.display_name}\n{entity.id}",
                        entity.type,
                        entity.role,
                        entity.condition,
                        entity.relevance_reason,
                        str(entity.evidence_count),
                    ]
                    for entity in entities
                ],
                [38 * mm, 18 * mm, 28 * mm, 22 * mm, 53 * mm, width - 159 * mm],
                styles,
                mono_columns={0},
            )
        )

    _section(story, "Response actions", styles)
    if analyst.response_actions:
        story.append(
            _table(
                ["Action", "Target", "Approval", "Execution", "Validation", "Outcome"],
                [
                    [
                        f"{action.action_type}\n{action.action_id}\nState v{action.state_version or 'unknown'}",
                        action.target,
                        action.approval_status,
                        action.execution_status,
                        f"{action.validation_status}\n{action.effectiveness}",
                        action.outcome or "No outcome recorded.",
                    ]
                    for action in analyst.response_actions
                ],
                [35 * mm, 32 * mm, 23 * mm, 23 * mm, 27 * mm, width - 140 * mm],
                styles,
                mono_columns={0, 1},
            )
        )
    else:
        _empty(story, "No response actions are recorded.", styles)

    _section(story, "Impact and remaining risk", styles)
    for heading, values, empty_message in [
        ("Confirmed impact", analyst.impact.confirmed, "Confirmed impact is unknown; no authoritative impact assessment is recorded."),
        ("Potential impact", analyst.impact.potential, "No record-backed potential impact statement is recorded."),
        ("Remaining risk", analyst.impact.remaining_risk, "No explicit remaining-risk item is recorded."),
    ]:
        story.append(Paragraph(escape(heading), styles["h2"]))
        if values:
            for value in values:
                story.append(Paragraph(f"- {_text(value)}", styles["body"]))
        else:
            _empty(story, empty_message, styles)

    _section(story, "Required next steps and open questions", styles)
    if analyst.next_steps:
        story.append(
            _table(
                ["Priority", "Required action / question", "Owner", "Status"],
                [[step.priority, step.text, step.owner, step.status] for step in analyst.next_steps],
                [19 * mm, 92 * mm, 32 * mm, width - 143 * mm],
                styles,
            )
        )
    else:
        _empty(story, "No record-backed next steps are recorded; this does not imply that no action is required.", styles)

    _section(story, "Technical appendices", styles)
    story.append(Paragraph("Appendix A - Complete evidence index", styles["h2"]))
    if analyst.appendices.evidence_index:
        story.append(
            _table(
                [
                    "Evidence",
                    "Source",
                    "Location",
                    "Time",
                    "Event type",
                    "Trust",
                    "SHA-256",
                ],
                [
                    [
                        item.evidence_id,
                        item.source_file,
                        item.source_location,
                        _time(item.timestamp),
                        item.event_type,
                        "Untrusted input" if item.untrusted else "Trusted",
                        item.sha256,
                    ]
                    for item in analyst.appendices.evidence_index
                ],
                [
                    25 * mm,
                    28 * mm,
                    18 * mm,
                    25 * mm,
                    24 * mm,
                    16 * mm,
                    width - 136 * mm,
                ],
                styles,
                mono_columns={0, 1, 2, 3, 6},
            )
        )
    else:
        _empty(story, "No evidence records are stored.", styles)

    story.append(Paragraph("Appendix B - Complete raw chronology", styles["h2"]))
    if analyst.appendices.raw_chronology:
        story.append(
            _table(
                ["Time", "Category", "Type", "Raw record summary", "Evidence"],
                [
                    [_time(event.timestamp), _label(event.category), event.event_type, event.raw_detail or event.summary, _refs(event.evidence_ids)]
                    for event in analyst.appendices.raw_chronology
                ],
                [27 * mm, 20 * mm, 28 * mm, 75 * mm, width - 150 * mm],
                styles,
                mono_columns={0, 4},
            )
        )
    else:
        _empty(story, "No chronology records are stored.", styles)

    story.append(Paragraph("Appendix C - Full technical findings", styles["h2"]))
    if analyst.appendices.technical_findings:
        story.append(
            _table(
                ["Finding", "Status", "Confidence", "Entities", "Evidence"],
                [
                    [finding.summary, finding.status, finding.confidence if finding.confidence is not None else "Not recorded", _refs(finding.affected_entity_ids), _refs(finding.evidence_ids)]
                    for finding in analyst.appendices.technical_findings
                ],
                [70 * mm, 20 * mm, 20 * mm, 34 * mm, width - 144 * mm],
                styles,
                mono_columns={3, 4},
            )
        )
    else:
        _empty(story, "No technical findings are stored.", styles)

    story.append(Paragraph("Appendix D - ATT&CK mapping", styles["h2"]))
    if analyst.appendices.attack_mapping:
        story.append(Paragraph(_text(_refs(analyst.appendices.attack_mapping)), styles["mono"]))
    else:
        _empty(story, "No evidence-backed ATT&CK mappings are recorded.", styles)

    provenance = analyst.appendices.provenance
    story.append(Paragraph("Appendix E - Provenance and identifiers", styles["h2"]))
    story.append(
        _table(
            ["Field", "Value"],
            [
                ["State version", provenance.state_version or "Not recorded"],
                ["Parent state", provenance.state_parent_version or "None"],
                ["State source", provenance.state_created_from or "Not recorded"],
                ["State change reason", provenance.state_change_reason or "Not recorded"],
                ["Plan ID", provenance.plan_id or "Not available"],
                ["Plan state version", provenance.plan_state_version or "Not recorded"],
                ["Plan stale", "Yes" if provenance.plan_is_stale else "No"],
                ["Action IDs", _refs(provenance.action_ids)],
                ["Execution IDs", _refs(provenance.execution_ids)],
            ],
            [42 * mm, width - 42 * mm],
            styles,
            mono_columns={1},
        )
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    document = _IncidentReportDocument(str(output_path), report)
    document.build(story, canvasmaker=_NumberedCanvas)
    return output_path
