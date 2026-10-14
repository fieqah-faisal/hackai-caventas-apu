import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceContext } from "./context";

const provider = vi.hoisted(() => ({ createAnalysisRun: vi.fn(), getActiveAnalysisRun: vi.fn(), getAnalysisRun: vi.fn() }));
vi.mock("@/lib/api", () => ({ getProvider: () => provider }));
import { AgentRunPanel } from "./AgentRunPanel";
import { AnalysisRunProvider } from "@/features/analysisRuns/AnalysisRunContext";

const run = { runId: "RUN-1", caseId: "CASE-SYNTH", status: "running", stage: "running_planner",
  message: "Planner is processing the incident state.", basedOnStateVersion: 2, planId: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null, error: null };
const ok = (data: unknown) => ({ kind: "ok", value: { data, source: "real" } });

beforeEach(() => {
  provider.createAnalysisRun.mockReset();
  provider.getActiveAnalysisRun.mockReset().mockResolvedValue(ok(null));
  provider.getAnalysisRun.mockReset();
});

it("shows only the server's stage and prevents a second start while active", async () => {
  provider.createAnalysisRun.mockResolvedValue(ok(run));
  provider.getAnalysisRun.mockResolvedValue(ok(run));
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={["/cases/CASE-SYNTH/analysis"]}><AnalysisRunProvider><Routes>
    <Route path="/cases/CASE-SYNTH/analysis" element={<><WorkspaceContext.Provider value={{ caseId: "CASE-SYNTH", synthetic: false, refresh: vi.fn(),
      header: {} as never, facts: {} as never }}><AgentRunPanel /></WorkspaceContext.Provider><Link to="/">Dashboard</Link></>} />
    <Route path="/" element={<h1>Dashboard</h1>} />
  </Routes></AnalysisRunProvider></MemoryRouter>);
  await user.dblClick(screen.getByRole("button", { name: "Re-run analysis" }));
  await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("running planner: Planner is processing"));
  expect(provider.createAnalysisRun).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Stored plan .* ready/)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Minimise" }));
  await user.click(screen.getByRole("link", { name: "Dashboard" }));
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open analysis run for CASE-SYNTH" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Open analysis run for CASE-SYNTH" }));
  expect(screen.getByRole("dialog", { name: "Caventas analysis agent" })).toBeInTheDocument();
});

it("surfaces a sanitized failed run and offers retry", async () => {
  provider.getAnalysisRun.mockResolvedValue(ok({ ...run, status: "failed", stage: "failed", error: "planner request failed (upstream unavailable)" }));
  provider.getActiveAnalysisRun.mockResolvedValue(ok({ ...run, status: "failed", stage: "failed", error: "planner request failed (upstream unavailable)" }));
  render(<MemoryRouter initialEntries={["/cases/CASE-SYNTH/analysis"]}><AnalysisRunProvider><WorkspaceContext.Provider value={{ caseId: "CASE-SYNTH", synthetic: false,
    refresh: vi.fn(), header: {} as never, facts: {} as never }}><AgentRunPanel /></WorkspaceContext.Provider></AnalysisRunProvider></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("upstream unavailable");
  expect(screen.getByRole("button", { name: "Retry analysis" })).toBeEnabled();
});
