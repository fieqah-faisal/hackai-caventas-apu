"""One-off check: which incident_type the planner reports per scenario (BL-041).

Runs the real planner once per scenario against its batch_01 evidence using the
in-memory fake Firestore (same pattern as scripts/planner_smoke.py) and prints
the persisted analysis block's incident_type.

    cd backend && ../.venv/bin/python ../.agents/tasks/bl-041-incident-type-enum/check_incident_types.py
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3] / "backend"
sys.path.insert(0, str(BACKEND))

from tests.fake_firestore import FakeFirestore  # noqa: E402

import app.database.repositories as repositories  # noqa: E402

fake_db = FakeFirestore()
repositories.get_db = lambda: fake_db

from app.services import ingestion, planning_service  # noqa: E402

SCENARIOS = ("sc02_phishing_injection", "sc03_false_alarm")


def main() -> int:
    for scenario_id in SCENARIOS:
        case_id = f"CASE-{scenario_id}"
        now = datetime.now(timezone.utc).isoformat()
        repositories.create_case(
            case_id,
            {
                "case_id": case_id,
                "title": scenario_id,
                "status": "new",
                "current_state_version": 0,
                "created_at": now,
                "updated_at": now,
            },
        )
        batch = (
            BACKEND / "scenarios" / scenario_id / "agent_inputs" / "batch_01.json"
        )
        ingested = ingestion.ingest(case_id, batch.name, batch.read_bytes())
        plan = planning_service.run_planning(case_id)
        analysis = plan.get("analysis") or {}
        print(
            f"{scenario_id}: incident_type={analysis.get('incident_type')!r} "
            f"severity={analysis.get('severity')!r} "
            f"stage={plan['stage']} actions={len(plan['actions'])} "
            f"(state v{ingested.new_state_version})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
