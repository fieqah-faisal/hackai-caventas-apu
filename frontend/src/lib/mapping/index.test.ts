/**
 * Mapping-layer tests pinned to the bodies the real backend returned in the
 * link API-mode run (Firestore emulator, synthetic fixtures). Values are
 * synthetic; field names and value shapes are the real ones.
 */
import { describe, it, expect } from "vitest";
import type { AuditEventDTO, ReportActionRowDTO } from "../api/dto";
import {
  ACTION_RESULTS,
  EVIDENCE_IN_DOC_ID_ORDER,
  PLANS_IN_DOC_ID_ORDER,
  REPORT_ACTION_ROWS,
  STORED_ACTIONS,
  reportBody,
} from "@/test/realBackendBodies";
import {
  API_REQUIRED_APPROVER,
  auditSummary,
  compareIsoInstants,
  inApprovalQueue,
  mapActionState,
  toApprovalItemVM,
  toExecutionResultVM,
  mapAuditKind,
  reportActionStage,
  reportDecision,
  sortEvidenceInUploadOrder,
  sortPlansOldestFirst,
  stageFromPlans,
  toAuditEventVM,
  toEvidenceItemVM,
  toReportVM,
} from "./index";

// Real GET /cases/{id}/audit rows: {audit_id, case_id, event_type, details, timestamp}.
const AUDIT_ROWS: AuditEventDTO[] = [
  {
    audit_id: "AUDIT-000000000001",
    case_id: "CASE-TEST0001",
    event_type: "case_created",
    details: { title: "Synthetic login anomaly" },
    timestamp: "2026-10-12T02:43:36.587030+00:00",
  },
  {
    audit_id: "AUDIT-000000000002",
    case_id: "CASE-TEST0001",
    event_type: "evidence_uploaded",
    details: {
      item_count: 4,
      source_file: "login_logs.csv",
      sha256: "0".repeat(64),
      stored_path: "/srv/backend/uploads/CASE-TEST0001/login_logs.csv",
      kind: "csv",
    },
    timestamp: "2026-10-12T02:43:36.679997+00:00",
  },
  {
    audit_id: "AUDIT-000000000003",
    case_id: "CASE-TEST0001",
    event_type: "action_executed",
    details: {
      execution_status: "completed",
      execution_id: "EXEC-000000000001",
      action_id: "ACT-000000000001",
      validation_status: "ineffective",
    },
    timestamp: "2026-10-12T02:45:53.501028+00:00",
  },
  {
    audit_id: "AUDIT-000000000004",
    case_id: "CASE-TEST0001",
    event_type: "report_generated",
    details: { report_id: "RPT-000000000001", pdf_path: "/srv/backend/reports/RPT-000000000001.pdf" },
    timestamp: "2026-10-12T02:46:10.000001+00:00",
  },
];

describe("audit mapping (real backend shape)", () => {
  it("maps every backend event_type onto the AuditKind union", () => {
    expect(mapAuditKind("case_created")).toBe("case_created");
    expect(mapAuditKind("evidence_uploaded")).toBe("evidence_ingested");
    expect(mapAuditKind("state_version_created")).toBe("state_version_created");
    expect(mapAuditKind("plan_created")).toBe("plan_created");
    expect(mapAuditKind("action_approved")).toBe("action_approved");
    expect(mapAuditKind("action_rejected")).toBe("action_rejected");
    expect(mapAuditKind("action_executed")).toBe("action_executed");
    expect(mapAuditKind("report_generated")).toBe("report_generated");
  });

  it("maps unknown event types to 'other'", () => {
    expect(mapAuditKind("approval_recorded")).toBe("other");
    expect(mapAuditKind("constructor")).toBe("other");
    expect(mapAuditKind("")).toBe("other");
  });

  it("coerces audit_id/event_type/timestamp/details into the view model", () => {
    const vm = toAuditEventVM(AUDIT_ROWS[1], "CASE-FALLBACK");
    expect(vm).toEqual({
      eventId: "AUDIT-000000000002",
      kind: "evidence_ingested",
      caseId: "CASE-TEST0001",
      summary: "evidence uploaded — source file: login_logs.csv, item count: 4",
      at: "2026-10-12T02:43:36.679997+00:00",
      payload: AUDIT_ROWS[1].details,
    });
  });

  it("maps the whole real body without throwing and keeps the backend order", () => {
    const vms = AUDIT_ROWS.map((r) => toAuditEventVM(r, "CASE-FALLBACK"));
    expect(vms.map((v) => v.kind)).toEqual([
      "case_created",
      "evidence_ingested",
      "action_executed",
      "report_generated",
    ]);
    expect(vms.map((v) => v.eventId)).toEqual(AUDIT_ROWS.map((r) => r.audit_id));
  });

  it("keeps execution and validation status as separate facts in the summary", () => {
    expect(toAuditEventVM(AUDIT_ROWS[2], "X").summary).toBe(
      "action executed — action id: ACT-000000000001, execution status: completed, validation status: ineffective",
    );
  });

  it("never puts server-local paths into the summary", () => {
    for (const row of AUDIT_ROWS) {
      const s = toAuditEventVM(row, "X").summary;
      expect(s).not.toContain("/srv/");
      expect(s).not.toContain(".pdf");
    }
  });

  it("falls back to the requested case id and tolerates missing details", () => {
    const vm = toAuditEventVM(
      { ...AUDIT_ROWS[0], case_id: "", details: undefined as unknown as Record<string, unknown> },
      "CASE-FALLBACK",
    );
    expect(vm.caseId).toBe("CASE-FALLBACK");
    expect(vm.summary).toBe("case created");
    expect(vm.payload).toEqual({});
  });

  it("summarises an unknown event type by its own name only", () => {
    expect(auditSummary("policy_checked", { secret_path: "/srv/x" })).toBe("policy checked");
  });
});

