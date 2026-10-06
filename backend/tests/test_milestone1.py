"""Milestone 1 acceptance tests.

Covers the five endpoints plus persistence and state versioning:
    POST /cases
    GET  /cases/{id}
    POST /cases/{id}/evidence
    GET  /cases/{id}/evidence
    GET  /cases/{id}/state
"""
from __future__ import annotations

from pathlib import Path

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "login_logs.csv"


def _create_case(client) -> str:
    resp = client.post("/cases", json={"title": "Phishing on WS-01"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["case_id"].startswith("CASE-")
    assert body["current_state_version"] == 0
    return body["case_id"]


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_create_and_get_case(client):
    case_id = _create_case(client)
    resp = client.get(f"/cases/{case_id}")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Phishing on WS-01"


def test_get_missing_case_404(client):
    assert client.get("/cases/CASE-NOPE").status_code == 404


def test_upload_evidence_and_state(client):
    case_id = _create_case(client)
    raw = FIXTURE.read_bytes()

    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("login_logs.csv", raw, "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result["item_count"] == 4
    assert result["kind"] == "csv"
    assert len(result["evidence_ids"]) == 4
    assert result["new_state_version"] == 1
    assert len(result["sha256"]) == 64

    # evidence is listable and traceable
    ev = client.get(f"/cases/{case_id}/evidence").json()
    assert len(ev) == 4
    assert all(e["source_file"] == "login_logs.csv" for e in ev)
    assert all(e["sha256"] == result["sha256"] for e in ev)

    # incident state v1 was produced with observed entities
    state = client.get(f"/cases/{case_id}/state").json()
    assert state["version"] == 1
    names = {e["name"] for e in state["entities"]}
    assert "WS-01" in names
    assert "user01" in names
    assert any(r["status"] == "observed" for r in state["relationships"])

    # case pointer advanced
    assert client.get(f"/cases/{case_id}").json()["current_state_version"] == 1


def test_second_upload_bumps_state_version(client):
    case_id = _create_case(client)
    raw = FIXTURE.read_bytes()
    client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("a.csv", raw, "text/csv")},
    )
    r2 = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("b.csv", raw, "text/csv")},
    )
    assert r2.json()["new_state_version"] == 2
    assert client.get(f"/cases/{case_id}/state").json()["version"] == 2


def test_malformed_json_rejected(client):
    case_id = _create_case(client)
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("bad.json", b"{not valid json", "application/json")},
    )
    assert resp.status_code == 400


def test_unsupported_type_rejected(client):
    case_id = _create_case(client)
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("x.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert resp.status_code == 400


def test_upload_to_missing_case_404(client):
    resp = client.post(
        "/cases/CASE-NOPE/evidence",
        files={"file": ("a.csv", b"event_time\n2026-01-01T00:00:00+00:00", "text/csv")},
    )
    assert resp.status_code == 404


def test_audit_trail_records_events(client):
    case_id = _create_case(client)
    client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("login_logs.csv", FIXTURE.read_bytes(), "text/csv")},
    )
    events = client.get(f"/cases/{case_id}/audit").json()
    types = {e["event_type"] for e in events}
    assert "case_created" in types
    assert "evidence_uploaded" in types
    assert "state_version_created" in types
