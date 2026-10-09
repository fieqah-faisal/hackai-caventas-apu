import { useState } from "react";
import { getProvider } from "@/lib/api";
import { useOutcome } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Icon } from "@/components/icons/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Mono } from "@/components/ui/Mono";
import { cx } from "@/lib/types";
import type { AnalysisVM } from "@/lib/types";
import { useWorkspace } from "../context";

const p = getProvider();

export function AnalysisTab() {
  const { caseId } = useWorkspace();
  const analysis = useOutcome<AnalysisVM>(() => p.getAnalysis(caseId), [caseId]);

  return (
    <AsyncBoundary outcome={analysis}>
      {(a) => (
        <div className="space-y-4">
          <Section title="Current classification">
            <p className="text-base text-text-primary">{a.classification ?? "Not yet classified."}</p>
          </Section>

          <Section title="Confidence">
            <div className="flex items-center gap-3">
              <span className="tnum text-xl font-bold text-text-primary">
                {a.confidence.value != null ? `${Math.round(a.confidence.value * 100)}%` : "—"}
              </span>
              <StatusBadge tone="info"><Icon name="info" size={18} className="mr-1" />Advisory</StatusBadge>
            </div>
            <p className="mt-1 text-meta text-text-muted">{a.confidence.basis}</p>
          </Section>

          <Section title="Affected entities">
            {a.affectedEntities.length === 0 ? (
              <p className="text-meta text-text-muted">None recorded.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {a.affectedEntities.map((e) => (
                  <li key={e.id}><StatusBadge>{e.type}: {e.name}</StatusBadge></li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="ATT&CK techniques">
            {a.attackTechniques.length === 0 ? (
              <p className="text-meta text-text-muted">None mapped.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {a.attackTechniques.map((t) => <Mono key={t} className="rounded border border-border-subtle px-1.5 py-0.5">{t}</Mono>)}
              </div>
            )}
          </Section>

          <Expandable title={`Missing evidence (${a.missingEvidence.length})`} items={a.missingEvidence} empty="No open evidence gaps." />
          <Expandable title={`Active hypotheses (${a.hypotheses.length})`} items={a.hypotheses} empty="No active hypotheses." />
        </div>
      )}
    </AsyncBoundary>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border-subtle bg-surface p-5">
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Expandable({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-md border border-border-subtle bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left"
      >
        <span className="text-base font-semibold text-text-primary">{title}</span>
        <Icon name="chevronRight" size={18} className={cx("text-text-muted transition-transform duration-180", open && "rotate-90")} />
      </button>
      {open && (
        <div className="border-t border-border-subtle px-5 py-3">
          {items.length === 0 ? (
            <p className="text-meta text-text-muted">{empty}</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-base text-text-secondary">
              {items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}