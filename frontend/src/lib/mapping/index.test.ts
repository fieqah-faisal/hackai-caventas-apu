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

  it("keeps the PDF unavailable (pdf_path is a server path)", () => {
    expect(toReportVM(reportBody("RPT-000000000001")).pdfAvailable).toBe(false);
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
