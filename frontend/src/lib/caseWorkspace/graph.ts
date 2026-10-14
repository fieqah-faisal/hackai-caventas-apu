import type { IncidentEntityVM, IncidentRelationshipVM, IncidentSnapshotVM } from "../types";

export function graphLayout(entities: IncidentEntityVM[], relationships: IncidentRelationshipVM[]) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  // Response edges may reference an action ID that is not an IncidentState entity.
  const ids = [...new Set([
    ...entities.map((entity) => entity.id),
    ...relationships.flatMap((relationship) => [relationship.source, relationship.target]),
  ])].sort();
  const outgoing = new Map(ids.map((id) => [id, new Set<string>()]));
  const incoming = new Map(ids.map((id) => [id, new Set<string>()]));
  const indegree = new Map(ids.map((id) => [id, 0]));

  for (const relationship of [...relationships].sort((a, b) => a.id.localeCompare(b.id))) {
    if (relationship.source === relationship.target || outgoing.get(relationship.source)?.has(relationship.target)) continue;
    outgoing.get(relationship.source)?.add(relationship.target);
    incoming.get(relationship.target)?.add(relationship.source);
    indegree.set(relationship.target, (indegree.get(relationship.target) ?? 0) + 1);
  }

  const ranks = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indegree.get(id) === 0);
  const visited = new Set<string>();
  while (queue.length) {
    queue.sort((a, b) => a.localeCompare(b));
    const id = queue.shift()!;
    visited.add(id);
    for (const target of [...(outgoing.get(id) ?? [])].sort()) {
      ranks.set(target, Math.max(ranks.get(target) ?? 0, (ranks.get(id) ?? 0) + 1));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }

  // Cycles cannot be made wholly left-to-right. Keep each unresolved component
  // in one deterministic rank so its arrowheads, rather than reversed data,
  // communicate the loop direction.
  for (const id of ids.filter((candidate) => !visited.has(candidate))) {
    const resolvedParentRanks = [...(incoming.get(id) ?? [])]
      .filter((parent) => visited.has(parent))
      .map((parent) => ranks.get(parent) ?? 0);
    ranks.set(id, resolvedParentRanks.length ? Math.max(...resolvedParentRanks) + 1 : 0);
  }

  const columns = new Map<number, string[]>();
  for (const id of ids) {
    const rank = ranks.get(id) ?? 0;
    columns.set(rank, [...(columns.get(rank) ?? []), id]);
  }
  const maxColumnSize = Math.max(1, ...[...columns.values()].map((column) => column.length));
  const nodes = [...columns.entries()].sort(([a], [b]) => a - b).flatMap(([rank, column]) =>
    column.sort().map((id, index) => ({
      id,
      rank,
      position: { x: rank * 330, y: (maxColumnSize - column.length) * 70 + index * 140 },
      entity: entityById.get(id) ?? null,
    })));
  return { nodes, edges: [...relationships].sort((a, b) => a.id.localeCompare(b.id)) };
}

export function compareStates(parent: IncidentSnapshotVM, current: IncidentSnapshotVM) {
  const before = new Map(parent.entities.map((e) => [e.id, e]));
  const after = new Map(current.entities.map((e) => [e.id, e]));
  const oldEdges = new Set(parent.relationships.map((r) => r.id));
  const newEdges = new Set(current.relationships.map((r) => r.id));
  const oldEvidence = new Set([...parent.entities, ...parent.relationships].flatMap((v) => v.evidenceIds));
  return {
    addedEntities: [...after.keys()].filter((id) => !before.has(id)).sort(),
    removedEntities: [...before.keys()].filter((id) => !after.has(id)).sort(),
    changedConditions: [...after.values()].filter((e) => before.has(e.id) && before.get(e.id)?.condition !== e.condition)
      .map((e) => `${e.id}: ${before.get(e.id)?.condition ?? "unknown"} → ${e.condition ?? "unknown"}`).sort(),
    addedRelationships: [...newEdges].filter((id) => !oldEdges.has(id)).sort(),
    removedRelationships: [...oldEdges].filter((id) => !newEdges.has(id)).sort(),
    addedEvidence: [...new Set([...current.entities, ...current.relationships].flatMap((v) => v.evidenceIds))]
      .filter((id) => !oldEvidence.has(id)).sort(),
    addedActions: current.actions.filter((id) => !parent.actions.includes(id)).sort(),
    addedResults: current.actionResults.filter((id) => !parent.actionResults.includes(id)).sort(),
  };
}
