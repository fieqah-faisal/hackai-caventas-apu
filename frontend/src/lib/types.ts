/**
 * Stable frontend VIEW MODELS.
 *
 * UI components consume these — never raw backend DTOs. The mapping layer
 * (lib/mapping) translates backend DTOs into these shapes. Fixture mode builds
 * these directly to demonstrate the full intended product contract; API mode
 * maps the real backend's actual shapes into the same view models, filling
 * unsupported fields with explicit "unavailable" markers rather than guesses.
 */

// ---- Shared enums (stable, used across the UI) ----------------------------

export type CaseStatus =
  | "open"
  | "investigating"
  | "contained"
  | "recovered"
  | "closed";

export type RecoveryStatus =
  | "investigating"
  | "containing"
  | "eradicating"
  | "recovering"
  | "resolved";

export type Stage =
  | "assessment"
  | "preservation"
  | "containment"
  | "eradication"
  | "hardening"
  | "restoration";

export const STAGE_ORDER: Stage[] = [
  "assessment",
  "preservation",
  "containment",
  "eradication",
  "hardening",
  "restoration",
];

export type EntityType =
  | "host"
  | "account"
  | "session"
  | "process"
  | "file"
  | "ip"
  | "domain"
  | "other";

export type EvidenceCategory =
  | "endpoint"
  | "identity"
  | "network"
  | "application"
  | "analyst_note"
  | "other";

export type Severity = "low" | "medium" | "high" | "critical";
export type Risk = "low" | "moderate" | "high";
export type RelationshipStatus = "observed" | "inferred";

/**
 * Canonical six-state action lifecycle — the single domain model used
 * everywhere in the frontend. The mapping layer reconciles the backend's own
 * status vocabulary (awaiting_approval/approved/rejected/verified/failed) into
 * these. Display labels may vary by surface; the domain meaning does not.
 */
export type PlanActionState =
  | "proposed"
  | "approved"
  | "simulated"
  | "validated_effective"
  | "validated_ineffective"
  | "not_applicable"
  | "superseded";

/**
 * An explicitly unavailable value — used when a surface's intended data has no
 * backing endpoint in the current mode. Never a fabricated value.
 */
export type Unavailable = { readonly unavailable: true; readonly reason: string };
export type Maybe<T> = T | Unavailable | null;

export function unavailable(reason: string): Unavailable {
  return { unavailable: true, reason };
}
export function isUnavailable(v: unknown): v is Unavailable {
  return typeof v === "object" && v !== null && (v as Unavailable).unavailable === true;
}

/** Provenance of a value/surface so the UI can flag synthetic data. */
export type DataSource = "real" | "synthetic";

// ---- Case view models -----------------------------------------------------

export interface CaseSummary {
  caseId: string;
  title: string;
  status: CaseStatus;
  /** Derived from the latest plan; absent when no plan exists. */
  stage: Stage | null;
  /** Derived from incident state / findings; absent when not assessed. */
  classification: string | null;
  severity: Severity | null;
  stateVersion: number;
  updatedAt: string;
}

export interface CaseHeaderVM {
  caseId: string;
  title: string;
  status: CaseStatus;
  severity: Severity | null;
  stage: Stage | null;
  recoveryStatus: RecoveryStatus | null;
  updatedAt: string;
  /** Compact agent state label, e.g. "Plan v2 ready", or null when unknown. */
  agentState: string | null;
}

export type AttentionReason =
  | "awaiting_decision"
  | "missing_evidence"
  | "newly_ingested"
  | "replan_needed"
  | "escalation_pending";

export interface AttentionItem {
  caseId: string;
  title: string;
  reason: AttentionReason;
  statusLabel: string;
  updatedAt: string;
}

export interface RecentCaseRow {
  caseId: string;
  title: string;
  classification: string | null;
  stage: Stage | null;
  status: CaseStatus;
  updatedAt: string;
}

// ---- Evidence view models -------------------------------------------------

