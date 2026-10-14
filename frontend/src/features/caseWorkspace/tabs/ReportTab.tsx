import { useState } from "react";
import { getProvider } from "@/lib/api";
import { outcomeMessage, useOutcome } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Region";
import { Icon } from "@/components/icons/Icon";
import { relativeTime } from "@/lib/format";
import { cx } from "@/lib/types";
import type { ReportVM, ReportSectionVM } from "@/lib/types";
import { useWorkspace } from "../context";

const p = getProvider();

export function ReportTab() {
  const { caseId } = useWorkspace();
  // Keyed by case so generation state never carries over between cases.
  return <ReportPanel key={caseId} caseId={caseId} />;
}

function ReportPanel({ caseId }: { caseId: string }) {
  // Loading the tab only READS. Generating is an explicit analyst action:
  // each generation stores a new report version, a PDF and an audit event.
  const report = useOutcome<ReportVM | null>(() => p.getReport(caseId), [caseId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const out = await p.generateReport(caseId);
    setBusy(false);
    // Show a report only once the backend has confirmed it.
    if (out.kind === "ok") report.retry();
    else setError(outcomeMessage(out));
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md border border-status-danger/45 bg-surface px-4 py-2 text-meta text-status-danger">
          Report not generated: {error}
        </p>
      )}
      <AsyncBoundary outcome={report}>
        {(r) =>
          r ? (
            <ReportView report={r} busy={busy} onGenerate={generate} />
          ) : (
            <section className="rounded-md border border-border-subtle bg-surface">
              <EmptyState
                icon={<Icon name="report" size={24} />}
                title="No report generated yet"
                hint="Generating builds a draft from the stored case records and stores it as a new report version with an audit event."
                action={
                  <Button variant="primary" size="sm" disabled={busy} onClick={generate} leadingIcon={<Icon name="report" size={18} />}>
                    {busy ? "Generating…" : "Generate report"}
                  </Button>
                }
              />
            </section>
          )
        }
      </AsyncBoundary>
    </div>
  );
}

function ReportView({ report, busy, onGenerate }: { report: ReportVM; busy: boolean; onGenerate: () => void }) {
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface p-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{report.title}</h2>
          <p className="mt-0.5 text-meta text-text-muted">
            {report.organisation} · report v{report.version} · status {report.status} · generated {relativeTime(report.generatedAt)}
          </p>
          <p className="mt-1 text-meta text-text-muted">
            State {report.stateVersion == null ? "not recorded" : `v${report.stateVersion}`}
            {report.recoveryStatus ? ` · recovery ${report.recoveryStatus}` : ""}
            {report.planId ? ` · plan ${report.planId}${report.planStateVersion == null ? "" : ` on state v${report.planStateVersion}`}` : " · no plan recorded"}
            {report.plannerModel ? ` · model ${report.plannerModel}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="tnum text-base font-semibold text-text-primary">
              {report.completeness.present}/{report.completeness.total}
            </div>
            <div className="text-meta text-text-muted">sections populated</div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onGenerate}
            title="Builds a new report version from the current case records."
            leadingIcon={<Icon name="reload" size={18} />}
          >
            {busy ? "Generating…" : "Regenerate"}
          </Button>
          {report.pdfAvailable && (
            <a
              href={`/api/cases/${encodeURIComponent(report.caseId)}/reports/${encodeURIComponent(report.reportId)}/pdf`}
              download={`${report.reportId}.pdf`}
              className="inline-flex h-7 items-center justify-center gap-2 rounded border border-border-strong bg-surface-raised px-2.5 text-btn font-semibold text-text-primary transition-colors duration-180 hover:bg-surface-hover focus-visible:outline-none"
            >
              <Icon name="download" size={18} /> Download PDF
            </a>
          )}
        </div>
      </section>

      {report.planIsStale && (
        <p role="status" className="rounded-md border border-status-warning/45 bg-surface px-4 py-2 text-meta text-text-secondary">
          The latest plan is stale for this incident state. Its narrative classification and open questions are retained as historical analysis bound to the earlier state; actions retain their own plan and state references.
        </p>
      )}

      <div className="space-y-2">
        {report.sections.map((s) => (
          <ReportSection key={s.key} section={s} />
        ))}
      </div>

      <p className="text-meta text-text-muted">
        The completeness indicator counts record-backed sections present versus total; it is not an accuracy percentage.
      </p>
    </div>
  );
}

function ReportSection({ section }: { section: ReportSectionVM }) {
  const [open, setOpen] = useState(section.present);
  return (
    <section className="rounded-md border border-border-subtle bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-base font-semibold text-text-primary">{section.title}</span>
          {!section.present && <span className="rounded border border-border-subtle px-1.5 py-0.5 text-2xs text-text-muted">empty</span>}
        </span>
        <Icon name="chevronRight" size={18} className={cx("text-text-muted transition-transform duration-180", open && "rotate-90")} />
      </button>
      {open && (
        <div className="border-t border-border-subtle px-5 py-3">
          {section.lines.length === 0 ? (
            <p className="text-meta text-text-muted">No record-backed content for this section.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-base text-text-secondary">
              {section.lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
