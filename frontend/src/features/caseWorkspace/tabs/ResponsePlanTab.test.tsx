import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PlanVM, ResponsePlanActionVM } from "@/lib/types";
import { INFOSTEALER_REPLAN_EXPLANATION } from "@/lib/scenario/config";
import { WorkspaceContext, type WorkspaceCtx } from "../context";

const provider = vi.hoisted(() => ({ getPlans: vi.fn() }));
vi.mock("@/lib/api", () => ({ getProvider: () => provider }));

import { ResponsePlanTab } from "./ResponsePlanTab";

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
    agentState: "Plan v3 ready",
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

function renderWith(plans: PlanVM[]) {
  provider.getPlans.mockResolvedValue({ kind: "ok", value: { data: plans, source: "real" } });
  return render(
    <WorkspaceContext.Provider value={ctx}>
      <ResponsePlanTab />
    </WorkspaceContext.Provider>,
  );
}

const UNAVAILABLE = "One stored action reference could not be resolved.";

/** What RealProvider.getPlans returns for the S2 case: 3 plans, 1 action each, no detail. */
function apiPlan(version: number): PlanVM {
  return {
    planId: `PLAN-00000000000${version}`,
    version,
    basedOnStateVersion: 2,
    stage: "containment",
    createdAt: `2026-10-12T02:45:5${version}.000000+00:00`,
    missingEvidence: [],
    planner: { kind: "unknown", adapter: "Not recorded", model: null },
    actions: [],
    actionsUnavailable: { count: 1, reason: UNAVAILABLE },
  };
}

function action(id: string, tool: string): ResponsePlanActionVM {
  return {
    actionId: id, version: 1, basedOnStateVersion: 1, stage: "containment",
    tool, target: "HOST::SYNTH-LT-01", targetType: "host", risk: "moderate",
    escalationRequired: false, approvalRequired: true, state: "proposed",
    rationale: "", policyRefs: [], evidenceIds: [], expectedEffect: "", validationChecks: [],
  };
}

describe("ResponsePlanTab honesty", () => {
  beforeEach(() => provider.getPlans.mockReset());

  it("API mode: says the plan has an unresolved action, never 'No actions'", async () => {
    renderWith([apiPlan(1), apiPlan(2), apiPlan(3)]);
    expect(await screen.findByText(/Plan v3 has 1 unresolved action reference\./)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(UNAVAILABLE.replace(/[.()]/g, "\\$&")))).toBeInTheDocument();
    expect(screen.queryByText(/No actions in the/)).not.toBeInTheDocument();
  });

  it("keeps resolved actions visible when another reference is unresolved", async () => {
    renderWith([{ ...apiPlan(1), actions: [action("a1", "isolate_host")] }]);
    expect(await screen.findByText("isolate_host")).toBeInTheDocument();
    expect(screen.getByText(/1 unresolved action reference/)).toBeInTheDocument();
  });

  it("API mode: shows no fixture re-plan copy, diff or 'New evidence received' badge", async () => {
    renderWith([apiPlan(1), apiPlan(2), apiPlan(3)]);
    await screen.findByRole("tab", { name: "Plan v3" });
    expect(screen.queryByText(INFOSTEALER_REPLAN_EXPLANATION)).not.toBeInTheDocument();
    expect(screen.queryByText("New evidence received")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-plan diff/i })).not.toBeInTheDocument();
  });

  it("a plan that truly has no actions says so for its own stage", async () => {
    renderWith([{ ...apiPlan(1), stage: "assessment", actionsUnavailable: undefined }]);
    expect(await screen.findByText("No actions in the Assessment stage.")).toBeInTheDocument();
  });

  it("fixture scenario: the provider-supplied re-plan explanation still drives the diff and badge", async () => {
    const v1: PlanVM = { ...apiPlan(1), actionsUnavailable: undefined, actions: [action("a1", "reimage_host")] };
    const v2: PlanVM = {
      ...apiPlan(2),
      actionsUnavailable: undefined,
      actions: [action("a1", "reimage_host"), action("b1", "revoke_sessions")],
      replanExplanation: INFOSTEALER_REPLAN_EXPLANATION,
    };
    renderWith([v1, v2]);
    expect(await screen.findByText(INFOSTEALER_REPLAN_EXPLANATION)).toBeInTheDocument();
    expect(screen.getByText("New evidence received")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide re-plan diff/i })).toBeInTheDocument();
    expect(screen.getByText("revoke_sessions")).toBeInTheDocument();
  });
});
