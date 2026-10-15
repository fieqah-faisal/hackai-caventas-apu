import type {
  AttentionReason,
  CaseStatus,
  DiffCategory,
  EvidenceCategory,
  PlanActionState,
  RecoveryStatus,
  Risk,
  Stage,
} from "./types";

export { cx } from "./types";

/** Relative time, compact ("3m ago", "2h ago", "1d ago"). */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const sec = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

/** Elapsed duration from an ISO instant to now, single largest whole unit. */
export function elapsedLargestUnit(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const min = Math.max(0, Math.floor((now.getTime() - then) / 60000));
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
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

/** Canonical six-state action labels (default surface). */
export const actionStateLabel: Record<PlanActionState, string> = {
  proposed: "Proposed",
  approved: "Approved",
  simulated: "Simulated",
  validated_effective: "Validated effective",
  validated_ineffective: "Validated ineffective",
  not_applicable: "Not applicable",
  superseded: "Superseded",
};

export const evidenceCategoryLabel: Record<EvidenceCategory, string> = {
  endpoint: "Endpoint",
  identity: "Identity",
  network: "Network",
  application: "Application",
  analyst_note: "Analyst Notes",
  other: "Other",
};

export const diffCategoryLabel: Record<DiffCategory, string> = {
  unchanged: "Unchanged",
  added: "Added",
  replaced_or_insufficient: "Replaced / insufficient",
  policy_triggered: "Policy-triggered",
};

export const riskLabel: Record<Risk, string> = {
  low: "Low risk",
  moderate: "Moderate risk",
  high: "High risk",
};

export function readableValue(value: string | null | undefined): string {
  if (!value || value.toLowerCase() === "unknown") return "Not established";
  if (value.toLowerCase() === "other") return "Other / Unclassified";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function plannerLabel(kind: "live_ai" | "deterministic" | "unknown"): string {
  if (kind === "live_ai") return "Live AI planner";
  if (kind === "deterministic") return "Deterministic demo/test planner";
  return "Planner identity not recorded";
}

export function modelReportedConfidence(value: number | null): string {
  return value == null ? "Not recorded" : `${Math.round(value * 100)}% model-reported`;
}
