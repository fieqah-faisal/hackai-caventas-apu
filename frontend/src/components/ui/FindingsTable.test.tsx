import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FindingsTable } from "./FindingsTable";

describe("FindingsTable", () => {
  it("renders an honest empty state", () => {
    render(<FindingsTable rows={[]} />);
    expect(screen.getByText("No structured findings are stored.")).toBeInTheDocument();
  });

  it("renders partial findings without inventing missing facts", () => {
    render(<FindingsTable rows={[{ key: "one", summary: "Observed record.", evidenceIds: [], confidence: null }]} />);
    expect(screen.getAllByText("Not established")).toHaveLength(3);
    expect(screen.getAllByText("Not recorded")).toHaveLength(2);
  });

  it("labels populated confidence as model-reported and uncalibrated", () => {
    render(<FindingsTable rows={[{
      key: "FND-01",
      title: "Evidence-linked finding",
      summary: "Synthetic evidence supports review.",
      status: "hypothesis",
      severity: "medium",
      affectedEntityIds: ["HOST::SYNTH-01"],
      evidenceIds: ["EV-01"],
      confidence: 0.72,
    }]} />);
    expect(screen.getByText("72% model-reported")).toBeInTheDocument();
    expect(screen.getByText("Advisory; not a calibrated probability.")).toBeInTheDocument();
    expect(screen.queryByText(/validated confidence/i)).not.toBeInTheDocument();
  });
});
