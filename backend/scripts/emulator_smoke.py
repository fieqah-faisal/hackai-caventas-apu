"""Emulator smoke: full API flow against the local Firestore emulator (BL-004).

Requires the Firestore emulator running on 127.0.0.1:8080:

    npx --yes firebase-tools emulators:start --only firestore --project ir-planner-dev

Note: firebase-tools 15 requires Java 21+; if your default JDK is older, set
JAVA_HOME first (e.g. /opt/homebrew/opt/openjdk@25).

Uses the fake planner and simulator so only the Firestore layer is under
test. Run from ``backend/``:

    ../.venv/bin/python scripts/emulator_smoke.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")

from fastapi.testclient import TestClient

from app.ai.planner_adapter import FakePlannerAdapter
from app.main import app
from app.services import planning_service

planning_service.get_planner_adapter = lambda: FakePlannerAdapter()

EVIDENCE = BACKEND_DIR / "fixtures" / "planner_smoke_evidence.json"


def main() -> int:
    client = TestClient(app)

    case_id = client.post("/cases", json={"title": "emulator smoke"}).json()["case_id"]
    print(f"case: {case_id}")

    upload = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("batch1.json", EVIDENCE.read_bytes(), "application/json")},
    )
    assert upload.status_code == 200, upload.text
    print(
        f"evidence: {upload.json()['item_count']} items, "
        f"state v{upload.json()['new_state_version']}"
    )

    plan_resp = client.post(f"/cases/{case_id}/runs")
    assert plan_resp.status_code == 200, plan_resp.text
    plan = plan_resp.json()
    action_id = plan["actions"][0]["action_id"]
    print(f"plan: {plan['plan_id']} -> action {action_id}")

    decision = client.post(
        f"/cases/{case_id}/actions/{action_id}/decision",
        json={"decision": "approve", "analyst": "smoke"},
    )
    assert decision.status_code == 200, decision.text

    execute = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    assert execute.status_code == 200, execute.text
    result = execute.json()["result"]
    print(f"execute: {result['execution_status']} / {result['validation_status']}")

    report_resp = client.post(f"/cases/{case_id}/reports")
    assert report_resp.status_code == 200, report_resp.text
    report_id = report_resp.json()["report_id"]
    fetched = client.get(f"/cases/{case_id}/reports/{report_id}")
    assert fetched.status_code == 200, fetched.text

    state = client.get(f"/cases/{case_id}/state").json()
    plans = client.get(f"/cases/{case_id}/plans").json()
    audit = {e["event_type"] for e in client.get(f"/cases/{case_id}/audit").json()}
    assert state["version"] == 2, state["version"]
    assert plans and plans[0]["plan_id"] == plan["plan_id"]
    assert {
        "case_created",
        "evidence_uploaded",
        "plan_created",
        "action_approved",
        "action_executed",
        "report_generated",
    } <= audit, sorted(audit)
    print(f"report: {report_id} pdf={Path(report_resp.json()['pdf_path']).name}")
    print("EMULATOR SMOKE PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
