"""Persistent analyst review API tests."""
from app.database import repositories


def _case(client):
    return client.post("/cases", json={"title": "Review contract"}).json()


def _body(case, **overrides):
    body = {
        "target_type": "case",
        "review_type": "note",
        "analyst": "A. Analyst",
        "analyst_role": "SOC analyst",
        "comment": "Needs identity evidence.",
        "state_version": case["current_state_version"],
    }
    body.update(overrides)
    return body


def test_review_persists_and_is_audited(client):
    case = _case(client)
    response = client.post(f"/cases/{case['case_id']}/reviews", json=_body(case))
    assert response.status_code == 201
    review = response.json()
    assert review["review_id"].startswith("REVIEW-")
    assert client.get(f"/cases/{case['case_id']}/reviews").json() == [review]
    events = client.get(f"/cases/{case['case_id']}/audit").json()
    assert events[-1]["event_type"] == "analyst_review_recorded"


def test_plan_review_validates_target_and_state(client):
    case = _case(client)
    repositories.add_plan(case["case_id"], "PLAN-1", {
        "plan_id": "PLAN-1", "case_id": case["case_id"], "based_on_state_version": 0,
    })
    response = client.post(
        f"/cases/{case['case_id']}/reviews",
        json=_body(case, target_type="plan", target_id="PLAN-1", plan_version=1, review_type="confirm"),
    )
    assert response.status_code == 201
    assert response.json()["target_id"] == "PLAN-1"


def test_review_rejects_stale_state_and_unsupported_target(client):
    case = _case(client)
    stale = client.post(f"/cases/{case['case_id']}/reviews", json=_body(case, state_version=1))
    unsupported = client.post(
        f"/cases/{case['case_id']}/reviews",
        json=_body(case, target_type="finding", target_id="FND-01"),
    )
    assert stale.status_code == 409
    assert unsupported.status_code == 422


def test_reviews_require_existing_case(client):
    assert client.get("/cases/CASE-MISSING/reviews").status_code == 404
