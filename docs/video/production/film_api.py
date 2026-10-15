"""API helpers for the film capture (run with the backend venv).

Commands:
    split <outdir>              batch 1 of sc01, one file per evidence source
    seed                        two background cases (sc02, sc03) with evidence
    advance <case_id>           off-camera containment steps from the demo path
    approve <case_id> <tool> <target> [role]   re-plan, approve and simulate one action
    batch2 <case_id> <outfile>  render batch 2 from the case's stored results

``advance`` follows the documented demo path: after each simulated execution
the plan's other approvals are stale, so it re-plans and approves the next
action from the fresh plan (exactly like ``evaluation/harness.py``).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

REPO = Path(__file__).resolve().parents[3]
BACKEND = REPO / "backend"
sys.path.insert(0, str(BACKEND))
SC = BACKEND / "scenarios"
API = httpx.Client(base_url="http://127.0.0.1:8000", timeout=120)

SOURCE_FILES = {
    "signin": "identity-signin-logs.json",
    "endpoint": "edr-endpoint-events.json",
    "dns": "dns-queries.json",
    "firewall": "firewall-network.json",
    "analyst_note": "analyst-triage-note.json",
}


def split(outdir: str) -> None:
    records = json.loads((SC / "sc01_infostealer/agent_inputs/batch_01.json").read_text())
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    for source, name in SOURCE_FILES.items():
        subset = [r for r in records if r["source"] == source]
        (out / name).write_text(json.dumps(subset, indent=2) + "\n")
        print(name, len(subset))


def seed() -> None:
    for scenario in ("sc02_phishing_injection", "sc03_false_alarm"):
        inputs = SC / scenario / "agent_inputs"
        case = API.post("/cases", json=json.loads((inputs / "case.json").read_text())).json()
        API.post(
            f"/cases/{case['case_id']}/evidence",
            files={"file": ("batch_01.json", (inputs / "batch_01.json").read_bytes())},
        ).raise_for_status()
        print(case["case_id"], case["title"])


def _run_and_pick(case_id: str, tool: str, target: str) -> dict:
    plan = API.post(f"/cases/{case_id}/runs")
    plan.raise_for_status()
    for action in plan.json()["actions"]:
        proposal = action["proposal"]
        if proposal["tool_name"] == tool and proposal["target_id"] == target:
            return action
    raise SystemExit(f"{tool} on {target} was not re-proposed")


def approve(case_id: str, tool: str, target: str, role: str = "soc_analyst") -> None:
    action = _run_and_pick(case_id, tool, target)
    API.post(
        f"/cases/{case_id}/actions/{action['action_id']}/decision",
        json={"decision": "approve", "analyst": "Caventas SOC Analyst",
              "approver_role": role, "reason": "Approved per containment plan."},
    ).raise_for_status()
    result = API.post(f"/cases/{case_id}/actions/{action['action_id']}/execute").json()["result"]
    print(tool, target, result["execution_status"], result["validation_status"])


def advance(case_id: str) -> None:
    approve(case_id, "revoke_sessions", "ACCOUNT::farah")
    approve(case_id, "reset_password", "ACCOUNT::farah")
    approve(case_id, "preserve_evidence", "HOST::SALES-LT-07")


def batch2(case_id: str, outfile: str) -> None:
    from scenarios.conditions import render_batch, serialise

    scenario = json.loads((SC / "sc01_infostealer/evaluator_only/scenario.json").read_text())
    results = API.get(f"/cases/{case_id}/action-results").json()
    revealed = {
        str(item["fields"].get("record_id"))
        for item in API.get(f"/cases/{case_id}/evidence").json()
        if item["fields"].get("record_id")
    }
    records, branch = render_batch(scenario, 2, results, revealed)
    Path(outfile).write_bytes(serialise(records, "json"))
    print(branch, len(records))


if __name__ == "__main__":
    command, *args = sys.argv[1:]
    {"split": split, "seed": seed, "advance": advance, "approve": approve, "batch2": batch2}[command](*args)
