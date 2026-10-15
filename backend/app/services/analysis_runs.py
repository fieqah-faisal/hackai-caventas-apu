"""Lifecycle of persisted background planning runs (no provider details stored)."""
from __future__ import annotations

import uuid
import re
from datetime import datetime, timezone
from typing import Callable

from app.database import repositories
from app.schemas.analysis_run import AnalysisRun, RunStage, RunStatus
from app.schemas.agent_decision_trace import AgentDecisionTraceStep, TraceStep, TraceStepDraft
from app.services import planning_service

_MESSAGES = {
    "loading_state": "Loading the bound incident state.",
    "loading_guidance": "Loading approved guidance.",
    "running_planner": "Planner is processing the incident state.",
    "persisting_plan": "Persisting the validated proposal.",
}


class AnalysisRunAlreadyActive(Exception):
    def __init__(self, run: AnalysisRun):
        super().__init__("analysis already in progress")
        self.run = run


def create(case_id: str) -> AnalysisRun:
    case = repositories.get_case(case_id)
    if case is None:
        raise planning_service.PlanningError("case not found", "not_found")
    version = int(case.get("current_state_version", 0))
    if version < 1 or repositories.get_state_version(case_id, version) is None:
        raise planning_service.PlanningError("upload evidence before analysis", "no_state")
    run = AnalysisRun(run_id=f"RUN-{uuid.uuid4().hex[:12]}", case_id=case_id,
                      based_on_state_version=version)
    if not repositories.acquire_analysis_run(case_id, run.run_id, run.model_dump(mode="json")):
        existing = active(case_id)
        if existing is None:
            raise planning_service.PlanningError("analysis run could not be acquired", "duplicate")
        raise AnalysisRunAlreadyActive(existing)
    return run


def read(case_id: str, run_id: str) -> AnalysisRun | None:
    data = repositories.get_analysis_run(case_id, run_id)
    return AnalysisRun(**data) if data else None


def active(case_id: str) -> AnalysisRun | None:
    data = repositories.get_active_analysis_run(case_id)
    return AnalysisRun(**data) if data else None


def list_for_case(case_id: str) -> list[AnalysisRun] | None:
    if not repositories.case_exists(case_id):
        return None
    runs = [AnalysisRun(**data) for data in repositories.list_analysis_runs(case_id)]
    return sorted(runs, key=lambda item: (item.created_at, item.run_id))


def list_steps(case_id: str, run_id: str) -> list[AgentDecisionTraceStep] | None:
    if read(case_id, run_id) is None:
        return None
    rows = [AgentDecisionTraceStep(**data) for data in repositories.list_trace_steps(case_id, run_id)]
    return sorted(rows, key=lambda item: (item.sequence, item.step_id))


def _trace_recorder(run: AnalysisRun) -> Callable[[TraceStepDraft], None]:
    sequence = len(repositories.list_trace_steps(run.case_id, run.run_id))

    def record(draft: TraceStepDraft) -> None:
        nonlocal sequence
        sequence += 1
        step = AgentDecisionTraceStep(
            **draft.model_dump(),
            step_id=f"TRACE-{sequence:04d}",
            case_id=run.case_id,
            run_id=run.run_id,
            sequence=sequence,
            based_on_state_version=run.based_on_state_version,
        )
        repositories.append_trace_step(
            run.case_id, run.run_id, step.step_id, step.model_dump(mode="json")
        )

    return record


def execute(run: AnalysisRun) -> None:
    trace = _trace_recorder(run)
    def update(stage: str, version: int) -> None:
        repositories.update_analysis_run(run.case_id, run.run_id, {
            "status": RunStatus.RUNNING.value, "stage": stage,
            "message": _MESSAGES[stage], "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    try:
        plan = planning_service.run_planning(
            run.case_id,
            progress=update,
            expected_state_version=run.based_on_state_version,
            trace=trace,
        )
        if plan["based_on_state_version"] != run.based_on_state_version:
            raise planning_service.PlanningError("plan state binding changed", "planner")
        now = datetime.now(timezone.utc).isoformat()
        repositories.update_analysis_run(run.case_id, run.run_id, {
            "status": RunStatus.COMPLETED.value, "stage": RunStage.COMPLETED.value,
            "message": "Stored plan is ready.", "plan_id": plan["plan_id"],
            "updated_at": now, "completed_at": now,
        })
        completed = datetime.now(timezone.utc)
        trace(TraceStepDraft(
            step=TraceStep.COMPLETED,
            message="Analysis run completed with a persisted plan.",
            started_at=completed,
            completed_at=completed,
            output_refs=[plan["plan_id"]],
            decision_summary="The state-bound proposal was persisted for analyst review.",
        ))
    except Exception as exc:
        # Do not store exception text: HTTP client exceptions may include URLs,
        # headers, upstream bodies or credential-bearing configuration.
        category = "planner" if isinstance(exc, planning_service.PlanningError) else "internal"
        upstream_502 = category == "planner" and exc.__cause__ is not None and bool(
            re.search(r"\b502\b", str(exc.__cause__))
        )
        now = datetime.now(timezone.utc).isoformat()
        repositories.update_analysis_run(run.case_id, run.run_id, {
            "status": RunStatus.FAILED.value, "stage": RunStage.FAILED.value,
            "message": "Planner request failed." if category == "planner" else "Analysis failed.",
            "error": ("planner request failed (upstream HTTP 502)" if upstream_502 else
                      "planner request failed (upstream unavailable)" if category == "planner" else "analysis failed"),
            "updated_at": now, "completed_at": now,
        })
        failed_at = datetime.now(timezone.utc)
        try:
            trace(TraceStepDraft(
                step=TraceStep.FAILED,
                status="failed",
                message="Analysis run failed safely.",
                started_at=failed_at,
                completed_at=failed_at,
                decision_summary="Failure category: planner unavailable." if category == "planner" else "Failure category: internal analysis error.",
            ))
        except Exception:
            pass
    finally:
        repositories.release_analysis_run(run.case_id, run.run_id)
