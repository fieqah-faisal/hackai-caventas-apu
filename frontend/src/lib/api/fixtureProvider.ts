/**
 * FixtureProvider — deterministic synthetic data implementing the COMPLETE
 * intended product contract (six-state lifecycle, request-more-investigation,
 * plan history, separate simulation and validation, structured report).
 *
 * Every surface backed by this provider is flagged "Synthetic demo data".
 * It never claims to have come from the real backend or modified real systems.
 */
import {
  DEMO_ORGANISATION,
  INFOSTEALER_REPLAN_EXPLANATION,
} from "../scenario/config";
import {
  cases as fxCases,
  INFOSTEALER_CASE_ID,
  NOW,
  infostealerAnalysisBatch1,
  infostealerAnalysisBatch2,
  infostealerEvidenceBatch1,
  infostealerEvidenceBatch2,
  infostealerPlanV1,
  infostealerPlanV1Actions,
  infostealerPlanV2,
  infostealerPlanV2Actions,
  infostealerTimelineBatch1,
  infostealerTimelineBatch2,
  type FxAction,
} from "../fixtures/infostealer";
import { STAGE_ORDER } from "../types";
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
  PlanActionState,
  PlanVM,
  RecentCaseRow,
  ReportVM,
  ResponsePlanActionVM,
  Risk,
  TimelineEventVM,
} from "../types";
import {
  ok,
  unsupported as _unsupported,
  type DataProvider,
  type Outcome,
  type PlanRef,
} from "./provider";

const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

/**
 * Mutable demo state for the Infostealer case so the workflow advances:
 * reveal batches, approve/reject/request actions, simulate, validate, replan.
 */
interface DemoState {
  revealedBatch: 1 | 2;
  actionState: Record<string, PlanActionState>;
  decisionNote: Record<string, { decision: DecisionKind; reason: string }>;
  results: ExecutionResultVM[];
  audit: AuditEventVM[];
}

const demo: DemoState = {
  revealedBatch: 1, // starts at batch 1 so the presenter can reveal batch 2 (v1 -> v2) live
  actionState: {},
  decisionNote: {},
  results: [],
  audit: [
    { eventId: "EV-A1", kind: "case_created", caseId: INFOSTEALER_CASE_ID, summary: "Case opened — Infostealer to session hijack", at: minsAgo(220) },
    { eventId: "EV-A2", kind: "evidence_ingested", caseId: INFOSTEALER_CASE_ID, summary: "4 endpoint/network records ingested (batch 1)", at: minsAgo(200) },
    { eventId: "EV-A3", kind: "plan_created", caseId: INFOSTEALER_CASE_ID, summary: "Plan v1 created (5 actions)", at: minsAgo(198) },
  ],
};

// initialise action states from fixtures
for (const a of [...infostealerPlanV1Actions, ...infostealerPlanV2Actions]) {
  if (!(a.actionId in demo.actionState)) demo.actionState[a.actionId] = a.state;
}

function fxActionToVM(a: FxAction): ResponsePlanActionVM {
  return {
    actionId: a.actionId,
    version: a.version,
    basedOnStateVersion: a.basedOnStateVersion,
    stage: a.stage,
    tool: a.tool,
    target: a.target,
    targetType: a.targetType,
    risk: a.risk,
    escalationRequired: a.escalationRequired,
    approvalRequired: true,
    state: demo.actionState[a.actionId] ?? a.state,
    rationale: a.rationale,
    policyRefs: a.policyRefs,
    evidenceIds: a.evidenceIds,
    expectedEffect: a.expectedEffect,
    validationChecks: a.validationChecks,
  };
}

function activeActions(): FxAction[] {
  // v2 supersedes v1 for the demo once batch 2 is revealed.
  return demo.revealedBatch === 2 ? infostealerPlanV2Actions : infostealerPlanV1Actions;
}

function findAction(actionId: string): FxAction | undefined {
  return [...infostealerPlanV2Actions, ...infostealerPlanV1Actions].find(
    (a) => a.actionId === actionId,
  );
}

export class FixtureProvider implements DataProvider {
  readonly mode = "fixture" as const;
  readonly synthetic = true;

