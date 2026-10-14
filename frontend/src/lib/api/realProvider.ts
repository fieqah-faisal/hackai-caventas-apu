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
 *   GET  /cases/{id}/actions                 -> StoredActionDTO[] (approvals queue, BL-027)
 *   GET  /cases/{id}/action-results          -> ActionResultDTO[] (BL-027)
 *   GET  /cases/{id}/audit                   -> AuditEventDTO[]
 *   POST /cases/{id}/actions/{aid}/decision  -> DecisionResponseDTO (approve/reject)
 *   POST /cases/{id}/actions/{aid}/execute   -> ExecuteResponseDTO
 *   POST /cases/{id}/reports                 -> StructuredReportDTO (explicit action only)
 *   GET  /cases/{id}/reports/{rid}           -> StructuredReportDTO
 * NOT available: global cases list, dashboard aggregates, plan-detail,
 *   run-status, request_more_investigation decision, /validate, report list.
 */
import { apiGet, apiPost, apiPostForm, type ApiResult } from "./apiClient";
import {
  ok,
  type DataProvider,
  type Outcome,
  type PlanRef,
} from "./provider";
import {
  inApprovalQueue,
  mapActionState,
  mapRisk,
  recoveryFromState,
  sortEvidenceInUploadOrder,
  sortPlansOldestFirst,
  stageFromPlans,
  toApprovalItemVM,
  toAuditEventVM,
  toEvidenceItemVM,
  toExecutionResultVM,
  toReportVM,
  toResponsePlanActionVM,
} from "../mapping";
import type {
  ActionResultDTO,
  ApproverRoleDTO,
  AuditEventDTO,
  CaseDTO,
  DecisionRequestDTO,
  DecisionResponseDTO,
  EvidenceUploadResultDTO,
  EvidenceItemDTO,
  ExecuteResponseDTO,
  IncidentStateDTO,
  PlanDocDTO,
  RunResponseDTO,
  StoredActionDTO,
  StructuredReportDTO,
} from "./dto";
import type {
  AgentPlanningVM,
  AnalysisVM,
  ApprovalItemVM,
  AttentionItem,
  AuditEventVM,
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

export const PLAN_ACTIONS_UNAVAILABLE =
  "One or more stored action references could not be resolved by GET /actions.";

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
    return r.kind === "ok" ? sortPlansOldestFirst(r.data) : [];
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
    return ok(sortEvidenceInUploadOrder(r.data).map(toEvidenceItemVM), "real");
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
    const r = await apiGet<PlanDocDTO[]>(`/cases/${caseId}/plans`);
    if (r.kind !== "ok") return fromApi<PlanVM[]>(r as ApiResult<never>, "real");
    const actionsR = await apiGet<StoredActionDTO[]>(`/cases/${caseId}/actions`);
    if (actionsR.kind !== "ok") return fromApi<PlanVM[]>(actionsR as ApiResult<never>, "real");
    const state = await this.loadState(caseId);
    const actionsById = new Map(actionsR.data.map((action) => [action.action_id, action]));
    // Version numbers are ordinals by created_at (the backend list is unordered).
    // No replanExplanation: the backend records no reason for a re-plan.
    const vms: PlanVM[] = sortPlansOldestFirst(r.data).map((p, idx) => {
      const actions = p.action_ids.flatMap((id) => {
        const action = actionsById.get(id);
        return action ? [toResponsePlanActionVM(action, p.stage, state)] : [];
      });
      const unresolved = p.action_ids.length - actions.length;
      return {
        planId: p.plan_id,
        version: idx + 1,
        basedOnStateVersion: p.based_on_state_version,
        stage: p.stage,
        createdAt: p.created_at,
        missingEvidence: p.missing_evidence,
        actions,
        ...(unresolved > 0
          ? { actionsUnavailable: { count: unresolved, reason: PLAN_ACTIONS_UNAVAILABLE } }
          : {}),
      };
    });
    return ok(vms, "real");
  }

  async getPlanRefs(caseId: string): Promise<Outcome<PlanRef[]>> {
    const r = await apiGet<PlanDocDTO[]>(`/cases/${caseId}/plans`);
    if (r.kind !== "ok") return fromApi<PlanRef[]>(r as ApiResult<never>, "real");
    return ok(
      sortPlansOldestFirst(r.data).map((p, idx) => ({ planId: p.plan_id, version: idx + 1, stage: p.stage, createdAt: p.created_at, actionCount: p.action_ids.length })),
      "real",
    );
  }

  async getPlanDetail(caseId: string, planId: string): Promise<Outcome<PlanVM>> {
    const plans = await this.getPlans(caseId);
    if (plans.kind !== "ok") return plans;
    const plan = plans.value.data.find((item) => item.planId === planId);
    return plan
      ? ok(plan, "real")
      : { kind: "http_error", status: 404, detail: `plan not found: ${planId}` };
  }

  async getApprovals(caseId: string): Promise<Outcome<ApprovalItemVM[]>> {
    // Read-only: GET /actions (stored actions, oldest first) + the case (title,
    // current state version) + plans (actions carry no stage). Any failed read
    // is surfaced as-is; the queue is never partly guessed.
    const caseR = await apiGet<CaseDTO>(`/cases/${caseId}`);
    if (caseR.kind !== "ok") return fromApi<ApprovalItemVM[]>(caseR as ApiResult<never>, "real");
    const actionsR = await apiGet<StoredActionDTO[]>(`/cases/${caseId}/actions`);
    if (actionsR.kind !== "ok") return fromApi<ApprovalItemVM[]>(actionsR as ApiResult<never>, "real");
    const queued = actionsR.data.filter((a) => inApprovalQueue(a.status));
    if (queued.length === 0) return ok([], "real");
    const plansR = await apiGet<PlanDocDTO[]>(`/cases/${caseId}/plans`);
    if (plansR.kind !== "ok") return fromApi<ApprovalItemVM[]>(plansR as ApiResult<never>, "real");
    const stageByPlan = new Map(plansR.data.map((p) => [p.plan_id, p.stage]));
    const orphan = queued.find((a) => !stageByPlan.has(a.plan_id));
    if (orphan) {
      return {
        kind: "unsupported",
        reason: `Stored action ${orphan.action_id} references plan ${orphan.plan_id}, which GET /plans did not return; its stage is not guessed.`,
      };
    }
    const items = queued.map((a) =>
      toApprovalItemVM(a, {
        stage: stageByPlan.get(a.plan_id)!,
        caseTitle: caseR.data.title,
        currentStateVersion: caseR.data.current_state_version,
      }),
    );
    return ok(items, "real");
  }

  async getExecutionResults(caseId: string): Promise<Outcome<ExecutionResultVM[]>> {
    // Read-only list of recorded results, oldest first; never runs the simulator.
    const r = await apiGet<ActionResultDTO[]>(`/cases/${caseId}/action-results`);
    if (r.kind !== "ok") return fromApi<ExecutionResultVM[]>(r as ApiResult<never>, "real");
    return ok(r.data.map(toExecutionResultVM), "real");
  }

  async getAudit(caseId: string): Promise<Outcome<AuditEventVM[]>> {
    const r = await apiGet<AuditEventDTO[]>(`/cases/${caseId}/audit`);
    if (r.kind !== "ok") return fromApi<AuditEventVM[]>(r as ApiResult<never>, "real");
    // Backend order is kept: audit_service sorts by timestamp, oldest first.
    return ok(r.data.map((e) => toAuditEventVM(e, caseId)), "real");
  }

  /**
   * Reports generated in THIS page session, newest per case. Memory only
   * (never localStorage). The backend has no "list/latest report" endpoint,
   * so reports generated before a reload cannot be shown again.
   */
  private readonly sessionReports = new Map<string, ReportVM>();

  async getReport(caseId: string): Promise<Outcome<ReportVM | null>> {
    // Never POSTs: each POST /reports stores a new report version, renders a
    // PDF and writes a report_generated audit event.
    return ok(this.sessionReports.get(caseId) ?? null, "real");
  }

  async generateReport(caseId: string): Promise<Outcome<ReportVM>> {
    const r = await apiPost<StructuredReportDTO>(`/cases/${caseId}/reports`);
    if (r.kind !== "ok") return fromApi<ReportVM>(r as ApiResult<never>, "real");
    const vm = toReportVM(r.data);
    this.sessionReports.set(caseId, vm); // cached only after backend confirmation
    return ok(vm, "real");
  }

  // ---- Mutations ----------------------------------------------------------
  async submitDecision(
    caseId: string,
    actionId: string,
    decision: DecisionKind,
    analyst: string,
    reason: string,
    approverRole?: ApproverRoleDTO,
  ): Promise<Outcome<{ state: string }>> {
    if (decision === "request_more_investigation") {
      return {
        kind: "unsupported",
        reason: "The backend decision endpoint supports approve/reject only.",
      };
    }
    // Typed as the backend DecisionRequest so the compiler pins the enum.
    const body: DecisionRequestDTO = { decision, analyst, reason };
    if (approverRole) body.approver_role = approverRole;
    const r = await apiPost<DecisionResponseDTO>(
      `/cases/${caseId}/actions/${actionId}/decision`,
      body,
    );
    if (r.kind !== "ok") return fromApi<{ state: string }>(r as ApiResult<never>, "real");
    return ok({ state: mapActionState(r.data.action.status) }, "real");
  }

  async executeAction(caseId: string, actionId: string): Promise<Outcome<ExecutionResultVM>> {
    const r = await apiPost<ExecuteResponseDTO>(`/cases/${caseId}/actions/${actionId}/execute`);
    if (r.kind !== "ok") return fromApi<ExecutionResultVM>(r as ApiResult<never>, "real");
    return ok(toExecutionResultVM(r.data.result), "real");
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
