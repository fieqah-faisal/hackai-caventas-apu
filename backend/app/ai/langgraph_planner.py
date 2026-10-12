"""LangGraph planner adapter: the real AI planner behind ``PlannerAdapter``.

Contract (see ``app/ai/planner_adapter.py`` and ``app/schemas/plan.py``):

    generate_plan(incident_state, approved_guidance) -> PlanProposal

The graph is intentionally small:

    analyze (LLM #1) -> sufficient evidence? -> propose (LLM #2)
                                            -> END (missing_evidence)

The LLM is an OpenAI-compatible chat-completions call (OpenCode Go gateway,
model ``deepseek-v4.1-flash``). The call is injectable so tests run without a
network or an API key. Safety rules are enforced locally, not trusted to the
model: the stage must be a valid ``Stage``, action targets must exist in the
incident state, evidence ids must exist, tool names must be in the approved
allowlist, and ``based_on_state_version`` always comes from the state.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Optional, TypedDict

import httpx
from langgraph.graph import END, START, StateGraph

from app.ai.planner_adapter import FakePlannerAdapter, PlannerAdapter
from app.config import get_settings
from app.schemas.incident_state import IncidentState
from app.schemas.plan import PlanProposal, ProposedAction, Stage

LLMCall = Callable[[list[dict[str, Any]], str], str]

USER_AGENT = "caventas-ir-planner/0.1"

DEFAULT_ALLOWED_TOOLS = {
    "isolate_host",
    "preserve_evidence",
    "reimage_host",
    "revoke_sessions",
    "reset_password",
    "disable_account",
    "remove_mail_forwarding_rule",
    "block_domain",
    "warn_staff",
}

DEFAULT_GUIDANCE_PATH = (
    Path(__file__).resolve().parents[2] / "fixtures" / "guidance.json"
)


class PlannerError(RuntimeError):
    """Raised when the planner cannot produce a valid proposal."""


class PlannerState(TypedDict, total=False):
    incident: dict[str, Any]
    guidance: dict[str, Any]
    selected_rule_ids: list[str]
    analysis: dict[str, Any]
    sufficient: bool
    stage: str
    actions: list[dict[str, Any]]
    missing_evidence: list[str]


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError as exc:
                raise PlannerError(f"planner returned invalid JSON: {exc}") from exc
        raise PlannerError("planner returned no JSON object")


def _str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(v) for v in value]


def _default_llm_call(messages: list[dict[str, Any]], session_id: str) -> str:
    settings = get_settings()
    if not settings.opencode_go_api_key:
        raise PlannerError(
            "OPENCODE_GO_API_KEY is not configured; set it in backend/.env"
        )
    payload = {
        "model": settings.opencode_go_model,
        "messages": messages,
        "temperature": settings.opencode_go_temperature,
        "max_tokens": settings.opencode_go_max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {settings.opencode_go_api_key}",
        "User-Agent": USER_AGENT,
        "x-opencode-session": session_id,
    }
    try:
        response = httpx.post(
            settings.opencode_go_endpoint,
            json=payload,
            headers=headers,
            timeout=settings.opencode_go_timeout_seconds,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise PlannerError(f"AI provider request failed: {exc}") from exc
    try:
        data = response.json()
        choice = data["choices"][0]
        content = choice["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise PlannerError("AI provider returned an unexpected response shape") from exc
    if not content or not content.strip():
        finish = choice.get("finish_reason") or "unknown"
        raise PlannerError(
            f"AI provider returned empty content (finish_reason={finish}); "
            "consider raising OPENCODE_GO_MAX_TOKENS"
        )
    return content


def _analysis_messages(incident: dict[str, Any]) -> list[dict[str, Any]]:
    system = (
        "You are an incident-response analysis assistant. Given a versioned "
        "incident state (entities, relationships, timeline, findings) "
        "derived from current evidence, determine the likely incident type, "
        "scope, severity, confidence (0-1), and the recommended IR stage. "
        "\"sufficient\" means: is there enough evidence to recommend an "
        "initial response focus? Indicators of active compromise (malicious "
        "execution, credential access, exfiltration, unauthorized sessions) "
        "warrant an initial plan: set sufficient=true and still list any "
        "remaining gaps in missing_evidence. Set sufficient=false only when "
        "no defensible action can be recommended yet, e.g. events look "
        "ambiguous or benign without corroboration. Never invent entity ids "
        "or evidence ids. Return ONLY a JSON object with keys: "
        "incident_type, scope, severity (low|medium|high|critical), "
        "confidence, sufficient, missing_evidence, stage (assessment|"
        "preservation|containment|eradication|hardening|restoration)."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(incident, sort_keys=True)},
    ]


def _proposal_messages(
    incident: dict[str, Any],
    analysis: dict[str, Any],
    guidance: dict[str, Any],
    entity_ids: set[str],
    evidence_ids: set[str],
) -> list[dict[str, Any]]:
    system = (
        "You are an incident-response planner. Propose the next response "
        "actions for the analyst to approve. Rules: use ONLY tools from the "
        "approved tool list in the guidance; target_id must be one of the "
        "valid entity ids; evidence_ids must come only from the valid "
        "evidence ids; reference policy rule ids in policy_refs when "
        "relevant. Every action needs rationale, risk, expected_effect and "
        "validation_checks. Never invent ids. Return ONLY a JSON object "
        "with exactly these keys: {\"stage\": <assessment|preservation|"
        "containment|eradication|hardening|restoration>, \"actions\": "
        "[{\"tool_name\": <string>, \"target_id\": <string>, "
        "\"evidence_ids\": [<string>], \"policy_refs\": [<string>], "
        "\"rationale\": <string>, \"prerequisites\": [<string>], "
        "\"risk\": <string>, \"expected_effect\": <string>, "
        "\"validation_checks\": [<string>]}]}."
    )
    payload = {
        "incident_state": incident,
        "analysis": analysis,
        "approved_guidance": guidance,
        "valid_entity_ids": sorted(entity_ids),
        "valid_evidence_ids": sorted(evidence_ids),
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, sort_keys=True)},
    ]


def _collect_evidence_ids(incident: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    for relationship in incident.get("relationships", []):
        ids.update(_str_list(relationship.get("evidence_ids")))
    for event in incident.get("timeline", []):
        ids.update(_str_list(event.get("evidence_ids")))
    for finding in incident.get("findings", []):
        ids.update(_str_list(finding.get("evidence_ids")))
    return ids


def _allowed_tools(guidance: dict[str, Any]) -> set[str]:
    tools = guidance.get("approved_tools")
    if isinstance(tools, list) and tools:
        return {str(t) for t in tools}
    return set(DEFAULT_ALLOWED_TOOLS)


def _coerce_stage(raw: Any) -> Stage:
    try:
        return Stage(str(raw))
    except ValueError:
        return Stage.ASSESSMENT


def _first_str(raw: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = raw.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def _validated_action(
    raw: dict[str, Any],
    entity_ids: set[str],
    evidence_ids: set[str],
    allowlist: set[str],
    allowed_refs: set[str],
) -> Optional[ProposedAction]:
    tool = _first_str(raw, "tool_name", "tool", "action", "action_type")
    target = _first_str(raw, "target_id", "target")
    if tool not in allowlist or target not in entity_ids:
        return None
    cited = [e for e in _str_list(raw.get("evidence_ids")) if e in evidence_ids]
    return ProposedAction(
        tool_name=tool,
        target_id=target,
        evidence_ids=cited,
        policy_refs=[
            ref for ref in _str_list(raw.get("policy_refs")) if ref in allowed_refs
        ],
        rationale=str(raw.get("rationale", "")),
        prerequisites=_str_list(raw.get("prerequisites")),
        risk=str(raw.get("risk", "")),
        expected_effect=str(raw.get("expected_effect", "")),
        validation_checks=_str_list(raw.get("validation_checks")),
    )


class LangGraphPlannerAdapter:
    """Real planner: LangGraph orchestration over an OpenAI-compatible LLM."""

    def __init__(self, llm_call: Optional[LLMCall] = None) -> None:
        self._llm_call = llm_call or _default_llm_call
        graph = StateGraph(PlannerState)
        graph.add_node("analyze", self._analyze)
        graph.add_node("retrieve", self._retrieve)
        graph.add_node("propose", self._propose)
        graph.add_edge(START, "analyze")
        graph.add_conditional_edges(
            "analyze",
            self._route_after_analyze,
            {"retrieve": "retrieve", "end": END},
        )
        graph.add_edge("retrieve", "propose")
        graph.add_edge("propose", END)
        self._graph = graph.compile()

    def _analyze(self, state: PlannerState) -> PlannerState:
        incident = state["incident"]
        raw = self._llm_call(_analysis_messages(incident), incident["case_id"])
        analysis = _extract_json(raw)
        return {
            "analysis": analysis,
            "sufficient": bool(analysis.get("sufficient", False)),
            "stage": _coerce_stage(analysis.get("stage", "")).value,
            "missing_evidence": _str_list(analysis.get("missing_evidence")),
        }

    def _route_after_analyze(self, state: PlannerState) -> str:
        return "retrieve" if state.get("sufficient") else "end"

    def _retrieve(self, state: PlannerState) -> PlannerState:
        guidance = select_guidance(state.get("guidance", {}), state.get("stage", ""))
        return {
            "guidance": guidance,
            "selected_rule_ids": sorted(
                str(rule.get("rule_id")) for rule in guidance.get("policy_rules", [])
            ),
        }

    def _propose(self, state: PlannerState) -> PlannerState:
        incident = state["incident"]
        entity_ids = {str(e.get("id")) for e in incident.get("entities", [])}
        raw = self._llm_call(
            _proposal_messages(
                incident,
                state.get("analysis", {}),
                state.get("guidance", {}),
                entity_ids,
                _collect_evidence_ids(incident),
            ),
            incident["case_id"],
        )
        proposal = _extract_json(raw)
        actions = proposal.get("actions") or []
        if not isinstance(actions, list):
            raise PlannerError("planner 'actions' must be a list")
        return {
            "actions": [a for a in actions if isinstance(a, dict)],
        }

    def generate_plan(
        self, incident_state: IncidentState, approved_guidance: dict | None = None
    ) -> PlanProposal:
        incident = incident_state.model_dump(mode="json")
        guidance = approved_guidance or {}
        final = self._graph.invoke({"incident": incident, "guidance": guidance})

        entity_ids = {entity.id for entity in incident_state.entities}
        evidence_ids = _collect_evidence_ids(incident)
        allowlist = _allowed_tools(guidance)
        allowed_refs = set(final.get("selected_rule_ids", []))
        actions: list[ProposedAction] = []
        for raw_action in final.get("actions", []):
            action = _validated_action(
                raw_action, entity_ids, evidence_ids, allowlist, allowed_refs
            )
            if action is not None:
                actions.append(action)

        return PlanProposal(
            based_on_state_version=incident_state.version,
            stage=_coerce_stage(final.get("stage")),
            actions=actions,
            missing_evidence=_str_list(final.get("missing_evidence")),
        )


def select_guidance(guidance: dict[str, Any], stage: str) -> dict[str, Any]:
    """Retrieve the guidance relevant to the selected response stage.

    Keeps policy rules whose ``phase`` matches the stage (an empty ``phase``
    applies to every stage) and narrows ``stage_guidance`` to that stage.
    ``approved_tools`` and ``assets`` stay complete: the tool allowlist is a
    safety boundary and the asset list is reference data.
    """
    rules = [
        rule
        for rule in guidance.get("policy_rules", [])
        if isinstance(rule.get("rule_id"), str)
        and rule["rule_id"]
        and (not rule.get("phase") or stage in rule["phase"])
    ]
    return {
        **guidance,
        "policy_rules": rules,
        "stage_guidance": {stage: guidance.get("stage_guidance", {}).get(stage, [])},
    }


def load_guidance(path: Optional[Path] = None) -> dict[str, Any]:
    """Load the approved-guidance fixture (policy pack + tool allowlist)."""
    source = path or DEFAULT_GUIDANCE_PATH
    with source.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def get_planner_adapter() -> PlannerAdapter:
    """Return the real adapter when an API key is configured, else the fake."""
    if get_settings().opencode_go_api_key:
        return LangGraphPlannerAdapter()
    return FakePlannerAdapter()
