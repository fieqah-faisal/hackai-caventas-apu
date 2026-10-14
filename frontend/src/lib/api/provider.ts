import type { ApproverRoleDTO } from "./dto";
/**
 * The DataProvider boundary.
 *
 * Exactly one provider is selected per application run via VITE_DATA_MODE
 * ("fixture" | "api"). The two modes are explicitly separate and never mix
 * within one case: API mode never silently falls back to fixtures on failure.
 *
 * Providers return view models (not raw DTOs). Each read is wrapped in a
 * ProviderOutcome so callers can render loading/empty/error honestly, and each
 * surface carries a DataSource so synthetic data is always visibly flagged.
 */
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
  DataSource,
  DecisionKind,
  EvidenceItemVM,
  ExecutionResultVM,
  HumanDecisionsVM,
  PlanVM,
  RecentCaseRow,
  ReportVM,
  TimelineEventVM,
} from "../types";

export type ProviderMode = "fixture" | "api";

/** A successful read, carrying its provenance for synthetic flagging. */
export interface Sourced<T> {
  data: T;
  source: DataSource;
}

/** An operation the current provider cannot perform (API mode gap). */
export interface Unsupported {
  unsupported: true;
  reason: string;
}

export function unsupported(reason: string): Unsupported {
  return { unsupported: true, reason };
}
export function isUnsupported(v: unknown): v is Unsupported {
  return typeof v === "object" && v !== null && (v as Unsupported).unsupported === true;
}

/** Outcome of a provider read. Mirrors apiClient's honest states. */
export type Outcome<T> =
  | { kind: "ok"; value: Sourced<T> }
  | { kind: "unsupported"; reason: string }
  | { kind: "http_error"; status: number; detail: string }
  | { kind: "not_implemented"; detail: string }
  | { kind: "network_error"; detail: string }
  | { kind: "offline" };

export function ok<T>(data: T, source: DataSource): Outcome<T> {
  return { kind: "ok", value: { data, source } };
}

/** A plan version list entry (metadata) for the plan-history selector. */
export interface PlanRef {
  planId: string;
  version: number;
  stage: string;
  createdAt: string;
  actionCount: number;
}

/** The capabilities every provider exposes. */
export interface DataProvider {
  readonly mode: ProviderMode;
  /** True when this provider's data is synthetic demonstration data. */
  readonly synthetic: boolean;

  // Dashboard
  getCaseActivity(): Promise<Outcome<CaseActivityVM>>;
  getAgentPlanning(): Promise<Outcome<AgentPlanningVM>>;
  getHumanDecisions(): Promise<Outcome<HumanDecisionsVM>>;
  getAttentionItems(): Promise<Outcome<AttentionItem[]>>;
  getRecentCases(): Promise<Outcome<RecentCaseRow[]>>;
  getCases(): Promise<Outcome<CaseSummary[]>>;

  // Case workspace
  getCaseHeader(caseId: string): Promise<Outcome<CaseHeaderVM>>;
  getCaseFacts(caseId: string): Promise<Outcome<CaseFacts>>;
  getEvidence(caseId: string): Promise<Outcome<EvidenceItemVM[]>>;
  getTimeline(caseId: string): Promise<Outcome<TimelineEventVM[]>>;
  getAnalysis(caseId: string): Promise<Outcome<AnalysisVM>>;
  /** All plan versions for a case, oldest first. */
  getPlans(caseId: string): Promise<Outcome<PlanVM[]>>;
  /** Metadata list of plan versions (always available if plans listed). */
  getPlanRefs(caseId: string): Promise<Outcome<PlanRef[]>>;
  /** Full detail for one historical plan. Unsupported in API mode (no endpoint). */
  getPlanDetail(caseId: string, planId: string): Promise<Outcome<PlanVM>>;
  getApprovals(caseId: string): Promise<Outcome<ApprovalItemVM[]>>;
  getExecutionResults(caseId: string): Promise<Outcome<ExecutionResultVM[]>>;
  getAudit(caseId: string): Promise<Outcome<AuditEventVM[]>>;
  /**
   * The latest report already generated for the case, or null when there is
   * none to show. Never generates one: generation is an explicit analyst
   * action (generateReport).
   */
  getReport(caseId: string): Promise<Outcome<ReportVM | null>>;

  // Mutations
  submitDecision(
    caseId: string,
    actionId: string,
    decision: DecisionKind,
    analyst: string,
    reason: string,
    approverRole?: ApproverRoleDTO,
  ): Promise<Outcome<{ state: string }>>;
  executeAction(caseId: string, actionId: string): Promise<Outcome<ExecutionResultVM>>;
  /** Generate a new report version (explicit analyst action; one request per call). */
  generateReport(caseId: string): Promise<Outcome<ReportVM>>;

  /**
   * Presenter-only: advance the synthetic scenario by revealing the next
   * evidence batch (drives the v1 -> v2 re-plan live during a demo). Optional
   * and implemented by FixtureProvider only; RealProvider never defines it, so
   * the UI must feature-detect before offering the control.
   */
  revealNextEvidenceBatch?(caseId: string): Promise<Outcome<{ revealed: number; hasMore: boolean }>>;

  // Create-case flow
  createCase(title: string, description: string): Promise<Outcome<{ caseId: string }>>;
  uploadEvidence(caseId: string, file: File): Promise<Outcome<{ accepted: number }>>;
  countEvidence(caseId: string): Promise<Outcome<{ count: number; sources: string[] }>>;
  startRun(caseId: string): Promise<Outcome<{ planId: string }>>;
}
