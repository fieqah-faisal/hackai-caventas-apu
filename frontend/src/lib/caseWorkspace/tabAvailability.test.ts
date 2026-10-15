import { describe, it, expect } from "vitest";
import { tabAvailability, resolveSelectedTab } from "./tabAvailability";
import type { CaseFacts } from "../types";

const base: CaseFacts = {
  evidenceUploaded: false,
  timelineReconstructed: false,
  planningRunStarted: false,
  proposalExists: false,
  actionAwaitingDecision: false,
  reportEligible: false,
};

describe("tab availability state machine", () => {
  it("overview is always available", () => {
    expect(tabAvailability(base).overview.available).toBe(true);
  });

  it("gates each tab on its prerequisite", () => {
    const s = tabAvailability(base);
    expect(s.evidence.available).toBe(false);
    expect(s.analysis.available).toBe(false);
    expect(s.graph.available).toBe(false);
    expect(s.plan.available).toBe(false);
    expect(s.approvals.available).toBe(false);
    expect(s.report.available).toBe(false);
    const full = tabAvailability({
      evidenceUploaded: true,
      timelineReconstructed: true,
      stateVersion: 1,
      planningRunStarted: true,
      proposalExists: true,
      actionAwaitingDecision: true,
      reportEligible: true,
    });
    expect(Object.values(full).every((t) => t.available)).toBe(true);
  });

  it("latches Evidence and Timeline — they never relock once available", () => {
    const prev = { overview: true, evidence: true, timeline: true, analysis: true, plan: true, approvals: true, report: true };
    // facts regress (evidence/timeline false again), but prev says they were available
    const s = tabAvailability(base, prev);
    expect(s.evidence.available).toBe(true);
    expect(s.timeline.available).toBe(true);
    // non-latching tabs relock
    expect(s.analysis.available).toBe(false);
    expect(s.plan.available).toBe(false);
  });

  it("falls back to overview when the selected tab is unavailable", () => {
    const s = tabAvailability(base);
    expect(resolveSelectedTab("plan", s)).toBe("overview");
    expect(resolveSelectedTab("overview", s)).toBe("overview");
  });
});