describe("plan ordering (real Firestore streams in document-ID order)", () => {
  it("compares the mixed timestamp formats the backend emits by instant", () => {
    // Same instant written three ways: Pydantic `Z`, isoformat `+00:00`, local `+08:00`.
    expect(compareIsoInstants("2026-10-12T02:45:53.458164Z", "2026-10-12T02:45:53.458164+00:00")).toBe(0);
    expect(compareIsoInstants("2026-10-12T10:45:53.470000+08:00", "2026-10-12T02:45:53.460138+00:00")).toBeGreaterThan(0);
    expect(compareIsoInstants("2026-10-12T02:45:53.458164Z", "2026-10-12T10:45:53.470000+08:00")).toBeLessThan(0);
    // Same millisecond: microseconds still order, across offsets too.
    expect(compareIsoInstants("2026-10-12T02:45:53.467100+00:00", "2026-10-12T02:45:53.467460+00:00")).toBeLessThan(0);
    expect(compareIsoInstants("2026-10-12T10:45:53.467900+08:00", "2026-10-12T02:45:53.467100Z")).toBeGreaterThan(0);
    // isoformat() drops the fraction when microsecond == 0.
    expect(compareIsoInstants("2026-10-12T02:45:53+00:00", "2026-10-12T02:45:53.000001+00:00")).toBeLessThan(0);
  });

  it("sorts plans oldest first by created_at without mutating the input", () => {
    const input = [...PLANS_IN_DOC_ID_ORDER];
    const sorted = sortPlansOldestFirst(input);
    expect(sorted.map((p) => p.plan_id)).toEqual(["PLAN-f10000000001", "PLAN-730000000002", "PLAN-4e0000000003"]);
    expect(input.map((p) => p.plan_id)).toEqual(PLANS_IN_DOC_ID_ORDER.map((p) => p.plan_id));
  });

  it("takes the stage from the newest plan, whatever the list order", () => {
    expect(stageFromPlans(PLANS_IN_DOC_ID_ORDER)).toBe("eradication");
    expect(stageFromPlans([...PLANS_IN_DOC_ID_ORDER].reverse())).toBe("eradication");
    expect(stageFromPlans([])).toBeNull();
  });
});

describe("evidence mapping (real field names and upload order)", () => {
  it("titles a record from the backend's normalized event_type", () => {
    const vm = toEvidenceItemVM(EVIDENCE_IN_DOC_ID_ORDER[1]);
    expect(vm.title).toBe("login_failed");
    expect(vm.sourceLocation).toBe("row 1");
  });

  it("still prefers a free-text event title, and falls back to the kind label", () => {
    const base = EVIDENCE_IN_DOC_ID_ORDER[0];
    expect(toEvidenceItemVM({ ...base, fields: { event: "Unsigned installer executed", event_type: "process_start" } }).title)
      .toBe("Unsigned installer executed");
    expect(toEvidenceItemVM({ ...base, fields: { host: "SYNTH-LT-01" } }).title).toBe("JSON record");
  });

  it("restores upload order (ingestion_time, then row) from document-ID order", () => {
    const sorted = sortEvidenceInUploadOrder(EVIDENCE_IN_DOC_ID_ORDER);
    expect(sorted.map((e) => e.fields.event_type)).toEqual(["login", "login_failed", "dns_query", "process_start"]);
    // Input untouched.
    expect(EVIDENCE_IN_DOC_ID_ORDER[0].evidence_id).toBe("EV-04000000000a");
  });
});

