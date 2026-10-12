"""Approved simulator catalogue (Aidan): the only actions the simulator runs.

The tool names are the planner's vocabulary (``fixtures/guidance.json``
``approved_tools``), so a planner proposal, the backend allowlist check and
the simulator all agree on one list (BL-008). ``tests/test_simulator.py``
fails if the guidance allowlist and this catalogue drift apart.

Every tool takes a single incident-state entity id as its target
(``HOST::<name>``, ``ACCOUNT::<name>``, ``DOMAIN::<name>``). There are no
free-text, command or path parameters: nothing here can be turned into an
arbitrary command.
"""
from __future__ import annotations

from typing import Any

SIMULATOR_VERSION = "1.0"

CATALOG: dict[str, dict[str, Any]] = {
    "isolate_host": {
        "target_type": "host",
        "stage": "containment",
        "summary": "Network-contain a host through the EDR; only the EDR channel stays up.",
        "policy_refs": ["POL-04"],
    },
    "preserve_evidence": {
        "target_type": "host",
        "stage": "preservation",
        "summary": "Capture memory and disk images and record their SHA-256.",
        "policy_refs": ["POL-01"],
    },
    "reimage_host": {
        "target_type": "host",
        "stage": "eradication",
        "summary": "Rebuild the host from the gold image. Blocked until evidence is preserved.",
        "policy_refs": ["POL-01"],
        "requires": ["preserve_evidence"],
    },
    "revoke_sessions": {
        "target_type": "account",
        "stage": "containment",
        "summary": "Invalidate the account's active sessions in every connected service.",
        "policy_refs": [],
    },
    "reset_password": {
        "target_type": "account",
        "stage": "containment",
        "summary": "Force a password reset at the identity provider. Existing sessions survive.",
        "policy_refs": [],
    },
    "disable_account": {
        "target_type": "account",
        "stage": "containment",
        "summary": "Block new sign-ins at the identity provider. Needs IT manager approval.",
        "policy_refs": ["POL-02"],
    },
    "remove_mail_forwarding_rule": {
        "target_type": "account",
        "stage": "eradication",
        "summary": "Delete inbox rules on the account's mailbox that forward or hide mail.",
        "policy_refs": [],
    },
    "block_domain": {
        "target_type": "domain",
        "stage": "containment",
        "summary": "Block resolution of and traffic to a domain at the DNS resolver and proxy.",
        "policy_refs": [],
    },
    "warn_staff": {
        "target_type": "account",
        "stage": "hardening",
        "summary": "Send a security advisory to the account owner and their team.",
        "policy_refs": [],
    },
}


def tool_names() -> list[str]:
    return sorted(CATALOG)


def describe() -> list[dict[str, Any]]:
    """Agent-visible description of the catalogue (no simulator internals)."""
    return [{"tool_name": name, **CATALOG[name]} for name in tool_names()]
