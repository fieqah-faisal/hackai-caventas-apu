import { AttentionRegion } from "./AttentionRegion";
import { ApprovalsRegion } from "./ApprovalsRegion";
import { AgentStatusRegion } from "./AgentStatusRegion";
import { RecentlyUpdatedRegion } from "./RecentlyUpdatedRegion";
import { ActivityRegion } from "./ActivityRegion";

export function DashboardPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Shared operations view — all open cases and pending approvals.
          </p>
        </div>
      </div>

      {/* Approved hierarchy, top to bottom. */}
      {/* 1 — Cases requiring attention (lead region, full width). */}
      <AttentionRegion />

      {/* 2 — Recommendations awaiting approval. */}
      <ApprovalsRegion />

      {/* 3 + 4 — Agent status beside recently updated on wide screens. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <AgentStatusRegion />
        <RecentlyUpdatedRegion />
      </div>

      {/* 5 — Secondary system activity (lowest emphasis). */}
      <ActivityRegion />
    </div>
  );
}
