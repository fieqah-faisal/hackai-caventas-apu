import { useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getProvider } from "@/lib/api";
import { useOutcome, outcomeMessage } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Icon, type IconName } from "@/components/icons/Icon";
import { Mono } from "@/components/ui/Mono";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { evidenceCategoryLabel, relativeTime } from "@/lib/format";
import { cx } from "@/lib/types";
import type { EvidenceCategory, EvidenceItemVM } from "@/lib/types";
import { isStale } from "@/lib/mapping/incidentState";
import { useWorkspace } from "../context";
import { DetailPanel } from "../DetailPanel";

const p = getProvider();

const FILTERS: { id: EvidenceCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "endpoint", label: "Endpoint" },
  { id: "identity", label: "Identity" },
  { id: "network", label: "Network" },
  { id: "application", label: "Application" },
  { id: "analyst_note", label: "Analyst Notes" },
];

const CATEGORY_ICON: Record<EvidenceCategory, IconName> = {
  endpoint: "endpoint",
  identity: "identity",
  network: "network",
  application: "application",
  analyst_note: "note",
  other: "file",
};

export function EvidenceTab() {
  const { caseId, reloadKey, refresh, facts } = useWorkspace();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const evidence = useOutcome<EvidenceItemVM[]>(() => p.getEvidence(caseId), [caseId, reloadKey]);
  const currentState = useOutcome(() => p.getCurrentState(caseId), [caseId, reloadKey]);
  const plans = useOutcome(() => p.getPlans(caseId), [caseId, reloadKey]);
  const [filter, setFilter] = useState<EvidenceCategory | "all">("all");
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null);
  const [stale, setStale] = useState<{ plan: number; bound: number } | null>(null);
  const [selected, setSelected] = useState<EvidenceItemVM | null>(null);

  const items = evidence.value?.data ?? [];
  const evidenceId = params.get("evidence");
  const shown = useMemo(() => evidenceId ? items.filter((i) => i.evidenceId === evidenceId)
    : filter === "all" ? items : items.filter((i) => i.category === filter), [items, filter, evidenceId]);
  const latestPlan = plans.value?.data[plans.value.data.length - 1];
  const stalePlan = stale ?? (latestPlan && isStale(latestPlan.basedOnStateVersion, facts.stateVersion ?? 0)
    ? { plan: latestPlan.version, bound: latestPlan.basedOnStateVersion } : null);

  async function upload(files: FileList | null) {
    if (!files || uploading) return;
    setUploading(true);
    setUploadError(null);
    const messages: string[] = [];
    let increased = false;
    let latest = facts.stateVersion ?? 0;
    for (const file of Array.from(files)) {
      if (!/\.(csv|json|txt)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
        messages.push(`${file.name}: rejected — CSV, JSON or TXT up to 10 MB only.`);
        continue;
      }
      const out = await p.uploadEvidence(caseId, file);
      if (out.kind !== "ok") { messages.push(`${file.name}: rejected — ${outcomeMessage(out)}`); continue; }
      const state = await p.getCurrentState(caseId);
      if (state.kind !== "ok") { setUploadError(`Upload accepted, but state confirmation failed: ${outcomeMessage(state)}`); continue; }
      if (state.value.data.version <= latest) {
        setUploadError(`${file.name}: upload was accepted, but the incident-state version did not advance. Retry the state read before re-analysis.`);
        continue;
      }
      latest = state.value.data.version;
      increased = true;
      messages.push(`${file.name}: accepted ${out.value.data.accepted} records; State v${latest}.`);
    }
    setFeedback(messages);
    if (increased) {
      setConfirmedVersion(latest);
      const plans = await p.getPlans(caseId);
      if (plans.kind === "ok") {
        const last = plans.value.data[plans.value.data.length - 1];
        setStale(last && isStale(last.basedOnStateVersion, latest) ? { plan: last.version, bound: last.basedOnStateVersion } : null);
      } else setUploadError(`Evidence ingested; plan status unavailable: ${outcomeMessage(plans)}`);
      refresh();
    }
    if (input.current) input.current.value = "";
    setUploading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded border border-border-subtle bg-surface p-3">
        <button disabled={uploading} onClick={() => input.current?.click()} className="rounded border border-accent/50 px-3 py-1 text-accent disabled:opacity-50">{uploading ? "Uploading evidence…" : "Upload more evidence"}</button>
        <span className="text-meta text-text-muted">CSV, JSON, TXT · 10 MB per file</span>
        <input ref={input} type="file" multiple accept=".csv,.json,.txt" className="sr-only" aria-label="Additional evidence files" onChange={(e) => void upload(e.target.files)} />
      </div>
      {feedback.length > 0 && <ul aria-live="polite" className="text-sm text-text-secondary">{feedback.map((line, i) => <li key={i}>{line}</li>)}</ul>}
      {uploadError && <p role="alert" className="text-status-danger">{uploadError}</p>}
      {(confirmedVersion ?? (currentState.value?.data.createdFrom === "evidence_upload" && currentState.value.data.version > 1
        ? currentState.value.data.version : null)) != null &&
        <p role="status" className="text-accent">Evidence ingested — State v{confirmedVersion ?? currentState.value?.data.version} created</p>}
      {stalePlan && <div role="alert" className="rounded border border-status-warning/40 p-3 text-status-warning">New evidence changed the incident state. Plan v{stalePlan.plan} is based on State v{stalePlan.bound} and must be reviewed. <button className="underline" onClick={() => navigate(`/cases/${caseId}/analysis`)}>Analyze new evidence</button></div>}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cx(
              "rounded border px-2.5 py-1 text-meta font-medium transition-colors duration-180",
              filter === f.id ? "border-accent/40 text-accent" : "border-border-subtle text-text-secondary hover:text-text-primary",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-md border border-border-subtle bg-surface overflow-hidden">
        <AsyncBoundary outcome={evidence} skeletonRows={4} emptyWhen={() => shown.length === 0} emptyTitle="No evidence in this filter">
          {() => (
            <ul>
              {shown.map((e) => (
                <li key={e.evidenceId}>
                  <button
                    onClick={() => setSelected(e)}
                    className="group flex w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-left last:border-b-0 hover:bg-surface-hover transition-colors duration-180"
                  >
                    <Icon name={CATEGORY_ICON[e.category]} size={20} className="text-text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base text-text-primary">{e.title}</span>
                      <span className="flex items-center gap-2 text-meta text-text-muted">
                        <Mono>{e.evidenceId}</Mono>
                        <span aria-hidden>·</span>
                        {evidenceCategoryLabel[e.category]}
                        {e.eventTime && <><span aria-hidden>·</span>{relativeTime(e.eventTime)}</>}
                      </span>
                    </span>
                    <StatusBadge tone={e.relationshipStatus === "observed" ? "neutral" : "info"}>
                      {e.relationshipStatus}
                    </StatusBadge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </div>

      <DetailPanel open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? "Evidence"}>
        {selected && (
          <dl className="space-y-3 text-base">
            <Field label="Evidence ID"><Mono>{selected.evidenceId}</Mono></Field>
            <Field label="Kind">{selected.kind.toUpperCase()}</Field>
            <Field label="Source file"><Mono>{selected.sourceFile}</Mono> ({selected.sourceLocation})</Field>
            <Field label="SHA-256"><Mono className="break-all">{selected.sha256}</Mono></Field>
            <Field label="State version"><Mono>v{selected.stateVersion}</Mono></Field>
            <Field label="Fields">
              <pre className="mono mt-1 overflow-x-auto rounded bg-canvas p-2 text-xs text-text-secondary">
                {JSON.stringify(selected.fields, null, 2)}
              </pre>
            </Field>
          </dl>
        )}
      </DetailPanel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-meta text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-text-secondary">{children}</dd>
    </div>
  );
}
