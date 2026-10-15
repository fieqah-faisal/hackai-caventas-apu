import type { AnalysisRunDTO, IncidentStateDTO, PlanDocDTO, StateVersionMetaDTO } from "../api/dto";
import type { AnalysisRunVM, AnalysisVM, IncidentSnapshotVM, StateVersionMetaVM } from "../types";
import { mapSeverity, sortPlansOldestFirst } from "./index";

export function toStateMeta(dto: StateVersionMetaDTO): StateVersionMetaVM {
  return {
    version: dto.version, parentVersion: dto.parent_version, createdFrom: dto.created_from,
    changeReason: dto.change_reason, createdAt: dto.created_at,
    entityCount: dto.entity_count, relationshipCount: dto.relationship_count,
    timelineCount: dto.timeline_count,
  };
}

export function toSnapshot(s: IncidentStateDTO): IncidentSnapshotVM {
  return {
    caseId: s.case_id, version: s.version, parentVersion: s.parent_version ?? null,
    changeReason: s.change_reason ?? null, createdFrom: s.created_from ?? null,
    createdAt: s.created_at,
    entities: s.entities.map((e) => ({ id: e.id, type: e.type, name: e.name,
      attributes: e.attributes, evidenceIds: e.evidence_ids ?? [], firstSeen: e.first_seen ?? null,
      lastSeen: e.last_seen ?? null, condition: e.condition ?? null })),
    relationships: s.relationships.map((r) => ({
      id: r.id ?? `REL::${r.relation}::${r.source}::${r.target}`,
      source: r.source, relation: r.relation, target: r.target,
      evidenceIds: r.evidence_ids, status: r.status, category: r.category ?? "context",
      firstSeen: r.first_seen ?? null, lastSeen: r.last_seen ?? null,
      attributes: r.attributes ?? {}, actionId: r.action_id ?? null, executionId: r.execution_id ?? null,
    })),
    timeline: s.timeline.map((t) => ({ timestamp: t.timestamp ?? null, description: t.description, evidenceIds: t.evidence_ids })),
    findings: s.findings.map((f) => ({ summary: f.summary, evidenceIds: f.evidence_ids })),
    attackMapping: s.attack_mapping, hypotheses: s.hypotheses, missingEvidence: s.missing_evidence,
    actions: s.actions, actionResults: s.action_results, recoveryStatus: s.recovery_status,
    observedResponseStatus: s.observed_response_status ?? null,
    recommendedResponseFocus: s.recommended_response_focus ?? null,
    responseObjective: s.response_objective ?? null, responsePrerequisites: s.response_prerequisites ?? [],
    routingRationale: s.routing_rationale ?? null, routingEvidenceIds: s.routing_evidence_ids ?? [],
    routingConfidence: s.routing_confidence ?? null, routingTransition: s.routing_transition ?? null,
    reportSectionsComplete: s.report_sections_complete ?? [], reportSectionsPending: s.report_sections_pending ?? [],
    reportSectionsInvalidated: s.report_sections_invalidated ?? [], latestReportId: s.latest_report_id ?? null,
    latestReportVersion: s.latest_report_version ?? null, reportStatus: s.report_status ?? null,
  };
}

export function isStale(planStateVersion: number, currentStateVersion: number): boolean {
  return planStateVersion < currentStateVersion;
}

export function analysisFromRecords(state: IncidentStateDTO, plans: PlanDocDTO[]): AnalysisVM {
  const ordered = sortPlansOldestFirst(plans);
  const latest = ordered[ordered.length - 1];
  const a = latest?.analysis;
  // When no plan analysis is persisted, fall back to a state-only
  // classification derived from the first stored finding summary (honest,
  // not a plan classification); the unavailableReason still flags the gap.
  const stateFallbackClassification = state.findings[0]?.summary?.trim() || null;
  return {
    classification: a?.incident_type || stateFallbackClassification,
    summary: a?.summary?.trim() || null,
    severity: mapSeverity(a?.severity), scope: a?.scope || null,
    confidence: { value: a ? a.confidence : null, basis: a ? "Model-reported by the stored planner; advisory and not a calibrated probability." : "No model-reported confidence is stored.", advisory: true },
    planner: latest?.planner
      ? { kind: latest.planner.kind, adapter: latest.planner.adapter, model: latest.planner.model ?? null }
      : { kind: "unknown", adapter: "Not recorded", model: null },
    findings: a ? a.findings.map((f) => ({ summary: f.summary, evidenceIds: f.evidence_ids, confidence: f.confidence }))
      : state.findings.map((f) => ({ summary: f.summary, evidenceIds: f.evidence_ids, confidence: null })),
    affectedEntities: state.entities.map((e) => ({ id: e.id, type: e.type, name: e.name })),
    attackTechniques: a?.attack_techniques ?? state.attack_mapping,
    missingEvidence: latest?.missing_evidence ?? state.missing_evidence,
    hypotheses: state.hypotheses,
    unavailableReason: latest && !a ? `Analysis unavailable for Plan v${ordered.length}. This stored plan does not contain a persisted analysis summary.` : null,
  };
}

export function toAnalysisRun(r: AnalysisRunDTO): AnalysisRunVM {
  return { runId: r.run_id, caseId: r.case_id, status: r.status, stage: r.stage,
    message: r.message, basedOnStateVersion: r.based_on_state_version,
    planId: r.plan_id, createdAt: r.created_at, updatedAt: r.updated_at,
    completedAt: r.completed_at, error: r.error };
}
