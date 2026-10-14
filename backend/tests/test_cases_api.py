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
