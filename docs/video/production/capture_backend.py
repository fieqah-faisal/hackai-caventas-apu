"""Deterministic backend for recording the Caventas product film.

Runs the real FastAPI application (every router, service, policy guard,
GAS-lite state builder, bounded simulator and report renderer) with two
substitutions so the recording is repeatable and needs no credentials:

* Firestore -> the in-memory ``tests.fake_firestore.FakeFirestore``.
* The LLM HTTP call inside ``LangGraphPlannerAdapter`` -> a replay of the
  infostealer decisions recorded by the live evaluation run
  (``backend/evaluation/results/live.json``: tools, targets, cited record ids,
  policy refs and missing evidence). The LangGraph graph, stage-scoped
  guidance retrieval, allowlist/evidence/policy-ref validation, trace steps
  and persistence are the real code paths.

Synthetic data only. All execution is the bounded simulator (``demo`` profile:
CRM admin API in vendor maintenance until 10:30, as in the scenario README).

Run from the repo root:
    .venv/bin/python docs/video/production/capture_backend.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[3]
BACKEND = REPO / "backend"
sys.path.insert(0, str(BACKEND))

_RUNTIME = Path(tempfile.mkdtemp(prefix="caventas-film-"))
os.environ.update({
    "SIMULATOR_PROFILE": "demo",
    "OPENCODE_GO_API_KEY": "",
    "FIRESTORE_EMULATOR_HOST": "",
    "UPLOAD_DIR": str(_RUNTIME / "uploads"),
    "REPORT_DIR": str(_RUNTIME / "reports"),
})

import uvicorn  # noqa: E402
from fastapi import Request  # noqa: E402

from app.ai.langgraph_planner import LangGraphPlannerAdapter  # noqa: E402
from app.database import repositories  # noqa: E402
from app.main import app  # noqa: E402
from app.services import planning_service  # noqa: E402
from tests.fake_firestore import FakeFirestore  # noqa: E402

_DB = FakeFirestore()
repositories.get_db = lambda: _DB

# Seconds each replayed model call takes, so the agent dialog shows its stages.
DELAY = {"seconds": 0.0}

# --- Replayed planner decisions (sc01_infostealer, live evaluation run) -----

CP1_ANALYSIS: dict[str, Any] = {
    "incident_type": "infostealer_session_hijack",
    "summary": (
        "An unsigned 'PDF editor' installer downloaded from pdf-editor-free.example "
        "ran on SALES-LT-07 and dropped svchost-update.exe, which read Chrome "
        "password and cookie stores, staged b7.zip and uploaded 2.4 MB to "
        "203.0.113.45 (cdn-sync-update.example). A Run-key persists the binary and "
        "HTTPS beacons continue. Farah's SSO and CRM sessions are exposed to replay."
    ),
    "scope": "Host SALES-LT-07 and account farah; CRM session crm-s-7731 exposed. No other host shows the binary yet.",
    "severity": "high",
    "confidence": 0.86,
    "sufficient": True,
    "stage": "containment",
    "findings": [
        {"summary": "Unsigned installer PDFEditorSetup.exe downloaded from an uncategorised domain and executed by farah.",
         "records": ["SC1-B1-05", "SC1-B1-06", "SC1-B1-07"], "confidence": 0.9},
        {"summary": "Child process svchost-update.exe masquerades as a Windows binary from AppData.",
         "records": ["SC1-B1-08"], "confidence": 0.7},
        {"summary": "Browser password and cookie stores read by the unsigned process (credential and session theft).",
         "records": ["SC1-B1-09"], "confidence": 0.88},
        {"summary": "b7.zip staged and 2.4 MB uploaded to 203.0.113.45 over HTTPS right after staging.",
         "records": ["SC1-B1-10", "SC1-B1-11", "SC1-B1-12"], "confidence": 0.82},
        {"summary": "Persistence via HKCU Run value SyncUpdate; periodic beacons to the same address overnight.",
         "records": ["SC1-B1-13", "SC1-B1-15", "SC1-B1-16", "SC1-B1-18"], "confidence": 0.85},
    ],
    "attack_techniques": ["T1204.002", "T1036.005", "T1555.003", "T1539", "T1560", "T1071.001", "T1041", "T1547.001"],
    "missing_evidence": [
        "Hash reputation or sandbox verdicts for PDFEditorSetup.exe and svchost-update.exe.",
        "Full process tree and memory image of SALES-LT-07 before remediation.",
        "Contents of the 2.4 MB upload (b7.zip): which session cookies were taken.",
        "Farah's CRM and mail audit logs from 21:42 onward for use of the stolen session.",
        "Proxy and DNS logs showing whether other hosts resolved the two domains.",
    ],
}

CP1_ACTIONS: list[dict[str, Any]] = [
    {"tool_name": "preserve_evidence", "target_id": "HOST::SALES-LT-07",
     "records": ["SC1-B1-07", "SC1-B1-08", "SC1-B1-09", "SC1-B1-10", "SC1-B1-12", "SC1-B1-13", "SC1-B1-20"],
     "policy_refs": [],
     "rationale": "Capture memory and disk before remediation so the stealer, its archive and persistence stay provable.",
     "prerequisites": ["EDR management channel reachable"],
     "risk": "Brief performance impact on the laptop during imaging.",
     "expected_effect": "Forensic images with SHA-256 and chain of custody recorded.",
     "validation_checks": ["Image hashes recorded", "Chain of custody entry exists"]},
    {"tool_name": "isolate_host", "target_id": "HOST::SALES-LT-07",
     "records": ["SC1-B1-07", "SC1-B1-08", "SC1-B1-09", "SC1-B1-12", "SC1-B1-15", "SC1-B1-18", "SC1-B1-19"],
     "policy_refs": ["POL-04"],
     "rationale": "Active stealer with HTTPS beacons to 203.0.113.45; network containment stops further exfiltration.",
     "prerequisites": ["Notify Farah's manager of temporary loss of connectivity"],
     "risk": "Farah loses network access until the laptop is cleared.",
     "expected_effect": "Only the EDR management channel remains; beacons to 203.0.113.45 stop.",
     "validation_checks": ["No outbound connection to 203.0.113.45 after isolation"]},
    {"tool_name": "revoke_sessions", "target_id": "ACCOUNT::farah",
     "records": ["SC1-B1-09", "SC1-B1-02", "SC1-B1-01", "SC1-B1-12", "SC1-B1-20"],
     "policy_refs": ["POL-11", "POL-07"],
     "rationale": "Cookie stores were read and uploaded; stolen SSO and CRM sessions must be revoked, a password reset alone is not enough.",
     "prerequisites": [],
     "risk": "Farah must sign in again on every service.",
     "expected_effect": "All active sessions for farah invalidated in IdP, mail and CRM.",
     "validation_checks": ["No active sessions remain for farah in idp, mail and crm"]},
    {"tool_name": "reset_password", "target_id": "ACCOUNT::farah",
     "records": ["SC1-B1-09", "SC1-B1-12", "SC1-B1-20"],
     "policy_refs": ["POL-07"],
     "rationale": "Saved browser passwords were read by the stealer; the SSO password must be considered compromised.",
     "prerequisites": ["Revoke active sessions first"],
     "risk": "User-assisted reset; short disruption.",
     "expected_effect": "Stolen password no longer valid at the identity provider.",
     "validation_checks": ["Password change event recorded at the IdP"]},
    {"tool_name": "block_domain", "target_id": "DOMAIN::cdn-sync-update.example",
     "records": ["SC1-B1-11", "SC1-B1-12", "SC1-B1-15", "SC1-B1-16", "SC1-B1-18"],
     "policy_refs": ["POL-09"],
     "rationale": "C2 and exfiltration destination of svchost-update.exe; evidence links it directly to the incident.",
     "prerequisites": [],
     "risk": "None expected; domain has no business use.",
     "expected_effect": "DNS resolution of cdn-sync-update.example blocked for all hosts.",
     "validation_checks": ["No DNS answers for cdn-sync-update.example after the block"]},
    {"tool_name": "block_domain", "target_id": "DOMAIN::pdf-editor-free.example",
     "records": ["SC1-B1-05", "SC1-B1-06", "SC1-B1-07"],
     "policy_refs": ["POL-09"],
     "rationale": "Lure site that served the malicious installer.",
     "prerequisites": [],
     "risk": "None expected.",
     "expected_effect": "Other staff cannot download the same installer.",
     "validation_checks": ["No DNS answers for pdf-editor-free.example after the block"]},
]

CP2_ANALYSIS: dict[str, Any] = {
    "incident_type": "infostealer_session_hijack",
    "summary": (
        "The stolen CRM session crm-s-7731 was replayed at 10:20 from 198.51.100.23 on "
        "an unregistered device: IdP revocation held, but CRM revocation had failed "
        "during vendor maintenance. 1,200 customer records (name, phone, email, company) "
        "were exported and downloaded. Farah was in a client meeting and did not use "
        "the CRM. Customer personal data is exposed and the CRM session is still live."
    ),
    "scope": "Account farah, CRM session crm-s-7731 and 1,200 customer records; SALES-LT-07 already isolated.",
    "severity": "critical",
    "confidence": 0.91,
    "sufficient": True,
    "stage": "containment",
    "findings": [
        {"summary": "Stolen CRM session crm-s-7731 replayed from 198.51.100.23 with a new device fingerprint.",
         "records": ["SC1-B2-11", "SC1-B1-02"], "confidence": 0.92},
        {"summary": "IdP rejected the stolen cookie and the old password, so the attacker pivoted to the CRM session.",
         "records": ["SC1-B2-08", "SC1-B2-10"], "confidence": 0.85},
        {"summary": "1,200 customer records exported and downloaded through the hijacked session.",
         "records": ["SC1-B2-13", "SC1-B2-14"], "confidence": 0.93},
        {"summary": "Farah confirms she has not used the CRM today; the session activity is not hers.",
         "records": ["SC1-B2-16"], "confidence": 0.8},
        {"summary": "CRM admin API is available again, so the failed CRM revocation can now be retried.",
         "records": ["SC1-B2-15"], "confidence": 0.75},
    ],
    "attack_techniques": ["T1539", "T1550.004", "T1213.004", "T1555.003", "T1041"],
    "missing_evidence": [
        "Complete CRM audit trail for crm-s-7731: views, exports and downloads beyond export_customers_central.csv.",
        "Whether 198.51.100.23 accessed any other account or application.",
        "Data classification and DPO notification decision for the 1,200 exported records.",
        "Sweep of other endpoints for PDFEditorSetup.exe, svchost-update.exe and the C2 address.",
    ],
}

CP2_ACTIONS: list[dict[str, Any]] = [
    {"tool_name": "revoke_sessions", "target_id": "ACCOUNT::farah",
     "records": ["SC1-B1-02", "SC1-B2-11", "SC1-B2-13", "SC1-B2-15"],
     "policy_refs": ["POL-07", "POL-11"],
     "rationale": "The earlier revocation failed in the CRM and the session was replayed; the admin API is back, so revoke again.",
     "prerequisites": ["CRM admin API available (maintenance ended 10:30)"],
     "risk": "Farah signs in again on all services.",
     "expected_effect": "crm-s-7731 and every other session for farah invalidated, including the CRM.",
     "validation_checks": ["No active CRM session for farah", "No further exports from 198.51.100.23"]},
    {"tool_name": "disable_account", "target_id": "ACCOUNT::farah",
     "records": ["SC1-B1-09", "SC1-B2-08", "SC1-B2-10", "SC1-B2-11"],
     "policy_refs": ["POL-02"],
     "rationale": "An attacker holds working session material for this account; block new sign-ins until the account is rebuilt.",
     "prerequisites": ["IT manager approval (POL-02)"],
     "risk": "Farah cannot work until the account is re-enabled.",
     "expected_effect": "New sign-ins for farah blocked at the identity provider.",
     "validation_checks": ["Sign-in attempts for farah are rejected"]},
]


def _record_map(case_id: str) -> dict[str, str]:
    return {
        str(item["fields"]["record_id"]): item["evidence_id"]
        for item in repositories.list_evidence(case_id)
        if item.get("fields", {}).get("record_id")
    }


def _ids(records: list[str], mapping: dict[str, str]) -> list[str]:
    return [mapping[r] for r in records if r in mapping]


def _replay(messages: list[dict[str, Any]], session_id: str) -> str:
    import json

    time.sleep(DELAY["seconds"])
    mapping = _record_map(session_id)
    checkpoint = 2 if any(r.startswith("SC1-B2") for r in mapping) else 1
    analysis = CP2_ANALYSIS if checkpoint == 2 else CP1_ANALYSIS
    if messages[0]["content"].startswith("You are an incident-response analysis"):
        out = {k: v for k, v in analysis.items() if k != "findings"}
        out["findings"] = [
            {"summary": f["summary"], "evidence_ids": _ids(f["records"], mapping),
             "confidence": f["confidence"]}
            for f in analysis["findings"]
        ]
        return json.dumps(out)

    # Within a checkpoint, the planner does not re-propose an action the
    # analyst already executed or rejected after this evidence arrived.
    latest = max(
        (item.get("event_time") or "" for item in repositories.list_evidence(session_id)),
        default="",
    )
    done = {
        (r.get("tool_name"), r.get("target_id"))
        for r in repositories.list_action_results(session_id)
        if str(r.get("simulated_at") or "") > latest
    }
    rejected = {
        (a["proposal"]["tool_name"], a["proposal"]["target_id"])
        for a in repositories.list_actions(session_id)
        if a.get("status") == "rejected"
    }
    source = CP2_ACTIONS if checkpoint == 2 else CP1_ACTIONS
    actions = []
    for action in source:
        key = (action["tool_name"], action["target_id"])
        if key in done or (checkpoint == 1 and key in rejected):
            continue
        out = {k: v for k, v in action.items() if k != "records"}
        out["evidence_ids"] = _ids(action["records"], mapping)
        actions.append(out)
    return json.dumps({"stage": analysis["stage"], "actions": actions})


planning_service.get_planner_adapter = lambda: LangGraphPlannerAdapter(llm_call=_replay)


@app.post("/__film/delay", include_in_schema=False)
async def _set_delay(request: Request) -> dict[str, float]:
    body = await request.json()
    DELAY["seconds"] = float(body.get("seconds", 0))
    return DELAY


if __name__ == "__main__":
    print(f"runtime dir: {_RUNTIME}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")), log_level="warning")
