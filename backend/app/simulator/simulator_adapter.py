"""Simulator adapter: the backend's boundary with the action simulator (Aidan).

All response actions are SIMULATED against synthetic state. Nothing here
touches real systems. ``execution_status`` (did the simulated action run)
is reported separately from effectiveness (``validation_status``).

``BoundedSimulatorAdapter`` is the real simulator (``engine.py`` +
``environment.json``). It is stateless: the simulated clock and the action
history come from the evidence and action results already stored for the
case. ``FakeSimulatorAdapter`` stays for tests that need a fixed outcome.
"""
from __future__ import annotations

from typing import Any, Optional, Protocol

from app.simulator import engine


class SimulatorAdapter(Protocol):
    def execute_action(
        self,
        tool_name: str,
        target_id: str,
        params: dict[str, Any] | None = None,
        *,
        case_id: str | None = None,
    ) -> dict[str, Any]: ...


class BoundedSimulatorAdapter:
    """Runs approved actions through the deterministic simulator engine.

    ``profile`` selects injected faults: ``demo`` (the CRM admin API is in
    vendor maintenance until 10:30 on the infostealer day, so an early CRM
    session revocation partially fails) or ``clean`` (no faults).
    """

    def __init__(
        self, profile: str = "demo", environment: Optional[dict[str, Any]] = None
    ) -> None:
        if profile not in engine.PROFILES:
            raise ValueError(f"unknown simulator profile '{profile}'")
        self.profile = profile
        self.environment = environment

    def execute_action(
        self,
        tool_name: str,
        target_id: str,
        params: dict[str, Any] | None = None,
        *,
        case_id: str | None = None,
    ) -> dict[str, Any]:
        history: list[dict[str, Any]] = []
        evidence_times: list[Any] = []
        if case_id:
            from app.database import repositories

            history = repositories.list_action_results(case_id)
            evidence_times = [
                item.get("event_time") for item in repositories.list_evidence(case_id)
            ]
        simulated_at = engine.simulated_clock(
            evidence_times, [r.get("simulated_at") for r in history]
        )
        return engine.simulate(
            tool_name,
            target_id,
            simulated_at=simulated_at,
            history=history,
            environment=self.environment,
            profile=self.profile,
        )


class FakeSimulatorAdapter:
    """Deterministic simulator for integration testing.

    Returns a 'completed but ineffective' result to exercise the key demo
    path: an executed action whose containment objective is not achieved,
    forcing a replan.
    """

    def execute_action(
        self,
        tool_name: str,
        target_id: str,
        params: dict[str, Any] | None = None,
        *,
        case_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            "execution_status": "completed",
            "validation_status": "ineffective",
            "observed_effect": "Suspicious outbound communication continued.",
            "tool_name": tool_name,
            "target_id": target_id,
        }
