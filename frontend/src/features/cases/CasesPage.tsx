import { useNavigate } from "react-router-dom";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import { Region } from "@/components/ui/Region";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SyntheticBadge } from "@/components/ui/SyntheticBadge";
import { getProvider } from "@/lib/api";
import { caseStatusLabel, relativeTime, stageLabel } from "@/lib/format";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { useOutcome } from "@/lib/useOutcome";
import type { CaseSummary } from "@/lib/types";

const provider = getProvider();

export function CasesPage() {
  useDocumentTitle("Cases");
  const navigate = useNavigate();
  const cases = useOutcome<CaseSummary[]>(() => provider.getCases());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-title font-bold text-text-primary">Cases</h1>
          <p className="mt-2 text-desc text-text-secondary">Persisted incident cases, newest activity first.</p>
        </div>
        {provider.synthetic && <SyntheticBadge />}
      </header>
      <Region title="All cases" busy={cases.state === "loading"}>
        <AsyncBoundary outcome={cases} emptyWhen={(rows) => rows.length === 0} emptyTitle="No cases yet">
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead>
                  <tr className="border-b border-border-subtle text-meta text-text-muted">
                    <th className="px-4 py-2 font-medium">Case</th>
                    <th className="px-4 py-2 font-medium">Stage</th>
                    <th className="px-4 py-2 font-medium">State</th>
                    <th className="px-4 py-2 font-medium">Updated</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.caseId} onClick={() => navigate(`/cases/${row.caseId}`)} className="cursor-pointer border-b border-border-subtle last:border-b-0 hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <span className="block font-medium text-text-primary">{row.title}</span>
                        <span className="mono text-meta text-text-muted">{row.caseId}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.stage ? stageLabel[row.stage] : "Not planned"}</td>
                      <td className="tnum px-4 py-3 text-text-secondary">v{row.stateVersion}</td>
                      <td className="px-4 py-3 text-meta text-text-muted">{relativeTime(row.updatedAt)}</td>
                      <td className="px-4 py-3"><StatusBadge>{caseStatusLabel[row.status]}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncBoundary>
      </Region>
    </div>
  );
}
