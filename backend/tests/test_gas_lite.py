"""GAS-lite unit tests (BL-024, DEC-010).

Pure-function and schema tests for the GAS-lite incident-state foundation.
No Firestore and no FastAPI client are needed for this module; everything
here exercises deterministic schema/pure-service behaviour.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.incident_state import (
    CreatedFrom,
    Entity,
    EntityType,
    IncidentState,
    Relationship,
    RelationshipCategory,
    RelationshipStatus,
    RelationshipType,
    ResponseFocus,
    RoutingTransition,
)


# --- Task 1.3: backward-compatible schema load -----------------------------

def test_pre_slice_snapshot_loads_with_defaults():
    """A snapshot stored before GAS-lite (no new keys) still validates and the
    new fields take their defaults."""
    legacy = {
        "case_id": "CASE-LEGACY",
        "version": 1,
        "entities": [
            {"id": "HOST::SALES-LT-07", "type": "host", "name": "SALES-LT-07"}
        ],
        "relationships": [
            {
                "source": "ACCOUNT::farah",
                "relation": "logged_into",
                "target": "HOST::SALES-LT-07",
                "evidence_ids": ["EV-1"],
            }
        ],
        "timeline": [],
    }
    state = IncidentState(**legacy)

    # provenance + new blocks default to None/empty
    assert state.parent_version is None
    assert state.change_reason is None
    assert state.created_from is None
    assert state.recommended_response_focus is None
    assert state.routing_transition is None
    assert state.report_status is None
    assert state.report_sections_invalidated == []

    # legacy entity gets defaulted enrichment fields
    ent = state.entities[0]
    assert ent.evidence_ids == []
    assert ent.first_seen is None and ent.last_seen is None
    assert ent.condition is None

    # legacy relationship gets defaulted category/status and keeps its relation
    rel = state.relationships[0]
    assert rel.category is RelationshipCategory.CONTEXT
    assert rel.status is RelationshipStatus.OBSERVED
    assert rel.relation is RelationshipType.LOGGED_INTO
    assert rel.id is None


def test_out_of_enum_values_are_rejected():
    """created_from / recommended_response_focus / routing_transition reject
    out-of-set values at the schema layer."""
    base = {"case_id": "C", "version": 1}

    with pytest.raises(ValidationError):
        IncidentState(**base, created_from="not_a_trigger")

    with pytest.raises(ValidationError):
        IncidentState(**base, recommended_response_focus="not_a_focus")

    with pytest.raises(ValidationError):
        IncidentState(**base, routing_transition="re-enter")  # hyphen rejected


def test_relationship_type_allowlist_enforced():
    """Relationship.relation is a closed enum; an unsupported relation is
    rejected, while every allowlisted value is accepted."""
    with pytest.raises(ValidationError):
        Relationship(source="A", relation="befriended", target="B")

    # all 11 allowlisted members construct cleanly
    for member in RelationshipType:
        rel = Relationship(source="A", relation=member.value, target="B")
        assert rel.relation is member


def test_core_enum_values():
    """Pin the Core enum values that other layers depend on."""
    assert CreatedFrom.INITIAL_RECONSTRUCTION.value == "initial_reconstruction"
    assert CreatedFrom.EVIDENCE_UPLOAD.value == "evidence_upload"
    assert CreatedFrom.ACTION_RESULT.value == "action_result"
    assert RoutingTransition.RE_ENTER.value == "re_enter"
    assert EntityType.SESSION.value == "session"
    assert {f.value for f in ResponseFocus} == {
        "assessment", "preservation", "containment",
        "eradication", "hardening", "restoration",
    }

# ==========================================================================
# Task 2 — pure gas_lite service tests
# ==========================================================================

from app.services import gas_lite


def _ev(evidence_id, event_type, event_time=None, **fields):
    """Build an evidence item in the stored shape (fields + event_time)."""
    f = {"event_type": event_type, **fields}
    return {"evidence_id": evidence_id, "event_time": event_time, "fields": f}


# --- Task 2.1a: entity_id normalization + determinism ---------------------

def test_entity_id_type_aware_normalization():
    assert gas_lite.entity_id(EntityType.HOST, "sales-lt-07") == "HOST::SALES-LT-07"
    assert gas_lite.entity_id(EntityType.ACCOUNT, "Farah") == "ACCOUNT::farah"
    assert gas_lite.entity_id(EntityType.DOMAIN, "Example.Test") == "DOMAIN::example.test"
    assert gas_lite.entity_id(EntityType.IP, " 203.0.113.45 ") == "IP::203.0.113.45"
    assert gas_lite.entity_id(EntityType.PROCESS, "SALES-LT-07", "Installer.exe") == \
        "PROCESS::SALES-LT-07::installer.exe"
    assert gas_lite.entity_id(
        EntityType.FILE, "SALES-LT-07", r"C:\Users\farah\Downloads\installer.exe"
    ) == "FILE::SALES-LT-07::c:/users/farah/downloads/installer.exe"


def test_entity_id_is_deterministic():
    a = gas_lite.entity_id(EntityType.HOST, "SALES-LT-07")
    b = gas_lite.entity_id(EntityType.HOST, "sales-lt-07")
    assert a == b == "HOST::SALES-LT-07"


def test_entity_id_missing_key_returns_none():
    assert gas_lite.entity_id(EntityType.HOST, "") is None
    assert gas_lite.entity_id(EntityType.HOST, "   ") is None
    assert gas_lite.entity_id(EntityType.PROCESS, "HOST", "") is None


# --- Task 2.2a: entity extraction (obligations 1 & 2) ---------------------

def _smoke_like_evidence():
    return [
        _ev("EV-1", "dns_query", "2026-10-04T21:38:00+08:00",
            host="SALES-LT-07", account="farah",
            query="pdf-editor-free.example", source_ip="192.0.2.44"),
        _ev("EV-2", "process_start", "2026-10-04T21:40:00+08:00",
            host="SALES-LT-07", account="farah",
            process="installer.exe", path=r"C:\Users\farah\Downloads\installer.exe"),
        _ev("EV-3", "network_upload", "2026-10-04T21:42:30+08:00",
            host="SALES-LT-07", account="farah",
            destination_ip="203.0.113.45", bytes=2400000, technique="T1041"),
    ]


def test_extract_entities_host_and_account():
    ents = gas_lite.extract_entities(_smoke_like_evidence())
    assert "HOST::SALES-LT-07" in ents
    assert "ACCOUNT::farah" in ents
    assert ents["HOST::SALES-LT-07"].name == "SALES-LT-07"


def test_extract_entities_ip_domain_process_file():
    ents = gas_lite.extract_entities(_smoke_like_evidence())
    assert "DOMAIN::pdf-editor-free.example" in ents
    assert "IP::192.0.2.44" in ents
    assert "IP::203.0.113.45" in ents
    assert "PROCESS::SALES-LT-07::installer.exe" in ents
    assert "FILE::SALES-LT-07::c:/users/farah/downloads/installer.exe" in ents
    # provenance + timestamps populated
    host = ents["HOST::SALES-LT-07"]
    assert host.evidence_ids and host.first_seen is not None and host.last_seen is not None


def test_extract_entities_session_only_from_explicit_field():
    """planner_smoke has no session field; a dedicated synthetic record with an
    explicit session_id yields a SESSION entity. No session id is fabricated."""
    # no session field -> no SESSION entity
    assert not any(e.type is EntityType.SESSION
                   for e in gas_lite.extract_entities(_smoke_like_evidence()).values())
    # explicit session_id -> SESSION entity
    synthetic = [
        _ev("EV-S", "auth", "2026-10-05T09:00:00+08:00",
            account="farah", host="SALES-LT-07", session_id="sess-abc123")
    ]
    ents = gas_lite.extract_entities(synthetic)
    assert "SESSION::farah::sess-abc123" in ents
    assert ents["SESSION::farah::sess-abc123"].type is EntityType.SESSION


# --- Task 2.3a: relationship extraction (obligations 5 & 6) ---------------

def test_extract_relationships_observed_with_evidence():
    evid = _smoke_like_evidence()
    ents = gas_lite.extract_entities(evid)
    rels = gas_lite.extract_relationships(evid, ents)
    relations = {r.relation for r in rels}
    assert RelationshipType.LOGGED_INTO in relations
    assert RelationshipType.RESOLVED_DOMAIN in relations
    assert RelationshipType.CONNECTED_TO in relations
    assert RelationshipType.EXECUTED_ON in relations
    # obligation 5: every observed relationship carries >=1 evidence id
    for r in rels:
        assert r.status is RelationshipStatus.OBSERVED
        assert len(r.evidence_ids) >= 1
        assert r.id and r.id.startswith("REL::")


def test_relationships_observed_vs_inferred_distinguishable():
    # obligation 6: status field distinguishes observed from inferred
    evid = _smoke_like_evidence()
    ents = gas_lite.extract_entities(evid)
    rels = gas_lite.extract_relationships(evid, ents)
    assert all(r.status is RelationshipStatus.OBSERVED for r in rels)
    inferred = Relationship(source="A", relation="connected_to", target="B",
                            status=RelationshipStatus.INFERRED)
    assert inferred.status is RelationshipStatus.INFERRED


def test_no_dangling_edge_when_endpoint_missing():
    # network_upload with a destination_ip but no host -> no connected_to edge
    evid = [_ev("EV-X", "network_upload", "2026-10-04T21:42:30+08:00",
                account="farah", destination_ip="203.0.113.45")]
    ents = gas_lite.extract_entities(evid)
    rels = gas_lite.extract_relationships(evid, ents)
    assert not any(r.relation is RelationshipType.CONNECTED_TO for r in rels)


# --- Task 2.4a: dedup idempotence (obligation 4) --------------------------

def test_dedupe_idempotent_on_duplicate_evidence():
    one = _smoke_like_evidence()
    two = _smoke_like_evidence() + _smoke_like_evidence()  # same records twice
    e1, r1, _ = gas_lite.build_graph(one, [], [])
    e2, r2, _ = gas_lite.build_graph(two, [], [])
    assert len(e1) == len(e2)
    assert len(r1) == len(r2)
    # provenance merged, not duplicated
    for r in r2:
        assert len(r.evidence_ids) == len(set(r.evidence_ids))


# --- Task 2.5a: response edge (obligation 10) -----------------------------

def _executed(action_id="ACT-1", execution_id="EXEC-1", tool="isolate_host",
              target="HOST::SALES-LT-07", validation="ineffective"):
    action = {"action_id": action_id, "proposal": {"tool_name": tool, "target_id": target}}
    result = {
        "execution_id": execution_id, "action_id": action_id,
        "tool_name": tool, "target_id": target,
        "execution_status": "completed", "validation_status": validation,
        "result_source": "simulator",
    }
    return action, result


def test_build_response_edges_one_per_result():
    action, result = _executed()
    edges = gas_lite.build_response_edges([action], [result], {})
    assert len(edges) == 1
    e = edges[0]
    assert e.relation is RelationshipType.ACTION_ATTEMPTED_ON
    assert e.category is RelationshipCategory.RESPONSE
    assert e.action_id == "ACT-1" and e.execution_id == "EXEC-1"
    assert e.target == "HOST::SALES-LT-07"


# --- Task 2.6a: effect safety (obligations 11 & 12) -----------------------

def test_ineffective_result_does_not_change_condition():
    ents = {"HOST::SALES-LT-07": Entity(id="HOST::SALES-LT-07", type=EntityType.HOST,
                                        name="SALES-LT-07")}
    _, result = _executed(validation="ineffective")
    out = gas_lite.apply_validated_effects(ents, [result])
    assert out["HOST::SALES-LT-07"].condition is None


def test_effective_result_mutates_only_target_condition():
    ents = {
        "HOST::SALES-LT-07": Entity(id="HOST::SALES-LT-07", type=EntityType.HOST, name="SALES-LT-07"),
        "ACCOUNT::farah": Entity(id="ACCOUNT::farah", type=EntityType.ACCOUNT, name="farah"),
    }
    _, result = _executed(tool="isolate_host", target="HOST::SALES-LT-07", validation="effective")
    out = gas_lite.apply_validated_effects(ents, [result])
    assert out["HOST::SALES-LT-07"].condition == "isolated"
    assert out["ACCOUNT::farah"].condition is None  # only the target changed


def test_revoke_sessions_effective_sets_contained():
    ents = {"ACCOUNT::farah": Entity(id="ACCOUNT::farah", type=EntityType.ACCOUNT, name="farah")}
    _, result = _executed(tool="revoke_sessions", target="ACCOUNT::farah", validation="effective")
    out = gas_lite.apply_validated_effects(ents, [result])
    assert out["ACCOUNT::farah"].condition == "contained"


# --- Task 2.7a: deterministic / stable graph (obligation 3) ---------------

def test_build_graph_is_deterministic_and_ordered():
    evid = _smoke_like_evidence()
    e1, r1, a1 = gas_lite.build_graph(evid, [], [])
    e2, r2, a2 = gas_lite.build_graph(evid, [], [])
    assert [e.id for e in e1] == [e.id for e in e2]
    assert [r.id for r in r1] == [r.id for r in r2]
    assert a1 == a2 == ["T1041"]
    # entities and relationships are id-sorted
    assert [e.id for e in e1] == sorted(e.id for e in e1)
    assert [r.id for r in r1] == sorted(r.id for r in r1)

# ==========================================================================
# Task 3 — repository read: list_state_versions
# ==========================================================================

def test_list_state_versions_returns_stored_docs(fake_db):
    """list_state_versions streams stored version docs; empty when none."""
    from app.database import repositories

    assert repositories.list_state_versions("CASE-NONE") == []

    repositories.create_case("CASE-R3", {"case_id": "CASE-R3", "current_state_version": 0})
    repositories.add_state_version("CASE-R3", 1, {"case_id": "CASE-R3", "version": 1})
    repositories.add_state_version("CASE-R3", 2, {"case_id": "CASE-R3", "version": 2})

    versions = repositories.list_state_versions("CASE-R3")
    assert {v["version"] for v in versions} == {1, 2}
    # caller orders by version; the stored docs are retrievable and intact
    by_version = sorted(versions, key=lambda d: d["version"])
    assert [d["version"] for d in by_version] == [1, 2]