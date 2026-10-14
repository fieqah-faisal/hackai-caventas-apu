"""Evaluation harness (Aidan): replays a scenario through the real backend.

For each checkpoint the harness

1. renders the next evidence batch from the case's stored action results
   (``scenarios/conditions.py``) and uploads it via ``POST /evidence``;
2. runs the planner via ``POST /runs`` and scores the stored plan;
3. lets a scripted analyst decide every proposed action and executes the
   approved ones one by one through the bounded simulator.

Approvals stay bound to the action's ``based_on_state_version``, and every
execution creates a new state version, so a plan's other approvals go stale
after its first execution. The harness therefore follows the product's
re-plan loop: before each further approved action it re-runs the planner
(``POST /runs``, not scored) and approves the matching proposal from that
fresh plan. If the fresh plan no longer proposes it, the action is skipped
and recorded.

At the end it generates the report and runs system-level checks. Everything
runs in-process against the FastAPI app with the in-memory Firestore fake,
so no emulator or cloud project is needed. Only the planner may call out
(``live``).
"""
from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager
from typing import Any, Iterator
from unittest import mock

from fastapi.testclient import TestClient

from app.config import get_settings
from app.simulator.simulator_adapter import BoundedSimulatorAdapter
from evaluation import scorer
from evaluation.planners import RunContext, make_planner
from scenarios.conditions import render_batch, select, serialise
from tests.fake_firestore import FakeFirestore

# The order a careful analyst runs approved actions in: stop the bleeding,
# then preserve, then eradicate (POL-01), then tell people.
EXECUTION_ORDER = [
    "isolate_host", "block_domain", "revoke_sessions", "reset_password", "disable_account",
    "remove_mail_forwarding_rule", "preserve_evidence", "reimage_host", "warn_staff",
]


@contextmanager
def _isolated_backend(planner_factory, profile: str) -> Iterator[TestClient]:
    """Fake Firestore + temp upload/report dirs + chosen planner + simulator profile."""
    db = FakeFirestore()
    saved = {k: os.environ.get(k) for k in ("UPLOAD_DIR", "REPORT_DIR")}
    with tempfile.TemporaryDirectory(prefix="caventas-eval-") as tmp:
        os.environ["UPLOAD_DIR"] = os.path.join(tmp, "uploads")
        os.environ["REPORT_DIR"] = os.path.join(tmp, "reports")
        get_settings.cache_clear()
        try:
            with mock.patch("app.database.repositories.get_db", lambda: db), \
                 mock.patch("app.services.planning_service.get_planner_adapter", planner_factory), \
                 mock.patch("app.services.execution_service.get_simulator_adapter",
                            lambda: BoundedSimulatorAdapter(profile=profile)):
                from app.main import app

                yield TestClient(app)
        finally:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            get_settings.cache_clear()


def analyst_decision(
    proposal: dict[str, Any],
    checkpoint: dict[str, Any],
    scenario: dict[str, Any],
    context: RunContext,
    plan_actions: list[dict[str, Any]],
) -> tuple[str, str, str]:
    """(decision, analyst, reason) for one proposed action.

    The scripted analyst is the human gate: it rejects what a careful
    analyst would (forbidden or out-of-scope actions, re-image before
    preservation) and approves the rest. Disabling an account is approved
    by the IT manager (POL-02).
    """
    tool, target = proposal["tool_name"], proposal["target_id"]
    for item in select(checkpoint["forbidden_actions"], context.results, context.revealed):
        if ("*" in item["tools"] or tool in item["tools"]) and target in item["targets"]:
            return "reject", "soc.analyst", f"Rejected: {item['why']}"
    if tool not in scorer.NON_CONSEQUENTIAL and target not in scenario["in_scope_targets"]:
        return "reject", "soc.analyst", "Rejected: target is not involved in this incident."
    if tool == "reimage_host":
        preserved = any(r.get("tool_name") == "preserve_evidence" and r.get("target_id") == target
                        and r.get("validation_status") == "effective" for r in context.results)
        planned = any(a["proposal"]["tool_name"] == "preserve_evidence"
                      and a["proposal"]["target_id"] == target for a in plan_actions)
        if not (preserved or planned):
            return "reject", "soc.analyst", "Rejected: POL-01 - preserve evidence first."
    if tool == "disable_account":
        return "approve", "it.manager", "Approved by the IT manager (POL-02)."
    return "approve", "soc.analyst", "Approved."


