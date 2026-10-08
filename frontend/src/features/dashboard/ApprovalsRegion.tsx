import { Check, CheckCheck, X } from "lucide-react";
import {
  EmptyState,
  PendingBackendNote,
  Region,
} from "@/components/ui/Region";
import {
  ActionStateBadge,
  EscalationBadge,
  StatusBadge,
} from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { stageLabel } from "@/lib/format";
import type { PendingApproval } from "@/lib/types";
import { pendingApprovals } from "@/lib/mock-data";

const riskTone = {
  low: "neutral",
  moderate: "warning",
  high: "danger",
} as const;

function ApprovalRow({ a }: { a: PendingApproval }) {
  return (
    <div className="px-4 py-3 border-b border-border-subtle last:border-b-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* These are PROPOSALS — a decision to make, never done. */}
            <ActionStateBadge state="proposed" />
            <code className="rounded bg-canvas border border-border-subtle px-1.5 py-0.5 text-xs text-text-primary">
              {a.toolName}
            </code>
            <span className="text-sm text-text-muted">on</span>
            <span className="text-sm text-text-secondary">
              {a.targetType}:{a.targetId}
            </span>
          </div>

          <p className="mt-1.5 text-sm text-text-secondary max-w-2xl">
            {a.rationale}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="truncate max-w-xs">{a.caseTitle}</span>
            <span aria-hidden>·</span>
            <span>{stageLabel[a.stage]}</span>
            <span aria-hidden>·</span>
            <span className="tnum">based on state v{a.basedOnStateVersion}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-row flex-wrap items-start gap-2 sm:flex-col sm:items-end">
          <StatusBadge tone={riskTone[a.risk]}>
            {a.risk[0].toUpperCase() + a.risk.slice(1)} risk
          </StatusBadge>
          {a.escalationRequired && <EscalationBadge />}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {a.escalationRequired ? (
          <Button
            size="sm"
            variant="secondary"
            disabled
            leadingIcon={<Check size={14} aria-hidden />}
          >
            Awaiting senior approval
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            leadingIcon={<Check size={14} strokeWidth={2.25} aria-hidden />}
          >
            Approve
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<X size={14} aria-hidden />}
        >
          Reject
        </Button>
        <a
          href={`/cases/${a.caseId}`}
          className="ml-auto text-sm text-text-secondary hover:text-text-primary"
        >
          Open case
        </a>
      </div>
    </div>
  );
}

export function ApprovalsRegion() {
  return (
    <Region
      title="Recommendations awaiting approval"
      count={pendingApprovals.length}
    >
      {pendingApprovals.length === 0 ? (
        <EmptyState
          icon={<CheckCheck size={22} aria-hidden />}
          title="No recommendations awaiting approval"
          hint="Approved actions move on to simulated execution; the AI never acts without an analyst decision."
        />
      ) : (
        <>
          <div>
            {pendingApprovals.map((a) => (
              <ApprovalRow key={`${a.actionId}-${a.version}`} a={a} />
            ))}
          </div>
          <PendingBackendNote>
            Approval and execution are not yet wired to the backend (endpoints
            in progress). Decisions here are not persisted.
          </PendingBackendNote>
        </>
      )}
    </Region>
  );
}
