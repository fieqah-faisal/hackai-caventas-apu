import {
  Activity,
  FilePlus2,
  FileText,
  GitCommitVertical,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Region } from "@/components/ui/Region";
import { relativeTime } from "@/lib/format";
import type { AuditEvent, AuditKind } from "@/lib/types";
import { auditEvents, NOW } from "@/lib/mock-data";

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
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-b-0">
      <Icon size={15} className="shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
        {e.summary}
      </span>
      <span className="tnum hidden text-xs text-text-muted sm:inline">{e.caseId}</span>
      <span className="text-xs text-text-muted whitespace-nowrap">
        {relativeTime(e.at, NOW)}
      </span>
    </div>
  );
}

export function ActivityRegion() {
  return (
    <Region
      title="Secondary system activity"
      action={
        <a
          href="/activity"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          View activity log
        </a>
      }
    >
      <div>
        {auditEvents.map((e) => (
          <Row key={e.eventId} e={e} />
        ))}
      </div>
    </Region>
  );
}
