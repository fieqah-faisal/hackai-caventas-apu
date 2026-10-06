"""Execution service (later milestone).

Routes approved actions to the bounded simulator. Execution is permitted
only when every safety precondition in .kiro/steering/security.md holds:
action exists, tool is in the approved catalogue, target exists, evidence
references exist, action version is current, approval matches that exact
action, and the incident state has not invalidated the proposal.

Uses a Firestore transaction to flip the action to 'executing' + write the
audit event atomically. Execution requests are idempotent (unique
execution id). ``execution_status`` is stored separately from
``validation_status`` / effectiveness.

Milestone 1 does not implement this.
"""
from __future__ import annotations


def execute(*args, **kwargs):
    raise NotImplementedError("execution_service is implemented in a later milestone")
