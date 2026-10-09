import { useMemo, useState } from "react";
import { getProvider } from "@/lib/api";
import { useOutcome } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Icon, type IconName } from "@/components/icons/Icon";
import { Mono } from "@/components/ui/Mono";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { evidenceCategoryLabel, relativeTime } from "@/lib/format";
import { cx } from "@/lib/types";
import type { EvidenceCategory, EvidenceItemVM } from "@/lib/types";
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
  const { caseId } = useWorkspace();
  const evidence = useOutcome<EvidenceItemVM[]>(() => p.getEvidence(caseId), [caseId]);
  const [filter, setFilter] = useState<EvidenceCategory | "all">("all");
  const [selected, setSelected] = useState<EvidenceItemVM | null>(null);

  const items = evidence.value?.data ?? [];
  const shown = useMemo(() => (filter === "all" ? items : items.filter((i) => i.category === filter)), [items, filter]);

  return (
    <div className="space-y-4">
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