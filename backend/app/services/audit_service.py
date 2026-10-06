"""Audit trail service.

Every meaningful backend operation (upload, state version, plan store,
approval, execution) records an audit event. This is the traceability
backbone the final report draws on.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.database import repositories


def record(case_id: str, event_type: str, details: dict[str, Any] | None = None) -> str:
    """Append an audit event to a case. Returns the audit event id."""
    audit_id = f"AUDIT-{uuid.uuid4().hex[:12]}"
    data = {
        "audit_id": audit_id,
        "case_id": case_id,
        "event_type": event_type,
        "details": details or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    repositories.add_audit_event(case_id, audit_id, data)
    return audit_id


def list_events(case_id: str) -> list[dict[str, Any]]:
    events = repositories.list_audit_events(case_id)
    events.sort(key=lambda e: e.get("timestamp", ""))
    return events