  async getCaseActivity(): Promise<Outcome<CaseActivityVM>> {
    const open = fxCases.filter((c) => ["open", "investigating", "contained"].includes(c.status)).length;
    const attention = 3;
    const buckets = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(NOW.getTime() - (6 - i) * 86_400_000);
      const date = d.toISOString().slice(0, 10);
      const count = [1, 0, 2, 1, 3, 2, 4][i];
      return { date, count };
    });
    return ok({ openCases: open, attentionCases: attention, buckets }, "synthetic");
  }

  async getAgentPlanning(): Promise<Outcome<AgentPlanningVM>> {
    const dist = STAGE_ORDER.map((stage) => ({
      stage,
      count: stage === "containment" ? 2 : stage === "assessment" ? 1 : 0,
    }));
    return ok(
      { activeRuns: 1, blockedRuns: 0, runCountsSource: "synthetic", stageDistribution: dist },
      "synthetic",
    );
  }

  async getHumanDecisions(): Promise<Outcome<HumanDecisionsVM>> {
    const awaiting = activeActions().filter((a) => (demo.actionState[a.actionId] ?? a.state) === "proposed").length;
    const esc = activeActions().filter((a) => a.escalationRequired && (demo.actionState[a.actionId] ?? a.state) === "proposed").length;
    const riskDist: { risk: Risk; count: number }[] = (["high", "moderate", "low"] as Risk[]).map((risk) => ({
      risk,
      count: activeActions().filter((a) => a.risk === risk && (demo.actionState[a.actionId] ?? a.state) === "proposed").length,
    }));
    return ok(
      { awaitingApproval: awaiting, highImpactEscalations: esc, oldestWaiting: awaiting > 0 ? "1h" : null, riskDistribution: riskDist },
      "synthetic",
    );
  }

  async getAttentionItems(): Promise<Outcome<AttentionItem[]>> {
    const items: AttentionItem[] = [
      { caseId: INFOSTEALER_CASE_ID, title: fxCases[0].title, reason: "awaiting_decision", statusLabel: "Awaiting decision", updatedAt: minsAgo(3) },
      { caseId: "CASE-PHISH204", title: fxCases[1].title, reason: "replan_needed", statusLabel: "Replan needed", updatedAt: minsAgo(18) },
      { caseId: "CASE-BACKUP118", title: fxCases[2].title, reason: "missing_evidence", statusLabel: "Evidence requested", updatedAt: minsAgo(26) },
    ];
    return ok(items, "synthetic");
  }

  async getRecentCases(): Promise<Outcome<RecentCaseRow[]>> {
    const rows: RecentCaseRow[] = [...fxCases]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 5)
      .map((c) => ({
        caseId: c.caseId,
        title: c.title,
        classification: c.classification,
        stage: c.stage,
        status: c.status,
        updatedAt: c.updatedAt,
      }));
    return ok(rows, "synthetic");
  }

  async getCases(): Promise<Outcome<CaseSummary[]>> {
    return ok(
      [...fxCases]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((c) => ({
          caseId: c.caseId,
          title: c.title,
          status: c.status,
          stage: c.stage,
          classification: c.classification,
          severity: c.severity,
          stateVersion: c.stateVersion,
          updatedAt: c.updatedAt,
        })),
      "synthetic",
    );
  }

  private caseById(caseId: string) {
    return fxCases.find((c) => c.caseId === caseId);
  }

  async getCaseHeader(caseId: string): Promise<Outcome<CaseHeaderVM>> {
    const c = this.caseById(caseId);
    if (!c) return { kind: "http_error", status: 404, detail: `case not found: ${caseId}` };
    const agentState = caseId === INFOSTEALER_CASE_ID
      ? demo.revealedBatch === 2 ? "Plan v2 ready" : "Plan v1 ready"
      : null;
    return ok(
      {
        caseId: c.caseId,
        title: c.title,
        status: c.status,
        severity: c.severity,
        stage: c.stage,
        recoveryStatus: c.status === "investigating" ? "containing" : "investigating",
        updatedAt: c.updatedAt,
        agentState,
      },
      "synthetic",
    );
  }

  async getCaseFacts(caseId: string): Promise<Outcome<CaseFacts>> {
    if (caseId !== INFOSTEALER_CASE_ID) {
      return ok(
        { evidenceUploaded: true, timelineReconstructed: true, planningRunStarted: false, proposalExists: false, actionAwaitingDecision: false, reportEligible: false },
        "synthetic",
      );
    }
    return ok(
      { evidenceUploaded: true, timelineReconstructed: true, planningRunStarted: true, proposalExists: true, actionAwaitingDecision: true, reportEligible: true },
      "synthetic",
    );
  }

  async getEvidence(caseId: string): Promise<Outcome<EvidenceItemVM[]>> {
    if (caseId !== INFOSTEALER_CASE_ID) return ok([], "synthetic");
    const items = demo.revealedBatch === 2
      ? [...infostealerEvidenceBatch1, ...infostealerEvidenceBatch2]
      : infostealerEvidenceBatch1;
    return ok(items, "synthetic");
  }

  async getTimeline(caseId: string): Promise<Outcome<TimelineEventVM[]>> {
    if (caseId !== INFOSTEALER_CASE_ID) return ok([], "synthetic");
    const events = demo.revealedBatch === 2
      ? [...infostealerTimelineBatch1, ...infostealerTimelineBatch2]
      : infostealerTimelineBatch1;
    return ok(events, "synthetic");
  }

  async getAnalysis(caseId: string): Promise<Outcome<AnalysisVM>> {
    if (caseId !== INFOSTEALER_CASE_ID) {
      return ok(
        { classification: null, confidence: { value: null, basis: "No analysis yet", advisory: true }, affectedEntities: [], attackTechniques: [], missingEvidence: [], hypotheses: [] },
        "synthetic",
      );
    }
    return ok(demo.revealedBatch === 2 ? infostealerAnalysisBatch2 : infostealerAnalysisBatch1, "synthetic");
  }

  async getPlans(caseId: string): Promise<Outcome<PlanVM[]>> {
    if (caseId !== INFOSTEALER_CASE_ID) return ok([], "synthetic");
    const plans: PlanVM[] = [
      { planId: infostealerPlanV1.planId, version: 1, basedOnStateVersion: 1, stage: infostealerPlanV1.stage, createdAt: infostealerPlanV1.createdAt, missingEvidence: infostealerPlanV1.missingEvidence, actions: infostealerPlanV1Actions.map(fxActionToVM) },
    ];
    if (demo.revealedBatch === 2) {
      // v2 is the scenario's scripted re-plan after evidence batch 2.
      plans.push({ planId: infostealerPlanV2.planId, version: 2, basedOnStateVersion: 2, stage: infostealerPlanV2.stage, createdAt: infostealerPlanV2.createdAt, missingEvidence: infostealerPlanV2.missingEvidence, actions: infostealerPlanV2Actions.map(fxActionToVM), replanExplanation: INFOSTEALER_REPLAN_EXPLANATION });
    }
    return ok(plans, "synthetic");
  }

  async getPlanRefs(caseId: string): Promise<Outcome<PlanRef[]>> {
    const plans = await this.getPlans(caseId);
    if (plans.kind !== "ok") return plans as Outcome<PlanRef[]>;
    return ok(
      plans.value.data.map((p) => ({ planId: p.planId, version: p.version, stage: p.stage, createdAt: p.createdAt, actionCount: p.actions.length })),
      "synthetic",
    );
  }

  async getPlanDetail(caseId: string, planId: string): Promise<Outcome<PlanVM>> {
    const plans = await this.getPlans(caseId);
    if (plans.kind !== "ok") return plans as Outcome<PlanVM>;
    const found = plans.value.data.find((p) => p.planId === planId);
    if (!found) return { kind: "http_error", status: 404, detail: `plan not found: ${planId}` };
    return ok(found, "synthetic");
  }

  async getApprovals(caseId: string): Promise<Outcome<ApprovalItemVM[]>> {
    if (caseId !== INFOSTEALER_CASE_ID) return ok([], "synthetic");
    const c = this.caseById(caseId);
    const items: ApprovalItemVM[] = activeActions()
      .filter((a) => {
        const state = demo.actionState[a.actionId] ?? a.state;
        return state === "proposed" || state === "approved";
      })
      .map((a) => ({
        actionId: a.actionId,
        actionVersion: a.version,
        basedOnStateVersion: a.basedOnStateVersion,
        caseId,
        caseTitle: c?.title ?? caseId,
        tool: a.tool,
        target: a.target,
        stage: a.stage,
        risk: a.risk,
        escalationRequired: a.escalationRequired,
        requiredApprover: a.requiredApprover,
        rationale: a.rationale,
        policyRef: a.policyRefs[0] ?? null,
        expectedEffect: a.expectedEffect,
        supportingEvidence: a.evidenceIds,
        state: demo.actionState[a.actionId] ?? a.state,
        stalePrewarn: false,
      }));
    return ok(items, "synthetic");
  }

  async getExecutionResults(caseId: string): Promise<Outcome<ExecutionResultVM[]>> {
    if (caseId !== INFOSTEALER_CASE_ID) return ok([], "synthetic");
    return ok(demo.results, "synthetic");
  }

  async getAudit(caseId: string): Promise<Outcome<AuditEventVM[]>> {
    if (caseId !== INFOSTEALER_CASE_ID) return ok([], "synthetic");
    return ok([...demo.audit].sort((a, b) => (a.at < b.at ? 1 : -1)), "synthetic");
  }

  async getReport(caseId: string): Promise<Outcome<ReportVM>> {
    return this.buildReport(caseId);
  }

  async generateReport(caseId: string): Promise<Outcome<ReportVM>> {
    return this.buildReport(caseId);
  }

  private buildReport(caseId: string): Outcome<ReportVM> {
    const c = this.caseById(caseId);
    if (!c) return { kind: "http_error", status: 404, detail: `case not found: ${caseId}` };
    const actions = activeActions();
    const executed = demo.results;
    const decided = Object.entries(demo.decisionNote);
    const sections = [
      { key: "executive_summary", title: "Executive summary", present: true, lines: ["Infostealer compromise escalated to session hijack and CRM data export; containment and eradication actions proposed across two plan versions."] },
      { key: "classification", title: "Incident classification", present: true, lines: ["Type: credential theft / session hijack", "Severity: high", "Phase: containment"] },
      { key: "timeline", title: "Timeline", present: true, lines: [...infostealerTimelineBatch1, ...infostealerTimelineBatch2].map((t) => t.label) },
      { key: "affected", title: "Affected assets and identities", present: true, lines: ["SALES-LT-07 (host)", "farah (account)", "CRM (data store)"] },
      { key: "evidence_index", title: "Evidence", present: true, lines: [...infostealerEvidenceBatch1, ...infostealerEvidenceBatch2].map((e) => `${e.evidenceId} — ${e.sourceFile}`) },
      { key: "attack", title: "ATT&CK mappings", present: true, lines: ["T1204.002", "T1555.003", "T1041", "T1550.004", "T1213"] },
      { key: "decisions", title: "Decisions and approvals", present: decided.length > 0, lines: decided.map(([id, d]) => `${id}: ${d.decision}${d.reason ? ` — ${d.reason}` : ""}`) },
      { key: "actions", title: "Recommended / simulated actions", present: true, lines: actions.map((a) => `${demo.actionState[a.actionId] ?? a.state}: ${a.tool} on ${a.target}`) },
      { key: "validation", title: "Validation results", present: executed.length > 0, lines: executed.map((r) => `${r.tool} → ${r.executionStatus}/${r.validationStatus}`) },
      { key: "open_questions", title: "Unresolved gaps", present: false, lines: [] },
      { key: "recommendations", title: "Lessons and hardening", present: true, lines: ["Harden session controls and software-installation policy."] },
    ];
    return ok(
      {
        reportId: "RPT-FIXTURE-IS",
        caseId,
        title: c.title,
        organisation: DEMO_ORGANISATION,
        status: "draft",
        generatedAt: minsAgo(1),
        sections,
        completeness: { present: sections.filter((s) => s.present).length, total: sections.length },
        pdfAvailable: false,
      },
      "synthetic",
    );
  }

  async submitDecision(
    caseId: string,
    actionId: string,
    decision: DecisionKind,
  ): Promise<Outcome<{ state: string }>> {
    const a = findAction(actionId);
    if (!a) return { kind: "http_error", status: 404, detail: `action not found: ${actionId}` };
    const next: PlanActionState = decision === "approve" ? "approved" : decision === "reject" ? "superseded" : "proposed";
    demo.actionState[actionId] = next;
    demo.decisionNote[actionId] = { decision, reason: "" };
    demo.audit.unshift({
      eventId: `EV-D-${actionId}`,
      kind: decision === "approve" ? "action_approved" : "action_rejected",
      caseId,
      summary: `${decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "Requested more investigation on"} ${a.tool}`,
      at: new Date().toISOString(),
    });
    return ok({ state: next }, "synthetic");
  }

  async executeAction(caseId: string, actionId: string): Promise<Outcome<ExecutionResultVM>> {
    const a = findAction(actionId);
    if (!a) return { kind: "http_error", status: 404, detail: `action not found: ${actionId}` };
    if ((demo.actionState[actionId] ?? a.state) !== "approved") {
      return { kind: "http_error", status: 409, detail: "action is not approved" };
    }
    // The first CRM revocation attempt hits the explicit demo fault; its
    // replacement on Plan v2 succeeds after the analyst re-plans.
    const effective = actionId !== "ACT-IS-1E";
    const result: ExecutionResultVM = {
      executionId: `EXE-${actionId}`,
      actionId,
      tool: a.tool,
      target: a.target,
      executionStatus: "completed",
      validationStatus: effective ? "effective" : "ineffective",
      observedEffect: effective ? "Expected effect observed in the simulator." : "CRM session revocation did not complete; the stolen session remained valid.",
      resultSource: "simulator",
      createdAt: new Date().toISOString(),
    };
    demo.results = [result, ...demo.results.filter((r) => r.actionId !== actionId)];
    demo.actionState[actionId] = "simulated";
    demo.audit.unshift({ eventId: `EV-X-${actionId}`, kind: "action_executed", caseId, summary: `Simulated ${a.tool} on ${a.target}`, at: new Date().toISOString() });
    // Validation is a distinct step in fixture mode: resolve to effective/ineffective.
    demo.actionState[actionId] = effective ? "validated_effective" : "validated_ineffective";
    return ok(result, "synthetic");
  }

  // ---- Presenter control (synthetic only) ----
  async revealNextEvidenceBatch(
    caseId: string,
  ): Promise<Outcome<{ revealed: number; hasMore: boolean }>> {
    if (caseId !== INFOSTEALER_CASE_ID) {
      return { kind: "http_error", status: 404, detail: `no further batches for ${caseId}` };
    }
    if (demo.revealedBatch >= 2) {
      return ok({ revealed: demo.revealedBatch, hasMore: false }, "synthetic");
    }
    demo.revealedBatch = 2;
    // Batch 2 arrival triggers the re-plan: new evidence, then Plan v2.
    demo.audit.unshift(
      { eventId: "EV-A4", kind: "evidence_ingested", caseId, summary: "2 identity/application records ingested (batch 2)", at: new Date(NOW.getTime() - 78 * 60_000).toISOString() },
      { eventId: "EV-A5", kind: "plan_created", caseId, summary: "Plan v2 created (7 actions) after re-plan", at: new Date().toISOString() },
    );
    // Seed any v2 action states not already present.
    for (const a of infostealerPlanV2Actions) {
      if (!(a.actionId in demo.actionState)) demo.actionState[a.actionId] = a.state;
    }
    return ok({ revealed: 2, hasMore: false }, "synthetic");
  }

  // ---- Create-case flow (synthetic) ----
  private draft = { count: 0, sources: new Set<string>() };

  async createCase(_title: string, _description: string): Promise<Outcome<{ caseId: string }>> {
    this.draft = { count: 0, sources: new Set<string>() };
    return ok({ caseId: "CASE-DRAFT-DEMO" }, "synthetic");
  }

  async uploadEvidence(_caseId: string, file: File): Promise<Outcome<{ accepted: number }>> {
    // Synthetic: accept the file deterministically and record its source name.
    const kind = file.name.split(".").pop()?.toLowerCase() ?? "";
    const perFile = kind === "csv" ? 12 : kind === "json" ? 8 : 1;
    this.draft.count += perFile;
    this.draft.sources.add(file.name);
    return ok({ accepted: perFile }, "synthetic");
  }

  async countEvidence(_caseId: string): Promise<Outcome<{ count: number; sources: string[] }>> {
    return ok({ count: this.draft.count, sources: [...this.draft.sources] }, "synthetic");
  }

  async startRun(_caseId: string): Promise<Outcome<{ planId: string }>> {
    return ok({ planId: "PLAN-IS-V1" }, "synthetic");
  }
}

export { _unsupported };