export interface EvidenceItemVM {
  evidenceId: string;
  category: EvidenceCategory;
  title: string;
  eventTime: string | null;
  kind: "csv" | "json" | "txt";
  relationshipStatus: RelationshipStatus;
  sha256: string;
  sourceFile: string;
  sourceLocation: string;
  relatedEntities: string[];
  attackMapping: string[];
  stateVersion: number;
  fields: Record<string, unknown>;
}

// ---- Timeline view models -------------------------------------------------

export type TimelineKind =
  | "relevant"
  | "benign_decoy"
  | "analyst_added"
  | "newly_introduced";

export interface TimelineEventVM {
  id: string;
  time: string | null;
  label: string;
  kind: TimelineKind;
  relationshipStatus: RelationshipStatus;
  evidenceId: string | null;
}

// ---- Analysis view models -------------------------------------------------

export interface AnalysisVM {
  classification: string | null;
  confidence: { value: number | null; basis: string; advisory: true };
  affectedEntities: { id: string; type: EntityType; name: string }[];
  attackTechniques: string[];
  missingEvidence: string[];
  hypotheses: string[];
  severity?: Severity | null;
  scope?: string | null;
  findings?: { summary: string; evidenceIds: string[]; confidence: number | null }[];
  unavailableReason?: string | null;
}

export interface StateVersionMetaVM {
  version: number;
  parentVersion: number | null;
  createdFrom: string | null;
  changeReason: string | null;
  createdAt: string | null;
  entityCount: number;
  relationshipCount: number;
  timelineCount: number;
}

export interface IncidentEntityVM {
  id: string;
  type: EntityType;
  name: string;
  attributes: Record<string, unknown>;
  evidenceIds: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  condition: string | null;
}

export interface IncidentRelationshipVM {
  id: string;
  source: string;
  relation: string;
  target: string;
  evidenceIds: string[];
  status: RelationshipStatus;
  category: "context" | "attack" | "response";
  firstSeen: string | null;
  lastSeen: string | null;
  attributes: Record<string, unknown>;
  actionId: string | null;
  executionId: string | null;
}

export interface IncidentSnapshotVM {
  caseId: string;
  version: number;
  parentVersion: number | null;
  changeReason: string | null;
  createdFrom: string | null;
  createdAt: string;
  entities: IncidentEntityVM[];
  relationships: IncidentRelationshipVM[];
  timeline: { timestamp: string | null; description: string; evidenceIds: string[] }[];
  findings: { summary: string; evidenceIds: string[] }[];
  attackMapping: string[];
  hypotheses: string[];
  missingEvidence: string[];
  actions: string[];
  actionResults: string[];
  recoveryStatus: RecoveryStatus;
  observedResponseStatus: string | null;
  recommendedResponseFocus: string | null;
  responseObjective: string | null;
  responsePrerequisites: string[];
  routingRationale: string | null;
  routingEvidenceIds: string[];
  routingConfidence: number | null;
  routingTransition: string | null;
  reportSectionsComplete: string[];
  reportSectionsPending: string[];
  reportSectionsInvalidated: string[];
  latestReportId: string | null;
  latestReportVersion: string | null;
  reportStatus: string | null;
}

