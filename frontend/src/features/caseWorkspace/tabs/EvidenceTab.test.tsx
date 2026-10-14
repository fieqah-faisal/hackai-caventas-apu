import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceContext } from "../context";

const p = vi.hoisted(() => ({ getEvidence: vi.fn(), uploadEvidence: vi.fn(), getCurrentState: vi.fn(), getPlans: vi.fn() }));
vi.mock("@/lib/api", () => ({ getProvider: () => p }));
import { EvidenceTab } from "./EvidenceTab";
const ok = (data: unknown) => ({ kind: "ok", value: { data, source: "real" } });

beforeEach(() => {
  p.getEvidence.mockReset().mockResolvedValue(ok([]));
  p.uploadEvidence.mockReset().mockResolvedValue(ok({ accepted: 1, newStateVersion: 2 }));
  p.getCurrentState.mockReset().mockResolvedValue(ok({ version: 2 }));
  p.getPlans.mockReset().mockResolvedValue(ok([{ version: 1, basedOnStateVersion: 1 }]));
});

it("uploads validated additional evidence, refreshes state and exposes explicit re-analysis", async () => {
  const refresh = vi.fn();
  const user = userEvent.setup();
  render(<MemoryRouter><WorkspaceContext.Provider value={{ caseId: "CASE-SYNTH", synthetic: false, refresh,
    header: {} as never, facts: { stateVersion: 1 } as never }}><EvidenceTab /></WorkspaceContext.Provider></MemoryRouter>);
  await user.upload(screen.getByLabelText("Additional evidence files"), new File(['{"host":"DEMO"}'], "batch.json", { type: "application/json" }));
  expect(await screen.findByText("Evidence ingested — State v2 created")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Plan v1 is based on State v1");
  expect(screen.getByRole("button", { name: "Analyze new evidence" })).toBeEnabled();
  expect(refresh).toHaveBeenCalled();
});

it("reports a backend-rejected upload with its reason", async () => {
  p.uploadEvidence.mockResolvedValue({ kind: "http_error", status: 400, detail: "invalid JSON" });
  const user = userEvent.setup();
  render(<MemoryRouter><WorkspaceContext.Provider value={{ caseId: "CASE-SYNTH", synthetic: false, refresh: vi.fn(),
    header: {} as never, facts: { stateVersion: 1 } as never }}><EvidenceTab /></WorkspaceContext.Provider></MemoryRouter>);
  const input = screen.getByLabelText("Additional evidence files");
  await user.upload(input, new File(["bad"], "bad.json", { type: "application/json" }));
  await waitFor(() => expect(screen.getByText(/bad.json: rejected — invalid JSON/)).toBeInTheDocument());
  expect(p.uploadEvidence).toHaveBeenCalledTimes(1);
});
