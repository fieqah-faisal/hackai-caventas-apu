"""State detail: timeline entries must carry record fields.

The planner only receives the incident state, so timeline descriptions must
include the salient record fields (destination IP, domains, byte counts, …)
or the model cannot ground its analysis on the evidence.
"""
from __future__ import annotations

import json


def test_timeline_entries_include_record_fields(client):
    case_id = client.post("/cases", json={"title": "detail"}).json()["case_id"]
    record = [
        {
            "event_time": "2026-10-04T21:42:30+08:00",
            "event_type": "network_upload",
            "host": "SALES-LT-07",
            "account": "farah",
            "destination_ip": "203.0.113.45",
            "bytes": 2400000,
        }
    ]
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={
            "file": (
                "batch1.json",
                json.dumps(record).encode(),
                "application/json",
            )
        },
    )
    assert resp.status_code == 200, resp.text

    state = client.get(f"/cases/{case_id}/state").json()
    descriptions = " ".join(event["description"] for event in state["timeline"])
    assert "network_upload" in descriptions
    assert "203.0.113.45" in descriptions
    assert "2400000" in descriptions


def test_mixed_naive_and_aware_times_do_not_break_the_state(client):
    """Regression: one naive timestamp used to 500 the upload and poison the case."""
    case_id = client.post("/cases", json={"title": "mixed tz"}).json()["case_id"]
    records = [
        {"event_time": "2026-10-04T21:40:00+08:00", "host": "SALES-LT-07", "account": "farah"},
        {"event_time": "2026-10-04 13:41:00", "host": "SALES-LT-07", "account": "farah"},
    ]
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("mixed.json", json.dumps(records).encode(), "application/json")},
    )
    assert resp.status_code == 200, resp.text
    times = [ev["timestamp"] for ev in client.get(f"/cases/{case_id}/state").json()["timeline"]]
    assert times == ["2026-10-04T21:40:00+08:00", "2026-10-04T13:41:00"]
