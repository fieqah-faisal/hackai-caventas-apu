"""Run the real Caventas FastAPI app for the promo recording.

Differences from a production run (all outside the repo):
- Firestore is the in-memory test double (backend/tests/fake_firestore.py).
- SIMULATOR_PROFILE=demo (the documented demo profile: CRM admin API in
  vendor maintenance until 10:30, so an early CRM revocation fails).
- The real LangGraphPlannerAdapter runs (analyze -> route -> retrieve ->
  propose -> adapter validation), but its LLM call is replayed from
  replay_plans.json because no planner API key exists in this environment.
Every planning node is logged to trace.jsonl for the pipeline graphic.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(BACKEND))

os.environ["SIMULATOR_PROFILE"] = "demo"
os.environ["UPLOAD_DIR"] = str(HERE / "runtime" / "uploads")
os.environ["REPORT_DIR"] = str(HERE / "runtime" / "reports")
os.environ.pop("OPENCODE_GO_API_KEY", None)

from tests.fake_firestore import FakeFirestore  # noqa: E402

DB = FakeFirestore()
import app.database.repositories as repositories  # noqa: E402

repositories.get_db = lambda: DB

from app.ai import langgraph_planner  # noqa: E402
from app.services import planning_service  # noqa: E402

PLANS = json.loads((HERE / "replay_plans.json").read_text())
TRACE = HERE / "trace.jsonl"
LLM_DELAY = float(os.environ.get("REPLAY_LLM_DELAY", "1.4"))


def _log(**event):
    event["t"] = time.time()
    with TRACE.open("a") as fh:
        fh.write(json.dumps(event) + "\n")


def _record_map(case_id: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for ev in repositories.list_evidence(case_id):
        rid = (ev.get("fields") or {}).get("record_id")
        if rid:
            out[rid] = ev["evidence_id"]
    return out


def _checkpoint(record_map: dict[str, str]) -> str:
    return "cp2" if any(r.startswith("SC1-B2") for r in record_map) else "cp1"


def _effective(case_id: str) -> set[tuple[str, str]]:
    return {
        (r.get("tool_name"), r.get("target_id"))
        for r in repositories.list_action_results(case_id)
        if r.get("validation_status") == "effective"
    }


def replay_llm(messages, session_id):
    """Stand-in for the OpenCode Go call: returns the recorded-style JSON."""
    case_id = session_id
    rmap = _record_map(case_id)
    cp = PLANS[_checkpoint(rmap)]
    ids = lambda recs: [rmap[r] for r in recs if r in rmap]  # noqa: E731
    system = messages[0]["content"]
    time.sleep(LLM_DELAY)
    if system.startswith("You are an incident-response analysis assistant"):
        a = dict(cp["analysis"])
        a["findings"] = [
            {"summary": f["summary"], "evidence_ids": ids(f["records"]), "confidence": f["confidence"]}
            for f in a["findings"]
        ]
        return json.dumps(a)
    done = _effective(case_id)
    actions = []
    for act in cp["proposal"]["actions"]:
        if (act["tool_name"], act["target_id"]) in done:
            continue
        a = {k: v for k, v in act.items() if k != "records"}
        a["evidence_ids"] = ids(act["records"])
        actions.append(a)
    return json.dumps({"stage": cp["proposal"]["stage"], "actions": actions})


class TracedAdapter(langgraph_planner.LangGraphPlannerAdapter):
    def _analyze(self, state):
        inc = state["incident"]
        _log(node="load_state", case=inc["case_id"], version=inc["version"],
             entities=len(inc.get("entities", [])), relationships=len(inc.get("relationships", [])),
             timeline=len(inc.get("timeline", [])))
        _log(node="analyze:start")
        out = super()._analyze(state)
        a = out["analysis"]
        _log(node="analyze:end", incident_type=a.get("incident_type"), severity=a.get("severity"),
             confidence=a.get("confidence"), stage=out["stage"], sufficient=out["sufficient"],
             findings=len(a.get("findings", [])), techniques=a.get("attack_techniques"),
             missing=len(out["missing_evidence"]))
        return out

    def _retrieve(self, state):
        out = super()._retrieve(state)
        _log(node="retrieve", rules=out["selected_rule_ids"],
             pack=len(state.get("guidance", {}).get("policy_rules", [])))
        return out

    def _propose(self, state):
        _log(node="propose:start")
        out = super()._propose(state)
        _log(node="propose:end", raw_actions=len(out["actions"]))
        return out

    def generate_plan(self, incident_state, approved_guidance=None):
        plan = super().generate_plan(incident_state, approved_guidance)
        _log(node="validate", kept=len(plan.actions), stage=plan.stage.value,
             based_on=plan.based_on_state_version,
             actions=[f"{a.tool_name} -> {a.target_id}" for a in plan.actions],
             policy_refs=[a.policy_refs for a in plan.actions])
        return plan


planning_service.get_planner_adapter = lambda: TracedAdapter(llm_call=replay_llm)

if __name__ == "__main__":
    import uvicorn
    from app.main import app

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
