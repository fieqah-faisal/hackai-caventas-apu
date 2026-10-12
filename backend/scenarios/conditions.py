"""Evidence branching for scenario batches (evaluator side, Aidan).

Later batches depend on what the analyst approved and the simulator did,
and when (simulated time). A condition is a small JSON expression evaluated
against the case's stored action results and the record ids revealed so far:

    {"done":     {"tool": "revoke_sessions" | [..], "target": "ACCOUNT::farah",
                  "service": "crm" (optional), "before": "<iso>" (optional)}}
    {"failed":   {... same keys ...}}       # ran, but the service / objective failed
    {"revealed": "SC1-B2-11"}               # record already shown to the agent
    {"not": cond} | {"all": [cond, ...]} | {"any": [cond, ...]}

``done`` means effective (or, with ``service``, that service succeeded)
strictly before ``before``. Only the harness and the scenario builder use
this module; the planner never sees conditions or ground truth.
"""
from __future__ import annotations

import csv
import io
import json
from typing import Any, Iterable, Optional

from app.simulator.engine import parse_time

Condition = Optional[dict[str, Any]]


def _matches(result: dict[str, Any], spec: dict[str, Any]) -> bool:
    tools = spec["tool"] if isinstance(spec["tool"], list) else [spec["tool"]]
    if result.get("tool_name") not in tools or result.get("target_id") != spec["target"]:
        return False
    before = parse_time(spec.get("before")) if spec.get("before") else None
    if before is not None:
        when = parse_time(result.get("simulated_at"))
        if when is None or when >= before:
            return False
    return True


def _done(results: Iterable[dict[str, Any]], spec: dict[str, Any]) -> bool:
    service = spec.get("service")
    for result in results:
        if not _matches(result, spec):
            continue
        if service:
            if (result.get("services") or {}).get(service) == "succeeded":
                return True
        elif result.get("validation_status") == "effective":
            return True
    return False


def _failed(results: Iterable[dict[str, Any]], spec: dict[str, Any]) -> bool:
    service = spec.get("service")
    for result in results:
        if not _matches(result, spec):
            continue
        if service:
            if (result.get("services") or {}).get(service) == "failed":
                return True
        elif result.get("validation_status") == "ineffective":
            return True
    return False


def evaluate(
    cond: Condition,
    results: list[dict[str, Any]],
    revealed: Optional[set[str]] = None,
) -> bool:
    if not cond:
        return True
    revealed = revealed or set()
    if "done" in cond:
        return _done(results, cond["done"])
    if "failed" in cond:
        return _failed(results, cond["failed"])
    if "revealed" in cond:
        return cond["revealed"] in revealed
    if "not" in cond:
        return not evaluate(cond["not"], results, revealed)
    if "all" in cond:
        return all(evaluate(c, results, revealed) for c in cond["all"])
    if "any" in cond:
        return any(evaluate(c, results, revealed) for c in cond["any"])
    raise ValueError(f"unknown condition: {json.dumps(cond)}")


def render_batch(
    scenario: dict[str, Any],
    batch_no: int,
    results: list[dict[str, Any]],
    revealed: Optional[set[str]] = None,
) -> tuple[list[dict[str, Any]], str]:
    """Agent-visible records of one batch for this action history + branch name."""
    batch = scenario["batches"][batch_no - 1]
    records = [
        dict(entry["record"])
        for entry in batch["entries"]
        if evaluate(entry.get("when"), results, revealed)
    ]
    branch = "default"
    for option in batch.get("branches", []):
        if evaluate(option.get("when"), results, revealed):
            branch = option["name"]
            break
    return records, branch


def serialise(records: list[dict[str, Any]], fmt: str) -> bytes:
    """Upload bytes for the backend's evidence endpoint (JSON array or CSV)."""
    if fmt == "json":
        return (json.dumps(records, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if fmt == "csv":
        columns: list[str] = []
        for record in records:
            for key in record:
                if key not in columns:
                    columns.append(key)
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        for record in records:
            writer.writerow(record)
        return buffer.getvalue().encode("utf-8")
    raise ValueError(f"unsupported batch format: {fmt}")


def select(items: Iterable[dict[str, Any]], results, revealed) -> list[dict[str, Any]]:
    """Ground-truth items whose ``when`` holds for this run."""
    return [item for item in items if evaluate(item.get("when"), results, revealed)]
