import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanVM } from "@/lib/types";

const provider = vi.hoisted(() => ({
  getAnalystReviews: vi.fn(),
  getPlans: vi.fn(),
  createAnalystReview: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getProvider: () => provider }));

import { AnalystReviewsPanel } from "./AnalystReviewsPanel";

function plan(version: number, stateVersion: number): PlanVM {
  return {
    planId: `PLAN-${version}`, version, basedOnStateVersion: stateVersion,
    stage: "containment", createdAt: `2026-01-0${version}T00:00:00Z`, missingEvidence: [],
    planner: { kind: "deterministic", adapter: "test", model: null }, actions: [],
  };
}

const ok = <T,>(data: T) => ({ kind: "ok" as const, value: { data, source: "real" as const } });

describe("AnalystReviewsPanel", () => {
  beforeEach(() => {
    provider.getAnalystReviews.mockReset().mockResolvedValue(ok([]));
    provider.getPlans.mockReset().mockResolvedValue(ok([plan(1, 1), plan(2, 2)]));
    provider.createAnalystReview.mockReset().mockResolvedValue(ok({}));
  });

  it("is collapsed by default and disables stale plans", async () => {
    render(<AnalystReviewsPanel caseId="CASE-1" stateVersion={2} />);
    expect(screen.getByRole("button", { name: /Analyst reviews/i })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /Analyst reviews/i }));
    await waitFor(() => expect(screen.getByRole("option", { name: /Plan v1 — stale, based on State v1/ })).toBeDisabled());
    expect(screen.getByRole("option", { name: /Plan v2 — current/ })).toBeEnabled();
    expect(screen.getByRole("option", { name: /Case \(State v2\)/ })).toBeEnabled();
  });

  it("keeps case-level evidence requests available when every plan is stale", async () => {
    provider.getPlans.mockResolvedValue(ok([plan(1, 1)]));
    render(<AnalystReviewsPanel caseId="CASE-1" stateVersion={2} />);
    fireEvent.click(screen.getByRole("button", { name: /Analyst reviews/i }));
    expect(await screen.findByText("The latest plan is based on an older incident state. Re-run analysis before reviewing that plan.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Analyst"), { target: { value: "A. Analyst" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "SOC analyst" } });
    fireEvent.change(screen.getByLabelText("Review type"), { target: { value: "request_more_evidence" } });
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Collect the synthetic identity logs." } });
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    await waitFor(() => expect(provider.createAnalystReview).toHaveBeenCalledWith("CASE-1", expect.objectContaining({ targetType: "case", targetId: null, reviewType: "request_more_evidence", stateVersion: 2 })));
  });

  it("submits a selected current plan with its exact binding", async () => {
    render(<AnalystReviewsPanel caseId="CASE-1" stateVersion={2} />);
    fireEvent.click(screen.getByRole("button", { name: /Analyst reviews/i }));
    await screen.findByRole("option", { name: /Plan v2 — current/ });
    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "PLAN-2" } });
    fireEvent.change(screen.getByLabelText("Analyst"), { target: { value: "A. Analyst" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "SOC analyst" } });
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Current-state plan reviewed." } });
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    await waitFor(() => expect(provider.createAnalystReview).toHaveBeenCalledWith("CASE-1", expect.objectContaining({ targetType: "plan", targetId: "PLAN-2", planVersion: 2, stateVersion: 2 })));
  });
});
