import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";

const p = vi.hoisted(() => ({
  synthetic: false,
  getCaseHeader: vi.fn().mockResolvedValue({ kind: "ok", value: { source: "real", data: {
    caseId: "CASE-SYNTH-1", title: "Synthetic demo", status: "investigating", severity: null,
    stage: null, recoveryStatus: null, updatedAt: "2026-10-14T00:00:00Z", agentState: null,
  } } }),
  getCaseFacts: vi.fn().mockResolvedValue({ kind: "ok", value: { source: "real", data: {
    evidenceUploaded: true, timelineReconstructed: true, stateVersion: 1, planningRunStarted: false,
    proposalExists: false, actionAwaitingDecision: false, reportEligible: false,
  } } }),
  getActiveAnalysisRun: vi.fn().mockResolvedValue({ kind: "ok", value: { source: "real", data: null } }),
}));
vi.mock("@/lib/api", () => ({ getProvider: () => p }));
import { CaseWorkspace } from "./CaseWorkspace";
import { AnalysisRunProvider } from "@/features/analysisRuns/AnalysisRunContext";

it("shows a persisted case ID, copies it with accessible feedback and enables the graph tab", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<MemoryRouter initialEntries={["/cases/CASE-SYNTH-1"]}><AnalysisRunProvider><Routes>
    <Route path="/cases/:caseId" element={<CaseWorkspace />}><Route index element={<p>Overview</p>} /></Route>
  </Routes></AnalysisRunProvider></MemoryRouter>);
  expect(await screen.findByText("Case ID: CASE-SYNTH-1")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Copy case ID" }));
  expect(writeText).toHaveBeenCalledWith("CASE-SYNTH-1");
  expect(screen.getByRole("status")).toHaveTextContent("Case ID copied");
  expect(screen.getByRole("tab", { name: "Incident Graph" })).toHaveAttribute("aria-selected", "false");
  expect(screen.getByRole("tab", { name: "Incident Graph" })).not.toHaveAttribute("aria-disabled", "true");
});
