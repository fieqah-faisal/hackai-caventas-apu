/**
 * Synthetic response bodies with the exact field names, value shapes and
 * ordering the real backend returned in the link API-mode run (Firestore
 * emulator). Shared by the mapping and RealProvider contract tests.
 */
import type {
  ActionResultDTO,
  CaseDTO,
  EvidenceItemDTO,
  PlanDocDTO,
  ReportActionRowDTO,
  StoredActionDTO,
  StructuredReportDTO,
} from "@/lib/api/dto";

/**
 * GET /cases/{id}/plans as real Firestore returned it: document-ID order,
 * NOT creation order (newest, middle, oldest). Stages differ here so the
 * "latest plan" is observable in assertions.
 */
export const PLANS_IN_DOC_ID_ORDER: PlanDocDTO[] = [
  {
    plan_id: "PLAN-4e0000000003",
    case_id: "CASE-TEST0001",
    based_on_state_version: 2,
    stage: "eradication",
    missing_evidence: [],
    action_ids: ["ACT-000000000003"],
    created_at: "2026-10-12T02:45:53.467460+00:00",
  },
  {
    plan_id: "PLAN-730000000002",
    case_id: "CASE-TEST0001",
    based_on_state_version: 2,
    stage: "containment",
    missing_evidence: [],
    action_ids: ["ACT-000000000002"],
    created_at: "2026-10-12T02:45:53.460138+00:00",
  },
  {
    plan_id: "PLAN-f10000000001",
    case_id: "CASE-TEST0001",
    based_on_state_version: 2,
    stage: "assessment",
    missing_evidence: [],
    action_ids: ["ACT-000000000001"],
    created_at: "2026-10-12T02:43:38.195695+00:00",
  },
];

function evidenceItem(
  id: string,
  sourceFile: string,
  kind: "csv" | "json",
  row: number,
  ingestionTime: string,
  fields: Record<string, unknown>,
): EvidenceItemDTO {
  return {
    evidence_id: id,
    case_id: "CASE-TEST0001",
    source_file: sourceFile,
    source_location: { file: sourceFile, row, line: null },
    sha256: (kind === "csv" ? "a" : "b").repeat(64),
    kind,
    event_time: typeof fields.event_time === "string" ? fields.event_time : null,
    ingestion_time: ingestionTime,
    fields,
  };
}

const CSV_UPLOAD = "2026-10-12T02:43:36.671561Z";
const JSON_UPLOAD = "2026-10-12T02:43:36.707072Z";

/**
 * GET /cases/{id}/evidence as real Firestore returned it: document-ID order.
 * Two uploads (CSV then JSON); items in one upload share `ingestion_time`
 * and are numbered by `row`. Normalized fields use `event_type`.
 */
export const EVIDENCE_IN_DOC_ID_ORDER: EvidenceItemDTO[] = [
  evidenceItem("EV-04000000000a", "planner_smoke_evidence.json", "json", 1, JSON_UPLOAD, {
    event_type: "process_start", host: "SYNTH-LT-01", event_time: "2026-10-04T21:40:00+08:00",
  }),
  evidenceItem("EV-23000000000b", "login_logs.csv", "csv", 1, CSV_UPLOAD, {
    event_type: "login_failed", host: "SYNTH-WS-01", event_time: "2026-10-03T10:05:00Z",
  }),
  evidenceItem("EV-7b000000000c", "planner_smoke_evidence.json", "json", 0, JSON_UPLOAD, {
    event_type: "dns_query", host: "SYNTH-LT-01", event_time: "2026-10-04T21:38:00+08:00",
  }),
  evidenceItem("EV-d8000000000d", "login_logs.csv", "csv", 0, CSV_UPLOAD, {
    event_type: "login", host: "SYNTH-WS-01", event_time: "2026-10-03T10:00:00Z",
  }),
];

/**
 * The three action rows the real report carried after the S2 decisions:
 * rejected, still awaiting approval, and approved -> executed -> ineffective
 * (the backend stores the last as status "failed").
 */
export const REPORT_ACTION_ROWS: ReportActionRowDTO[] = [
  {
    action_id: "ACT-000000000002",
    playbook_step_id: "",
    phase: "containment",
    recommendation: "Host shows suspicious activity in current state.",
    status: "rejected",
    replaces_action_id: null,
    decided_by: "Analyst A",
    decided_at: "2026-10-12T02:45:53.486081+00:00",
    reason: "Synthetic test: not needed",
    executed_by: null,
    result: null,
    result_source: null,
  },
  {
    action_id: "ACT-000000000001",
    playbook_step_id: "",
    phase: "containment",
    recommendation: "Host shows suspicious activity in current state.",
    status: "awaiting_approval",
    replaces_action_id: null,
    decided_by: null,
    decided_at: null,
    reason: null,
    executed_by: null,
    result: null,
    result_source: null,
  },
  {
    action_id: "ACT-000000000003",
    playbook_step_id: "",
    phase: "containment",
    recommendation: "Host shows suspicious activity in current state.",
    status: "failed",
    replaces_action_id: null,
    decided_by: "Analyst A",
    decided_at: "2026-10-12T02:45:53.479117+00:00",
    reason: "",
    executed_by: null,
    result: "Suspicious outbound communication continued.",
    result_source: "simulator",
  },
];

