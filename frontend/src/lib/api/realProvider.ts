/**
 * RealProvider — talks to the live FastAPI backend using ONLY endpoints that
 * currently exist. Unsupported operations return an explicit "unsupported"
 * outcome; it NEVER silently falls back to FixtureProvider. All DTOs are mapped
 * into stable view models before leaving this layer.
 *
 * Backend contract honoured here (merged BL-003):
 *   GET  /cases/{id}                         -> CaseDTO
 *   GET  /cases/{id}/evidence                -> EvidenceItemDTO[]
 *   GET  /cases/{id}/state                   -> IncidentStateDTO
 *   POST /cases/{id}/runs                    -> RunResponseDTO (full actions)
 *   GET  /cases/{id}/plans                   -> PlanDocDTO[] (action_ids only)
 *   GET  /cases/{id}/audit                   -> AuditEventDTO[]
 *   POST /cases/{id}/actions/{aid}/decision  -> DecisionResponseDTO (approve/reject)
 *   POST /cases/{id}/actions/{aid}/execute   -> ExecuteResponseDTO
 *   POST /cases/{id}/reports                 -> StructuredReportDTO
 *   GET  /cases/{id}/reports/{rid}           -> StructuredReportDTO
 * NOT available: global cases list, dashboard aggregates, plan-detail,
 *   run-status, request_more_investigation decision, /validate.
 */
import { apiGet, apiPost, apiPostForm, type ApiResult } from "./apiClient";
import {
  ok,
  type DataProvider,
  type Outcome,
  type PlanRef,
} from "./provider";
import {
  mapActionState,
  mapRisk,
  recoveryFromState,
  stageFromPlans,
  toEvidenceItemVM,
  toReportVM,
  toResponsePlanActionVM,
} from "../mapping";
import type {
  AuditEventDTO,
  CaseDTO,
  DecisionResponseDTO,
  EvidenceUploadResultDTO,
  EvidenceItemDTO,
  ExecuteResponseDTO,
  IncidentStateDTO,
  PlanDocDTO,
  RunResponseDTO,
  StructuredReportDTO,
} from "./dto";
import type {
  AgentPlanningVM,
  AnalysisVM,
  ApprovalItemVM,
  AttentionItem,
  AuditEventVM,
  AuditKind,
  CaseActivityVM,
  CaseFacts,
  CaseHeaderVM,
  DecisionKind,
  EvidenceItemVM,
  ExecutionResultVM,
  HumanDecisionsVM,
  PlanVM,
  RecentCaseRow,
  ReportVM,
  TimelineEventVM,
} from "../types";

/** Translate an apiClient result into a provider Outcome. */
function fromApi<T>(r: ApiResult<T>, source: "real"): Outcome<T> {
  switch (r.kind) {
    case "ok":
      return ok(r.data, source);
    case "http_error":
      return { kind: "http_error", status: r.status, detail: r.detail };
    case "not_implemented":
      return { kind: "not_implemented", detail: r.detail };
    case "network_error":
      return { kind: "network_error", detail: r.detail };
    case "offline":
      return { kind: "offline" };
  }
}

const UNSUPPORTED_DASHBOARD =
  "No global dashboard endpoint exists in the backend. Switch to fixture mode for the demo dashboard.";

export class RealProvider implements DataProvider {
  readonly mode = "api" as const;
  readonly synthetic = false;

  // ---- Dashboard: no global endpoints exist in API mode -------------------
  async getCaseActivity(): Promise<Outcome<CaseActivityVM>> {
    return { kind: "unsupported", reason: UNSUPPORTED_DASHBOARD };
  }
  async getAgentPlanning(): Promise<Outcome<AgentPlanningVM>> {
    return { kind: "unsupported", reason: UNSUPPORTED_DASHBOARD };
  }
  async getHumanDecisions(): Promise<Outcome<HumanDecisionsVM>> {
    return { kind: "unsupported", reason: UNSUPPORTED_DASHBOARD };
  }
  async getAttentionItems(): Promise<Outcome<AttentionItem[]>> {
    return { kind: "unsupported", reason: UNSUPPORTED_DASHBOARD };
  }
  async getRecentCases(): Promise<Outcome<RecentCaseRow[]>> {
    return {
      kind: "unsupported",
      reason: "No global GET /cases endpoint exists; recent cases are unavailable in API mode.",
    };
  }

