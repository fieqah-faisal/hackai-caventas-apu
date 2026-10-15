"""Pure structured timeline projection tests."""
from datetime import datetime, timezone

from app.schemas.incident_state import IncidentState, TimelineEvent
from app.services.timeline_projection import project_timeline


def _evidence(evidence_id, occurred_at, **fields):
    return {
        "evidence_id": evidence_id,
        "event_time": occurred_at,
        "kind": "json",
        "source_file": "synthetic.json",
        "fields": fields,
    }


def test_projection_is_deterministic_allowlisted_and_chronological():
    state = IncidentState(
        case_id="CASE-TIMELINE",
        version=1,
        timeline=[TimelineEvent(
            timestamp=datetime(2026, 1, 2, tzinfo=timezone.utc),
            description="dns_query: query=example.invalid, arbitrary=must-stay-raw",
            evidence_ids=["EV-2"],
        )],
    )
    evidence = [
        _evidence("EV-2", "2026-01-02T00:00:00Z", event_type="dns_query", account="analyst-user", query="example.invalid", answer="203.0.113.10", arbitrary_secret="not promoted", severity="high"),
        _evidence("EV-1", "2026-01-01T00:00:00Z", event_type="process_start", host="SYNTH-HOST", process="safe.exe"),
    ]

    first = project_timeline(evidence, [], [], state)
    second = project_timeline(list(reversed(evidence)), [], [], state)

    assert [row.event_id for row in first] == ["TL-EVIDENCE-EV-1", "TL-EVIDENCE-EV-2"]
    assert [row.event_id for row in second] == [row.event_id for row in first]
    assert first[1].actor == "analyst-user"
    assert first[1].subject == "example.invalid"
    assert first[1].details == {"query": "example.invalid", "answer": "203.0.113.10"}
    assert "arbitrary_secret" not in first[1].model_dump_json()
    assert first[1].raw_description.endswith("arbitrary=must-stay-raw")


def test_projection_keeps_unknown_values_unknown_and_reads_legacy_description():
    state = IncidentState(
        case_id="CASE-LEGACY",
        version=1,
        timeline=[TimelineEvent(timestamp=None, description="Legacy description only")],
    )
    row = project_timeline([], [], [], state)[0]
    assert row.event_type == "legacy_event"
    assert row.occurred_at is None
    assert row.actor is None
    assert row.source is None
    assert row.severity is None
    assert row.raw_description == "Legacy description only"


def test_projection_preserves_decision_and_result_references():
    actions = [{
        "action_id": "ACT-1",
        "status": "rejected",
        "decided_at": "2026-01-02T00:00:00Z",
        "decided_by": "A. Analyst",
        "reason": "Synthetic host ownership is not established.",
        "proposal": {"tool_name": "isolate_host", "target_id": "HOST::SYNTH", "evidence_ids": ["EV-1"]},
    }]
    results = [{
        "execution_id": "EXEC-1",
        "simulated_at": "2026-01-03T00:00:00Z",
        "tool_name": "block_domain",
        "target_id": "DOMAIN::example.invalid",
        "execution_status": "completed",
        "validation_status": "effective",
        "evidence_ids": ["EV-2"],
    }]
    rows = project_timeline([], actions, results, None)
    assert [row.event_id for row in rows] == ["TL-DECISION-ACT-1", "TL-RESULT-EXEC-1"]
    assert rows[0].details["reason"] == "Synthetic host ownership is not established."
    assert rows[1].result == "execution=completed; validation=effective"
