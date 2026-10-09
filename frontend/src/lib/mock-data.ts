/**
 * SYNTHETIC demonstration data only (HackAI constraint: synthetic data,
 * no real systems or people). These objects mirror the backend contract
 * shapes in types.ts. The approval / execution / reporting endpoints are
 * backend stubs today (BL-003); the dashboard renders their real shape and
 * marks live wiring as pending rather than fabricating confirmed outcomes.
 *
 * All dashboard summary counts and the status overview are DERIVED from the
 * records below (see selectors at the bottom) — never hardcoded. NOW is a
 * fixed reference instant so the demo renders deterministically.
 */
import type {
  AgentRun,
  AttentionCase,
  AuditEvent,
  CaseStatus,
  CaseSummary,
  PendingApproval,
  RecentlyUpdatedCase,
} from "./types";

export const NOW = new Date("2026-10-07T09:40:00Z");

const minsAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

/**
 * Canonical synthetic case list — the single source the summary tiles and
 * status overview derive from. The attention / recently-updated views below
 * reference members of this list, so every count stays internally consistent.
 */
export const allCases: CaseSummary[] = [
  {
    caseId: "CASE-78A34EA9",
    title: "Repeated failed logins then success — svc-backup",
    status: "investigating",
    recoveryStatus: "containing",
    stateVersion: 7,
    updatedAt: minsAgo(4),
  },
  {
    caseId: "CASE-4B3D175F",
    title: "Outbound beacon to unrecognised domain — WKS-2231",
    status: "investigating",
    recoveryStatus: "investigating",
    stateVersion: 3,
    updatedAt: minsAgo(11),
  },
  {
    caseId: "CASE-EC68D5E8",
    title: "Credential stuffing against VPN gateway",
    status: "open",
    recoveryStatus: "investigating",
    stateVersion: 2,
    updatedAt: minsAgo(23),
  },
  {
    caseId: "CASE-06DC8BF6",
    title: "Suspicious OAuth grant — finance mailbox",
    status: "open",
    recoveryStatus: "investigating",
    stateVersion: 1,
    updatedAt: minsAgo(38),
  },
  {
    caseId: "CASE-3C43ED8A",
    title: "Phishing payload opened — HR laptop",
    status: "contained",
    recoveryStatus: "eradicating",
    stateVersion: 9,
    updatedAt: minsAgo(29),
  },
  {
    caseId: "CASE-11F7C2A0",
    title: "Lateral movement attempt — finance subnet",
    status: "investigating",
    recoveryStatus: "containing",
    stateVersion: 5,
    updatedAt: minsAgo(52),
  },
  {
    caseId: "CASE-9D2E7B41",
    title: "Malware quarantined — build server",
    status: "recovered",
    recoveryStatus: "recovering",
    stateVersion: 12,
    updatedAt: minsAgo(140),
  },
  {
    caseId: "CASE-5A0C3E88",
    title: "Resolved — mis-scoped firewall rule",
    status: "closed",
    recoveryStatus: "resolved",
    stateVersion: 15,
    updatedAt: minsAgo(360),
  },
];

const caseById = (id: string): CaseSummary => {
  const found = allCases.find((c) => c.caseId === id);
  if (!found) throw new Error(`unknown case id in mock data: ${id}`);
  return found;
};

interface AttentionMeta {
  caseId: string;
  reason: AttentionCase["reason"];
  detail: string;
}

const attentionMeta: AttentionMeta[] = [
  {
    caseId: "CASE-78A34EA9",
    reason: "awaiting_decision",
    detail: "Containment plan proposed; 2 actions await approval.",
  },
  {
    caseId: "CASE-4B3D175F",
    reason: "escalation_pending",
    detail: "Host isolation flagged high-impact; senior review pending.",
  },
  {
    caseId: "CASE-EC68D5E8",
    reason: "missing_evidence",
    detail: "Planner reported missing evidence: source IP geolocation.",
  },
  {
    caseId: "CASE-06DC8BF6",
    reason: "newly_ingested",
    detail: "Evidence ingested; no plan generated yet.",
  },
];

export const attentionCases: AttentionCase[] = attentionMeta.map((m) => ({
  ...caseById(m.caseId),
  reason: m.reason,
  detail: m.detail,
}));

export const pendingApprovals: PendingApproval[] = [
  {
    actionId: "ACT-5F2A",
    version: 1,
    caseId: "CASE-78A34EA9",
    caseTitle: "Repeated failed logins then success — svc-backup",
    toolName: "disable_account",
    targetId: "acct-svc-backup",
    targetType: "account",
    stage: "containment",
    risk: "moderate",
    escalationRequired: false,
    basedOnStateVersion: 7,
    rationale:
      "Account shows anomalous success after 42 failures from a new ASN; disable pending review of downstream jobs.",
  },
  {
    actionId: "ACT-5F2B",
    version: 1,
    caseId: "CASE-78A34EA9",
    caseTitle: "Repeated failed logins then success — svc-backup",
    toolName: "revoke_sessions",
    targetId: "acct-svc-backup",
    targetType: "account",
    stage: "containment",
    risk: "low",
    escalationRequired: false,
    basedOnStateVersion: 7,
    rationale: "Invalidate active sessions tied to the compromised account.",
  },
  {
    actionId: "ACT-91C0",
    version: 2,
    caseId: "CASE-4B3D175F",
    caseTitle: "Outbound beacon to unrecognised domain — WKS-2231",
    toolName: "isolate_host",
    targetId: "host-wks-2231",
    targetType: "host",
    stage: "containment",
    risk: "high",
    escalationRequired: true,
    basedOnStateVersion: 3,
    rationale:
      "Sustained C2-like beacon; isolate to stop exfil. High-impact — requires senior approval before execution.",
  },
];

