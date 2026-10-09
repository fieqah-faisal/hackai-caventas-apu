import { FlaskConical } from "lucide-react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { useDashboardData } from "@/lib/useDashboardData";
import { SummaryTiles } from "./SummaryTiles";
import { AttentionRegion } from "./AttentionRegion";
import { WorkflowSnapshot } from "./WorkflowSnapshot";
import { ApprovalsRegion } from "./ApprovalsRegion";
import { CaseStatusOverview } from "./CaseStatusOverview";
import { ActivityRegion } from "./ActivityRegion";

export function DashboardPage() {
  useDocumentTitle("Dashboard");
  const { state, data, retry } = useDashboardData();
  const loading = state === "loading";

  return (
    <div className="space-y-6">
      {/* A. Page header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mono text-eyebrow font-medium uppercase text-text-muted">
            SOC Operations
          </p>
          <h1 className="mt-1.5 text-title font-bold text-text-primary">
            Dashboard
          </h1>
          <p className="mt-2 text-desc font-normal text-text-secondary">
            Shared operations view — all open cases and pending approvals.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded border border-border-subtle bg-surface px-2.5 py-1 text-meta text-text-muted">
          <FlaskConical size={13} aria-hidden />
          Synthetic demonstration data
        </span>
      </header>

      {/* B. Operational summary */}
      <SummaryTiles summary={data?.summary ?? null} loading={loading} />

      {/* C. Primary grid: attention (8) + workflow snapshot (4) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <AttentionRegion
            cases={data?.attention ?? null}
            state={state}
            onRetry={retry}
          />
        </div>
        <div className="lg:col-span-4">
          <WorkflowSnapshot runs={data?.runs ?? null} loading={loading} />
        </div>
      </div>

      {/* D. Secondary grid: approvals (7) + status overview (5) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ApprovalsRegion
            approvals={data?.approvals ?? null}
            state={state}
            onRetry={retry}
          />
        </div>
        <div className="lg:col-span-5">
          <CaseStatusOverview
            breakdown={data?.statusBreakdown ?? null}
            loading={loading}
          />
        </div>
      </div>

      {/* E. Recent activity */}
      <ActivityRegion
        events={data?.activity ?? null}
        state={state}
        onRetry={retry}
      />
    </div>
  );
}