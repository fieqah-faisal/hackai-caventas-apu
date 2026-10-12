/**
 * Mapping-layer tests pinned to the bodies the real backend returned in the
 * link API-mode run (Firestore emulator, synthetic fixtures). Values are
 * synthetic; field names and value shapes are the real ones.
 */
import { describe, it, expect } from "vitest";
import type { AuditEventDTO } from "../api/dto";
import { auditSummary, mapAuditKind, toAuditEventVM } from "./index";

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
