import { ArrowRight, Check, CheckCheck, X } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  PendingBackendNote,
  Region,
} from "@/components/ui/Region";
import { SkeletonRows } from "@/components/ui/Skeleton";
import {
  ActionStateBadge,
  EscalationBadge,
  StatusBadge,
} from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/ui/Mono";
import { useToast } from "@/components/ui/Toast";
import { stageLabel } from "@/lib/format";
import type { PendingApproval } from "@/lib/types";
import type { LoadState } from "@/lib/useDashboardData";

const MAX_ROWS = 3;
const riskRank = { high: 0, moderate: 1, low: 2 } as const;

const riskTone = {
  low: "neutral",
  moderate: "warning",
  high: "danger",
} as const;

/** High-impact first, then oldest-waiting (by lower action id as a proxy). */
function prioritize(approvals: PendingApproval[]): PendingApproval[] {
  return [...approvals]
    .sort((a, b) => {
      if (a.escalationRequired !== b.escalationRequired) {
        return a.escalationRequired ? -1 : 1;
      }
      if (riskRank[a.risk] !== riskRank[b.risk]) {
        return riskRank[a.risk] - riskRank[b.risk];
      }
      return a.actionId.localeCompare(b.actionId);
    })
    .slice(0, MAX_ROWS);
}

function ApprovalRow({ a }: { a: PendingApproval }) {
  const { notify } = useToast();
  return (
    <div className="px-4 py-3.5 border-b border-border-subtle last:border-b-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* These are PROPOSALS — a decision to make, never done. */}
            <ActionStateBadge state="proposed" />
            <Mono className="rounded bg-canvas border border-border-subtle px-1.5 py-0.5 text-text-primary">
              {a.toolName}
            </Mono>
            <span className="text-base text-text-muted">on</span>
            <span className="text-base text-text-secondary">
              {a.targetType}:<Mono title={a.targetId}>{a.targetId}</Mono>
            </span>
          </div>

          <p className="mt-1.5 text-base text-text-secondary max-w-2xl">
            {a.rationale}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-meta text-text-muted">
            <span className="truncate max-w-xs">{a.caseTitle}</span>
            <span aria-hidden>·</span>
            <span>{stageLabel[a.stage]}</span>
            <span aria-hidden>·</span>
            <span>
              based on state <Mono>v{a.basedOnStateVersion}</Mono>
            </span>
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
            onClick={() =>
              notify({
                tone: "info",
                title: "Approval not sent",
                detail: `Backend approval endpoint is not implemented yet (BL-003). ${a.toolName} was not recorded.`,
              })
            }
          >
            Approve
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<X size={14} aria-hidden />}
          onClick={() =>
            notify({
              tone: "info",
              title: "Rejection not sent",
              detail: "Backend approval endpoint is not implemented yet (BL-003).",
            })
          }
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

export function ApprovalsRegion({
  approvals,
  state,
  onRetry,
}: {
  approvals: PendingApproval[] | null;
  state: LoadState;
  onRetry: () => void;
}) {
  const shown = approvals ? prioritize(approvals) : [];
  return (
    <Region
      title="Recommendations awaiting approval"
      count={state === "ready" ? (approvals?.length ?? 0) : undefined}
      busy={state === "loading"}
      action={
        <a
          href="/approvals"
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          View all
          <ArrowRight size={13} aria-hidden />
        </a>
      }
    >
      {state === "loading" ? (
        <SkeletonRows rows={2} />
      ) : state === "error" ? (
        <ErrorState
          message="Could not load pending recommendations."
          onRetry={onRetry}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<CheckCheck size={22} aria-hidden />}
          title="No recommendations awaiting approval"
          hint="Approved actions move on to simulated execution; the AI never acts without an analyst decision."
        />
      ) : (
        <>
          <div>
            {shown.map((a) => (
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