"""Synthetic incident package tests: fresh, synthetic, consistent, leak-free."""
from __future__ import annotations

import ipaddress
import json
import re
from pathlib import Path

import pytest

from app.simulator import engine
from scenarios import build_scenarios
from scenarios.conditions import evaluate, render_batch, serialise

ROOT = Path(build_scenarios.ROOT)
BACKEND = ROOT.parent
SCENARIOS = build_scenarios.all_scenarios()
DOC_NETS = [ipaddress.ip_network(n) for n in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")]
IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
DOMAIN_RE = re.compile(r"\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b", re.I)
FILE_SUFFIXES = {"exe", "zip", "csv", "json", "txt"}
# dotted user names, not domains
NAMES = {"soc.lead", "soc.analyst", "it.manager", "ravi.adm", "threat.intel", "hakim.backup"}


def _generated(root: Path) -> dict[str, str]:
    """Map each generated file to its newline-normalized text content.

    Compares text content, not raw bytes, so a checkout that materializes the
    committed files with CRLF line endings (Windows + core.autocrlf) is still
    considered current against the LF content the builder writes. All generated
    scenario files are text (.json/.csv/.md); a genuine content change still
    differs after normalization and fails the freshness check. See BL-031.
    """
    return {
        str(p.relative_to(root)): p.read_text(encoding="utf-8").replace("\r\n", "\n")
        for p in root.rglob("*")
        if p.is_file()
        and p.suffix != ".py"
        and "__pycache__" not in p.parts
        and p != root / "README.md"
    }


def _agent_text(scenario) -> str:
    texts = []
    for batch in scenario["batches"]:
        for item in batch["entries"]:
            texts.append(json.dumps(item["record"], ensure_ascii=False))
    texts.append(json.dumps(scenario["case"]))
    return "\n".join(texts)


def _all_records(scenario):
    return [item["record"] for batch in scenario["batches"] for item in batch["entries"]]


def test_generated_files_are_up_to_date(tmp_path):
    build_scenarios.build(tmp_path)
    assert _generated(tmp_path) == _generated(ROOT), (
        "scenario files are stale: run `python -m scenarios.build_scenarios` from backend/"
    )


def test_freshness_check_is_newline_insensitive_but_content_sensitive(tmp_path):
    """BL-031: the freshness check must ignore LF-vs-CRLF-only differences while
    still detecting a genuine content change."""
    build_scenarios.build(tmp_path)
    # Rewrite every generated file with CRLF line endings: equivalent content,
    # different bytes. This must still read as "up to date".
    for file in tmp_path.rglob("*"):
        if file.is_file() and file.suffix != ".py" and "__pycache__" not in file.parts \
                and file != tmp_path / "README.md":
            text = file.read_text(encoding="utf-8")
            file.write_bytes(text.replace("\n", "\r\n").encode("utf-8"))
    assert _generated(tmp_path) == _generated(ROOT), "CRLF-only difference must be treated as current"

    # A real content change must still be detected.
    victim = next(p for p in tmp_path.rglob("*.json") if p.is_file())
    victim.write_text(victim.read_text(encoding="utf-8") + "\nSTALE-MARKER\n", encoding="utf-8")
    assert _generated(tmp_path) != _generated(ROOT), "a genuine content change must fail the check"


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["scenario_id"])
def test_agent_visible_data_is_synthetic(scenario):
    text = _agent_text(scenario)
    for ip in IP_RE.findall(text):
        addr = ipaddress.ip_address(ip)
        assert any(addr in net for net in DOC_NETS), f"non-documentation IP {ip}"
    for domain in DOMAIN_RE.findall(text):
        tld = domain.rsplit(".", 1)[-1].lower()
        if tld in FILE_SUFFIXES or domain.lower() in NAMES:
            continue
        assert domain.lower().endswith(".example"), f"non-reserved domain {domain}"


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["scenario_id"])
def test_entities_exist_in_the_simulated_environment(scenario):
    env = engine.load_environment()
    for record in _all_records(scenario):
        if "host" in record:
            assert record["host"] in env["hosts"], record["record_id"]
        if "account" in record:
            assert record["account"] in env["accounts"], record["record_id"]
    for target in scenario["in_scope_targets"]:
        kind, name = engine.split_target(target)
        assert name in env[{"host": "hosts", "account": "accounts", "domain": "domains"}[kind]]


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["scenario_id"])
def test_ground_truth_references_real_records_and_valid_values(scenario):
    ids = [r["record_id"] for r in _all_records(scenario)]
    if scenario["scenario_id"] != "sc01_infostealer_messy":  # has deliberate duplicates
        assert len(ids) == len(set(ids)), "duplicate record ids"
    known = set(ids)
    stages = {"assessment", "preservation", "containment", "eradication", "hardening", "restoration"}
    tools = set(engine.CATALOG)
    for cp in scenario["checkpoints"]:
        for option in cp["stage"]:
            assert set(option["preferred"] + option["acceptable"]) <= stages
        for item in cp["required_actions"] + cp["recommended_actions"]:
            assert set(item["tools"]) <= tools
            assert set(item["key_records"]) <= known, item["id"]
        for item in cp["forbidden_actions"]:
            assert set(item["tools"]) <= tools | {"*"}
    for row in scenario["attack_mapping"]:
        assert re.fullmatch(r"T\d{4}(\.\d{3})?", row["technique_id"])
        assert row["status"] in {"expected", "acceptable", "unsupported", "false_positive"}
        assert set(row["record_ids"]) <= known


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["scenario_id"])
def test_every_condition_evaluates(scenario):
    for batch_no in range(1, len(scenario["batches"]) + 1):
        records, branch = render_batch(scenario, batch_no, [], set())
        assert records, f"batch {batch_no} renders no records with no actions taken"
        serialise(records, scenario["batches"][batch_no - 1]["format"])
    for cp in scenario["checkpoints"]:
        for group in ("required_actions", "recommended_actions", "forbidden_actions", "questions"):
            for item in cp[group]:
                evaluate(item.get("when"), [], set())


