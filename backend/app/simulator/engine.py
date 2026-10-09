"""Bounded action simulator engine (Aidan).

Pure and deterministic: ``simulate()`` takes one approved action, the
simulated time and the case's earlier action results, and returns what the
action did in the fictional environment (``environment.json``). It keeps no
state of its own: the history comes from the action results the backend
already stores in Firestore, so the simulator needs no database (DEC-006).

Statuses are reported per the security rules (``.kiro/steering/security.md``):
``execution_status`` says whether the action ran; ``validation_status`` says
whether it achieved its objective. They are deliberately separate.

    execution_status:  completed | partially_completed | failed | blocked | rejected
    validation_status: effective | ineffective | not_applicable

Nothing here touches a real system.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Optional

from app.simulator.catalog import CATALOG, SIMULATOR_VERSION

ORG_TZ = timezone(timedelta(hours=8))
STEP = timedelta(minutes=5)
PROFILES = ("demo", "clean")
ENVIRONMENT_PATH = Path(__file__).with_name("environment.json")

_TYPE_PREFIX = {"HOST": "host", "ACCOUNT": "account", "DOMAIN": "domain"}


@lru_cache
def load_environment(path: Optional[str] = None) -> dict[str, Any]:
    source = Path(path) if path else ENVIRONMENT_PATH
    with source.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_time(value: Any) -> Optional[datetime]:
    """Parse an ISO timestamp; naive times are assumed UTC, as in the backend."""
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value))
        except (TypeError, ValueError):
            return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def simulated_clock(
    evidence_times: Iterable[Any], prior_result_times: Iterable[Any]
) -> datetime:
    """The simulated time at which the next approved action runs.

    The analyst acts after the latest evidence they have seen; each action
    then takes ``STEP`` (5 minutes). With no timestamps at all, use now.
    """
    times = [
        t
        for t in (parse_time(v) for v in [*evidence_times, *prior_result_times])
        if t is not None
    ]
    if not times:
        return datetime.now(ORG_TZ).replace(microsecond=0)
    return (max(times) + STEP).astimezone(ORG_TZ)


def split_target(target_id: str) -> Optional[tuple[str, str]]:
    """``HOST::SALES-LT-07`` -> ``("host", "SALES-LT-07")``."""
    prefix, sep, name = str(target_id).partition("::")
    if not sep or not name or prefix not in _TYPE_PREFIX:
        return None
    return _TYPE_PREFIX[prefix], name


def _digest(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


class _Run:
    """Context for one simulated action."""

    def __init__(
        self,
        tool: str,
        target_id: str,
        simulated_at: datetime,
        history: list[dict[str, Any]],
        environment: dict[str, Any],
        profile: str,
    ) -> None:
        self.tool = tool
        self.target_id = target_id
        self.at = simulated_at
        self.history = history
        self.env = environment
        self.profile = profile

    def result(
        self,
        execution_status: str,
        validation_status: str,
        observed_effect: str,
        *,
        services: Optional[dict[str, str]] = None,
        side_effects: Optional[list[str]] = None,
        policy_refs: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        return {
            "tool_name": self.tool,
            "target_id": self.target_id,
            "execution_status": execution_status,
            "validation_status": validation_status,
            "observed_effect": observed_effect,
            "simulated_at": self.at.isoformat(),
            "services": services or {},
            "side_effects": side_effects or [],
            "policy_refs": policy_refs
            if policy_refs is not None
            else list(CATALOG.get(self.tool, {}).get("policy_refs", [])),
            "simulator_version": SIMULATOR_VERSION,
            "simulator_profile": self.profile,
            "result_source": "simulator",
        }

    def earlier(self, tool: str, target_id: Optional[str] = None) -> Optional[datetime]:
        """Earliest simulated time ``tool`` was effective on the target."""
        target = target_id or self.target_id
        times = [
            parse_time(r.get("simulated_at"))
            for r in self.history
            if r.get("tool_name") == tool
            and r.get("target_id") == target
            and r.get("validation_status") == "effective"
        ]
        times = [t for t in times if t is not None and t <= self.at]
        return min(times) if times else None

    def fault(self, service: str) -> Optional[str]:
        for fault in self.env.get("faults", []):
            until = parse_time(fault.get("until"))
            if (
                fault.get("profile") == self.profile
                and fault.get("tool") == self.tool
                and fault.get("service") == service
                and until is not None
                and self.at < until
            ):
                return str(fault.get("error", "service unavailable"))
        return None


def _hhmm(moment: datetime) -> str:
    return moment.astimezone(ORG_TZ).strftime("%Y-%m-%d %H:%M")


# --- host actions ---------------------------------------------------------

def _isolate_host(run: _Run, name: str, host: dict[str, Any]) -> dict[str, Any]:
    since = run.earlier("isolate_host")
    if since is not None:
        return run.result(
            "completed", "effective", f"{name} has been isolated since {_hhmm(since)}; no change."
        )
    impact = host.get("isolation_impact") or (
        f"{host.get('owner', 'The user')} cannot use {name} until isolation is lifted."
    )
    return run.result(
        "completed",
        "effective",
        f"{name} network-contained by the EDR; only the EDR management channel remains.",
        side_effects=[impact],
    )


def _preserve_evidence(run: _Run, name: str, host: dict[str, Any]) -> dict[str, Any]:
    reimaged = run.earlier("reimage_host")
    if reimaged is not None:
        return run.result(
            "failed",
            "ineffective",
            f"Evidence on {name} is gone: the host was re-imaged at {_hhmm(reimaged)}.",
        )
    seed = f"{name}|{run.at.isoformat()}"
    memory, disk = _digest(seed, "memory"), _digest(seed, "disk")
    return run.result(
        "completed",
        "effective",
        f"Memory image (sha256 {memory[:16]}...) and disk image (sha256 {disk[:16]}...) "
        f"of {name} captured; chain of custody recorded.",
    )


def _reimage_host(run: _Run, name: str, host: dict[str, Any]) -> dict[str, Any]:
    if run.earlier("preserve_evidence") is None:
        return run.result(
            "blocked",
            "not_applicable",
            f"Blocked by POL-01: preserve evidence on {name} before re-imaging. Nothing was changed.",
        )
    return run.result(
        "completed",
        "effective",
        f"{name} rebuilt from the gold image; malicious files and persistence removed. "
        "Stolen passwords and session tokens are not affected by a re-image.",
        side_effects=[f"{host.get('owner', 'The user')} is without {name} for about 2 hours."],
    )


# --- account actions ------------------------------------------------------

def _revoke_sessions(run: _Run, name: str, account: dict[str, Any]) -> dict[str, Any]:
    services: dict[str, str] = {}
    errors: dict[str, str] = {}
    for service in account.get("services", []):
        error = run.fault(service)
        services[service] = "failed" if error else "succeeded"
        if error:
            errors[service] = error
    ok = [s for s, status in services.items() if status == "succeeded"]
    if not errors:
        return run.result(
            "completed",
            "effective",
            f"Active sessions for {name} revoked in: {', '.join(ok)}.",
            services=services,
        )
    failed = "; ".join(f"{s} ({e})" for s, e in errors.items())
    effect = (
        f"Sessions for {name} revoked in: {', '.join(ok)}. FAILED in {failed}. "
        f"Sessions in {', '.join(errors)} remain valid."
        if ok
        else f"No sessions revoked for {name}. FAILED in {failed}."
    )
    return run.result(
        "partially_completed" if ok else "failed", "ineffective", effect, services=services
    )


def _reset_password(run: _Run, name: str, account: dict[str, Any]) -> dict[str, Any]:
    if "idp" not in account.get("services", []):
        service = (account.get("services") or ["local"])[0]
        return run.result(
            "completed",
            "effective",
            f"Credential for service account {name} rotated in the {service} credential store.",
            services={service: "succeeded"},
            side_effects=[account["reset_impact"]] if account.get("reset_impact") else [],
        )
    return run.result(
        "completed",
        "effective",
        f"Password for {name} reset at the identity provider (user-assisted). "
        "Existing sessions stay valid until revoked.",
        services={"idp": "succeeded"},
    )


def _disable_account(run: _Run, name: str, account: dict[str, Any]) -> dict[str, Any]:
    since = run.earlier("disable_account")
    if since is not None:
        return run.result(
            "completed", "effective", f"{name} has been disabled since {_hhmm(since)}; no change."
        )
    if account.get("kind") == "service":
        return run.result(
            "completed",
            "effective",
            f"Service account {name} disabled.",
            services={s: "succeeded" for s in account.get("services", [])},
            side_effects=[f"Jobs that run as {name} stop until it is re-enabled."],
        )
    return run.result(
        "completed",
        "effective",
        f"{name} disabled at the identity provider: new sign-ins are blocked. "
        "Existing application sessions stay valid until revoked.",
        services={"idp": "succeeded"},
        side_effects=[f"{name} cannot work until the account is re-enabled."],
    )


def _remove_mail_forwarding_rule(
    run: _Run, name: str, account: dict[str, Any]
) -> dict[str, Any]:
    if "mail" not in account.get("services", []):
        return run.result("failed", "not_applicable", f"{name} has no mailbox.")
    if run.earlier("remove_mail_forwarding_rule") is not None:
        rules: list[dict[str, Any]] = []
    else:
        rules = [
            rule
            for rule in run.env.get("mailbox_rules", {}).get(name, [])
            if (parse_time(rule.get("created_at")) or run.at) <= run.at
        ]
    if not rules:
        return run.result(
            "completed",
            "not_applicable",
            f"No forwarding or hiding inbox rules found on {name}'s mailbox.",
            services={"mail": "succeeded"},
        )
    removed = "; ".join(f"'{r['rule_name']}' ({r['action']})" for r in rules)
    return run.result(
        "completed",
        "effective",
        f"Removed inbox rule(s) from {name}'s mailbox: {removed}.",
        services={"mail": "succeeded"},
    )


def _warn_staff(run: _Run, name: str, account: dict[str, Any]) -> dict[str, Any]:
    return run.result(
        "completed",
        "effective",
        f"Security advisory sent to {name} and the {account.get('department', 'their')} team.",
    )


# --- domain actions -------------------------------------------------------

def _block_domain(run: _Run, name: str, domain: dict[str, Any]) -> dict[str, Any]:
    since = run.earlier("block_domain")
    if since is not None:
        return run.result(
            "completed", "effective", f"{name} has been blocked since {_hhmm(since)}; no change."
        )
    side = (
        [f"{name} is used by an approved business service; blocking it disrupts that service."]
        if domain.get("business_use")
        else []
    )
    return run.result(
        "completed",
        "effective",
        f"{name} sinkholed at the DNS resolver and blocked at the web proxy.",
        side_effects=side,
    )


_HANDLERS = {
    "isolate_host": _isolate_host,
    "preserve_evidence": _preserve_evidence,
    "reimage_host": _reimage_host,
    "revoke_sessions": _revoke_sessions,
    "reset_password": _reset_password,
    "disable_account": _disable_account,
    "remove_mail_forwarding_rule": _remove_mail_forwarding_rule,
    "warn_staff": _warn_staff,
    "block_domain": _block_domain,
}

_INVENTORY = {"host": "hosts", "account": "accounts", "domain": "domains"}


def simulate(
    tool_name: str,
    target_id: str,
    *,
    simulated_at: datetime,
    history: Iterable[dict[str, Any]] = (),
    environment: Optional[dict[str, Any]] = None,
    profile: str = "demo",
) -> dict[str, Any]:
    """Run one approved action against the simulated environment."""
    if profile not in PROFILES:
        raise ValueError(f"unknown simulator profile '{profile}'; use one of {PROFILES}")
    env = environment if environment is not None else load_environment()
    at = parse_time(simulated_at) or simulated_clock([], [])
    ordered = sorted(
        (dict(r) for r in history),
        key=lambda r: parse_time(r.get("simulated_at")) or at,
    )
    run = _Run(tool_name, target_id, at.astimezone(ORG_TZ), ordered, env, profile)

    if tool_name not in CATALOG:
        return run.result(
            "rejected",
            "not_applicable",
            f"'{tool_name}' is not in the approved simulator catalogue. Nothing was run.",
            policy_refs=[],
        )
    parsed = split_target(target_id)
    if parsed is None:
        return run.result(
            "rejected",
            "not_applicable",
            f"Malformed target '{target_id}'; expected HOST::, ACCOUNT:: or DOMAIN::<name>.",
        )
    kind, name = parsed
    expected = CATALOG[tool_name]["target_type"]
    if kind != expected:
        return run.result(
            "rejected",
            "not_applicable",
            f"{tool_name} needs a {expected} target, not a {kind}. Nothing was run.",
        )
    inventory = env.get(_INVENTORY[kind], {})
    if name not in inventory:
        if kind != "domain":
            return run.result(
                "failed",
                "not_applicable",
                f"{target_id} does not exist in the simulated environment.",
            )
        record: dict[str, Any] = {}
    else:
        record = inventory[name]
    return _HANDLERS[tool_name](run, name, record)
