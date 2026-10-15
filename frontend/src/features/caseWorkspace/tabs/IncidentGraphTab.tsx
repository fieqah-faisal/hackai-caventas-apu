import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ReactFlow, Background, Controls, Handle, MarkerType, Position, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { getProvider } from "@/lib/api";
import { useOutcome, outcomeMessage } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { compareStates, graphLayout } from "@/lib/caseWorkspace/graph";
import type { IncidentEntityVM, IncidentRelationshipVM, IncidentSnapshotVM } from "@/lib/types";
import { useWorkspace } from "../context";

const p = getProvider();
const label = (text: string) => text.replace(/_/g, " ");
const edgeColour = { attack: "#ff5d5d", response: "#9ded00", context: "#68a0ff" } as const;

interface IncidentNodeData extends Record<string, unknown> {
  name: string;
  type: string;
  condition: string | null;
  evidenceCount: number;
  reference: boolean;
  selected: boolean;
}

function IncidentNode({ data }: NodeProps) {
  const node = data as IncidentNodeData;
  const border = node.condition === "compromised" ? "#ff5d5d"
    : node.condition === "recovered" ? "#9ded00"
      : node.condition === "isolated" || node.condition === "contained" ? "#f2b84b" : "#394558";
  return <div className="relative w-[230px] rounded-md border bg-surface-raised px-4 py-3 text-left text-text-primary"
    style={{ borderColor: node.selected ? "#9ded00" : border, boxShadow: node.selected ? "0 0 0 2px rgb(157 237 0 / 20%)" : undefined }}>
    <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-canvas !bg-status-info" />
    <strong className="block truncate">{node.reference ? `Action ${node.name}` : node.name}</strong>
    <small className="block text-text-secondary">{node.reference ? "action reference" : `${node.type} · ${node.condition ?? "unknown"} · ${node.evidenceCount} evidence`}</small>
    <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-canvas !bg-accent" />
  </div>;
}

const nodeTypes = { incident: IncidentNode };

class GraphBoundary extends Component<{ children: ReactNode; onFallback: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="alert">Graph canvas unavailable. <button className="underline text-status-info" onClick={this.props.onFallback}>Use accessible list</button></p> : this.props.children;
  }
}

