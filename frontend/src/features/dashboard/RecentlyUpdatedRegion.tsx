import { FileClock } from "lucide-react";
import { EmptyState, Region } from "@/components/ui/Region";
import { caseStatusLabel, recoveryLabel, relativeTime } from "@/lib/format";
import type { RecentlyUpdatedCase } from "@/lib/types";
import { NOW, recentlyUpdated } from "@/lib/mock-data";

function Row({ c }: { c: RecentlyUpdatedCase }) {
  return (
    <a
      href={`/cases/${c.caseId}`}
      className="flex flex-col gap-1 px-4 py-2.5 border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors duration-180 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-x-4 sm:gap-y-0"
    >
      <div className="min-w-0">
        <p className="truncate text-base text-text-primary">{c.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span className="tnum">{c.caseId}</span>
          <span aria-hidden>·</span>
          <span>{caseStatusLabel[c.status]}</span>
          <span aria-hidden>·</span>
          <span>{recoveryLabel[c.recoveryStatus]}</span>
        </div>
      </div>
      <div className="sm:justify-self-end sm:text-right">
        <p className="text-sm text-text-secondary">{c.delta}</p>
        <p className="text-xs text-text-muted">
          {relativeTime(c.updatedAt, NOW)}
        </p>
      </div>
    </a>
  );
}

export function RecentlyUpdatedRegion() {
  return (
    <Region title="Recently updated cases" count={recentlyUpdated.length}>
      {recentlyUpdated.length === 0 ? (
        <EmptyState
          icon={<FileClock size={22} aria-hidden />}
          title="No recent case updates"
        />
      ) : (
        <div>
          {recentlyUpdated.map((c) => (
            <Row key={c.caseId} c={c} />
          ))}
        </div>
      )}
    </Region>
  );
}