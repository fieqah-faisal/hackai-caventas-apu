import { ArrowRight, Inbox } from "lucide-react";
import {
  Region,
  EmptyState,
  ErrorState,
} from "@/components/ui/Region";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Mono } from "@/components/ui/Mono";
import {
  attentionReasonLabel,
  caseStatusLabel,
  recoveryLabel,
  cx,
  relativeTime,
} from "@/lib/format";
import type { AttentionCase, AttentionReason } from "@/lib/types";
import { NOW } from "@/lib/mock-data";
import type { LoadState } from "@/lib/useDashboardData";

const MAX_ROWS = 4;

const reasonTone: Record<
  AttentionReason,
  "warning" | "danger" | "info" | "neutral"
> = {
  awaiting_decision: "warning",
  escalation_pending: "danger",
  missing_evidence: "info",
  replan_needed: "info",
  newly_ingested: "neutral",
};

function Row({ c }: { c: AttentionCase }) {
  return (
    <a
      href={`/cases/${c.caseId}`}
      className="group flex flex-col gap-2 px-4 py-3.5 border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors duration-180 focus-visible:bg-surface-hover sm:grid sm:grid-cols-[1fr_auto] sm:items-start sm:gap-x-4"
    >
      <div className="order-2 min-w-0 sm:order-1">
        <span className="block truncate text-case font-semibold text-text-primary">
          {c.title}
        </span>
        <p className="mt-1.5 line-clamp-2 max-w-[65ch] text-base text-text-secondary">
          {c.detail}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-muted">
          <Mono title={c.caseId}>{c.caseId}</Mono>
          <span aria-hidden>·</span>
          <span>{caseStatusLabel[c.status]}</span>
          <span aria-hidden>·</span>
          <span>{recoveryLabel[c.recoveryStatus]}</span>
          <span aria-hidden>·</span>
          <span>{relativeTime(c.updatedAt, NOW)}</span>
        </div>
      </div>

      <div className="order-1 flex items-center gap-3 sm:order-2 sm:justify-self-end sm:pt-0.5">
        <StatusBadge tone={reasonTone[c.reason]}>
          {attentionReasonLabel[c.reason]}
        </StatusBadge>
        <ArrowRight
          size={15}
          className={cx(
            "hidden text-text-muted transition-colors duration-180 sm:block",
            "group-hover:text-text-secondary",
          )}
          aria-hidden
        />
      </div>
    </a>
  );
}

export function AttentionRegion({
  cases,
  state,
  onRetry,
}: {
  cases: AttentionCase[] | null;
  state: LoadState;
  onRetry: () => void;
}) {
  const shown = cases?.slice(0, MAX_ROWS) ?? [];
  return (
    <Region
      title="Cases requiring attention"
      count={state === "ready" ? (cases?.length ?? 0) : undefined}
      busy={state === "loading"}
      action={
        <a
          href="/cases"
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          View all cases
          <ArrowRight size={13} aria-hidden />
        </a>
      }
    >
      {state === "loading" ? (
        <SkeletonRows rows={4} />
      ) : state === "error" ? (
        <ErrorState
          message="Could not load the attention queue."
          onRetry={onRetry}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Inbox size={22} aria-hidden />}
          title="Nothing needs attention right now"
          hint="Cases surface here when a decision is pending, evidence is missing, or a replan is needed."
        />
      ) : (
        <div>
          {shown.map((c) => (
            <Row key={c.caseId} c={c} />
          ))}
        </div>
      )}
    </Region>
  );
}