describe("report action wording keeps proposed / approved / executed / effective apart", () => {
  const lines = (key: string, actions: ReportActionRowDTO[] = REPORT_ACTION_ROWS) =>
    toReportVM(reportBody("RPT-000000000001", actions)).sections.find((s) => s.key === key)?.lines;

  it("derives the decision from the lifecycle status, never printing an outcome as a decision", () => {
    expect(reportDecision("approved")).toBe("approved");
    expect(reportDecision("verified")).toBe("approved");
    expect(reportDecision("failed")).toBe("approved");
    expect(reportDecision("rejected")).toBe("rejected");
    expect(reportDecision("awaiting_approval")).toBeNull();
    expect(reportDecision("recommended")).toBeNull();
  });

  it("decisions: an approved-then-ineffective action reads 'Approved by', not 'FAILED by'", () => {
    expect(lines("decisions")).toEqual([
      "Rejected by Analyst A: Host shows suspicious activity in current state. — reason: Synthetic test: not needed",
      "Approved by Analyst A: Host shows suspicious activity in current state.",
    ]);
    expect(lines("decisions")?.join(" ")).not.toMatch(/FAILED|failed/);
  });

  it("actions: each lifecycle status gets a label that separates the stages", () => {
    expect(lines("actions")).toEqual([
      "Rejected: Host shows suspicious activity in current state.",
      "Proposed, awaiting approval: Host shows suspicious activity in current state.",
      "Approved, sent to simulator, not validated effective: Host shows suspicious activity in current state.",
    ]);
    expect(reportActionStage("approved")).toBe("Approved, not yet simulated");
    expect(reportActionStage("verified")).toBe("Approved, simulated, validated effective");
    // "failed" also covers an execution that did not complete: never claim it ran.
    expect(reportActionStage("failed")).not.toMatch(/simulated|completed|executed/);
  });

  it("validation: shows the verdict next to the observed effect, only for executed actions", () => {
    expect(lines("validation")).toEqual([
      "Not validated effective: Host shows suspicious activity in current state. → Suspicious outbound communication continued.",
    ]);
    const verified: ReportActionRowDTO = { ...REPORT_ACTION_ROWS[2], status: "verified", result: "Outbound traffic stopped." };
    expect(lines("validation", [verified])).toEqual([
      "Validated effective: Host shows suspicious activity in current state. → Outbound traffic stopped.",
    ]);
  });

  it("shows not_applicable explicitly instead of treating it as proposed", () => {
    const odd: ReportActionRowDTO = { ...REPORT_ACTION_ROWS[2], status: "not_applicable" };
    expect(lines("decisions", [odd])).toEqual([
      "Decided by Analyst A (status not_applicable): Host shows suspicious activity in current state.",
    ]);
    expect(lines("actions", [odd])).toEqual(["Approved, simulated, not applicable: Host shows suspicious activity in current state."]);
    expect(lines("validation", [odd])).toEqual([
      "Validation not applicable: Host shows suspicious activity in current state. → Suspicious outbound communication continued.",
    ]);
  });

  it("marks the PDF downloadable through the report API", () => {
    expect(toReportVM(reportBody("RPT-000000000001")).pdfAvailable).toBe(true);
  });

  it("maps the complete v1.3 report contract without dropping authoritative fields", () => {
    const dto = reportBody("RPT-000000000001", [{
      ...REPORT_ACTION_ROWS[0],
      plan_id: "PLAN-1",
      based_on_state_version: 3,
      tool_name: "isolate_host",
      target_id: "HOST::SYNTH-LT-01",
      evidence_ids: ["EV-1"],
      policy_refs: ["POL-04"],
      required_approver: "soc_analyst",
      approver_role: "soc_analyst",
      policy_check: { result: "pass", reasons: ["role accepted"] },
    }]);
    dto.exposed_credentials = [{ service: "CRM", account: "synthetic.user", exposed: "session", status: "revoked", evidence_ids: ["EV-1"] }];
    dto.findings = [{ finding_id: "FND-01", summary: "Synthetic session reuse observed.", status: "hypothesis", confidence: 0.8, evidence_ids: ["EV-1"] }];
    dto.root_cause = { text: "Synthetic installer execution.", finding_ids: ["FND-01"], status: "hypothesis" };
    dto.impact = { operational: "Synthetic test disruption", personal_data_involved: "unknown" };
    dto.evidence_preservation = [{ evidence_id: "EV-1", item: "logs", stored_at: "case store", collected_by: "analyst", collected_at: dto.created_at, sha256: "abc" }];
    dto.notifications = [{ policy_rule_id: "POL-13", trigger: "synthetic trigger", triggered: "yes", notify: "it_manager", deadline_hours: 4, status: "pending", finding_ids: ["FND-01"] }];
    dto.recommendations = [{ text: "Harden synthetic sessions.", finding_ids: ["FND-01"], addresses_root_cause: true }];
    dto.policy_conformance = [{ policy_rule_id: "POL-04", requirement: "Analyst approval", result: "pass", reason: "Role accepted", related_ids: ["ACT-1"] }];
    dto.sign_off = { analyst: "Analyst A", role: "soc_analyst", decision: "return", at: dto.created_at, comments: "Draft only" };

    const vm = toReportVM(dto);
    const section = (key: string) => vm.sections.find((item) => item.key === key);

    expect(vm).toMatchObject({
      version: 1,
      plannerModel: "fake-planner",
      stateVersion: 3,
      planId: "PLAN-4e0000000003",
      planStateVersion: 3,
      planIsStale: false,
    });
    for (const key of ["exposed_credentials", "findings", "root_cause", "impact", "action_policy", "evidence_preservation", "notifications", "recommendations", "metrics", "policy_conformance", "sign_off"]) {
      expect(section(key)?.present, key).toBe(true);
    }
    expect(section("action_policy")?.lines[0]).toContain("isolate_host → HOST::SYNTH-LT-01");
    expect(section("findings")?.lines[0]).toContain("EV-1");
    expect(vm.completeness).toEqual({ present: 6, total: 8 });
    expect(vm.schemaVersion).toBe("legacy");
    expect(vm.entities.every((entity) => entity.relevance === "suspected_affected")).toBe(true);
  });

  it("prefers the typed v2 analyst report over legacy flattened sections", () => {
    const dto = reportBody("RPT-000000000002");
    dto.template_schema_version = "2.0";
    dto.analyst_report = {
      overview: {
        case_id: dto.incident_id,
        case_status: "active",
        incident_status: "not_an_incident",
        severity: "low",
        incident_type: "not_an_incident",
        current_phase: "assessment",
        primary_assets: [],
        state_version: 3,
        plan_id: dto.plan_id,
        plan_state_version: 3,
        plan_status: "current",
        planner_model: "fake-planner",
      },
      executive_summary: "Current records support authorized backup activity, not an incident.",
      executive_summary_source: "current_state_analysis",
      key_findings: [{
        id: "FND-01",
        title: "Authorized backup activity",
        summary: "The transfer matches an approved change record.",
        severity: "low",
        confidence: 0.9,
        status: "supported",
        affected_entity_ids: [],
        evidence_ids: ["EV-1"],
        attack_techniques: [],
        source: "planner_current_state",
      }],
      key_timeline: [{
        timestamp: dto.created_at,
        category: "context",
        event_type: "change_record",
        summary: "Approved backup window",
        significance: "Explains the observed transfer",
        entity_ids: ["HOST::FS-01"],
        evidence_ids: ["EV-1"],
        source: "itsm",
        material: true,
        raw_detail: "Approved backup window",
      }],
      entities: [{
        id: "HOST::FS-01",
        type: "host",
        display_name: "FS-01",
        role: "Observed endpoint",
        condition: "unknown",
        relevance: "contextual",
        relevance_reason: "Observed without an affected-state determination",
        evidence_count: 1,
        evidence_ids: ["EV-1"],
      }],
      response_actions: [],
      agent_decision_trace: [{
        step_id: "TRACE-0001", case_id: dto.incident_id, run_id: "RUN-1", sequence: 1,
        step: "analyze", status: "completed", message: "Analysis completed.", based_on_state_version: 3,
        started_at: dto.created_at, completed_at: dto.created_at, duration_ms: 12,
        evidence_ids: ["EV-1"], guidance_ids: [], output_refs: [],
        decision_summary: "One stored record was analyzed.", validation_summary: "",
        planner_kind: "deterministic", planner_adapter: "FakePlannerAdapter", planner_model: "deterministic-rules-v1",
      }],
      investigation_activity: [{
        event_id: "ACTIVITY-APPROVAL-1", timestamp: dto.created_at, actor_type: "analyst",
        actor: "A. Analyst", role: "soc_analyst", event_type: "action_rejected", target_type: "action",
        target_id: "ACT-1", state_version: 3, plan_id: dto.plan_id, action_id: "ACT-1",
        summary: "Action ACT-1 was rejected.", reason: "Target ownership was not established.", outcome: "rejected",
        references: ["ACT-1"], action_name: "isolate_host", action_target: "HOST::FS-01", replacement_plan_id: null,
      }],
      impact: { confirmed: [], potential: [], remaining_risk: [] },
      next_steps: [{ priority: "Low", text: "Close after analyst review.", owner: "SOC analyst", status: "open", related_ids: ["EV-1"] }],
      appendices: {
        evidence_index: [{ evidence_id: "EV-1", source_file: "batch.json", source_location: "row 1", timestamp: dto.created_at, event_type: "change_record", source: "itsm", sha256: "abc", untrusted: true }],
        raw_chronology: [],
        technical_findings: [],
        attack_mapping: [],
        provenance: { state_version: 3, plan_id: dto.plan_id, plan_state_version: 3, plan_is_stale: false, action_ids: [], execution_ids: [] },
      },
    };

    const vm = toReportVM(dto);
    expect(vm.schemaVersion).toBe("2.0");
    expect(vm.overview.incidentStatus).toBe("not_an_incident");
    expect(vm.findings[0].title).toBe("Authorized backup activity");
    expect(vm.timeline[0].category).toBe("context");
    expect(vm.entities[0].relevance).toBe("contextual");
    expect(vm.executiveSummary.source).toBe("current_state_analysis");
    expect(vm.appendices.evidence[0].untrusted).toBe(true);
    expect(vm.agentDecisionTrace[0].runId).toBe("RUN-1");
    expect(vm.investigationActivity[0].reason).toBe("Target ownership was not established.");
  });
});

