import { modelReportedConfidence, readableValue } from "@/lib/format";
import { Mono } from "./Mono";
import { StatusBadge } from "./StatusBadge";

export interface FindingDisplayRow {
  key: string;
  title?: string | null;
  summary: string;
  status?: string | null;
  category?: string | null;
  severity?: string | null;
  affectedEntityIds?: string[];
  evidenceIds: string[];
  confidence: number | null;
}

export function FindingsTable({ rows }: { rows: FindingDisplayRow[] }) {
  if (!rows.length) {
    return <p className="text-meta text-text-muted">No structured findings are stored.</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-border-subtle">
      <table className="w-full min-w-[880px] border-collapse text-left text-meta">
        <thead>
          <tr className="border-b border-border-strong bg-surface-raised text-2xs uppercase tracking-wide text-text-muted">
            <th className="px-3 py-2">Status / category</th>
            <th className="px-3 py-2">Severity</th>
            <th className="px-3 py-2">Finding</th>
            <th className="px-3 py-2">Affected entities</th>
            <th className="px-3 py-2">Supporting evidence</th>
            <th className="px-3 py-2">Model-reported confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border-subtle align-top last:border-0">
              <td className="px-3 py-3">
                <StatusBadge>{readableValue(row.status || row.category)}</StatusBadge>
              </td>
              <td className="px-3 py-3 text-text-secondary">{readableValue(row.severity)}</td>
              <td className="max-w-sm px-3 py-3">
                {row.title && <span className="block font-semibold text-text-primary">{row.title}</span>}
                <span className="block leading-5 text-text-secondary">{row.summary}</span>
              </td>
              <td className="px-3 py-3 font-mono text-2xs text-text-secondary">
                {row.affectedEntityIds?.length ? row.affectedEntityIds.join(", ") : "Not established"}
              </td>
              <td className="px-3 py-3">
                {row.evidenceIds.length
                  ? <div className="flex max-w-xs flex-wrap gap-1">{row.evidenceIds.map((id) => <Mono key={id}>{id}</Mono>)}</div>
                  : <span className="text-text-muted">Not recorded</span>}
              </td>
              <td className="px-3 py-3 text-text-secondary">
                <span className="whitespace-nowrap">{modelReportedConfidence(row.confidence)}</span>
                {row.confidence != null && <span className="mt-1 block max-w-48 text-2xs text-text-muted">Advisory; not a calibrated probability.</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