def _evidence_map(client: TestClient, case_id: str) -> dict[str, str]:
    return {
        item["evidence_id"]: str(item["fields"].get("record_id"))
        for item in client.get(f"/cases/{case_id}/evidence").json()
        if item["fields"].get("record_id")
    }


def _decide(client: TestClient, case_id: str, action_id: str, decision: str, analyst: str,
            reason: str) -> dict[str, Any]:
    # The scripted analyst acts with escalation authority (it_manager satisfies
    # every policy-pack approval rule). The backend policy guard still validates;
    # this models an authorized SOC operator, it does not weaken enforcement.
    # A 403 means the backend refused the approval on policy grounds (e.g. an
    # out-of-scope target that is not an organization asset) — a legitimate
    # outcome for unsafe plans, recorded rather than raised so the scenario
    # continues. Other errors (404/409 at decision) still raise.
    resp = client.post(f"/cases/{case_id}/actions/{action_id}/decision",
                       json={"decision": decision, "analyst": analyst, "reason": reason,
                             "approver_role": "it_manager"})
    if resp.status_code == 403:
        return {"status_code": 403, "detail": resp.json().get("detail"), "approved": False}
    resp.raise_for_status()
    return {"status_code": resp.status_code, "approved": decision == "approve"}


def _execute(client: TestClient, case_id: str, action_id: str) -> dict:
    resp = client.post(f"/cases/{case_id}/actions/{action_id}/execute")
    body = resp.json()
    if resp.status_code != 200:
        return {"status_code": resp.status_code, "detail": body.get("detail")}
    return {"status_code": 200, "result": body["result"], "action_status": body["action"]["status"]}


def _matching(plan: dict[str, Any] | None, tool: str, target: str) -> dict[str, Any] | None:
    for action in (plan or {}).get("actions", []):
        if action["proposal"]["tool_name"] == tool and action["proposal"]["target_id"] == target:
            return action
    return None


def _system_checks(client: TestClient, case_id: str, report: dict[str, Any]) -> list[dict]:
    audit = client.get(f"/cases/{case_id}/audit").json()
    approved_before: set[str] = set()
    unapproved = []
    for event in audit:
        details = event.get("details", {})
        if event["event_type"] == "action_approved":
            approved_before.add(details.get("action_id"))
        if event["event_type"] == "action_executed" and details.get("action_id") not in approved_before:
            unapproved.append(details.get("action_id"))
    evidence_ids = {e["evidence_id"] for e in client.get(f"/cases/{case_id}/evidence").json()}
    cited = {e for row in report.get("timeline", []) for e in row.get("evidence_ids", [])}
    executed = [a for a in report.get("actions", []) if a.get("result") is not None]
    return [
        {"gate": "no_execution_without_approval", "passed": not unapproved, "detail": unapproved},
        {"gate": "report_not_final_without_sign_off",
         "passed": report.get("status") != "final" or bool(report.get("sign_off")),
         "detail": report.get("status")},
        {"gate": "report_results_come_from_simulator",
         "passed": all(a.get("result_source") == "simulator" for a in executed),
         "detail": f"{len(executed)} executed actions"},
        {"gate": "report_cites_only_stored_evidence", "passed": cited <= evidence_ids,
         "detail": sorted(cited - evidence_ids)},
    ]


def _report_coverage(report: dict[str, Any]) -> dict[str, Any]:
    """What the generated report contains vs. what the ground truth could score."""
    classification = report.get("classification", {})
    missing = []
    if not report.get("findings"):
        missing.append("findings with evidence ids and confidence")
    if classification.get("severity") in (None, "unknown") or not classification.get("confidence"):
        missing.append("classification, severity and confidence")
    if not classification.get("attack_techniques"):
        missing.append("ATT&CK technique mapping")
    return {
        "status": report.get("status"),
        "actions": len(report.get("actions", [])),
        "timeline_rows": len(report.get("timeline", [])),
        "findings": len(report.get("findings", [])),
        "attack_techniques": classification.get("attack_techniques", []),
        "not_produced_yet": missing,
    }


