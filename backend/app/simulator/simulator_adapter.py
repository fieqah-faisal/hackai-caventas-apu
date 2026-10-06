"""Simulator adapter: the backend's boundary with the action simulator (Aidan).

All response actions are SIMULATED against synthetic state. Nothing here
touches real systems. ``execution_status`` (did the simulated action run)
is reported separately from effectiveness, which the backend validates
against the resulting state.

``FakeSimulatorAdapter`` lets the backend be developed before Aidan's
simulator is ready. Milestone 1 does not call these; defined now to fix the
contract.
"""
from __future__ import annotations

from typing import Any, Protocol


class SimulatorAdapter(Protocol):
    def execute_action(
        self, tool_name: str, target_id: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]: ...


class FakeSimulatorAdapter:
    """Deterministic simulator for integration testing.

    Returns a 'completed but ineffective' result to exercise the key demo
    path: an executed action whose containment objective is not achieved,
    forcing a replan.
    """

    def execute_action(
        self, tool_name: str, target_id: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return {
            "execution_status": "completed",
            "validation_status": "ineffective",
            "observed_effect": "Suspicious outbound communication continued.",
            "tool_name": tool_name,
            "target_id": target_id,
        }
