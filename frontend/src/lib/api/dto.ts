/**
 * Backend DTOs — the EXACT shapes the FastAPI backend returns today.
 *
 * These mirror backend/app/schemas/*.py and the service return values as of
 * the merged BL-003 backend. They are the authoritative contract for API mode.
 * UI components never consume these directly; they go through lib/mapping into
 * stable view models (lib/types.ts). Do not add fields the backend does not
 * actually return.
 */

// ---- Enums as the backend spells them -------------------------------------

export type CaseStatusDTO =
  | "open"
  | "investigating"
  | "contained"
  | "recovered"
  | "closed";

export type RecoveryStatusDTO =
  | "investigating"
  | "containing"
  | "eradicating"
  | "recovering"
  | "resolved";

export type StageDTO =
  | "assessment"
  | "preservation"
  | "containment"
  | "eradication"
  | "hardening"
  | "restoration";

export type EntityTypeDTO =
  | "host"
  | "account"
  | "session"
  | "process"
  | "file"
  | "ip"
  | "domain"
  | "other";

export type EvidenceKindDTO = "csv" | "json" | "txt";

/**
 * Real backend action lifecycle string (StoredAction.status). This is NOT the
 * intended six-state product model — the mapping layer reconciles it.
 * Observed values: awaiting_approval (default), recommended, approved,
 * rejected, verified, failed, not_applicable.
 */
export type ActionStatusDTO =
  | "awaiting_approval"
  | "recommended"
  | "approved"
  | "rejected"
  | "verified"
  | "failed"
  | "not_applicable";

/** Backend decision enum — approve/reject ONLY (no request_more_investigation). */
export type DecisionDTO = "approve" | "reject";

// ---- Case -----------------------------------------------------------------

export interface CaseDTO {
  case_id: string;
  title: string;
  description: string;
  status: CaseStatusDTO;
  current_state_version: number;
  created_at: string;
  updated_at: string;
}

// ---- Evidence -------------------------------------------------------------

export interface SourceLocationDTO {
  file: string;
  row?: number | null;
  line?: number | null;
}

export interface EvidenceItemDTO {
  evidence_id: string;
  case_id: string;
  source_file: string;
  source_location: SourceLocationDTO;
  sha256: string;
  kind: EvidenceKindDTO;
  event_time?: string | null;
  ingestion_time: string;
  fields: Record<string, unknown>;
}

export interface EvidenceUploadResultDTO {
  source_file: string;
  sha256: string;
  kind: EvidenceKindDTO;
  item_count: number;
  evidence_ids: string[];
  new_state_version?: number | null;
}

// ---- Incident state -------------------------------------------------------

export interface EntityDTO {
  id: string;
  type: EntityTypeDTO;
  name: string;
  attributes: Record<string, unknown>;
  evidence_ids?: string[];
  first_seen?: string | null;
  last_seen?: string | null;
  condition?: string | null;
}

export interface RelationshipDTO {
  id?: string | null;
  source: string;
  relation: string;
  target: string;
  evidence_ids: string[];
  status: "observed" | "inferred";
  category?: "context" | "attack" | "response";
  first_seen?: string | null;
  last_seen?: string | null;
  attributes?: Record<string, unknown>;
  action_id?: string | null;
  execution_id?: string | null;
}

export interface StateVersionMetaDTO {
  version: number;
  parent_version: number | null;
  created_from: string | null;
  change_reason: string | null;
  created_at: string | null;
  entity_count: number;
  relationship_count: number;
  timeline_count: number;
}

export interface TimelineEventDTO {
  timestamp?: string | null;
  description: string;
  evidence_ids: string[];
}

export interface FindingDTO {
  summary: string;
  evidence_ids: string[];
}

export interface IncidentStateDTO {
  case_id: string;
  version: number;
  parent_version?: number | null;
  change_reason?: string | null;
  created_from?: string | null;
  entities: EntityDTO[];
  relationships: RelationshipDTO[];
  timeline: TimelineEventDTO[];
  findings: FindingDTO[];
  attack_mapping: string[];
  hypotheses: string[];
  missing_evidence: string[];
  actions: string[];
  action_results: string[];
  recovery_status: RecoveryStatusDTO;
  created_at: string;
  observed_response_status?: string | null;
  recommended_response_focus?: string | null;
  response_objective?: string | null;
  response_prerequisites?: string[];
  routing_rationale?: string | null;
  routing_evidence_ids?: string[];
  routing_confidence?: number | null;
  routing_transition?: string | null;
  report_sections_complete?: string[];
  report_sections_pending?: string[];
  report_sections_invalidated?: string[];
  latest_report_id?: string | null;
  latest_report_version?: string | null;
  report_status?: string | null;
}