export function IncidentGraphTab() {
  const { caseId, reloadKey } = useWorkspace();
  const navigate = useNavigate();
  const history = useOutcome(() => p.getStateHistory(caseId), [caseId, reloadKey]);
  const [version, setVersion] = useState<number | null>(null);
  const [parent, setParent] = useState<IncidentSnapshotVM | null>(null);
  const [parentReload, setParentReload] = useState(0);
  const [selection, setSelection] = useState<IncidentEntityVM | IncidentRelationshipVM | null>(null);
  const [view, setView] = useState<"graph" | "list">("graph");
  const hist = history.value?.data ?? [];
  const latest = hist[hist.length - 1]?.version;
  useEffect(() => { setVersion(null); setSelection(null); }, [caseId]);
  const selected = version ?? latest;
  const snapshot = useOutcome(() => selected == null
    ? Promise.resolve({ kind: "unsupported" as const, reason: "No incident-state version yet." })
    : p.getStateVersion(caseId, selected), [caseId, selected, reloadKey]);

  useEffect(() => {
    const pv = snapshot.value?.data.parentVersion;
    if (pv == null) { setParent(null); return; }
    let active = true;
    setParent(null);
    p.getStateVersion(caseId, pv).then((out) => { if (active) setParent(out.kind === "ok" ? out.value.data : null); });
    return () => { active = false; };
  }, [caseId, snapshot.value?.data.version, reloadKey, parentReload]);

  const s = snapshot.value?.data;
  const layout = useMemo(() => s ? graphLayout(s.entities, s.relationships) : null, [s]);
  const selectedId = selection?.id ?? null;
  const highlightedNodes = new Set<string>();
  const highlightedEdges = new Set<string>();
  if (selection && "type" in selection) {
    highlightedNodes.add(selection.id);
    for (const relationship of s?.relationships ?? []) {
      if (relationship.source === selection.id || relationship.target === selection.id) {
        highlightedEdges.add(relationship.id);
        highlightedNodes.add(relationship.source);
        highlightedNodes.add(relationship.target);
      }
    }
  } else if (selection) {
    highlightedEdges.add(selection.id);
    highlightedNodes.add(selection.source);
    highlightedNodes.add(selection.target);
  }
  const nodes: Node[] = (layout?.nodes ?? []).map(({ id, position, entity }) => ({ id, position, type: "incident",
    data: { name: entity?.name ?? id, type: entity?.type ?? "action", condition: entity?.condition ?? null,
      evidenceCount: entity?.evidenceIds.length ?? 0, reference: !entity, selected: selectedId === id },
    style: { opacity: selection && !highlightedNodes.has(id) ? 0.22 : 1, transition: "opacity 160ms ease" },
    draggable: false, selectable: true }));
  const edges: Edge[] = (layout?.edges ?? []).map((r) => ({ id: r.id, source: r.source, target: r.target,
    label: label(r.relation), markerEnd: { type: MarkerType.ArrowClosed, color: edgeColour[r.category], width: 24, height: 24 },
    style: { stroke: edgeColour[r.category], strokeWidth: selectedId === r.id ? 3.5 : 2.25,
      strokeDasharray: r.status === "inferred" ? "7 5" : undefined,
      opacity: selection && !highlightedEdges.has(r.id) ? 0.16 : 1, transition: "opacity 160ms ease" },
    labelStyle: { fill: "#ececed", fontSize: 12, fontWeight: 600 },
    labelBgPadding: [6, 4], labelBgBorderRadius: 3, labelBgStyle: { fill: "#141e2d", fillOpacity: 0.94 } }));
  const diff = s && parent ? compareStates(parent, s) : null;

  return <div className="space-y-4">
    <AsyncBoundary outcome={history} emptyWhen={(items) => items.length === 0} emptyTitle="No incident state yet" emptyHint="Upload evidence to reconstruct the incident state.">
      {(items) => <label className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
        State version <select aria-label="State version" value={selected ?? ""} onChange={(e) => { setVersion(Number(e.target.value)); setSelection(null); }}
          className="rounded border border-border-strong bg-surface px-2 py-1 text-text-primary">
          {items.map((m) => <option value={m.version} key={m.version}>State v{m.version}{m.version === latest ? " (current)" : ""}</option>)}
        </select>
        <span className="text-text-muted">Parent v{items.find((m) => m.version === selected)?.parentVersion ?? "—"}</span>
      </label>}
    </AsyncBoundary>
    {selected != null && <AsyncBoundary outcome={snapshot}>
      {(state) => <>
        <div className="rounded border border-border-subtle bg-surface p-4 text-sm text-text-secondary">
          <p>State v{state.version}{state.version === latest ? " · Current" : " · Historical"} · {state.createdFrom ?? "Source unavailable"} · {state.changeReason ?? "No change reason recorded"}</p>
          <p>Created {state.createdAt} · {state.entities.length} entities · {state.relationships.length} relationships · {state.timeline.length} timeline events</p>
        </div>
        <div className="flex gap-2"><button onClick={() => setView("graph")} aria-pressed={view === "graph"} className="rounded border px-3 py-1">Graph</button>
          <button onClick={() => setView("list")} aria-pressed={view === "list"} className="rounded border px-3 py-1">Accessible list</button></div>
        <div aria-label="Relationship legend" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded border border-border-subtle bg-surface px-3 py-2 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Direction: source → target</span>
          <span><i className="mr-1 inline-block h-0.5 w-5 bg-status-danger align-middle" />Attack</span>
          <span><i className="mr-1 inline-block h-0.5 w-5 bg-accent align-middle" />Response</span>
          <span><i className="mr-1 inline-block h-0.5 w-5 bg-status-info align-middle" />Context</span>
          <span><i className="mr-1 inline-block w-5 border-t-2 border-dashed border-text-muted align-middle" />Inferred</span>
        </div>
        {view === "graph" && <GraphBoundary key={state.version} onFallback={() => setView("list")}><div aria-label="Read-only incident graph" className="hidden h-[480px] w-full min-w-0 overflow-hidden rounded border border-border-subtle bg-canvas sm:block">
          <ReactFlow key={state.version} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.28, maxZoom: 1.05 }} minZoom={0.3} maxZoom={1.4} nodesConnectable={false} nodesDraggable={false}
            edgesReconnectable={false} deleteKeyCode={null}
            elementsSelectable onNodeClick={(_, node) => setSelection(state.entities.find((e) => e.id === node.id) ?? null)}
            onEdgeClick={(_, edge) => setSelection(state.relationships.find((r) => r.id === edge.id) ?? null)}>
            <Background color="#394558" gap={24} size={1} /><Controls showInteractive={false} />
          </ReactFlow>
        </div></GraphBoundary>}
        <div className={view === "graph" ? "sm:hidden" : ""}>
          <h2 className="text-base font-semibold">Entities and relationships</h2>
          <div className="grid gap-3 md:grid-cols-2"><div><h3>Entities ({state.entities.length})</h3><ul>
            {state.entities.map((e) => <li key={e.id}><button className="w-full border-b border-border-subtle p-2 text-left focus-visible:outline" onClick={() => setSelection(e)}>{e.name} · {e.type} · {e.condition ?? "unknown"}</button></li>)}
          </ul></div><div><h3>Relationships ({state.relationships.length})</h3><ul>
            {state.relationships.map((r) => <li key={r.id}><button className="w-full border-b border-border-subtle p-2 text-left focus-visible:outline" onClick={() => setSelection(r)}>{r.source} → {label(r.relation)} → {r.target} · {r.category} · {r.status}</button></li>)}
          </ul></div></div>
        </div>
        {selection && <section aria-label="Graph detail" className="rounded border border-border-strong bg-surface p-4 text-sm text-text-secondary">
          <div className="flex justify-between"><h2 className="text-base font-semibold text-text-primary">{ "type" in selection ? selection.name : label(selection.relation) }</h2>
            <button onClick={() => setSelection(null)} aria-label="Close graph detail">Close</button></div>
          <dl className="mt-2 space-y-1 break-all">
            {!("type" in selection) && <div><dt className="inline text-text-muted">Direction: </dt><dd className="inline mono">{selection.source} → {selection.target}</dd></div>}
            {Object.entries(selection).filter(([key]) => key !== "attributes" && key !== "evidenceIds").map(([key, value]) => <div key={key}><dt className="inline text-text-muted">{label(key)}: </dt><dd className="inline">{String(value ?? "—")}</dd></div>)}
            <div><dt>Evidence IDs</dt><dd>{selection.evidenceIds.length ? selection.evidenceIds.map((id) => <button key={id} className="mr-2 text-status-info underline" onClick={() => navigate(`/cases/${caseId}/evidence?evidence=${encodeURIComponent(id)}`)}>{id}</button>) : "None recorded"}</dd></div>
            <div><dt>Attributes</dt><dd><pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(selection.attributes, null, 2)}</pre></dd></div>
          </dl>
        </section>}
        {state.parentVersion != null && <section className="rounded border border-border-subtle bg-surface p-4">
          <h2 className="font-semibold">Compared with parent State v{state.parentVersion}</h2>
          {diff ? Object.entries(diff).map(([key, values]) => <p key={key} className="text-sm text-text-secondary">{label(key)}: {values.length ? values.join(", ") : "None"}</p>)
            : <p role="status">Parent comparison loading or unavailable. <button className="underline text-status-info" onClick={() => setParentReload((n) => n + 1)}>Retry comparison</button></p>}
        </section>}
      </>}
    </AsyncBoundary>}
    {snapshot.state === "error" && snapshot.failure && <p role="alert">{outcomeMessage(snapshot.failure)}</p>}
  </div>;
}
