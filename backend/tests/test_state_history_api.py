"""State-history API tests (GAS-lite Task 5.2, obligations 7, 8, 9, 13).

Covers the two additive endpoints:
    GET /cases/{case_id}/states
    GET /cases/{case_id}/states/{version}
and their interaction with evidence upload (pointer increments, immutable
history, correct provenance metadata, deterministic ordering, honest 404s).
"""
from __future__ import annotations

import json


def _upload(client, case_id, records, name="batch.json"):
    resp = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": (name, json.dumps(records).encode(), "application/json")},
    )
    assert resp.status_code == 200, resp.text
    return resp


R1 = [{"event_time": "2026-10-04T21:40:00+08:00", "event_type": "process_start",
       "host": "SALES-LT-07", "account": "farah", "process": "svchost-update.exe"}]
R2 = [{"event_time": "2026-10-04T21:42:30+08:00", "event_type": "network_upload",
       "host": "SALES-LT-07", "account": "farah", "destination_ip": "203.0.113.45",
       "bytes": 2400000}]


def test_upload_increments_pointer_and_states_lists_new_version(client):
    """Obligation 7: after POST /evidence the pointer increments and the new
    version appears in GET /states."""
    case_id = client.post("/cases", json={"title": "history"}).json()["case_id"]
    assert client.get(f"/cases/{case_id}/states").json() == []

    _upload(client, case_id, R1)
    metas = client.get(f"/cases/{case_id}/states").json()
    assert [m["version"] for m in metas] == [1]

    _upload(client, case_id, R2)
    metas = client.get(f"/cases/{case_id}/states").json()
    assert [m["version"] for m in metas] == [1, 2]


def test_history_is_immutable_earlier_version_unchanged(client):
    """Obligation 8: upload twice and GET /states/1 still returns v1 unchanged."""
    case_id = client.post("/cases", json={"title": "immutable"}).json()["case_id"]
    _upload(client, case_id, R1)
    v1_first = client.get(f"/cases/{case_id}/states/1").json()

    _upload(client, case_id, R2)
    v1_after = client.get(f"/cases/{case_id}/states/1").json()
    assert v1_after == v1_first
    assert v1_after["version"] == 1
    # v2 is a distinct, newer snapshot.
    v2 = client.get(f"/cases/{case_id}/states/2").json()
    assert v2["version"] == 2 and v2 != v1_after


def test_metadata_carries_provenance(client):
    """Obligation 9: metadata shows parent_version, change_reason and
    created_from=evidence_upload."""
    case_id = client.post("/cases", json={"title": "provenance"}).json()["case_id"]
    _upload(client, case_id, R1)
    _upload(client, case_id, R2)
    metas = {m["version"]: m for m in client.get(f"/cases/{case_id}/states").json()}

    assert metas[1]["parent_version"] is None
    assert metas[1]["created_from"] == "evidence_upload"
    assert metas[2]["parent_version"] == 1
    assert metas[2]["created_from"] == "evidence_upload"
    assert "change_reason" in metas[1]


def test_states_list_is_ordered_with_counts(client):
    """Obligation 13: ordered metadata with entity/relationship/timeline counts."""
    case_id = client.post("/cases", json={"title": "counts"}).json()["case_id"]
    _upload(client, case_id, R1)
    _upload(client, case_id, R2)
    metas = client.get(f"/cases/{case_id}/states").json()

    assert [m["version"] for m in metas] == [1, 2]
    for m in metas:
        assert m["entity_count"] >= 1          # at least HOST + ACCOUNT
        assert m["timeline_count"] >= 1
        assert "relationship_count" in m
    # richer evidence in v2 cannot have fewer entities than v1
    assert metas[1]["entity_count"] >= metas[0]["entity_count"]


def test_detail_returns_full_snapshot(client):
    """Obligation 13: GET /states/{version} returns the full IncidentState."""
    case_id = client.post("/cases", json={"title": "detail"}).json()["case_id"]
    _upload(client, case_id, R2)
    snap = client.get(f"/cases/{case_id}/states/1").json()
    assert snap["case_id"] == case_id
    assert snap["version"] == 1
    assert "entities" in snap and "relationships" in snap and "timeline" in snap


def test_empty_list_for_case_with_no_versions(client):
    """Obligation 13: a known case with no versions returns [] (not 404)."""
    case_id = client.post("/cases", json={"title": "empty"}).json()["case_id"]
    resp = client.get(f"/cases/{case_id}/states")
    assert resp.status_code == 200
    assert resp.json() == []


def test_unknown_case_returns_404_on_both_endpoints(client):
    """Obligation 13: honest 404 for an unknown case."""
    assert client.get("/cases/NOPE/states").status_code == 404
    assert client.get("/cases/NOPE/states/1").status_code == 404


def test_unknown_version_of_known_case_returns_distinct_404(client):
    """Obligation 13: distinct 404 detail for unknown version vs unknown case."""
    case_id = client.post("/cases", json={"title": "distinct"}).json()["case_id"]
    _upload(client, case_id, R1)

    missing_version = client.get(f"/cases/{case_id}/states/99")
    assert missing_version.status_code == 404
    assert "version 99" in missing_version.json()["detail"]

    missing_case = client.get("/cases/NOPE/states/1")
    assert missing_case.status_code == 404
    assert "case not found" in missing_case.json()["detail"]


def test_current_state_endpoint_still_works(client):
    """Backward-compat: the singular GET /state endpoint is unchanged."""
    case_id = client.post("/cases", json={"title": "compat"}).json()["case_id"]
    _upload(client, case_id, R1)
    resp = client.get(f"/cases/{case_id}/state")
    assert resp.status_code == 200
    assert resp.json()["version"] == 1