  // ---- Case workspace -----------------------------------------------------
  private async loadState(caseId: string): Promise<IncidentStateDTO | null> {
    const r = await apiGet<IncidentStateDTO>(`/cases/${caseId}/state`);
    return r.kind === "ok" ? r.data : null;
  }
  private async loadPlans(caseId: string): Promise<PlanDocDTO[]> {
    const r = await apiGet<PlanDocDTO[]>(`/cases/${caseId}/plans`);
    return r.kind === "ok" ? r.data : [];
  }

  async getCaseHeader(caseId: string): Promise<Outcome<CaseHeaderVM>> {
    const caseR = await apiGet<CaseDTO>(`/cases/${caseId}`);
    if (caseR.kind !== "ok") return fromApi<CaseHeaderVM>(caseR as ApiResult<never>, "real");
    const state = await this.loadState(caseId);
    const plans = await this.loadPlans(caseId);
    const vm: CaseHeaderVM = {
      caseId: caseR.data.case_id,
      title: caseR.data.title,
      status: caseR.data.status,
      severity: null,
      stage: stageFromPlans(plans),
      recoveryStatus: recoveryFromState(state),
      updatedAt: caseR.data.updated_at,
      agentState: plans.length > 0 ? `Plan v${plans.length} ready` : null,
    };
    return ok(vm, "real");
  }

  async getCaseFacts(caseId: string): Promise<Outcome<CaseFacts>> {
    const caseR = await apiGet<CaseDTO>(`/cases/${caseId}`);
    if (caseR.kind !== "ok") return fromApi<CaseFacts>(caseR as ApiResult<never>, "real");
    const evR = await apiGet<EvidenceItemDTO[]>(`/cases/${caseId}/evidence`);
    const plans = await this.loadPlans(caseId);
    const state = await this.loadState(caseId);
    const hasEvidence = evR.kind === "ok" && evR.data.length > 0;
    const hasPlan = plans.length > 0;
    const actionAwaiting = hasPlan; // refined by approvals read elsewhere
    const facts: CaseFacts = {
      evidenceUploaded: hasEvidence,
      timelineReconstructed: !!state && state.timeline.length > 0,
      planningRunStarted: hasPlan,
      proposalExists: hasPlan,
      actionAwaitingDecision: actionAwaiting,
      reportEligible: hasPlan,
    };
    return ok(facts, "real");
  }

  async getEvidence(caseId: string): Promise<Outcome<EvidenceItemVM[]>> {
    const r = await apiGet<EvidenceItemDTO[]>(`/cases/${caseId}/evidence`);
    if (r.kind !== "ok") return fromApi<EvidenceItemVM[]>(r as ApiResult<never>, "real");
    return ok(r.data.map(toEvidenceItemVM), "real");
  }

  async getTimeline(caseId: string): Promise<Outcome<TimelineEventVM[]>> {
    const state = await apiGet<IncidentStateDTO>(`/cases/${caseId}/state`);
    if (state.kind !== "ok") return fromApi<TimelineEventVM[]>(state as ApiResult<never>, "real");
    const events: TimelineEventVM[] = state.data.timeline.map((t, i) => ({
      id: `TL-${i}`,
      time: t.timestamp ?? null,
      label: t.description,
      kind: "relevant",
      relationshipStatus: "observed",
      evidenceId: t.evidence_ids[0] ?? null,
    }));
    return ok(events, "real");
  }

