import { useState } from "react";
import { getProvider } from "@/lib/api";
import { useOutcome } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/icons/Icon";
import { cx } from "@/lib/types";
import type { ReportVM, ReportSectionVM } from "@/lib/types";
import { useWorkspace } from "../context";

const p = getProvider();

export function ReportTab() {
  const { caseId } = useWorkspace();
  const report = useOutcome<ReportVM>(() => p.getReport(caseId), [caseId]);

  return (
    <AsyncBoundary outcome={report}>
      {(r) => <ReportView report={r} />}
    </AsyncBoundary>
  );
}

function ReportView({ report }: { report: ReportVM }) {
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface p-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{report.title}</h2>
          <p className="mt-0.5 text-meta text-text-muted">
            {report.organisation} · status {report.status}
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
            disabled
            title="PDF export is produced server-side and is not available for download in this prototype."
            leadingIcon={<Icon name="download" size={18} />}
          >
            PDF (unavailable)
          </Button>
        </div>
      </section>

      <div className="space-y-2">
        {report.sections.map((s) => (
          <ReportSection key={s.key} section={s} />
        ))}
      </div>

      <p className="text-meta text-text-muted">
        The completeness indicator counts record-backed sections present versus total; it is not an accuracy percentage. PDF rendering runs server-side and is not exposed as a download.
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