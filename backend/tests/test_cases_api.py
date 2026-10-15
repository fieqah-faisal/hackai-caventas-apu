"""Persisted case-list endpoint tests."""
from __future__ import annotations

from app.database import repositories


def test_list_cases_empty(client):
    response = client.get("/cases")

    assert response.status_code == 200
    assert response.json() == []


def test_list_cases_returns_newest_first(client):
    rows = [
        ("CASE-OLD", "Old case", "2026-10-12T02:43:36.585974Z"),
        ("CASE-NEW", "New case", "2026-10-12T10:43:36.733154+08:00"),
        ("CASE-MIDDLE", "Middle case", "2026-10-12T02:44:00+00:00"),
    ]
    for case_id, title, updated_at in rows:
        repositories.create_case(
            case_id,
            {
                "case_id": case_id,
                "title": title,
                "description": "",
                "status": "investigating",
                "current_state_version": 0,
                "created_at": updated_at,
                "updated_at": updated_at,
            },
        )

    response = client.get("/cases")

    assert response.status_code == 200
    assert [row["case_id"] for row in response.json()] == [
        "CASE-MIDDLE",
        "CASE-NEW",
        "CASE-OLD",
    ]


def test_list_cases_is_read_only(client):
    created = client.post("/cases", json={"title": "Persisted case"}).json()
    before = client.get(f"/cases/{created['case_id']}/audit").json()

    assert client.get("/cases").status_code == 200

    assert client.get(f"/cases/{created['case_id']}/audit").json() == before


def test_patch_case_metadata_persists_and_audits(client):
    created = client.post("/cases", json={"title": "Before", "description": "Old"}).json()
    response = client.patch(
        f"/cases/{created['case_id']}",
        json={"title": "  After  ", "description": "  Updated context  "},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "After"
    assert response.json()["description"] == "Updated context"
    assert client.get(f"/cases/{created['case_id']}").json() == response.json()
    events = client.get(f"/cases/{created['case_id']}/audit").json()
    assert events[-1]["event_type"] == "case_updated"
    assert events[-1]["details"]["changed_fields"] == ["description", "title"]


def test_patch_case_preserves_omitted_field(client):
    created = client.post("/cases", json={"title": "Before", "description": "Keep me"}).json()
    response = client.patch(f"/cases/{created['case_id']}", json={"title": "After"})
    assert response.status_code == 200
    assert response.json()["description"] == "Keep me"


def test_patch_case_rejects_empty_blank_null_and_unknown_fields(client):
    created = client.post("/cases", json={"title": "Before"}).json()
    url = f"/cases/{created['case_id']}"
    for body in ({}, {"title": "  "}, {"description": None}, {"status": "closed"}):
        assert client.patch(url, json=body).status_code == 422


def test_patch_unknown_case_returns_404(client):
    assert client.patch("/cases/CASE-MISSING", json={"title": "New"}).status_code == 404
