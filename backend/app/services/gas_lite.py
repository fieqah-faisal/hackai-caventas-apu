"""GAS-lite pure graph-building service (BL-024, DEC-010).

Deterministic, side-effect-free functions that turn already-fetched records
(evidence items, actions, action results) into the entity/relationship graph
of an incident-state snapshot. This module performs NO Firestore I/O and makes
NO LLM calls: ``state_manager`` owns all persistence and passes records in.
Because the graph is built here by code rather than by a model, the LLM cannot
invent persistent graph relationships (requirement R6.6).

Everything is deterministic: given the same stored inputs, ``build_snapshot``
produces byte-identical graph content (entities/relationships ordered by id,
timeline by timestamp) excluding the version/provenance/timestamp fields.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from app.schemas.incident_state import (
    Entity,
    EntityType,
    Relationship,
    RelationshipCategory,
    RelationshipStatus,
    RelationshipType,
    TimelineEvent,
)

# Explicit, allowlisted session fields. A SESSION entity is created ONLY from
# one of these when present; a session identifier is NEVER derived/fabricated.
_SESSION_FIELDS = ("session_id", "session_cookie_id")


# --------------------------------------------------------------------------
# Task 2.1 — deterministic, type-aware entity ids
# --------------------------------------------------------------------------

def _collapse_ws(value: Any) -> str:
    """Trim and collapse internal whitespace runs to a single space."""
    return " ".join(str(value).split())


def _normalize_part(entity_type: EntityType, part: Any) -> str:
    """Type-aware normalization of a single key part (DEC-010 R7.3)."""
    text = _collapse_ws(part)
    if text == "":
        return ""
    if entity_type is EntityType.HOST:
        return text.upper()
    if entity_type in (EntityType.ACCOUNT, EntityType.DOMAIN):
        return text.lower()
    if entity_type is EntityType.IP:
        # Core fixtures are plain IPv4 strings; canonical = trimmed as-is.
        # IPv6 would be lowercased/compressed here in a follow-on.
        return text
    if entity_type is EntityType.PROCESS:
        # PROCESS id key parts: <HOST-normalized>::<process-name lowercased>.
        return text.lower()
    if entity_type is EntityType.FILE:
        # Unify path separators and lowercase for a stable id.
        return text.replace("\\", "/").lower()
    if entity_type is EntityType.SESSION:
        return text
    return text


# Composite entity ids whose leading key part belongs to another entity type:
#   PROCESS::<HOST>::<process>, FILE::<HOST>::<path>, SESSION::<ACCOUNT>::<id>
# The prefix part is normalized with the prefix type's rules; the final part
# with the entity's own rules.
_PREFIX_TYPE: dict[EntityType, EntityType] = {
    EntityType.PROCESS: EntityType.HOST,
    EntityType.FILE: EntityType.HOST,
    EntityType.SESSION: EntityType.ACCOUNT,
}


def entity_id(entity_type: EntityType, *key_parts: Any) -> Optional[str]:
    """Build a deterministic ``TYPE::part[::part...]`` identifier.

    Normalization is type-aware. For composite ids (PROCESS/FILE/SESSION) the
    leading key part is normalized with the prefix type's rules (host/account)
    and the final part with the entity's own rules. Returns ``None`` when any
    required key part is empty after normalization, so the caller creates no
    partial/placeholder entity (R7.5).
    """
    parts = list(key_parts)
    if not parts:
        return None

    prefix_type = _PREFIX_TYPE.get(entity_type)
    normalized: list[str] = []
    for i, part in enumerate(parts):
        # Composite id: first part uses the prefix type, last part the own type.
        part_type = prefix_type if (prefix_type is not None and i == 0 and len(parts) > 1) else entity_type
        norm = _normalize_part(part_type, part)
        if norm == "":
            return None
        normalized.append(norm)
    return entity_type.name + "::" + "::".join(normalized)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _parse_time(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _fields_of(ev: dict[str, Any]) -> dict[str, Any]:
    return ev.get("fields", {}) or {}


def _event_type(ev: dict[str, Any]) -> str:
    return str(_fields_of(ev).get("event_type", ev.get("kind", "event")))


def _upsert_entity(
    entities: dict[str, Entity],
    ent_id: str,
    ent_type: EntityType,
    name: str,
    evidence_id: Optional[str],
    when: Optional[datetime],
) -> None:
    """Insert or merge an entity, unioning evidence and widening first/last seen."""
    existing = entities.get(ent_id)
    if existing is None:
        entities[ent_id] = Entity(
            id=ent_id,
            type=ent_type,
            name=name,
            evidence_ids=[evidence_id] if evidence_id else [],
            first_seen=when,
            last_seen=when,
        )
        return
    if evidence_id and evidence_id not in existing.evidence_ids:
        existing.evidence_ids.append(evidence_id)
    existing.first_seen = _min_time(existing.first_seen, when)
    existing.last_seen = _max_time(existing.last_seen, when)


def _cmp_key(dt: datetime) -> datetime:
    """Comparison key tolerant of naive timestamps (treated as UTC).

    Uploaded logs are untrusted and may mix naive and aware times; comparing
    them directly raises TypeError (PR #9 handles the same hazard in the
    timeline sort). We normalize only for comparison and return the original
    value, so stored first_seen/last_seen keep their source form.
    """
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _min_time(a: Optional[datetime], b: Optional[datetime]) -> Optional[datetime]:
    if a is None:
        return b
    if b is None:
        return a
    return a if _cmp_key(a) <= _cmp_key(b) else b


def _max_time(a: Optional[datetime], b: Optional[datetime]) -> Optional[datetime]:
    if a is None:
        return b
    if b is None:
        return a
    return a if _cmp_key(a) >= _cmp_key(b) else b


# --------------------------------------------------------------------------
# Task 2.2 — entity extraction (documented field->entity mapping)
# --------------------------------------------------------------------------

def extract_entities(evidence_items: Iterable[dict[str, Any]]) -> dict[str, Entity]:
    """Extract entities from normalized evidence per the documented mapping.

    Only mapped fields produce entities; arbitrary fields never do (R7.4).
    SESSION is produced ONLY from an explicit allowlisted session field
    (R6.8) — never derived.
    """
    entities: dict[str, Entity] = {}
    for ev in evidence_items:
        f = _fields_of(ev)
        ev_id = ev.get("evidence_id")
        when = _parse_time(ev.get("event_time"))
        etype = _event_type(ev)

        host = f.get("host")
        account = f.get("account")

        host_id = entity_id(EntityType.HOST, host) if host else None
        if host_id:
            _upsert_entity(entities, host_id, EntityType.HOST, str(host), ev_id, when)

        if account:
            acc_id = entity_id(EntityType.ACCOUNT, account)
            if acc_id:
                _upsert_entity(entities, acc_id, EntityType.ACCOUNT, str(account), ev_id, when)

        if etype == "process_start":
            process = f.get("process")
            if host and process:
                pid = entity_id(EntityType.PROCESS, host, process)
                if pid:
                    _upsert_entity(entities, pid, EntityType.PROCESS, str(process), ev_id, when)
            path = f.get("path")
            if host and path:
                fid = entity_id(EntityType.FILE, host, path)
                if fid:
                    _upsert_entity(entities, fid, EntityType.FILE, str(path), ev_id, when)

        if etype == "dns_query":
            query = f.get("query")
            if query:
                did = entity_id(EntityType.DOMAIN, query)
                if did:
                    _upsert_entity(entities, did, EntityType.DOMAIN, str(query), ev_id, when)
            source_ip = f.get("source_ip")
            if source_ip:
                iid = entity_id(EntityType.IP, source_ip)
                if iid:
                    _upsert_entity(entities, iid, EntityType.IP, str(source_ip), ev_id, when)

        if etype == "network_upload":
            dest_ip = f.get("destination_ip")
            if dest_ip:
                iid = entity_id(EntityType.IP, dest_ip)
                if iid:
                    _upsert_entity(entities, iid, EntityType.IP, str(dest_ip), ev_id, when)

        # SESSION only from an explicitly present allowlisted field.
        if account:
            for sf in _SESSION_FIELDS:
                sval = f.get(sf)
                if sval:
                    sid = entity_id(EntityType.SESSION, account, sval)
                    if sid:
                        _upsert_entity(entities, sid, EntityType.SESSION, str(sval), ev_id, when)
                    break

    return entities


# --------------------------------------------------------------------------
# Task 2.3 — relationship extraction (allowlisted context/attack)
# --------------------------------------------------------------------------

def _rel_id(relation: RelationshipType, source: str, target: str,
            execution_id: Optional[str] = None) -> str:
    base = f"REL::{relation.value}::{source}::{target}"
    return f"{base}::{execution_id}" if execution_id else base


def _add_rel(
    rels: dict[str, Relationship],
    relation: RelationshipType,
    source: str,
    target: str,
    category: RelationshipCategory,
    evidence_id: Optional[str],
    when: Optional[datetime],
) -> None:
    rid = _rel_id(relation, source, target)
    existing = rels.get(rid)
    if existing is None:
        rels[rid] = Relationship(
            id=rid,
            source=source,
            relation=relation,
            target=target,
            category=category,
            status=RelationshipStatus.OBSERVED,
            evidence_ids=[evidence_id] if evidence_id else [],
            first_seen=when,
            last_seen=when,
        )
        return
    if evidence_id and evidence_id not in existing.evidence_ids:
        existing.evidence_ids.append(evidence_id)
    existing.first_seen = _min_time(existing.first_seen, when)
    existing.last_seen = _max_time(existing.last_seen, when)


def extract_relationships(
    evidence_items: Iterable[dict[str, Any]],
    entities: dict[str, Entity],
) -> list[Relationship]:
    """Build allowlisted OBSERVED context relations supported by the fixtures.

    An edge is only emitted when both endpoints exist in ``entities`` (no
    dangling edges). Each relation is a ``RelationshipType`` member.
    """
    rels: dict[str, Relationship] = {}
    for ev in evidence_items:
        f = _fields_of(ev)
        ev_id = ev.get("evidence_id")
        when = _parse_time(ev.get("event_time"))
        etype = _event_type(ev)

        host = f.get("host")
        account = f.get("account")
        host_id = entity_id(EntityType.HOST, host) if host else None
        account_id = entity_id(EntityType.ACCOUNT, account) if account else None

        # account logged_into host
        if account_id and host_id and account_id in entities and host_id in entities:
            _add_rel(rels, RelationshipType.LOGGED_INTO, account_id, host_id,
                     RelationshipCategory.CONTEXT, ev_id, when)

        if etype == "dns_query":
            source_ip = f.get("source_ip")
            query = f.get("query")
            ip_id = entity_id(EntityType.IP, source_ip) if source_ip else None
            dom_id = entity_id(EntityType.DOMAIN, query) if query else None
            if ip_id and dom_id and ip_id in entities and dom_id in entities:
                _add_rel(rels, RelationshipType.RESOLVED_DOMAIN, ip_id, dom_id,
                         RelationshipCategory.CONTEXT, ev_id, when)

        if etype == "network_upload":
            dest_ip = f.get("destination_ip")
            ip_id = entity_id(EntityType.IP, dest_ip) if dest_ip else None
            if host_id and ip_id and host_id in entities and ip_id in entities:
                _add_rel(rels, RelationshipType.CONNECTED_TO, host_id, ip_id,
                         RelationshipCategory.CONTEXT, ev_id, when)

        if etype == "process_start":
            process = f.get("process")
            proc_id = entity_id(EntityType.PROCESS, host, process) if (host and process) else None
            if proc_id and host_id and proc_id in entities and host_id in entities:
                _add_rel(rels, RelationshipType.EXECUTED_ON, proc_id, host_id,
                         RelationshipCategory.CONTEXT, ev_id, when)

    return list(rels.values())


# --------------------------------------------------------------------------
# Task 2.4 — dedupe / merge (idempotent)
# --------------------------------------------------------------------------

def dedupe_and_merge(
    entities: dict[str, Entity],
    relationships: list[Relationship],
) -> tuple[dict[str, Entity], list[Relationship]]:
    """Merge relationships that share a deterministic id, unioning evidence and
    widening first/last seen. Entities are already keyed by id (merged on
    insert), so this mainly collapses relationships. Idempotent."""
    merged: dict[str, Relationship] = {}
    for rel in relationships:
        rid = rel.id or _rel_id(rel.relation, rel.source, rel.target, rel.execution_id)
        rel.id = rid
        existing = merged.get(rid)
        if existing is None:
            merged[rid] = rel
            continue
        for e in rel.evidence_ids:
            if e not in existing.evidence_ids:
                existing.evidence_ids.append(e)
        existing.first_seen = _min_time(existing.first_seen, rel.first_seen)
        existing.last_seen = _max_time(existing.last_seen, rel.last_seen)
    return entities, list(merged.values())


# --------------------------------------------------------------------------
# Task 2.5 — response edges (one per executed action)
# --------------------------------------------------------------------------

def build_response_edges(
    actions: Iterable[dict[str, Any]],
    action_results: Iterable[dict[str, Any]],
    entities: dict[str, Entity],
) -> list[Relationship]:
    """One ``action_attempted_on`` response edge per executed action result.

    The edge targets the action's target entity and carries ``action_id`` and
    ``execution_id``. A completed execution is NOT treated as effective here;
    condition changes happen only in ``apply_validated_effects``.
    """
    by_action: dict[str, dict[str, Any]] = {}
    for a in actions:
        aid = a.get("action_id")
        if aid:
            by_action[aid] = a

    edges: list[Relationship] = []
    for result in action_results:
        action_id = result.get("action_id")
        execution_id = result.get("execution_id")
        target = result.get("target_id")
        if not target:
            action = by_action.get(action_id, {})
            target = (action.get("proposal", {}) or {}).get("target_id")
        if not (action_id and execution_id and target):
            continue
        rid = _rel_id(RelationshipType.ACTION_ATTEMPTED_ON, str(action_id), str(target), str(execution_id))
        edges.append(
            Relationship(
                id=rid,
                source=str(action_id),
                relation=RelationshipType.ACTION_ATTEMPTED_ON,
                target=str(target),
                category=RelationshipCategory.RESPONSE,
                status=RelationshipStatus.OBSERVED,
                action_id=str(action_id),
                execution_id=str(execution_id),
                attributes={
                    "tool_name": result.get("tool_name"),
                    "execution_status": result.get("execution_status"),
                    "validation_status": result.get("validation_status"),
                    "result_source": result.get("result_source"),
                },
            )
        )
    return edges


# --------------------------------------------------------------------------
# Task 2.6 — validated-effect application (only effective mutates condition)
# --------------------------------------------------------------------------

# Minimal, documented tool -> target condition transition on EFFECTIVE result.
_EFFECTIVE_CONDITION: dict[str, str] = {
    "isolate_host": "isolated",
    "revoke_sessions": "contained",
    # preserve_evidence intentionally has no condition change.
}


def apply_validated_effects(
    entities: dict[str, Entity],
    action_results: Iterable[dict[str, Any]],
) -> dict[str, Entity]:
    """Apply ONLY validated-effective outcomes to the target entity's condition.

    A result whose ``validation_status`` is not exactly ``effective`` leaves all
    conditions unchanged. An effective result changes ONLY the target entity's
    ``condition`` (nothing else). (R12.2-R12.4)
    """
    for result in action_results:
        if str(result.get("validation_status")) != "effective":
            continue
        tool = str(result.get("tool_name", ""))
        target = result.get("target_id")
        if not target or target not in entities:
            continue
        new_condition = _EFFECTIVE_CONDITION.get(tool)
        if new_condition is not None:
            entities[target].condition = new_condition
    return entities


# --------------------------------------------------------------------------
# Task 2.7 — deterministic snapshot assembly (graph part)
# --------------------------------------------------------------------------

def build_graph(
    evidence_items: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    action_results: list[dict[str, Any]],
) -> tuple[list[Entity], list[Relationship], list[str]]:
    """Assemble the deterministic graph (entities, relationships, attack ids).

    Returns entities and relationships in STABLE id order so identical inputs
    yield byte-identical graph content. ``state_manager`` composes this with the
    timeline and provenance to form the full ``IncidentState``.
    """
    entities = extract_entities(evidence_items)
    relationships = extract_relationships(evidence_items, entities)
    entities, relationships = dedupe_and_merge(entities, relationships)

    relationships.extend(build_response_edges(actions, action_results, entities))
    entities = apply_validated_effects(entities, action_results)

    # MITRE ATT&CK technique ids from alert evidence (deduped, stable order).
    attack: list[str] = []
    for ev in evidence_items:
        technique = _fields_of(ev).get("technique")
        if technique and technique not in attack:
            attack.append(str(technique))

    ordered_entities = [entities[k] for k in sorted(entities.keys())]
    ordered_relationships = sorted(relationships, key=lambda r: r.id or "")
    return ordered_entities, ordered_relationships, sorted(attack)