  async getAnalysis(caseId: string): Promise<Outcome<AnalysisVM>> {
    const state = await apiGet<IncidentStateDTO>(`/cases/${caseId}/state`);
    if (state.kind !== "ok") return fromApi<AnalysisVM>(state as ApiResult<never>, "real");
    const s = state.data;
    const vm: AnalysisVM = {
      classification: s.findings[0]?.summary ?? null,
      confidence: { value: null, basis: `${s.findings.length} findings on record`, advisory: true },
      affectedEntities: s.entities.map((e) => ({ id: e.id, type: e.type, name: e.name })),
      attackTechniques: s.attack_mapping,
      missingEvidence: s.missing_evidence,
      hypotheses: s.hypotheses,
    };
    return ok(vm, "real");
  }

  async getPlans(caseId: string): Promise<Outcome<PlanVM[]>> {
    // GET /plans returns action_ids only; the just-run plan (POST /runs) is the
    // only source of full actions. Historical full plans need a plan-detail
    // endpoint that does not exist, so plan ACTIONS are unavailable here.
    const r = await apiGet<PlanDocDTO[]>(`/cases/${caseId}/plans`);
    if (r.kind !== "ok") return fromApi<PlanVM[]>(r as ApiResult<never>, "real");
    const vms: PlanVM[] = r.data.map((p, idx) => ({
      planId: p.plan_id,
      version: idx + 1,
      basedOnStateVersion: p.based_on_state_version,
      stage: p.stage,
      createdAt: p.created_at,
      missingEvidence: p.missing_evidence,
      actions: [], // historical action detail is not retrievable (no endpoint)
    }));
    return ok(vms, "real");
  }

  async getPlanRefs(caseId: string): Promise<Outcome<PlanRef[]>> {
    const r = await apiGet<PlanDocDTO[]>(`/cases/${caseId}/plans`);
    if (r.kind !== "ok") return fromApi<PlanRef[]>(r as ApiResult<never>, "real");
    return ok(
      r.data.map((p, idx) => ({ planId: p.plan_id, version: idx + 1, stage: p.stage, createdAt: p.created_at, actionCount: p.action_ids.length })),
      "real",
    );
  }

  async getPlanDetail(_caseId: string, _planId: string): Promise<Outcome<PlanVM>> {
    return {
      kind: "unsupported",
      reason: "The backend has no plan-detail endpoint; historical action detail cannot be reloaded in API mode.",
    };
  }

  async getApprovals(caseId: string): Promise<Outcome<ApprovalItemVM[]>> {
    // Approvals require full action detail. The only source of full actions is
    // the just-run POST /runs response; GET /plans gives action_ids only and
    // there is no stored-action read endpoint. So in API mode the approvals
    // queue derived purely from reads is unavailable; actions are surfaced from
    // a fresh run instead (handled by the workspace run flow).
    void caseId;
    return {
      kind: "unsupported",
      reason: "Full stored-action detail is only available from a planning run response; there is no stored-action read endpoint.",
    };
  }

  async getExecutionResults(_caseId: string): Promise<Outcome<ExecutionResultVM[]>> {
    return {
      kind: "unsupported",
      reason: "No endpoint lists execution results; they are returned inline from the execute call.",
    };
  }

  async getAudit(caseId: string): Promise<Outcome<AuditEventVM[]>> {
    const r = await apiGet<AuditEventDTO[]>(`/cases/${caseId}/audit`);
    if (r.kind !== "ok") return fromApi<AuditEventVM[]>(r as ApiResult<never>, "real");
    const vms: AuditEventVM[] = r.data.map((e, i) => ({
      eventId: e.event_id ?? `AE-${i}`,
      kind: (e.kind as AuditKind) ?? "other",
      caseId: e.case_id ?? caseId,
      summary: e.kind.replace(/_/g, " "),
      at: e.at ?? e.created_at ?? "",
    }));
    return ok(vms, "real");
  }

  async getReport(caseId: string): Promise<Outcome<ReportVM>> {
    // Reports are generated via POST; there is no "latest report" GET without an
    // id, so getReport generates a fresh structured report.
    return this.generateReport(caseId);
  }

