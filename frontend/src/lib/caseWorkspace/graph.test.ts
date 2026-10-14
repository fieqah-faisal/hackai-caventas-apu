import { describe, expect, it } from "vitest";
import { compareStates, graphLayout } from "./graph";
import { analysisFromRecords, isStale, toSnapshot, toStateMeta } from "../mapping/incidentState";
import type { IncidentStateDTO, PlanDocDTO } from "../api/dto";

const state: IncidentStateDTO = {
  case_id: "CASE-SYNTH", version: 1, parent_version: null, created_from: "evidence_upload",
  change_reason: "first batch", created_at: "2026-10-14T00:00:00Z",
  entities: [{ id: "SESSION::demo::s1", type: "session", name: "s1", attributes: { confirmed: true },
    evidence_ids: ["EV-1"], first_seen: "2026-10-14T00:00:00Z", last_seen: null, condition: null }],
  relationships: [{ id: "REL-1", source: "SESSION::demo::s1", relation: "session_used_by", target: "ACCOUNT::demo",
    evidence_ids: ["EV-1"], status: "inferred", category: "attack", action_id: null, execution_id: null, attributes: { basis: "synthetic" } }],
  timeline: [], findings: [{ summary: "Stored finding", evidence_ids: ["EV-1"] }], attack_mapping: ["T1550.004"],
  hypotheses: [], missing_evidence: [], actions: [], action_results: [], recovery_status: "investigating",
};

describe("GAS-lite frontend mapping and pure graph helpers", () => {
  it("maps complete snapshot, session, inferred attack provenance and metadata", () => {
    const s = toSnapshot(state);
    expect(s.entities[0]).toMatchObject({ type: "session", evidenceIds: ["EV-1"], attributes: { confirmed: true } });
    expect(s.relationships[0]).toMatchObject({ category: "attack", status: "inferred", evidenceIds: ["EV-1"], attributes: { basis: "synthetic" } });
    expect(toStateMeta({ version: 1, parent_version: null, created_from: "evidence_upload", change_reason: "first batch",
      created_at: state.created_at, entity_count: 1, relationship_count: 1, timeline_count: 0 })).toMatchObject({ version: 1, entityCount: 1 });
  });

  it("prefers persisted plan analysis and reports an honest absent-analysis fallback", () => {
    const base: PlanDocDTO = { plan_id: "P1", case_id: state.case_id, based_on_state_version: 1,
      stage: "containment", missing_evidence: [], action_ids: [], created_at: state.created_at };
    expect(analysisFromRecords(state, [{ ...base, analysis: { incident_type: "infostealer_session_hijack", severity: "high",
      scope: "one host", confidence: 0.8, findings: [{ summary: "Plan finding", evidence_ids: ["EV-1"], confidence: 0.8 }],
      attack_techniques: ["T1550.004"] } }]).classification).toBe("infostealer_session_hijack");
    const missing = analysisFromRecords(state, [base]);
    expect(missing.classification).toBe("Stored finding"); // state-only fallback, not a plan classification
    expect(missing.unavailableReason).toContain("Plan v1");
    expect(isStale(base.based_on_state_version, 2)).toBe(true);
  });

  it("compares immutable snapshots and lays out the same graph identically", () => {
    const v1 = toSnapshot(state);
    const v2 = toSnapshot({ ...state, version: 2, parent_version: 1,
      entities: [...state.entities, { id: "HOST::DEMO-LT", type: "host", name: "DEMO-LT", attributes: {}, evidence_ids: ["EV-2"], condition: "isolated" }],
      actions: ["ACT-1"], action_results: ["EXEC-1"] });
    const first = JSON.stringify(v1);
    expect(compareStates(v1, v2)).toMatchObject({ addedEntities: ["HOST::DEMO-LT"], addedEvidence: ["EV-2"],
      addedActions: ["ACT-1"], addedResults: ["EXEC-1"] });
    expect(JSON.stringify(v1)).toBe(first);
    const layout = graphLayout(v2.entities, v2.relationships);
    expect(layout).toEqual(graphLayout([...v2.entities].reverse(), [...v2.relationships].reverse()));
    const source = layout.nodes.find((node) => node.id === "SESSION::demo::s1")!;
    const target = layout.nodes.find((node) => node.id === "ACCOUNT::demo")!;
    expect(source.position.x).toBeLessThan(target.position.x);
    expect(layout.edges[0]).toMatchObject({ source: source.id, target: target.id });
  });
});
