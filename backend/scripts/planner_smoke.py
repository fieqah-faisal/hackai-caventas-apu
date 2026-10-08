"""Live planner smoke: evidence -> incident state -> real AI plan.

Uses the in-memory fake Firestore (no emulator needed) but the REAL
OpenCode Go API, so it requires ``OPENCODE_GO_API_KEY`` in ``backend/.env``.

Run from ``backend/``:

    ../.venv/bin/python scripts/planner_smoke.py [evidence-file]

Defaults to ``fixtures/planner_smoke_evidence.json`` (scenario-style batch).
"""
from __future__ import annotations

import sys
import time
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from tests.fake_firestore import FakeFirestore

import app.database.repositories as repositories

fake_db = FakeFirestore()
repositories.get_db = lambda: fake_db

from app.services import ingestion, planning_service

CASE_ID = "CASE-SMOKE"
DEFAULT_EVIDENCE = BACKEND_DIR / "fixtures" / "planner_smoke_evidence.json"


def main() -> int:
    evidence = (
        Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_EVIDENCE
    )
    now = datetime.now(timezone.utc).isoformat()
    repositories.create_case(
        CASE_ID,
        {
            "case_id": CASE_ID,
            "title": "Planner live smoke",
            "status": "new",
            "current_state_version": 0,
            "created_at": now,
            "updated_at": now,
        },
    )

    uploaded = ingestion.ingest(CASE_ID, evidence.name, evidence.read_bytes())
    print(
        f"evidence: {uploaded.item_count} items -> state v{uploaded.new_state_version}"
    )

    started = time.monotonic()
    try:
        plan = planning_service.run_planning(CASE_ID)
    except Exception as exc:
        elapsed = time.monotonic() - started
        print(f"FAILED after {elapsed:.1f}s: {type(exc).__name__}: {exc}")
        return 1
    elapsed = time.monotonic() - started

    print(
        f"plan {plan['plan_id']}: stage={plan['stage']} "
        f"actions={len(plan['actions'])} "
        f"missing_evidence={len(plan['missing_evidence'])} ({elapsed:.1f}s)"
    )
    for action in plan["actions"]:
        proposal = action["proposal"]
        print(
            f"  - {proposal['tool_name']} -> {proposal['target_id']} "
            f"evidence={proposal['evidence_ids']}"
        )
        print(f"    rationale: {proposal['rationale']}")
    for gap in plan["missing_evidence"]:
        print(f"  missing: {gap}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