  async generateReport(caseId: string): Promise<Outcome<ReportVM>> {
    const r = await apiPost<StructuredReportDTO>(`/cases/${caseId}/reports`);
    if (r.kind !== "ok") return fromApi<ReportVM>(r as ApiResult<never>, "real");
    return ok(toReportVM(r.data), "real");
  }

  // ---- Mutations ----------------------------------------------------------
  async submitDecision(
    caseId: string,
    actionId: string,
    decision: DecisionKind,
    analyst: string,
    reason: string,
  ): Promise<Outcome<{ state: string }>> {
    if (decision === "request_more_investigation") {
      return {
        kind: "unsupported",
        reason: "The backend decision endpoint supports approve/reject only.",
      };
    }
    const r = await apiPost<DecisionResponseDTO>(
      `/cases/${caseId}/actions/${actionId}/decision`,
      { decision, analyst, reason },
    );
    if (r.kind !== "ok") return fromApi<{ state: string }>(r as ApiResult<never>, "real");
    return ok({ state: mapActionState(r.data.action.status) }, "real");
  }

  async executeAction(caseId: string, actionId: string): Promise<Outcome<ExecutionResultVM>> {
    const r = await apiPost<ExecuteResponseDTO>(`/cases/${caseId}/actions/${actionId}/execute`);
    if (r.kind !== "ok") return fromApi<ExecutionResultVM>(r as ApiResult<never>, "real");
    const res = r.data.result;
    const vm: ExecutionResultVM = {
      executionId: res.execution_id,
      actionId: res.action_id,
      tool: res.tool_name,
      target: res.target_id,
      executionStatus: res.execution_status,
      validationStatus: res.validation_status,
      observedEffect: res.observed_effect,
      resultSource: res.result_source,
      createdAt: res.created_at,
    };
    return ok(vm, "real");
  }

  // ---- Create-case flow (real endpoints) ----
  async createCase(title: string, description: string): Promise<Outcome<{ caseId: string }>> {
    const r = await apiPost<CaseDTO>("/cases", { title, description });
    if (r.kind !== "ok") return fromApi<{ caseId: string }>(r as ApiResult<never>, "real");
    return ok({ caseId: r.data.case_id }, "real");
  }

  async uploadEvidence(caseId: string, file: File): Promise<Outcome<{ accepted: number }>> {
    const form = new FormData();
    form.append("file", file);
    const r = await apiPostForm<EvidenceUploadResultDTO>(`/cases/${caseId}/evidence`, form);
    if (r.kind !== "ok") return fromApi<{ accepted: number }>(r as ApiResult<never>, "real");
    return ok({ accepted: r.data.item_count }, "real");
  }

  async countEvidence(caseId: string): Promise<Outcome<{ count: number; sources: string[] }>> {
    const r = await apiGet<EvidenceItemDTO[]>(`/cases/${caseId}/evidence`);
    if (r.kind !== "ok") return fromApi<{ count: number; sources: string[] }>(r as ApiResult<never>, "real");
    const sources = Array.from(new Set(r.data.map((e) => e.source_file)));
    return ok({ count: r.data.length, sources }, "real");
  }

  async startRun(caseId: string): Promise<Outcome<{ planId: string }>> {
    const r = await apiPost<RunResponseDTO>(`/cases/${caseId}/runs`);
    if (r.kind !== "ok") return fromApi<{ planId: string }>(r as ApiResult<never>, "real");
    return ok({ planId: r.data.plan_id }, "real");
  }
}

/** Build full response-plan action VMs from a just-run plan (API mode helper). */
export function planFromRunResponse(
  run: RunResponseDTO,
  ordinal: number,
  state: IncidentStateDTO | null,
): PlanVM {
  return {
    planId: run.plan_id,
    version: ordinal,
    basedOnStateVersion: run.based_on_state_version,
    stage: run.stage,
    createdAt: run.created_at,
    missingEvidence: run.missing_evidence,
    actions: run.actions.map((a) => toResponsePlanActionVM(a, run.stage, state)),
  };
}

// re-export helpers used by callers
export { mapRisk };