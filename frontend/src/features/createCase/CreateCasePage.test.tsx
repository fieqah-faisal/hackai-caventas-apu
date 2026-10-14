import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";

const provider = vi.hoisted(() => ({
  createCase: vi.fn(),
  uploadEvidence: vi.fn(),
  countEvidence: vi.fn(),
  startRun: vi.fn(),
  synthetic: false,
}));
vi.mock("@/lib/api", () => ({
  getProvider: () => provider,
  resolveMode: () => "api",
}));

import { CreateCasePage } from "./CreateCasePage";

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
    provider.startRun.mockReset();
  });

  it("shows long-running progress and prevents a duplicate planning request", async () => {
    const run = deferred<{ kind: "http_error"; status: number; detail: string }>();
    provider.startRun.mockReturnValue(run.promise);
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <ToastProvider><CreateCasePage /></ToastProvider>
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

    expect(provider.startRun).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Analyzing evidence…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("up to 120 seconds");

    await act(async () => run.resolve({ kind: "http_error", status: 500, detail: "planner failed" }));
    expect(await screen.findByRole("button", { name: /^Start analysis$/ })).toBeEnabled();
  });
});
