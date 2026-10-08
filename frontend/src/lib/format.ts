import type {
  ActionState,
  AttentionReason,
  CaseStatus,
  RecoveryStatus,
  RunStatus,
  Stage,
} from "./types";

/** Relative time, compact ("3m", "2h", "1d"). */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export const caseStatusLabel: Record<CaseStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  contained: "Contained",
  recovered: "Recovered",
  closed: "Closed",
};

export const recoveryLabel: Record<RecoveryStatus, string> = {
  investigating: "Investigating",
  containing: "Containing",
  eradicating: "Eradicating",
  recovering: "Recovering",
  resolved: "Resolved",
};

export const stageLabel: Record<Stage, string> = {
  assessment: "Assessment",
  preservation: "Preservation",
  containment: "Containment",
  eradication: "Eradication",
  hardening: "Hardening",
  restoration: "Restoration",
};

export const attentionReasonLabel: Record<AttentionReason, string> = {
  awaiting_decision: "Awaiting decision",
  missing_evidence: "Missing evidence",
  newly_ingested: "New evidence ingested",
  replan_needed: "Replan needed",
  escalation_pending: "Escalation pending",
};

export const runStatusLabel: Record<RunStatus, string> = {
  running: "Running",
  complete: "Complete",
  blocked: "Blocked",
};

export const actionStateLabel: Record<ActionState, string> = {
  proposed: "Proposed",
  approved: "Approved",
  executed: "Executed",
  effective: "Confirmed effective",
  failed: "Failed",
};

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