describe("approvals queue mapping (GET /cases/{id}/actions, BL-027)", () => {
  it("never maps not_applicable or an unknown status to proposed", () => {
    expect(mapActionState("not_applicable")).toBe("not_applicable");
    expect(mapActionState("future_status" as never)).toBe("superseded");
  });
  it("queues only actions awaiting a decision or approved and not yet simulated", () => {
    expect(STORED_ACTIONS.map((a) => [a.status, inApprovalQueue(a.status)])).toEqual([
      ["awaiting_approval", true],
      ["rejected", false],
      ["failed", false],
      ["approved", true],
    ]);
    expect(inApprovalQueue("recommended")).toBe(true);
    expect(inApprovalQueue("verified")).toBe(false);
    // Unknown statuses (e.g. a future not_applicable) are not offered for a decision.
    expect(inApprovalQueue("not_applicable")).toBe(false);
  });

  it("maps a stored action into a queue item without inventing an approver role", () => {
    const vm = toApprovalItemVM(STORED_ACTIONS[0], { stage: "assessment", caseTitle: "Synthetic login anomaly", currentStateVersion: 2 });
    expect(vm).toEqual({
      actionId: "ACT-000000000001",
      actionVersion: 1,
      basedOnStateVersion: 2,
      caseId: "CASE-TEST0001",
      caseTitle: "Synthetic login anomaly",
      tool: "isolate_host",
      target: "HOST::SYNTH-LT-01",
      stage: "assessment",
      risk: "low",
      escalationRequired: true,
      requiredApprover: API_REQUIRED_APPROVER,
      rationale: "Host shows suspicious activity in current state.",
      policyRef: null,
      expectedEffect: "Prevent further outbound communication.",
      supportingEvidence: ["EV-04000000000a", "EV-7b000000000c"],
      state: "proposed",
      stalePrewarn: false,
    });
  });

  it("pre-warns when the action is bound to an older state version than the case's current one", () => {
    const ctx = { stage: "containment" as const, caseTitle: "t", currentStateVersion: 3 };
    expect(toApprovalItemVM(STORED_ACTIONS[0], ctx).stalePrewarn).toBe(true); // bound to v2
    expect(toApprovalItemVM(STORED_ACTIONS[3], ctx).stalePrewarn).toBe(false); // bound to v3
    expect(toApprovalItemVM(STORED_ACTIONS[3], ctx).state).toBe("approved");
  });

  it("maps a recorded result keeping execution and validation status apart", () => {
    const vm = toExecutionResultVM(ACTION_RESULTS[0]);
    expect(vm.executionStatus).toBe("completed");
    expect(vm.validationStatus).toBe("ineffective");
    expect(vm).toMatchObject({ executionId: "EXEC-000000000001", actionId: "ACT-000000000003", resultSource: "simulator" });
  });
});
