/**
 * Synthetic response bodies with the exact field names, value shapes and
 * ordering the real backend returned in the link API-mode run (Firestore
 * emulator). Shared by the mapping and RealProvider contract tests.
 */
import type { PlanDocDTO, ReportActionRowDTO, StructuredReportDTO } from "@/lib/api/dto";

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