function storedAction(
  actionId: string,
  planId: string,
  status: StoredActionDTO["status"],
  basedOnStateVersion: number,
  createdAt: string,
): StoredActionDTO {
  const decided = status !== "awaiting_approval" && status !== "recommended";
  return {
    action_id: actionId,
    case_id: "CASE-TEST0001",
    plan_id: planId,
    version: 1,
    based_on_state_version: basedOnStateVersion,
    proposal: {
      tool_name: "isolate_host",
      target_id: "HOST::SYNTH-LT-01",
      evidence_ids: ["EV-04000000000a", "EV-7b000000000c"],
      policy_refs: [],
      rationale: "Host shows suspicious activity in current state.",
      prerequisites: [],
      risk: "Temporary workstation connectivity loss.",
      expected_effect: "Prevent further outbound communication.",
      validation_checks: ["Verify suspicious outbound traffic stops."],
    },
    status,
    decided_by: decided ? "Analyst A" : null,
    decided_at: decided ? "2026-10-12T02:45:53.479117+00:00" : null,
    reason: decided ? "" : null,
    created_at: createdAt,
  };
}

/**
 * GET /cases/{id}/actions (BL-027): StoredAction docs, oldest first, one per
 * lifecycle status the S2 run produced plus an approved, not-yet-simulated
 * action. Plan IDs match PLANS_IN_DOC_ID_ORDER. The case is at state v3
 * (CASE_AT_STATE_3), so ACT-...1 (bound to v2) is stale.
 */
export const STORED_ACTIONS: StoredActionDTO[] = [
  storedAction("ACT-000000000001", "PLAN-f10000000001", "awaiting_approval", 2, "2026-10-12T02:43:38.193000Z"),
  storedAction("ACT-000000000002", "PLAN-730000000002", "rejected", 2, "2026-10-12T02:45:53.458164Z"),
  storedAction("ACT-000000000003", "PLAN-4e0000000003", "failed", 2, "2026-10-12T02:45:53.465000Z"),
  storedAction("ACT-000000000004", "PLAN-4e0000000003", "approved", 3, "2026-10-12T02:46:10.000000Z"),
];

/** GET /cases/{id} after one execution rebuilt the state to v3. */
export const CASE_AT_STATE_3: CaseDTO = {
  case_id: "CASE-TEST0001",
  title: "Synthetic login anomaly",
  description: "",
  status: "investigating",
  current_state_version: 3,
  created_at: "2026-10-12T02:43:36.585974Z",
  updated_at: "2026-10-12T10:45:53.508441+08:00",
};

/** GET /cases/{id}/action-results (BL-027): the S2 execute result, as stored. */
export const ACTION_RESULTS: ActionResultDTO[] = [
  {
    execution_id: "EXEC-000000000001",
    case_id: "CASE-TEST0001",
    action_id: "ACT-000000000003",
    tool_name: "isolate_host",
    target_id: "HOST::SYNTH-LT-01",
    execution_status: "completed",
    validation_status: "ineffective",
    observed_effect: "Suspicious outbound communication continued.",
    result_source: "simulator",
    created_at: "2026-10-12T02:45:53.499034+00:00",
  },
];

/** POST /cases/{id}/reports body (schema v1.2 shape), trimmed to synthetic values. */
export function reportBody(reportId: string, actions: ReportActionRowDTO[] = REPORT_ACTION_ROWS): StructuredReportDTO {
  return {
    report_id: reportId,
    incident_id: "CASE-TEST0001",
    version: 1,
    status: "draft",
    title: "Synthetic login anomaly",
    organisation: "Caventas Demo Organisation",
    playbook: { id: "PB-IR-001", version: "0.1" },
    policy_pack_version: "0.1-draft",
    planner_model: "fake-planner",
    current_state_version: 3,
    recovery_status: "investigating",
    plan_id: "PLAN-4e0000000003",
    plan_based_on_state_version: 3,
    plan_is_stale: false,
    created_at: "2026-10-12T02:45:53.540003+00:00",
    updated_at: "2026-10-12T02:45:53.540003+00:00",
    executive_summary: {
      text: "Draft generated from stored case records: 4 entities observed, 10 evidence records, 3 proposed actions, 0 open questions.",
      finding_ids: [],
    },
    classification: {
      incident_type: "other",
      status: "suspected",
      closure_reason: null,
      severity: "unknown",
      severity_reason: "Not assessed by the prototype.",
      confidence: 0,
      current_phase: "containment",
      attack_techniques: [],
      confirmed_by_analyst: false,
    },
    affected: [],
    exposed_credentials: [],
    timeline: [],
    findings: [],
    root_cause: { text: "", finding_ids: [], status: "hypothesis" },
    impact: { operational: "", personal_data_involved: "unknown" },
    actions,
    evidence_preservation: [],
    notifications: [],
    recommendations: [],
    open_questions: [],
    metrics: { analyst_decisions: 2 },
    policy_conformance: [],
    sign_off: null,
    evidence_index: [],
    pdf_path: `/srv/backend/reports/${reportId}.pdf`,
  };
}
