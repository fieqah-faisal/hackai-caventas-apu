import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Outcome } from "@/lib/api/provider";
import type { ReportVM } from "@/lib/types";
import { toReportVM } from "@/lib/mapping";
import { reportBody } from "@/test/realBackendBodies";
import { WorkspaceContext, type WorkspaceCtx } from "../context";

const provider = vi.hoisted(() => ({
  getReport: vi.fn(),
  generateReport: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getProvider: () => provider }));

import { ReportTab } from "./ReportTab";

const ctx: WorkspaceCtx = {
  caseId: "CASE-TEST0001",
  header: {
    caseId: "CASE-TEST0001",
    title: "Synthetic login anomaly",
    description: "Synthetic test case",
    status: "investigating",
    severity: null,
    stage: "containment",
    recoveryStatus: "investigating",
    updatedAt: "2026-10-12T02:45:53.508441+00:00",
    agentState: null,
  },
  facts: {
    evidenceUploaded: true,
    timelineReconstructed: true,
    planningRunStarted: true,
    proposalExists: true,
    actionAwaitingDecision: true,
    reportEligible: true,
  },
  synthetic: false,
  refresh: () => {},
};

function renderTab() {
  return render(
    <WorkspaceContext.Provider value={ctx}>
      <ReportTab />
    </WorkspaceContext.Provider>,
  );
}

const REPORT: ReportVM = toReportVM(reportBody("RPT-000000000001"));
const okNull: Outcome<ReportVM | null> = { kind: "ok", value: { data: null, source: "real" } };

describe("ReportTab (H4: generate only on explicit action)", () => {
  beforeEach(() => {
    provider.getReport.mockReset();
    provider.generateReport.mockReset();
  });

  it("loading the tab only reads; it never generates a report", async () => {
    provider.getReport.mockResolvedValue(okNull);
    renderTab();
    expect(await screen.findByText("No report generated yet")).toBeInTheDocument();
    expect(provider.getReport).toHaveBeenCalledWith("CASE-TEST0001");
    expect(provider.generateReport).not.toHaveBeenCalled();
  });

  it("Generate report calls the backend once and shows the confirmed report", async () => {
    provider.getReport.mockResolvedValueOnce(okNull).mockResolvedValue({ kind: "ok", value: { data: REPORT, source: "real" } });
    provider.generateReport.mockResolvedValue({ kind: "ok", value: { data: REPORT, source: "real" } });
    renderTab();

    await userEvent.click(await screen.findByRole("button", { name: /generate report/i }));

    expect(await screen.findByRole("heading", { name: "Synthetic login anomaly" })).toBeInTheDocument();
    expect(provider.generateReport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /download pdf/i })).toHaveAttribute(
      "href",
      "/api/cases/CASE-TEST0001/reports/RPT-000000000001/pdf",
    );
  });

  it("a failed generation shows an error and no report", async () => {
    provider.getReport.mockResolvedValue(okNull);
    provider.generateReport.mockResolvedValue({ kind: "http_error", status: 500, detail: "Internal Server Error" });
    renderTab();

    await userEvent.click(await screen.findByRole("button", { name: /generate report/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Report not generated: Internal Server Error");
    await waitFor(() => expect(screen.getByText("No report generated yet")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Synthetic login anomaly" })).not.toBeInTheDocument();
  });

  it("labels analysis from a plan bound to an older state", async () => {
    const stale = { ...REPORT, stateVersion: 3, planStateVersion: 2, planIsStale: true };
    provider.getReport.mockResolvedValue({ kind: "ok", value: { data: stale, source: "real" } });
    renderTab();

    expect(await screen.findByRole("status")).toHaveTextContent("latest plan is stale");
    expect(screen.getByText(/plan PLAN-4e0000000003 on state v2/)).toBeInTheDocument();
  });

  it("renders decision-oriented sections and keeps technical detail collapsed", async () => {
    provider.getReport.mockResolvedValue({ kind: "ok", value: { data: REPORT, source: "real" } });
    renderTab();

    expect(await screen.findByRole("heading", { name: "Incident overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Executive summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Key findings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actions and outcomes" })).toBeInTheDocument();
    expect(screen.queryByText("Raw chronology")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /technical appendices/i }));
    expect(screen.getByText("Raw chronology")).toBeInTheDocument();
    expect(screen.getByText("Evidence index")).toBeInTheDocument();
  });

  it("renders immutable activity facts and collapses the decision trace by default", async () => {
    const auditable: ReportVM = {
      ...REPORT,
      agentDecisionTrace: [{
        stepId: "TRACE-0001", runId: "RUN-1", sequence: 1, step: "analyze", status: "completed",
        message: "Analysis completed.", stateVersion: 2, startedAt: "2026-01-01T00:00:00Z",
        completedAt: "2026-01-01T00:00:01Z", durationMs: 1000, evidenceIds: ["EV-1"],
        guidanceIds: [], outputRefs: [], decisionSummary: "One stored record was analyzed.",
        validationSummary: "", plannerKind: "deterministic", plannerAdapter: "FakePlannerAdapter", plannerModel: null,
      }],
      investigationActivity: [{
        eventId: "ACTIVITY-APPROVAL-1", timestamp: "2026-01-01T00:00:02Z", actorType: "analyst",
        actor: "A. Analyst", role: "soc_analyst", eventType: "action_rejected", targetType: "action",
        targetId: "ACT-1", stateVersion: 2, planId: "PLAN-1", actionId: "ACT-1",
        summary: "Action ACT-1 was rejected.", reason: "Target ownership was not established.", outcome: "rejected",
        references: ["ACT-1"], actionName: "isolate_host", actionTarget: "HOST::SYNTH", replacementPlanId: null,
      }],
    };
    provider.getReport.mockResolvedValue({ kind: "ok", value: { data: auditable, source: "real" } });
    renderTab();

    const traceHeading = await screen.findByText("Agent Decision Trace");
    expect(traceHeading.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Analyst Activity and Approval Log" })).toBeInTheDocument();
    expect(screen.getByText("Reason: Target ownership was not established.")).toBeInTheDocument();
  });
});