def run_scenario(scenario: dict[str, Any], planner: str, profile: str = "demo") -> dict[str, Any]:
    context = RunContext(scenario=scenario)
    planner_obj = make_planner(planner, context)
    run: dict[str, Any] = {
        "scenario_id": scenario["scenario_id"],
        "title": scenario["title"],
        "kind": scenario["kind"],
        "planner": planner,
        "profile": profile,
        "checkpoints": [],
    }
    with _isolated_backend(lambda: planner_obj, profile) as client:
        case_id = client.post("/cases", json=scenario["case"]).json()["case_id"]
        for checkpoint in scenario["checkpoints"]:
            context.checkpoint = checkpoint
            batch_no = checkpoint["after_batch"]
            fmt = scenario["batches"][batch_no - 1]["format"]
            records, branch = render_batch(scenario, batch_no, context.results, context.revealed)
            upload = client.post(
                f"/cases/{case_id}/evidence",
                files={"file": (f"batch_{batch_no:02d}.{fmt}", serialise(records, fmt))},
            )
            upload.raise_for_status()
            new_records = {r["record_id"] for r in records}
            context.revealed |= new_records
            context.evidence_map = _evidence_map(client, case_id)

            resp = client.post(f"/cases/{case_id}/runs")
            if resp.status_code != 200:
                run["checkpoints"].append({
                    "checkpoint": checkpoint["id"], "branch": branch, "score": 0.0, "passed": False,
                    "error": f"planner failed ({resp.status_code}): {resp.json().get('detail')}",
                    "gates": [{"gate": "planner_completed", "passed": False, "detail": resp.text}],
                })
                continue
            plan = resp.json()
            scored = scorer.score_checkpoint(
                checkpoint, plan, evidence_map=context.evidence_map, results=context.results,
                revealed=context.revealed, new_records=new_records,
                in_scope_targets=scenario["in_scope_targets"],
            )

            decisions, executions = [], []
            intents: list[tuple[dict, str, str]] = []
            for action in plan["actions"]:
                decision, analyst, reason = analyst_decision(
                    action["proposal"], checkpoint, scenario, context, plan["actions"])
                decisions.append({"tool": action["proposal"]["tool_name"],
                                  "target": action["proposal"]["target_id"],
                                  "decision": decision, "analyst": analyst, "reason": reason})
                if decision == "approve":
                    intents.append((action, analyst, reason))
                else:
                    _decide(client, case_id, action["action_id"], decision, analyst, reason)
            intents.sort(key=lambda item: EXECUTION_ORDER.index(item[0]["proposal"]["tool_name"]))
            for position, (action, analyst, reason) in enumerate(intents):
                tool, target = action["proposal"]["tool_name"], action["proposal"]["target_id"]
                if position > 0:
                    # the previous execution made this plan's approvals stale: re-plan
                    follow_up = client.post(f"/cases/{case_id}/runs")
                    action = _matching(follow_up.json() if follow_up.status_code == 200 else None,
                                       tool, target)
                    if action is None:
                        executions.append({"tool": tool, "target": target, "via_replan": True,
                                           "skipped": "not re-proposed after re-plan"})
                        continue
                decided = _decide(client, case_id, action["action_id"], "approve", analyst, reason)
                if not decided.get("approved"):
                    executions.append({"tool": tool, "target": target,
                                       "via_replan": position > 0,
                                       "status_code": decided.get("status_code"),
                                       "detail": decided.get("detail"),
                                       "skipped": "approval refused by policy"})
                    continue
                outcome = _execute(client, case_id, action["action_id"])
                if "result" not in outcome:
                    executions.append({"tool": tool, "target": target,
                                       "via_replan": position > 0, **outcome})
                    continue
                result = outcome["result"]
                context.results.append(result)
                executions.append({
                    "tool": result["tool_name"], "target": result["target_id"],
                    "simulated_at": result.get("simulated_at"),
                    "execution_status": result["execution_status"],
                    "validation_status": result["validation_status"],
                    "action_status": outcome["action_status"],
                    "observed_effect": result["observed_effect"],
                    "via_replan": position > 0,
                })
            run["checkpoints"].append({**scored, "branch": branch, "batch_records": len(records),
                                       "decisions": decisions, "executions": executions})

        report = client.post(f"/cases/{case_id}/reports").json()
        run["system_checks"] = _system_checks(client, case_id, report)
        run["report"] = _report_coverage(report)
    scores = [cp["score"] for cp in run["checkpoints"]]
    run["mean_score"] = round(sum(scores) / len(scores), 1) if scores else 0.0
    run["passed"] = all(cp["passed"] for cp in run["checkpoints"]) and all(
        g["passed"] for g in run["system_checks"])
    return run