export interface AnalysisRunDTO {
  run_id: string;
  case_id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: "queued" | "loading_state" | "loading_guidance" | "running_planner" | "persisting_plan" | "completed" | "failed";
  message: string;
  based_on_state_version: number;
  plan_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
}

// ---- Plans & actions ------------------------------------------------------

export interface ProposedActionDTO {
  tool_name: string;
  target_id: string;
  evidence_ids: string[];
  policy_refs: string[];
  rationale: string;
  prerequisites: string[];
  risk: string;
  expected_effect: string;
  validation_checks: string[];
}

/** StoredAction as persisted/returned by the backend. */
export interface StoredActionDTO {
  action_id: string;
  case_id: string;
  plan_id: string;
  version: number;
  based_on_state_version: number;
  proposal: ProposedActionDTO;
  status: ActionStatusDTO;
  decided_by?: string | null;
  decided_at?: string | null;
  reason?: string | null;
  created_at: string;
}

/** Plan document from GET /cases/{id}/plans — carries action_ids only. */
export interface PlanDocDTO {
  plan_id: string;
  case_id: string;
  based_on_state_version: number;
  stage: StageDTO;
  missing_evidence: string[];
  action_ids: string[];
  created_at: string;
  analysis?: {
    incident_type: string;
    scope: string;
    severity: string;
    confidence: number;
    findings: { summary: string; evidence_ids: string[]; confidence: number }[];
    attack_techniques: string[];
  } | null;
}

/** POST /cases/{id}/runs response — plan doc plus full action docs. */
export interface RunResponseDTO extends PlanDocDTO {
  actions: StoredActionDTO[];
}

// ---- Approvals ------------------------------------------------------------

/** Declared prototype approver role (policy-pack roles only). */
export type ApproverRoleDTO = "soc_analyst" | "it_manager" | "dpo";

export interface DecisionRequestDTO {
  decision: DecisionDTO;
  analyst: string;
  approver_role?: ApproverRoleDTO;
  reason?: string;
}

export interface ApprovalRecordDTO {
  approval_id: string;
  case_id: string;
  action_id: string;
  action_version: number;
  state_version: number;
  /**
   * Stored in the past tense. The request enum is imperative
   * (DecisionDTO: approve/reject); "approved"/"rejected" in a REQUEST is a 422.
   */
  decision: "approved" | "rejected";
  analyst: string;
  approver_role?: ApproverRoleDTO;
  required_role?: ApproverRoleDTO | null;
  reason: string;
  created_at: string;
}

/** POST /cases/{id}/actions/{action_id}/decision response. */
export interface DecisionResponseDTO {
  action: StoredActionDTO;
  approval: ApprovalRecordDTO;
}

// ---- Execution ------------------------------------------------------------

export interface ActionResultDTO {
  execution_id: string;
  case_id: string;
  action_id: string;
  tool_name: string;
  target_id: string;
  execution_status: string; // "completed" | "failed"
  validation_status: string; // "effective" | "ineffective"
  observed_effect: string;
  result_source: string; // "simulator"
  created_at: string;
}

/** POST /cases/{id}/actions/{action_id}/execute response. */
export interface ExecuteResponseDTO {
  action: StoredActionDTO;
  result: ActionResultDTO;
}

// ---- Audit ----------------------------------------------------------------

/**
 * One GET /cases/{id}/audit row, exactly as audit_service.record() stores it.
 * The backend returns rows sorted by `timestamp`, oldest first.
 * Observed `event_type`s: case_created, evidence_uploaded,
 * state_version_created, plan_created, action_approved, action_rejected,
 * action_executed, report_generated. `details` is free-form per event type
 * and can hold server-local paths (`stored_path`, `pdf_path`) — never render
 * those as links.
 */
