"""Tests for the LangGraph planner adapter (BL-002).

The LLM call is injected, so these tests need no network and no API key.
They pin the safety rules from `.kiro/steering/security.md`: proposals only,
no fabricated evidence ids, targets must exist in the state, tool names come
from the approved allowlist, and the state version is never taken from the
model.
"""
from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.ai.langgraph_planner import (
    LangGraphPlannerAdapter,
    PlannerError,
    load_guidance,
)
from app.schemas.incident_state import (
    Entity,
    EntityType,
    IncidentState,
    Relationship,
    RelationshipStatus,
    TimelineEvent,
)
from app.schemas.plan import Stage


def _state(version: int = 3) -> IncidentState:
    return IncidentState(
        case_id="CASE-001",
        version=version,
        entities=[
            Entity(id="HOST::WS-01", type=EntityType.HOST, name="WS-01"),
            Entity(id="ACCOUNT::farah", type=EntityType.ACCOUNT, name="farah"),
        ],
        relationships=[
            Relationship(
                source="ACCOUNT::farah",
                relation="logged_into",
                target="HOST::WS-01",
                evidence_ids=["EV-1"],
                status=RelationshipStatus.OBSERVED,
            )
        ],
        timeline=[
            TimelineEvent(description="stealer upload", evidence_ids=["EV-2"]),
        ],
    )


GUIDANCE = {
    "policy_pack_version": "test",
    "policy_rules": [
        {"rule_id": "POL-01", "statement": "Preserve evidence before re-imaging."}
    ],
    "approved_tools": ["isolate_host", "revoke_sessions"],
}


class ScriptedLLM:
    """Returns canned responses in order and records the calls."""

    def __init__(self, responses: list[str]):
        self.responses = list(responses)
        self.calls: list[tuple[list[dict], str]] = []

    def __call__(self, messages: list[dict], session_id: str) -> str:
        self.calls.append((messages, session_id))
        if not self.responses:
            raise AssertionError("no scripted response left")
        return self.responses.pop(0)


def _analysis(**overrides) -> str:
    payload = {
        "incident_type": "infostealer_session_hijack",
        "scope": "one laptop and the CRM session",
        "severity": "high",
        "confidence": 0.7,
        "sufficient": True,
        "missing_evidence": [],
        "stage": "containment",
    }
    payload.update(overrides)
    return json.dumps(payload)


def _action(**overrides) -> dict:
    payload = {
        "tool_name": "isolate_host",
        "target_id": "HOST::WS-01",
        "evidence_ids": ["EV-1"],
        "rationale": "Suspicious activity is evidence-backed on WS-01.",
        "prerequisites": [],
        "risk": "Temporary workstation connectivity loss.",
        "expected_effect": "Stop further exfiltration from the host.",
        "validation_checks": ["Outbound traffic stops."],
        "policy_refs": ["POL-01"],
    }
    payload.update(overrides)
    return payload


def _proposal(**overrides) -> str:
    payload = {"stage": "containment", "actions": [_action()]}
    payload.update(overrides)
    return json.dumps(payload)


def test_sufficient_analysis_produces_grounded_proposal():
    llm = ScriptedLLM([_analysis(), _proposal()])
    plan = LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), GUIDANCE)

    assert plan.stage is Stage.CONTAINMENT
    assert plan.based_on_state_version == 3
    assert plan.missing_evidence == []
    assert len(plan.actions) == 1
    action = plan.actions[0]
    assert action.tool_name == "isolate_host"
    assert action.target_id == "HOST::WS-01"
    assert action.evidence_ids == ["EV-1"]
    assert action.policy_refs == ["POL-01"]

    assert len(llm.calls) == 2
    assert all(session == "CASE-001" for _, session in llm.calls)
    # the proposal call must have seen the approved guidance
    assert "POL-01" in json.dumps(llm.calls[1][0])


def test_insufficient_evidence_requests_more_and_skips_proposal():
    llm = ScriptedLLM(
        [
            _analysis(
                sufficient=False,
                missing_evidence=["Authentication records for WS-01"],
                stage="assessment",
            )
        ]
    )
    plan = LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), GUIDANCE)

    assert plan.actions == []
    assert plan.missing_evidence == ["Authentication records for WS-01"]
    assert plan.stage is Stage.ASSESSMENT
    assert len(llm.calls) == 1


def test_fabricated_evidence_ids_are_filtered():
    llm = ScriptedLLM(
        [_analysis(), _proposal(actions=[_action(evidence_ids=["EV-999", "EV-1"])])]
    )
    plan = LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), GUIDANCE)

    assert plan.actions[0].evidence_ids == ["EV-1"]


def test_unknown_tool_and_unknown_target_actions_are_dropped():
    llm = ScriptedLLM(
        [
            _analysis(),
            _proposal(
                actions=[
                    _action(tool_name="format_c_drive"),
                    _action(target_id="HOST::NOPE"),
                ]
            ),
        ]
    )
    plan = LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), GUIDANCE)

    assert plan.actions == []


def test_invalid_stage_falls_back_to_assessment():
    llm = ScriptedLLM([_analysis(), _proposal(stage="combat")])
    plan = LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), GUIDANCE)

    assert plan.stage is Stage.ASSESSMENT


def test_malformed_llm_output_raises_planner_error():
    llm = ScriptedLLM(["this is not json at all"])
    with pytest.raises(PlannerError):
        LangGraphPlannerAdapter(llm_call=llm).generate_plan(_state(), GUIDANCE)


def _settings(api_key: str | None = "sk-test", **overrides) -> SimpleNamespace:
    values = {
        "opencode_go_api_key": api_key,
        "opencode_go_model": "deepseek-v4.1-flash",
        "opencode_go_endpoint": "https://opencode.ai/zen/go/v1/chat/completions",
        "opencode_go_max_tokens": 1234,
        "opencode_go_temperature": 0.1,
        "opencode_go_timeout_seconds": 9.0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_missing_api_key_raises_planner_error(monkeypatch):
    monkeypatch.setattr(
        "app.ai.langgraph_planner.get_settings", lambda: _settings(api_key=None)
    )
    adapter = LangGraphPlannerAdapter()  # default client, no key configured
    with pytest.raises(PlannerError):
        adapter.generate_plan(_state(), GUIDANCE)


def test_default_llm_call_builds_opencode_go_request(monkeypatch):
    captured: dict = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured.update(url=url, json=json, headers=headers, timeout=timeout)

        class _Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {"choices": [{"message": {"content": "{\"ok\": true}"}}]}

        return _Response()

    monkeypatch.setattr("app.ai.langgraph_planner.httpx.post", fake_post)
    monkeypatch.setattr("app.ai.langgraph_planner.get_settings", lambda: _settings())

    from app.ai import langgraph_planner

    out = langgraph_planner._default_llm_call(
        [{"role": "user", "content": "hi"}], "CASE-001"
    )

    assert out == "{\"ok\": true}"
    assert captured["url"] == "https://opencode.ai/zen/go/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer sk-test"
    assert captured["headers"]["x-opencode-session"] == "CASE-001"
    assert "caventas" in captured["headers"]["User-Agent"]
    assert captured["json"]["model"] == "deepseek-v4.1-flash"
    assert captured["json"]["max_tokens"] == 1234
    assert captured["json"]["temperature"] == 0.1
    assert captured["timeout"] == 9.0


def test_load_guidance_reads_repo_fixture():
    guidance = load_guidance()
    assert guidance["playbook"]["id"]
    assert guidance["policy_pack_version"]
    assert any(r["rule_id"] == "POL-01" for r in guidance["policy_rules"])
    assert "isolate_host" in guidance["approved_tools"]