export const agentRuns: AgentRun[] = [
  {
    runId: "RUN-20A6",
    caseId: "CASE-EC68D5E8",
    caseTitle: "Credential stuffing against VPN gateway",
    stage: "assessment",
    phase: "sufficiency",
    status: "blocked",
    startedAt: minsAgo(2),
    note: "Blocked on missing evidence: source IP geolocation.",
  },
  {
    runId: "RUN-20A7",
    caseId: "CASE-06DC8BF6",
    caseTitle: "Suspicious OAuth grant — finance mailbox",
    stage: "assessment",
    phase: "analyze",
    status: "running",
    startedAt: minsAgo(1),
  },
  {
    runId: "RUN-20A5",
    caseId: "CASE-78A34EA9",
    caseTitle: "Repeated failed logins then success — svc-backup",
    stage: "containment",
    phase: "propose",
    status: "complete",
    startedAt: minsAgo(6),
    note: "Proposed 2 containment actions.",
  },
];

interface RecentMeta {
  caseId: string;
  change: RecentlyUpdatedCase["change"];
  delta: string;
  updatedAt: string;
}

const recentMeta: RecentMeta[] = [
  {
    caseId: "CASE-78A34EA9",
    change: "state_version",
    delta: "v6 to v7 — containment plan recorded",
    updatedAt: minsAgo(6),
  },
  {
    caseId: "CASE-3C43ED8A",
    change: "status_change",
    delta: "Investigating to Contained",
    updatedAt: minsAgo(29),
  },
  {
    caseId: "CASE-EC68D5E8",
    change: "evidence_added",
    delta: "login_logs.csv ingested",
    updatedAt: minsAgo(23),
  },
];

export const recentlyUpdated: RecentlyUpdatedCase[] = recentMeta.map((m) => ({
  ...caseById(m.caseId),
  updatedAt: m.updatedAt,
  change: m.change,
  delta: m.delta,
}));

export const auditEvents: AuditEvent[] = [
  {
    eventId: "EV-7781",
    kind: "plan_created",
    caseId: "CASE-78A34EA9",
    summary: "Containment plan created (2 actions)",
    at: minsAgo(6),
  },
  {
    eventId: "EV-7780",
    kind: "state_version_created",
    caseId: "CASE-78A34EA9",
    summary: "Incident state v7 recorded",
    at: minsAgo(6),
  },
  {
    eventId: "EV-7779",
    kind: "evidence_ingested",
    caseId: "CASE-EC68D5E8",
    summary: "login_logs.csv ingested (sha256 recorded)",
    at: minsAgo(23),
  },
  {
    eventId: "EV-7778",
    kind: "case_created",
    caseId: "CASE-06DC8BF6",
    summary: "Case opened — Suspicious OAuth grant",
    at: minsAgo(38),
  },
  {
    eventId: "EV-7777",
    kind: "evidence_ingested",
    caseId: "CASE-4B3D175F",
    summary: "pcap sample ingested (sha256 recorded)",
    at: minsAgo(12),
  },
];

/* ---- Derived selectors (all counts computed, never hardcoded) ---- */

const OPEN_STATUSES: CaseStatus[] = ["open", "investigating", "contained"];

/** Case status breakdown across the canonical list. */
export function caseStatusBreakdown(): Record<CaseStatus, number> {
  const base: Record<CaseStatus, number> = {
    open: 0,
    investigating: 0,
    contained: 0,
    recovered: 0,
    closed: 0,
  };
  for (const c of allCases) base[c.status] += 1;
  return base;
}

export interface DashboardSummary {
  openCases: number;
  awaitingApproval: number;
  activeRuns: number;
  blockedOrMissing: number;
}

/** Four operational summary values, derived from records above. */
export function dashboardSummary(): DashboardSummary {
  const openCases = allCases.filter((c) =>
    OPEN_STATUSES.includes(c.status),
  ).length;
  // Union by case so a case blocked on missing evidence is not double counted.
  const blockedCaseIds = new Set<string>([
    ...agentRuns.filter((r) => r.status === "blocked").map((r) => r.caseId),
    ...attentionCases
      .filter((c) => c.reason === "missing_evidence")
      .map((c) => c.caseId),
  ]);
  return {
    openCases,
    awaitingApproval: pendingApprovals.length,
    activeRuns: agentRuns.filter((r) => r.status === "running").length,
    blockedOrMissing: blockedCaseIds.size,
  };
}

export const pendingApprovalCount = pendingApprovals.length;