export interface AuditEventDTO {
  audit_id: string;
  case_id: string;
  event_type: string;
  details: Record<string, unknown>;
  timestamp: string;
}

// ---- Report (v1.3 structured report) --------------------------------------

export interface ReportClassificationDTO {
  incident_type: string;
  status: string;
  closure_reason?: string | null;
  closure_evidence_ids?: string[];
  severity: string;
  severity_reason: string;
  confidence: number;
  current_phase: string;
  attack_techniques: string[];
  confirmed_by_analyst: boolean;
}

export interface ReportAffectedDTO {
  asset_id: string;
  name: string;
  type: string;
  owner: string;
  criticality: string;
  how_affected: string;
  data_classification: string;
  evidence_ids: string[];
}

export interface ReportTimelineRowDTO {
  time?: string | null;
  event: string;
  source: string;
  side: string;
  attack_technique?: string | null;
  evidence_ids: string[];
}

export interface ReportActionRowDTO {
  action_id: string;
  plan_id?: string | null;
  based_on_state_version?: number | null;
  playbook_step_id: string;
  phase: string;
  tool_name?: string;
  target_id?: string;
  recommendation: string;
  evidence_ids?: string[];
  policy_refs?: string[];
  required_approver?: string | null;
  approver_role?: string | null;
  policy_check?: { result: "pass" | "blocked" | string; reasons: string[] };
  status: string;
  replaces_action_id?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  reason?: string | null;
  executed_by?: string | null;
  execution_id?: string | null;
  execution_status?: string | null;
  validation_status?: string | null;
  result?: string | null;
  result_source?: string | null;
}

export interface ReportFindingDTO {
  finding_id: string;
  summary: string;
  status?: "hypothesis" | "confirmed" | string;
  confidence: number;
  evidence_ids: string[];
}

export interface ReportCredentialDTO {
  service: string;
  account: string;
  exposed: string;
  status: string;
  evidence_ids: string[];
}

export interface ReportPreservationDTO {
  evidence_id: string;
  item: string;
  stored_at: string;
  collected_by: string;
  collected_at: string;
  sha256: string;
}

export interface ReportNotificationDTO {
  policy_rule_id: string;
  trigger: string;
  triggered: string;
  notify: string;
  deadline_hours: number;
  due_by?: string | null;
  status: string;
  done_at?: string | null;
  finding_ids: string[];
}

export interface ReportRecommendationDTO {
  text: string;
  finding_ids: string[];
  addresses_root_cause: boolean;
}

export interface ReportPolicyConformanceDTO {
  policy_rule_id: string;
  requirement: string;
  result: string;
  reason: string;
  related_ids: string[];
  override_reason?: string | null;
}

export interface ReportSignOffDTO {
  analyst: string;
  role: string;
  decision: string;
  at: string;
  comments: string;
}

export interface ReportOpenQuestionDTO {
  question: string;
  reason: string;
  answer?: string | null;
  related_ids: string[];
}

export interface ReportEvidenceIndexRowDTO {
  evidence_id: string;
  source_file: string;
  line?: number | null;
  time?: string | null;
  sha256: string;
  untrusted: boolean;
}

export type AnalystTimelineCategoryDTO = "attack" | "defensive" | "analyst" | "context" | "observed";
export type AnalystEntityRelevanceDTO = "confirmed_affected" | "suspected_affected" | "malicious_indicator" | "contextual";

export interface AnalystReportOverviewDTO {
  case_id: string;
  case_status: string;
  incident_status: string;
  severity: string;
  incident_type: string;
  current_phase: string;
  primary_assets: string[];
  state_version?: number | null;
  plan_id?: string | null;
  plan_state_version?: number | null;
  plan_status: "current" | "stale" | "not_available";
  planner_model?: string | null;
}

export interface AnalystReportFindingDTO {
  id: string;
  title: string;
  summary: string;
  severity: string;
  confidence?: number | null;
  status: string;
  affected_entity_ids: string[];
  evidence_ids: string[];
  attack_techniques: string[];
  first_seen?: string | null;
  last_seen?: string | null;
  source: string;
  plan_id?: string | null;
  state_version?: number | null;
}

