import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { WorkspaceContext } from "../context";
import type { IncidentSnapshotVM } from "@/lib/types";

vi.mock("@xyflow/react", () => ({ ReactFlow: ({ nodes, edges }: { nodes: unknown[]; edges: unknown[] }) =>
  <div aria-label="Graph canvas">{nodes.length} nodes · {edges.length} edges</div>,
  Background: () => null, Controls: () => null, Handle: () => null,
  Position: { Left: "left", Right: "right" }, MarkerType: { ArrowClosed: "arrowclosed" } }));
const p = vi.hoisted(() => ({ getStateHistory: vi.fn(), getStateVersion: vi.fn() }));
vi.mock("@/lib/api", () => ({ getProvider: () => p }));
import { IncidentGraphTab } from "./IncidentGraphTab";

const base: IncidentSnapshotVM = {
  caseId: "CASE-SYNTH", version: 1, parentVersion: null, changeReason: "first evidence", createdFrom: "evidence_upload",
  createdAt: "2026-10-14T00:00:00Z", entities: [{ id: "HOST::DEMO", type: "host", name: "DEMO", attributes: { origin: "synthetic" },
    evidenceIds: ["EV-1"], condition: null, firstSeen: null, lastSeen: null }], relationships: [], timeline: [], findings: [],
  attackMapping: [], hypotheses: [], missingEvidence: [], actions: [], actionResults: [], recoveryStatus: "investigating",
  observedResponseStatus: null, recommendedResponseFocus: null, responseObjective: null, responsePrerequisites: [],
  routingRationale: null, routingEvidenceIds: [], routingConfidence: null, routingTransition: null,
  reportSectionsComplete: [], reportSectionsPending: [], reportSectionsInvalidated: [], latestReportId: null,
  latestReportVersion: null, reportStatus: null,
};
const v2: IncidentSnapshotVM = { ...base, version: 2, parentVersion: 1, changeReason: "second evidence",
  relationships: [{ id: "REL-1", source: "HOST::DEMO", relation: "connected_to", target: "IP::203.0.113.2", category: "attack",
    status: "observed", evidenceIds: ["EV-2"], firstSeen: null, lastSeen: null, attributes: {}, actionId: null, executionId: null }],
  entities: [...base.entities, { ...base.entities[0], id: "IP::203.0.113.2", type: "ip", name: "203.0.113.2", evidenceIds: ["EV-2"] }] };
const ok = (data: unknown) => ({ kind: "ok", value: { data, source: "real" } });

it("renders selected version, accessible nodes/edges, provenance and parent diff", async () => {
  p.getStateHistory.mockResolvedValue(ok([1, 2].map((version) => ({ version, parentVersion: version === 2 ? 1 : null }))));
  p.getStateVersion.mockImplementation(async (_: string, version: number) => ok(version === 1 ? base : v2));
  const user = userEvent.setup();
  render(<MemoryRouter><WorkspaceContext.Provider value={{ caseId: "CASE-SYNTH", refresh: vi.fn(), synthetic: false,
    header: {} as never, facts: { stateVersion: 2 } as never }}><IncidentGraphTab /></WorkspaceContext.Provider></MemoryRouter>);
  await screen.findByText("2 nodes · 1 edges");
  expect(screen.getByLabelText("Relationship legend")).toHaveTextContent("source → target");
  await user.click(screen.getByRole("button", { name: "Accessible list" }));
  await user.click(screen.getByRole("button", { name: /DEMO · host/ }));
  expect(screen.getByLabelText("Graph detail")).toHaveTextContent("EV-1");
  expect(await screen.findByText(/Compared with parent State v1/)).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("State version"), "1");
  expect(await screen.findByRole("heading", { name: "Entities (1)" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Relationships (0)" })).toBeInTheDocument();
  expect(p.getStateVersion).toHaveBeenCalledWith("CASE-SYNTH", 1);
});
