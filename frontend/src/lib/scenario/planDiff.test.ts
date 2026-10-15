import { describe, it, expect } from "vitest";
import { computePlanDiff, diffIsMECE } from "./planDiff";
import { INFOSTEALER_REPLAN_EXPLANATION } from "./config";
import type { PlanVM, ResponsePlanActionVM } from "../types";

function action(id: string, tool: string, target: string, extra: Partial<ResponsePlanActionVM> = {}): ResponsePlanActionVM {
  return {
    actionId: id, version: 1, basedOnStateVersion: 1, stage: "containment",
    tool, target, targetType: "host", risk: "moderate", escalationRequired: false,
    approvalRequired: true, state: "proposed", rationale: "", policyRefs: [],
    evidenceIds: [], expectedEffect: "", validationChecks: [], ...extra,
  };
}

const v1: PlanVM = {
  planId: "P1", version: 1, basedOnStateVersion: 1, stage: "containment", createdAt: "", missingEvidence: [],
  planner: { kind: "deterministic", adapter: "test", model: null },
  actions: [
    action("a1", "isolate_host", "host-x"),
    action("a2", "preserve_evidence", "host-x"),
    action("a3", "reimage_host", "host-x"),
  ],
};

const v2: PlanVM = {
  planId: "P2", version: 2, basedOnStateVersion: 2, stage: "containment", createdAt: "", missingEvidence: [],
  planner: { kind: "deterministic", adapter: "test", model: null },
  actions: [
    action("a2", "preserve_evidence", "host-x"), // unchanged
    action("a3", "reimage_host", "host-x"), // unchanged key but host also newly re-targeted below
    action("b1", "revoke_sessions", "acct-y"), // added (new target)
    action("b2", "disable_account", "acct-y", { escalationRequired: true }), // policy_triggered
  ],
};

describe("plan diff (v1 -> v2)", () => {
  it("assigns every v2 action to exactly one category (MECE)", () => {
    const diff = computePlanDiff(v1, v2);
    expect(diffIsMECE(diff, v2)).toBe(true);
    const cats = new Set(["unchanged", "added", "replaced_or_insufficient", "policy_triggered"]);
    for (const e of diff.entries) expect(cats.has(e.category)).toBe(true);
  });

  it("categorises policy-triggered escalation actions", () => {
    const diff = computePlanDiff(v1, v2);
    const b2 = diff.entries.find((e) => e.action.actionId === "b2");
    expect(b2?.category).toBe("policy_triggered");
  });

  it("marks a brand-new target as added", () => {
    const diff = computePlanDiff(v1, v2);
    const b1 = diff.entries.find((e) => e.action.actionId === "b1");
    expect(b1?.category).toBe("added");
  });

  it("carries the exact re-plan explanation", () => {
    const diff = computePlanDiff(v1, v2);
    expect(diff.explanation).toBe(INFOSTEALER_REPLAN_EXPLANATION);
  });
});