export interface AnalystReportTimelineEventDTO {
  timestamp?: string | null;
  category: AnalystTimelineCategoryDTO;
  event_type: string;
  summary: string;
  significance: string;
  entity_ids: string[];
  evidence_ids: string[];
  source: string;
  material: boolean;
  raw_detail: string;
}

export interface AnalystReportEntityDTO {
  id: string;
  type: string;
  display_name: string;
  role: string;
  condition: string;
  relevance: AnalystEntityRelevanceDTO;
  relevance_reason: string;
  first_seen?: string | null;
  last_seen?: string | null;
  evidence_count: number;
  evidence_ids: string[];
}

export interface AnalystReportActionDTO {
  action_id: string;
  action_type: string;
  target: string;
  recommendation: string;
  proposed_status: string;
  approval_status: string;
  execution_status: string;
  validation_status: string;
  effectiveness: string;
  outcome: string;
  state_version?: number | null;
  timestamp?: string | null;
  plan_id?: string | null;
  phase: string;
  approval_id?: string | null;
  decided_by?: string | null;
  approver_role?: string | null;
  decision_reason?: string | null;
  execution_id?: string | null;
  result_source?: string | null;
  evidence_ids: string[];
  policy_refs: string[];
}

export interface AnalystReportNextStepDTO {
  priority: "High" | "Medium" | "Low";
  text: string;
  owner: string;
  status: string;
  related_ids: string[];
}

export interface AnalystEvidenceReferenceDTO {
  evidence_id: string;
  source_file: string;
  source_location: string;
  timestamp?: string | null;
  event_type: string;
  source: string;
  sha256: string;
  untrusted: boolean;
}

export interface AnalystReportDTO {
  overview: AnalystReportOverviewDTO;
  executive_summary: string;
  executive_summary_source: "current_state_analysis" | "record_derived";
  key_findings: AnalystReportFindingDTO[];
  key_timeline: AnalystReportTimelineEventDTO[];
  entities: AnalystReportEntityDTO[];
  response_actions: AnalystReportActionDTO[];
  impact: { confirmed: string[]; potential: string[]; remaining_risk: string[] };
  next_steps: AnalystReportNextStepDTO[];
  appendices: {
    evidence_index: AnalystEvidenceReferenceDTO[];
    raw_chronology: AnalystReportTimelineEventDTO[];
    technical_findings: AnalystReportFindingDTO[];
    attack_mapping: string[];
    provenance: {
      state_version?: number | null;
      state_parent_version?: number | null;
      state_created_from?: string | null;
      state_change_reason?: string | null;
      plan_id?: string | null;
      plan_state_version?: number | null;
      plan_is_stale: boolean;
      action_ids: string[];
      execution_ids: string[];
    };
  };
}

export interface StructuredReportDTO {
  template_schema_version?: string;
  report_id: string;
  incident_id: string;
  version: number;
  status: string;
  title: string;
  organisation: string;
  playbook: { id: string; version: string };
  policy_pack_version: string;
  planner_model?: string;
  current_state_version?: number | null;
  recovery_status?: string | null;
  plan_id?: string | null;
  plan_based_on_state_version?: number | null;
  plan_is_stale?: boolean;
  created_at: string;
  updated_at: string;
  executive_summary: { text: string; finding_ids: string[] };
  classification: ReportClassificationDTO;
  affected: ReportAffectedDTO[];
  exposed_credentials: ReportCredentialDTO[];
  timeline: ReportTimelineRowDTO[];
  findings: ReportFindingDTO[];
  root_cause: { text: string; finding_ids: string[]; status: string };
  impact: Record<string, unknown>;
  actions: ReportActionRowDTO[];
  evidence_preservation: ReportPreservationDTO[];
  notifications: ReportNotificationDTO[];
  recommendations: Array<ReportRecommendationDTO | string>;
  open_questions: ReportOpenQuestionDTO[];
  metrics: Record<string, unknown>;
  policy_conformance: ReportPolicyConformanceDTO[];
  sign_off: ReportSignOffDTO | null;
  evidence_index: ReportEvidenceIndexRowDTO[];
  analyst_report?: AnalystReportDTO;
  /** Server-local filesystem path. NOT a downloadable URL — never expose as a link. */
  pdf_path?: string;
}
