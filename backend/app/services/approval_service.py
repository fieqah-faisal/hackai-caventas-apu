"""Approval service (later milestone).

Approval is created by the backend after an analyst decision. It is NEVER
derived from AI output. An approval binds to an exact (action_id,
action_version, incident_state_version); approving version 1 must not
authorize version 2.

Milestone 1 does not implement this. The module exists to fix the scope
boundary and interface shape.
"""
from __future__ import annotations


def record_decision(*args, **kwargs):
    raise NotImplementedError("approval_service is implemented in a later milestone")
