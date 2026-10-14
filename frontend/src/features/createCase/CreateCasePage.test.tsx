import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";

const provider = vi.hoisted(() => ({
  createCase: vi.fn(),
  uploadEvidence: vi.fn(),
  countEvidence: vi.fn(),
  createAnalysisRun: vi.fn(),
  getActiveAnalysisRun: vi.fn(),
  getAnalysisRun: vi.fn(),
  synthetic: false,
}));
vi.mock("@/lib/api", () => ({
  getProvider: () => provider,
  resolveMode: () => "api",
}));

import { CreateCasePage } from "./CreateCasePage";
import { AnalysisRunProvider } from "@/features/analysisRuns/AnalysisRunContext";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("CreateCasePage planning request", () => {
  beforeEach(() => {
    provider.createCase.mockReset().mockResolvedValue({ kind: "ok", value: { data: { caseId: "CASE-TEST" }, source: "real" } });
    provider.uploadEvidence.mockReset().mockResolvedValue({ kind: "ok", value: { data: { accepted: 1 }, source: "real" } });
    provider.countEvidence.mockReset().mockResolvedValue({ kind: "ok", value: { data: { count: 1, sources: ["evidence.json"] }, source: "real" } });
    provider.createAnalysisRun.mockReset();
  });

  it("shows long-running progress and prevents a duplicate planning request", async () => {
    const run = deferred<{ kind: "http_error"; status: number; detail: string }>();
    provider.createAnalysisRun.mockReturnValue(run.promise);
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <AnalysisRunProvider><ToastProvider><CreateCasePage /></ToastProvider></AnalysisRunProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Case title"), "Pending planner test");
    await user.click(screen.getByRole("button", { name: "Create case & continue" }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["{}"], "evidence.json", { type: "application/json" }));
    await user.click(screen.getByRole("button", { name: /Evidence review$/ }));
    await user.click(screen.getByRole("button", { name: "Confirm review & continue" }));

    const start = screen.getByRole("button", { name: /^Start analysis$/ });
    await user.dblClick(start);

    expect(provider.createAnalysisRun).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Analyzing evidence…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Requesting a persisted analysis run");

    await act(async () => run.resolve({ kind: "http_error", status: 500, detail: "planner failed" }));
    expect(await screen.findByRole("button", { name: /^Start analysis$/ })).toBeEnabled();
  });
});
