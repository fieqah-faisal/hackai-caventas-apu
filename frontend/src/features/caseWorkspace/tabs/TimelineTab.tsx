import { getProvider } from "@/lib/api";
import { useOutcome } from "@/lib/useOutcome";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";
import type { TimelineEventVM } from "@/lib/types";
import { useWorkspace } from "../context";
import { TimelineTable } from "@/components/ui/TimelineTable";

const p = getProvider();

export function TimelineTab() {
  const { caseId } = useWorkspace();
  const timeline = useOutcome<TimelineEventVM[]>(() => p.getTimeline(caseId), [caseId]);

  return (
    <div className="rounded-md border border-border-subtle bg-surface overflow-hidden">
      <AsyncBoundary outcome={timeline} skeletonRows={5} emptyWhen={(d) => d.length === 0} emptyTitle="No timeline events yet">
        {(events) => <TimelineTable caseId={caseId} events={events} />}
      </AsyncBoundary>
    </div>
  );
}