export interface AnalysisRunVM {
  runId: string;
  caseId: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  message: string;
  basedOnStateVersion: number;
  planId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

// ---- Response plan view models --------------------------------------------

export interface ResponsePlanActionVM {
  actionId: string;
  version: number;
  basedOnStateVersion: number;
  stage: Stage;
  tool: string;
  target: string;
  targetType: EntityType | null;
  risk: Risk;
  escalationRequired: boolean;
  approvalRequired: boolean;
  state: PlanActionState;
  rationale: string;
  policyRefs: string[];
  evidenceIds: string[];
  expectedEffect: string;
  validationChecks: string[];
}

export interface PlanVM {
  planId: string;
  version: number; // 1-based ordinal across the case's plans
  basedOnStateVersion: number;
  stage: Stage;
  createdAt: string;
  missingEvidence: string[];
  actions: ResponsePlanActionVM[];
  /**
   * Set when a plan references actions the provider could not resolve.
   * `actions` is then [] and must never be shown as "no actions".
   */
  actionsUnavailable?: { count: number; reason: string };
  /**
   * The recorded reason this version replaced the previous one. Only the
   * fixture scenario supplies it; the backend stores no re-plan rationale,
   * so API mode never shows re-plan copy.
   */
  replanExplanation?: string;
}

export type DiffCategory =
  | "unchanged"
  | "added"
  | "replaced_or_insufficient"
  | "policy_triggered";

export interface PlanDiffEntryVM {
  action: ResponsePlanActionVM;
  category: DiffCategory;
}

export interface PlanDiffVM {
  fromVersion: number;
  toVersion: number;
  explanation: string;
  entries: PlanDiffEntryVM[];
}

// ---- Approvals view models ------------------------------------------------

export type DecisionKind = "approve" | "reject" | "request_more_investigation";

export interface ApprovalItemVM {
  actionId: string;
  actionVersion: number;
  basedOnStateVersion: number;
  caseId: string;
  caseTitle: string;
  tool: string;
  target: string;
  stage: Stage;
  risk: Risk;
  escalationRequired: boolean;
  requiredApprover: string;
  rationale: string;
  policyRef: string | null;
  expectedEffect: string;
  supportingEvidence: string[];
  state: PlanActionState;
  /** True when a later incident-state version supersedes this action's binding. */
  stalePrewarn: boolean;
}

// ---- Execution / validation view models -----------------------------------

export interface ExecutionResultVM {
  executionId: string;
  actionId: string;
  tool: string;
  target: string;
  executionStatus: "completed" | "failed" | string;
  validationStatus: "effective" | "ineffective" | string;
  observedEffect: string;
  resultSource: string;
  createdAt: string;
}

// ---- Report view models ---------------------------------------------------

export interface ReportSectionVM {
  key: string;
  title: string;
  present: boolean;
  lines: string[];
}

export interface ReportVM {
  reportId: string;
  caseId: string;
  title: string;
  organisation: string;
  status: string;
  generatedAt: string;
  sections: ReportSectionVM[];
  completeness: { present: number; total: number };
  /** True when the backend exposes the generated PDF through its download API. */
  pdfAvailable: boolean;
}

// ---- Audit / activity view models -----------------------------------------

export type AuditKind =
  | "case_created"
  | "evidence_ingested"
  | "plan_created"
  | "action_approved"
  | "action_rejected"
  | "action_executed"
  | "report_generated"
  | "state_version_created"
  | "other";

export interface AuditEventVM {
  eventId: string;
  kind: AuditKind;
  caseId: string;
  summary: string;
  at: string;
  /**
   * The backend audit `details`, verbatim (API mode only). It can hold
   * server-local paths; never render those as links.
   */
  payload?: Record<string, unknown>;
}

// ---- Dashboard aggregate view models --------------------------------------

export interface DayBucket {
  date: string; // ISO date (yyyy-mm-dd)
  count: number;
}

export interface CaseActivityVM {
  openCases: number;
  attentionCases: number;
  buckets: DayBucket[]; // exactly 7, trailing days ending today
}

export interface AgentPlanningVM {
  /** Null when the provider has no persisted run-status contract. */
  activeRuns: number | null;
  blockedRuns: number;
  /** Provenance of the available planning counts. */
  runCountsSource: DataSource;
  stageDistribution: { stage: Stage; count: number }[];
}

export interface HumanDecisionsVM {
  awaitingApproval: number;
  highImpactEscalations: number;
  oldestWaiting: string | null; // single largest whole unit, null when none
  riskDistribution: { risk: Risk; count: number }[];
}

// ---- Case workspace tab model ---------------------------------------------

export type TabId =
  | "overview"
  | "evidence"
  | "timeline"
  | "graph"
  | "analysis"
  | "plan"
  | "approvals"
  | "report";

export interface CaseFacts {
  evidenceUploaded: boolean;
  timelineReconstructed: boolean;
  stateVersion?: number;
  planningRunStarted: boolean;
  proposalExists: boolean;
  actionAwaitingDecision: boolean;
  reportEligible: boolean;
}

// ---- Create-case step model -----------------------------------------------

export type StepId = "details" | "evidence" | "review" | "start";

// ---- utility --------------------------------------------------------------

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
