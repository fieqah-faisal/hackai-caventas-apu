"""Deterministic policy guard (BL-032/BL-018/BL-019).

Evaluates policy independently of the planner's cited ``policy_refs``. The
backend NEVER treats an LLM-cited reference as authorization: this module reads
the approved policy pack (``guidance.json``) and the stored case records and
decides, by code, which rules apply to an action, which approver role is
required, whether evidence is present, and whether sequencing prerequisites
(e.g. POL-01 preserve-before-reimage) are satisfied.

The pure matching helpers take already-loaded data (the guidance dict, plain
action/result dicts) and perform no I/O, so they are directly unit-testable.
Repository access is confined to the thin ``evaluate_*`` entry points used by
the approval and execution services.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

from app.ai.langgraph_planner import load_guidance

# Allowlisted approver roles, from the policy pack's required_approver values.
APPROVER_ROLES = ("soc_analyst", "it_manager", "dpo")

# Role seniority: a more senior role satisfies a requirement for a less senior
# one (an it_manager may approve a soc_analyst action). dpo is a separate
# notification role and is NOT a general approval escalation of the other two.
_ROLE_RANK = {"soc_analyst": 1, "it_manager": 2}


@dataclass
class PolicyCheck:
    """One policy evaluation outcome."""

    ok: bool
    code: str                      # machine-readable reason, e.g. "role_ok"
    detail: str = ""               # human-readable explanation
    rule_ids: list[str] = field(default_factory=list)


@dataclass
class ApprovalPolicyResult:
    required_role: Optional[str]
    acting_role_ok: bool
    rule_ids: list[str]
    asset_type: Optional[str]
    checks: list[PolicyCheck]

    @property
    def ok(self) -> bool:
        return all(c.ok for c in self.checks)


# --------------------------------------------------------------------------
# pure helpers (no I/O)
# --------------------------------------------------------------------------

def rules_for_tool(guidance: dict[str, Any], tool: str) -> list[dict[str, Any]]:
    """Policy rules whose ``applies_to_tools`` includes ``tool``."""
    return [
        rule
        for rule in guidance.get("policy_rules", [])
        if tool in (rule.get("applies_to_tools") or [])
    ]


def asset_id_from_entity(entity_id: str) -> str:
    """Map an incident-state entity id to a policy-pack asset id.

    Only the readable tail is used: ``HOST::SALES-LT-07`` -> ``SALES-LT-07``.
    Does not assume the result is a real asset (callers resolve it against the
    inventory and fail closed when it is not).
    """
    text = (entity_id or "").strip()
    if "::" in text:
        text = text.split("::")[-1]
    return text


def resolve_asset(guidance: dict[str, Any], entity_id: str) -> Optional[dict[str, Any]]:
    """Return the asset-inventory record for an entity id, or None."""
    asset_id = asset_id_from_entity(entity_id)
    for asset in guidance.get("assets", []):
        if str(asset.get("asset_id")) == asset_id:
            return asset
    return None


def asset_type_of(guidance: dict[str, Any], entity_id: str) -> Optional[str]:
    asset = resolve_asset(guidance, entity_id)
    return str(asset.get("type")) if asset else None


def approval_rules_for(
    guidance: dict[str, Any], tool: str, asset_type: Optional[str]
) -> list[dict[str, Any]]:
    """Approval rules for a tool, narrowed by asset type.

    A rule with an empty ``asset_types`` applies to every asset. A rule scoped
    to specific ``asset_types`` applies only when ``asset_type`` matches.
    """
    out = []
    for rule in rules_for_tool(guidance, tool):
        if rule.get("type") != "approval":
            continue
        scoped = rule.get("asset_types") or []
        if not scoped or (asset_type is not None and asset_type in scoped):
            out.append(rule)
    return out


def required_approver(
    guidance: dict[str, Any], tool: str, asset_type: Optional[str]
) -> tuple[Optional[str], list[str]]:
    """Determine the required approver role for a tool+asset_type.

    Returns ``(role, rule_ids)``. When multiple approval rules apply, the most
    senior required role wins (defense in depth). Returns ``(None, [])`` when no
    approval rule constrains the tool.
    """
    rules = approval_rules_for(guidance, tool, asset_type)
    best: Optional[str] = None
    rule_ids: list[str] = []
    for rule in rules:
        role = rule.get("required_approver")
        if not role:
            continue
        rule_ids.append(str(rule.get("rule_id")))
        if best is None or _ROLE_RANK.get(role, 0) > _ROLE_RANK.get(best, 0):
            best = str(role)
    return best, rule_ids


def role_satisfies(acting_role: Optional[str], required_role: Optional[str]) -> bool:
    """Does the acting role satisfy the required role?

    No requirement -> any (or absent) role is fine. Otherwise an exact match or
    a more senior ranked role satisfies it; ``dpo`` only satisfies a ``dpo``
    requirement (it is a notification role, not an approval escalation).
    """
    if required_role is None:
        return True
    if acting_role is None:
        return False
    if acting_role == required_role:
        return True
    req_rank = _ROLE_RANK.get(required_role)
    act_rank = _ROLE_RANK.get(acting_role)
    if req_rank is None or act_rank is None:
        return False
    return act_rank >= req_rank


def tool_needs_asset_resolution(guidance: dict[str, Any], tool: str) -> bool:
    """True when any approval rule for the tool is scoped to specific asset types
    (so the asset type MUST be resolvable to pick the right rule)."""
    return any(
        rule.get("type") == "approval" and (rule.get("asset_types") or [])
        for rule in rules_for_tool(guidance, tool)
    )


def valid_evidence_refs(
    evidence_ids: Iterable[str], exists: "callable", case_id: str
) -> PolicyCheck:
    """BL-019: require at least one evidence reference that actually exists.

    ``exists(case_id, evidence_id)`` is the repository existence check. An empty
    list fails (it must not pass merely because there is nothing to iterate);
    a reference that does not exist in this case fails.
    """
    refs = [str(e) for e in (evidence_ids or [])]
    if not refs:
        return PolicyCheck(False, "no_evidence",
                           "action cites no supporting evidence", ["POL-14"])
    missing = [r for r in refs if not exists(case_id, r)]
    if missing:
        return PolicyCheck(False, "evidence_missing",
                           f"evidence reference(s) not found in this case: {', '.join(missing)}",
                           ["POL-14"])
    return PolicyCheck(True, "evidence_ok", f"{len(refs)} evidence reference(s) present",
                       ["POL-14"])


def preservation_satisfied(
    tool: str, target_id: str, action_results: Iterable[dict[str, Any]]
) -> PolicyCheck:
    """POL-01: ``reimage_host`` requires a prior effective ``preserve_evidence``
    on the same target.

    'Effective' uses the simulator's real outcome model: a stored
    ``preserve_evidence`` result for the target with ``execution_status ==
    completed`` AND ``validation_status == effective``. Execution and validation
    stay distinct. Non-reimage tools are unaffected.
    """
    if tool != "reimage_host":
        return PolicyCheck(True, "sequence_not_applicable", "", [])
    for r in action_results:
        if (
            r.get("tool_name") == "preserve_evidence"
            and r.get("target_id") == target_id
            and r.get("execution_status") == "completed"
            and r.get("validation_status") == "effective"
        ):
            return PolicyCheck(True, "preservation_ok",
                               "evidence preservation completed for this target", ["POL-01"])
    return PolicyCheck(False, "preservation_required",
                       "Evidence preservation must complete for this target before re-imaging.",
                       ["POL-01"])


# --------------------------------------------------------------------------
# entry points (thin; load guidance, delegate to pure helpers)
# --------------------------------------------------------------------------

def evaluate_approval(
    tool: str,
    target_id: str,
    acting_role: Optional[str],
    *,
    guidance: Optional[dict[str, Any]] = None,
) -> ApprovalPolicyResult:
    """Evaluate approver-role policy for an action at decision time.

    Fails closed when a tool has asset-specific approval rules but the target's
    asset type cannot be resolved (returns an explicit failure rather than
    silently choosing the least restrictive rule).
    """
    g = guidance if guidance is not None else load_guidance()
    checks: list[PolicyCheck] = []

    asset_type = asset_type_of(g, target_id)
    if tool_needs_asset_resolution(g, tool) and asset_type is None:
        checks.append(PolicyCheck(
            False, "asset_unresolved",
            f"target '{target_id}' is not in the asset inventory; cannot select the "
            "asset-specific approval policy (failing closed)",
            [r.get("rule_id") for r in rules_for_tool(g, tool) if r.get("type") == "approval"],
        ))
        return ApprovalPolicyResult(None, False, [], asset_type, checks)

    role, rule_ids = required_approver(g, tool, asset_type)
    ok = role_satisfies(acting_role, role)
    if role is None:
        checks.append(PolicyCheck(True, "no_approval_rule",
                                  f"no approval policy constrains '{tool}'", []))
    elif ok:
        checks.append(PolicyCheck(True, "role_ok",
                                  f"acting role '{acting_role}' satisfies required '{role}'",
                                  rule_ids))
    else:
        checks.append(PolicyCheck(False, "role_insufficient",
                                  f"required approver '{role}' but acting role is "
                                  f"'{acting_role or 'none'}'", rule_ids))
    return ApprovalPolicyResult(role, ok, rule_ids, asset_type, checks)
