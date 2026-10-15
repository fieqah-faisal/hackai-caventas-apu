"""Current-state structured timeline API tests."""
from app.database import repositories
from app.schemas.incident_state import IncidentState, TimelineEvent


def test_timeline_endpoint_returns_current_version_and_stable_rows(client):
    case = client.post("/cases", json={"title": "Synthetic timeline case"}).json()
    case_id = case["case_id"]
    repositories.add_evidence(case_id, "EV-1", {
        "evidence_id": "EV-1",
        "case_id": case_id,
        "event_time": "2026-01-01T00:00:00Z",
        "kind": "json",
        "source_file": "synthetic.json",
        "fields": {"event_type": "dns_query", "query": "example.invalid"},
    })
    state = IncidentState(
        case_id=case_id,
        version=1,
        timeline=[TimelineEvent(description="dns_query: query=example.invalid", evidence_ids=["EV-1"])],
    )
    repositories.add_state_version(case_id, 1, state.model_dump(mode="json"))
    repositories.update_case(case_id, {"current_state_version": 1})

    response = client.get(f"/cases/{case_id}/timeline")
    assert response.status_code == 200
    assert response.json()["state_version"] == 1
    assert response.json()["events"][0]["event_id"] == "TL-EVIDENCE-EV-1"
    assert response.json()["events"][0]["evidence_ids"] == ["EV-1"]


def test_timeline_endpoint_handles_known_empty_and_unknown_cases(client):
    case = client.post("/cases", json={"title": "No state yet"}).json()
    response = client.get(f"/cases/{case['case_id']}/timeline")
    assert response.status_code == 200
    assert response.json()["state_version"] == 0
    assert response.json()["events"] == []
    assert client.get("/cases/CASE-MISSING/timeline").status_code == 404
