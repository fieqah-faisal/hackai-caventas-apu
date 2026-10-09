import { useState } from "react";
import { getProvider } from "@/lib/api";
import { useOutcome } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Icon, type IconName } from "@/components/icons/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { relativeTime } from "@/lib/format";
import { cx } from "@/lib/types";
import type { EvidenceItemVM, TimelineEventVM, TimelineKind } from "@/lib/types";
import { useWorkspace } from "../context";
import { DetailPanel } from "../DetailPanel";
import { Mono } from "@/components/ui/Mono";

const p = getProvider();

const KIND_META: Record<TimelineKind, { icon: IconName; label: string; tone: "neutral" | "info" | "warning" | "accent" }> = {
  relevant: { icon: "timeline", label: "Relevant", tone: "info" },
  benign_decoy: { icon: "info", label: "Benign / decoy", tone: "neutral" },
  analyst_added: { icon: "note", label: "Analyst-added", tone: "accent" },
  newly_introduced: { icon: "warning", label: "New evidence", tone: "warning" },
};

export function TimelineTab() {
  const { caseId } = useWorkspace();
  const timeline = useOutcome<TimelineEventVM[]>(() => p.getTimeline(caseId), [caseId]);
  const [selected, setSelected] = useState<EvidenceItemVM | null>(null);
  const { notify } = useToast();

  async function openEvent(ev: TimelineEventVM) {
    if (!ev.evidenceId) {
      notify({ tone: "info", title: "No evidence linked", detail: "This timeline event has no associated evidence record." });
      return;
    }
    const res = await p.getEvidence(caseId);
    if (res.kind === "ok") {
      const match = res.value.data.find((e) => e.evidenceId === ev.evidenceId) ?? null;
      if (match) setSelected(match);
      else notify({ tone: "info", title: "Evidence not found", detail: ev.evidenceId });
    }
  }

  return (
    <div className="rounded-md border border-border-subtle bg-surface overflow-hidden">
      <AsyncBoundary outcome={timeline} skeletonRows={5} emptyWhen={(d) => d.length === 0} emptyTitle="No timeline events yet">
        {(events) => (
          <ol className="relative">
            {events.map((ev, i) => {
              const m = KIND_META[ev.kind];
              return (
                <li key={ev.id} className="flex gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
                  <div className="flex flex-col items-center">
                    <span className={cx("grid h-7 w-7 place-items-center rounded-full border", m.tone === "warning" ? "border-status-warning/40 text-status-warning" : m.tone === "accent" ? "border-accent/40 text-accent" : "border-border-strong text-text-muted")}>
                      <Icon name={m.icon} size={18} />
                    </span>
                    {i < events.length - 1 && <span aria-hidden className="mt-1 w-px flex-1 bg-border-subtle" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => openEvent(ev)}
                        className="truncate text-left text-base text-text-primary hover:text-accent"
                      >
                        {ev.label}
                      </button>
                      <StatusBadge tone={m.tone}>{m.label}</StatusBadge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-meta text-text-muted">
                      {ev.time && <span>{relativeTime(ev.time)}</span>}
                      <span aria-hidden>·</span>
                      <span>{ev.relationshipStatus}</span>
                      {ev.evidenceId && <><span aria-hidden>·</span><Mono>{ev.evidenceId}</Mono></>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </AsyncBoundary>

      <DetailPanel open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? "Evidence"}>
        {selected && (
          <dl className="space-y-3 text-base">
            <div><dt className="text-meta text-text-muted">Evidence ID</dt><dd className="mt-0.5"><Mono>{selected.evidenceId}</Mono></dd></div>
            <div><dt className="text-meta text-text-muted">Source</dt><dd className="mt-0.5 text-text-secondary"><Mono>{selected.sourceFile}</Mono> ({selected.sourceLocation})</dd></div>
            <div><dt className="text-meta text-text-muted">SHA-256</dt><dd className="mt-0.5"><Mono className="break-all">{selected.sha256}</Mono></dd></div>
            <div><dt className="text-meta text-text-muted">Fields</dt><dd><pre className="mono mt-1 overflow-x-auto rounded bg-canvas p-2 text-xs text-text-secondary">{JSON.stringify(selected.fields, null, 2)}</pre></dd></div>
          </dl>
        )}
      </DetailPanel>
    </div>
  );
}