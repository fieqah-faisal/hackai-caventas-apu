import type { CaseFacts, TabId } from "../types";

export interface TabStatus {
  id: TabId;
  available: boolean;
  reason?: string;
}

export const TAB_ORDER: TabId[] = [
  "overview",
  "evidence",
  "timeline",
  "analysis",
  "plan",
  "approvals",
  "report",
];

export const TAB_LABEL: Record<TabId, string> = {
  overview: "Overview",
  evidence: "Evidence",
  timeline: "Timeline",
  analysis: "Analysis",
  plan: "Response Plan",
  approvals: "Approvals",
  report: "Report",
};

/**
 * Pure tab-availability from observable case facts.
 *
 * - Overview is always available.
 * - Evidence/Timeline LATCH: once available they never return to disabled,
 *   even after analysis begins (analysts must be able to revisit).
 * - Analysis/Plan/Approvals/Report are gated and may relock if a prerequisite
 *   becomes unmet again.
 *
 * `prev` carries the previous statuses so the latch can be honoured.
 */
export function tabAvailability(
  facts: CaseFacts,
  prev?: Record<TabId, boolean>,
): Record<TabId, TabStatus> {
  const wasAvailable = (id: TabId) => prev?.[id] === true;

  const evidence = facts.evidenceUploaded || wasAvailable("evidence");
  const timeline = facts.timelineReconstructed || wasAvailable("timeline");

  const mk = (id: TabId, available: boolean, reason: string): TabStatus =>
    available ? { id, available: true } : { id, available: false, reason };

  return {
    overview: { id: "overview", available: true },
    evidence: mk("evidence", evidence, "Upload evidence to enable this tab."),
    timeline: mk("timeline", timeline, "Available after evidence is normalized into a timeline."),
    analysis: mk("analysis", facts.planningRunStarted, "Available after a planning run starts."),
    plan: mk("plan", facts.proposalExists, "Available after analysis produces a proposal."),
    approvals: mk("approvals", facts.actionAwaitingDecision, "Available when an action needs a decision."),
    report: mk("report", facts.reportEligible, "Available once the case has report-eligible content."),
  };
}

/** Resolve the tab to show: the requested one if available, else Overview. */
export function resolveSelectedTab(
  requested: TabId,
  statuses: Record<TabId, TabStatus>,
): TabId {
  return statuses[requested]?.available ? requested : "overview";
}