def test_no_action_branch_reveals_the_attack_and_containment_blocks_it():
    sc1 = SCENARIOS[0]
    idle, branch = render_batch(sc1, 2, [], set())
    assert branch == "replay_succeeded"
    assert "SC1-B2-13" in {r["record_id"] for r in idle}

    revoked = [{
        "tool_name": "revoke_sessions", "target_id": "ACCOUNT::farah",
        "simulated_at": "2026-10-05T09:05:00+08:00", "validation_status": "effective",
        "services": {"idp": "succeeded", "mail": "succeeded", "crm": "succeeded"},
    }]
    blocked, branch = render_batch(sc1, 2, revoked, set())
    ids = {r["record_id"] for r in blocked}
    assert branch == "replay_blocked"
    assert "SC1-B2-13" not in ids and {"SC1-B2-08", "SC1-B2-12"} <= ids


def test_agent_inputs_contain_no_answer_keys():
    banned = ["required_actions", "forbidden", "ground truth", "\"when\"", "checkpoint",
              "key_records", "in_scope", "attack_mapping"]
    for path in ROOT.glob("*/agent_inputs/**/*"):
        if path.is_file() and path.suffix in {".json", ".csv"}:
            text = path.read_text(encoding="utf-8").lower()
            for word in banned:
                assert word not in text, f"{word!r} leaked into {path}"


def test_backend_code_never_reads_evaluator_data():
    leak = re.compile(r"evaluator_only|^\s*(from|import)\s+(scenarios|evaluation)\b", re.M)
    for path in (BACKEND / "app").rglob("*.py"):
        assert not leak.search(path.read_text(encoding="utf-8")), path


@pytest.mark.parametrize(
    "path",
    sorted(p for p in ROOT.glob("*/agent_inputs/**/batch_*.*")),
    ids=lambda p: f"{p.parent.parent.name if p.parent.name == 'demo_path' else p.parent.parent.name}/{p.name}",
)
def test_every_batch_file_ingests(client, path):
    case_id = client.post("/cases", json={"title": "ingest check"}).json()["case_id"]
    resp = client.post(f"/cases/{case_id}/evidence", files={"file": (path.name, path.read_bytes())})
    assert resp.status_code == 200, resp.text
    assert resp.json()["item_count"] > 0
