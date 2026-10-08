import { ArrowRight, Inbox } from "lucide-react";
import { Region, EmptyState } from "@/components/ui/Region";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  attentionReasonLabel,
  caseStatusLabel,
  cx,
  relativeTime,
} from "@/lib/format";
import type { AttentionCase, AttentionReason } from "@/lib/types";
import { attentionCases, NOW } from "@/lib/mock-data";

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
      className="group flex flex-col gap-2 px-4 py-3 border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors duration-180 sm:grid sm:grid-cols-[1fr_auto] sm:items-start sm:gap-x-4"
    >
      <div className="order-2 min-w-0 sm:order-1">
        <span className="block truncate text-base font-medium text-text-primary">
          {c.title}
        </span>
        <p className="mt-0.5 text-sm text-text-secondary">{c.detail}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span className="tnum">{c.caseId}</span>
          <span aria-hidden>·</span>
          <span>{caseStatusLabel[c.status]}</span>
          <span aria-hidden>·</span>
          <span className="tnum">state v{c.stateVersion}</span>
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

export function AttentionRegion() {
  return (
    <Region title="Cases requiring attention" count={attentionCases.length}>
      {attentionCases.length === 0 ? (
        <EmptyState
          icon={<Inbox size={22} aria-hidden />}
          title="Nothing needs attention right now"
          hint="Cases surface here when a decision is pending, evidence is missing, or a replan is needed."
        />
      ) : (
        <div>
          {attentionCases.map((c) => (
            <Row key={c.caseId} c={c} />
          ))}
        </div>
      )}
    </Region>
  );
}