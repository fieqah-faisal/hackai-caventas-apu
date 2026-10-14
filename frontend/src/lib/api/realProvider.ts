/**
 * RealProvider — talks to the live FastAPI backend using ONLY endpoints that
 * currently exist. Unsupported operations return an explicit "unsupported"
 * outcome; it NEVER silently falls back to FixtureProvider. All DTOs are mapped
 * into stable view models before leaving this layer.
 *
 * Backend contract honoured here (merged BL-003):
 *   GET  /cases                              -> CaseDTO[]
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
 *   GET  /cases/{id}/reports/latest          -> StructuredReportDTO
 *   GET  /cases/{id}/reports/{rid}/pdf       -> application/pdf
 * NOT available: run-status, request_more_investigation decision, /validate.
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
  CaseSummary,
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

export const PLAN_ACTIONS_UNAVAILABLE =
  "One or more stored action references could not be resolved by GET /actions.";

export class RealProvider implements DataProvider {
  readonly mode = "api" as const;
  readonly synthetic = false;

  private casesRead: Promise<ApiResult<CaseDTO[]>> | null = null;
  private readonly planReads = new Map<string, Promise<ApiResult<PlanDocDTO[]>>>();
  private readonly actionReads = new Map<string, Promise<ApiResult<StoredActionDTO[]>>>();

  private loadCases(): Promise<ApiResult<CaseDTO[]>> {
    if (!this.casesRead) {
      const read = apiGet<CaseDTO[]>("/cases");
      this.casesRead = read;
      void read.then((result) => {
        if (result.kind !== "ok" && this.casesRead === read) this.casesRead = null;
      });
    }
    return this.casesRead;
  }

  private readPlans(caseId: string): Promise<ApiResult<PlanDocDTO[]>> {
    let read = this.planReads.get(caseId);
    if (!read) {
      read = apiGet<PlanDocDTO[]>(`/cases/${caseId}/plans`);
      this.planReads.set(caseId, read);
      void read.then((result) => {
        if (result.kind !== "ok" && this.planReads.get(caseId) === read) this.planReads.delete(caseId);
      });
    }
    return read;
  }

  private readActions(caseId: string): Promise<ApiResult<StoredActionDTO[]>> {
    let read = this.actionReads.get(caseId);
    if (!read) {
      read = apiGet<StoredActionDTO[]>(`/cases/${caseId}/actions`);
      this.actionReads.set(caseId, read);
      void read.then((result) => {
        if (result.kind !== "ok" && this.actionReads.get(caseId) === read) this.actionReads.delete(caseId);
      });
    }
    return read;
  }

  private async plansByCase(cases: CaseDTO[]): Promise<Outcome<Map<string, PlanDocDTO[]>>> {
    const reads = await Promise.all(cases.map((item) => this.readPlans(item.case_id)));
    const failed = reads.find((read) => read.kind !== "ok");
    if (failed) return fromApi<Map<string, PlanDocDTO[]>>(failed as ApiResult<never>, "real");
    return ok(new Map(cases.map((item, index) => [item.case_id, sortPlansOldestFirst((reads[index] as { kind: "ok"; data: PlanDocDTO[] }).data)])), "real");
  }

  private async actionsByCase(cases: CaseDTO[]): Promise<Outcome<Map<string, StoredActionDTO[]>>> {
    const reads = await Promise.all(cases.map((item) => this.readActions(item.case_id)));
    const failed = reads.find((read) => read.kind !== "ok");
    if (failed) return fromApi<Map<string, StoredActionDTO[]>>(failed as ApiResult<never>, "real");
    return ok(new Map(cases.map((item, index) => [item.case_id, (reads[index] as { kind: "ok"; data: StoredActionDTO[] }).data])), "real");
  }

  // ---- Dashboard: derived from persisted case records ---------------------
  async getCaseActivity(): Promise<Outcome<CaseActivityVM>> {
    const result = await this.loadCases();
    if (result.kind !== "ok") return fromApi<CaseActivityVM>(result as ApiResult<never>, "real");
    const open = result.data.filter((item) => ["open", "investigating", "contained"].includes(item.status));
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      return date.toISOString().slice(0, 10);
    });
    return ok({
      openCases: open.length,
      attentionCases: open.filter((item) => item.status === "investigating").length,
      buckets: dates.map((date) => ({ date, count: result.data.filter((item) => item.updated_at.slice(0, 10) === date).length })),
    }, "real");
  }
  async getAgentPlanning(): Promise<Outcome<AgentPlanningVM>> {
    const result = await this.loadCases();
    if (result.kind !== "ok") return fromApi<AgentPlanningVM>(result as ApiResult<never>, "real");
    const plans = await this.plansByCase(result.data);
    if (plans.kind !== "ok") return plans;
    const latest = [...plans.value.data.values()].flatMap((items) => items.length ? [items[items.length - 1]] : []);
    return ok({
      activeRuns: null,
      blockedRuns: latest.filter((item) => item.missing_evidence.length > 0).length,
      runCountsSource: "real",
      stageDistribution: (["assessment", "preservation", "containment", "eradication", "hardening", "restoration"] as const)
        .map((stage) => ({ stage, count: latest.filter((item) => item.stage === stage).length })),
    }, "real");
  }
  async getHumanDecisions(): Promise<Outcome<HumanDecisionsVM>> {
    const result = await this.loadCases();
    if (result.kind !== "ok") return fromApi<HumanDecisionsVM>(result as ApiResult<never>, "real");
    const actions = await this.actionsByCase(result.data);
    if (actions.kind !== "ok") return actions;
    const queued = [...actions.value.data.values()].flat().filter((item) => inApprovalQueue(item.status));
    const oldest = queued.map((item) => Date.parse(item.created_at)).filter(Number.isFinite).sort((a, b) => a - b)[0];
    const ageMs = oldest == null ? 0 : Math.max(0, Date.now() - oldest);
    const oldestWaiting = oldest == null ? null : ageMs >= 86_400_000 ? `${Math.floor(ageMs / 86_400_000)}d` : ageMs >= 3_600_000 ? `${Math.floor(ageMs / 3_600_000)}h` : `${Math.floor(ageMs / 60_000)}m`;
    const risks = queued.map((item) => mapRisk(item.proposal.risk));
    return ok({
      awaitingApproval: queued.length,
      highImpactEscalations: risks.filter((risk) => risk === "high").length,
      oldestWaiting,
      riskDistribution: (["high", "moderate", "low"] as const).map((risk) => ({ risk, count: risks.filter((item) => item === risk).length })),
    }, "real");
  }
  async getAttentionItems(): Promise<Outcome<AttentionItem[]>> {
    const result = await this.loadCases();
    if (result.kind !== "ok") return fromApi<AttentionItem[]>(result as ApiResult<never>, "real");
    const [plans, actions] = await Promise.all([this.plansByCase(result.data), this.actionsByCase(result.data)]);
    if (plans.kind !== "ok") return plans;
    if (actions.kind !== "ok") return actions;
    const items = result.data.flatMap((item): AttentionItem[] => {
      const casePlans = plans.value.data.get(item.case_id) ?? [];
      const latest = casePlans[casePlans.length - 1];
      const waiting = (actions.value.data.get(item.case_id) ?? []).some((action) => inApprovalQueue(action.status));
      if (waiting) return [{ caseId: item.case_id, title: item.title, reason: "awaiting_decision", statusLabel: "Awaiting decision", updatedAt: item.updated_at }];
      if (latest?.missing_evidence.length) return [{ caseId: item.case_id, title: item.title, reason: "missing_evidence", statusLabel: "Evidence requested", updatedAt: item.updated_at }];
      if (!latest && !["closed", "recovered"].includes(item.status)) return [{ caseId: item.case_id, title: item.title, reason: "newly_ingested", statusLabel: "Planning not started", updatedAt: item.updated_at }];
      return [];
    });
    return ok(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), "real");
  }
  async getRecentCases(): Promise<Outcome<RecentCaseRow[]>> {
    const result = await this.getCases();
    if (result.kind !== "ok") return result;
    return ok(result.value.data.slice(0, 5).map((item) => ({
      caseId: item.caseId,
      title: item.title,
      classification: item.classification,
      stage: item.stage,
      status: item.status,
      updatedAt: item.updatedAt,
    })), "real");
  }

  async getCases(): Promise<Outcome<CaseSummary[]>> {
    const result = await this.loadCases();
    if (result.kind !== "ok") return fromApi<CaseSummary[]>(result as ApiResult<never>, "real");
    const plans = await this.plansByCase(result.data);
    if (plans.kind !== "ok") return plans;
    return ok(result.data.map((item) => ({
      caseId: item.case_id,
      title: item.title,
      status: item.status,
      stage: stageFromPlans(plans.value.data.get(item.case_id) ?? []),
      classification: null,
      severity: null,
      stateVersion: item.current_state_version,
      updatedAt: item.updated_at,
    })), "real");
  }

  // ---- Case workspace -----------------------------------------------------
  private async loadState(caseId: string): Promise<IncidentStateDTO | null> {
    const r = await apiGet<IncidentStateDTO>(`/cases/${caseId}/state`);
    return r.kind === "ok" ? r.data : null;
  }
  private async loadPlans(caseId: string): Promise<PlanDocDTO[]> {
    const r = await this.readPlans(caseId);
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

  async getReport(caseId: string): Promise<Outcome<ReportVM | null>> {
    const r = await apiGet<StructuredReportDTO>(`/cases/${caseId}/reports/latest`);
    if (r.kind === "http_error" && r.status === 404) return ok(null, "real");
    if (r.kind !== "ok") return fromApi<ReportVM | null>(r as ApiResult<never>, "real");
    return ok(toReportVM(r.data), "real");
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
    this.actionReads.delete(caseId);
    return ok({ state: mapActionState(r.data.action.status) }, "real");
  }

  async executeAction(caseId: string, actionId: string): Promise<Outcome<ExecutionResultVM>> {
    const r = await apiPost<ExecuteResponseDTO>(`/cases/${caseId}/actions/${actionId}/execute`);
    if (r.kind !== "ok") return fromApi<ExecutionResultVM>(r as ApiResult<never>, "real");
    this.actionReads.delete(caseId);
    return ok(toExecutionResultVM(r.data.result), "real");
  }

  // ---- Create-case flow (real endpoints) ----
  async createCase(title: string, description: string): Promise<Outcome<{ caseId: string }>> {
    const r = await apiPost<CaseDTO>("/cases", { title, description });
    if (r.kind !== "ok") return fromApi<{ caseId: string }>(r as ApiResult<never>, "real");
    this.casesRead = null;
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
    this.planReads.delete(caseId);
    this.actionReads.delete(caseId);
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
