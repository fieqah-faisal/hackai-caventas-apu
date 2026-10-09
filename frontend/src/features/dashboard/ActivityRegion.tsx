import {
  Activity,
  ArrowRight,
  FilePlus2,
  FileText,
  GitCommitVertical,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Region, EmptyState, ErrorState } from "@/components/ui/Region";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Mono } from "@/components/ui/Mono";
import { relativeTime } from "@/lib/format";
import type { AuditEvent, AuditKind } from "@/lib/types";
import { NOW } from "@/lib/mock-data";
import type { LoadState } from "@/lib/useDashboardData";

const MAX_ROWS = 5;

const kindIcon: Record<AuditKind, typeof Activity> = {
  case_created: FilePlus2,
  evidence_ingested: Upload,
  plan_created: FileText,
  approval_recorded: ShieldCheck,
  action_executed: Activity,
  state_version_created: GitCommitVertical,
};

function Row({ e }: { e: AuditEvent }) {
  const Icon = kindIcon[e.kind];
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-b-0">
      <Icon
        size={15}
        className="shrink-0 text-text-muted"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-base text-text-secondary">
        {e.summary}
      </span>
      <Mono className="hidden sm:inline" title={e.caseId}>
        {e.caseId}
      </Mono>
      <span className="whitespace-nowrap text-meta text-text-muted">
        {relativeTime(e.at, NOW)}
      </span>
    </div>
  );
}

export function ActivityRegion({
  events,
  state,
  onRetry,
}: {
  events: AuditEvent[] | null;
  state: LoadState;
  onRetry: () => void;
}) {
  const shown = events?.slice(0, MAX_ROWS) ?? [];
  return (
    <Region
      title="Recent activity"
      busy={state === "loading"}
      action={
        <a
          href="/activity"
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          View full activity log
          <ArrowRight size={13} aria-hidden />
        </a>
      }
    >
      {state === "loading" ? (
        <SkeletonRows rows={4} />
      ) : state === "error" ? (
        <ErrorState message="Could not load recent activity." onRetry={onRetry} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Activity size={22} aria-hidden />}
          title="No recent activity"
          hint="Meaningful case events — evidence, plans, state versions — appear here as they happen."
        />
      ) : (
        <div>
          {shown.map((e) => (
            <Row key={e.eventId} e={e} />
          ))}
        </div>
      )}
    </Region>
  );
}