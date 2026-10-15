import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TimelineEventVM } from "@/lib/types";
import { TimelineTable } from "./TimelineTable";

const events: TimelineEventVM[] = [
  {
    id: "TL-LATE", time: "2026-01-02T00:00:00Z", label: "Later event", kind: "relevant",
    relationshipStatus: "inferred", evidenceId: "EV-LATE", eventType: "network_upload",
    source: "edr", actor: "analyst-user", subject: "HOST::SYNTH", result: "allowed",
    details: { destination_ip: "203.0.113.10" }, evidenceIds: ["EV-LATE"], entityIds: ["HOST::SYNTH"],
    relevance: "attack", severity: "high", rawDescription: "network_upload: destination_ip=203.0.113.10",
  },
  {
    id: "TL-EARLY", time: "2026-01-01T00:00:00Z", label: "Earlier event", kind: "benign_decoy",
    relationshipStatus: "observed", evidenceId: null, eventType: "change_record", source: "itsm",
    details: {}, evidenceIds: [], entityIds: [], relevance: "context", severity: null, rawDescription: "",
  },
];

describe("TimelineTable", () => {
  it("sorts, filters, links evidence, and exposes technical details", () => {
    render(<TimelineTable caseId="CASE-1" events={events} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Earlier event")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "EV-LATE" })[0]).toHaveAttribute("href", "/cases/CASE-1/evidence?evidence=EV-LATE");

    fireEvent.change(screen.getByLabelText("Timeline order"), { target: { value: "newest" } });
    expect(within(screen.getAllByRole("row")[1]).getByText("Later event")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter by source"), { target: { value: "itsm" } });
    expect(screen.queryByText("Later event")).not.toBeInTheDocument();
    expect(screen.getAllByText("Earlier event").length).toBeGreaterThan(0);
  });

  it("renders an honest filtered empty state", () => {
    render(<TimelineTable caseId="CASE-1" events={events} />);
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "inferred" } });
    fireEvent.change(screen.getByLabelText("Filter by relevance"), { target: { value: "context" } });
    expect(screen.getByText("No timeline events match the selected filters.")).toBeInTheDocument();
  });
});
