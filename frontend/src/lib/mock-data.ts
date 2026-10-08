/**
 * SYNTHETIC demonstration data only (HackAI constraint: synthetic data,
 * no real systems or people). These objects mirror the backend contract
 * shapes in types.ts. The approval / execution / reporting endpoints are
 * backend stubs today (BL-003); the dashboard renders their real shape and
 * marks live wiring as pending rather than fabricating confirmed outcomes.
 *
 * NOW is a fixed reference instant so the demo renders deterministically.
 */
import type {
  AgentRun,
  AttentionCase,
  AuditEvent,
  PendingApproval,
  RecentlyUpdatedCase,
} from "./types";

export const NOW = new Date("2026-10-07T09:40:00Z");

const minsAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

export const attentionCases: AttentionCase[] = [
  {
    caseId: "CASE-78A34EA9",
    title: "Repeated failed logins then success — svc-backup",
    status: "investigating",
    recoveryStatus: "containing",
    stateVersion: 7,
    updatedAt: minsAgo(4),
    reason: "awaiting_decision",
    detail: "Containment plan proposed; 2 actions await approval.",
  },
  {
    caseId: "CASE-4B3D175F",
    title: "Outbound beacon to unrecognised domain — WKS-2231",
    status: "investigating",
    recoveryStatus: "investigating",
    stateVersion: 3,
    updatedAt: minsAgo(11),
    reason: "escalation_pending",
    detail: "Host isolation flagged high-impact; senior review pending.",
  },
  {
    caseId: "CASE-EC68D5E8",
    title: "Credential stuffing against VPN gateway",
    status: "open",
    recoveryStatus: "investigating",
    stateVersion: 2,
    updatedAt: minsAgo(23),
    reason: "missing_evidence",
    detail: "Planner reported missing evidence: source IP geolocation.",
  },
  {
    caseId: "CASE-06DC8BF6",
    title: "Suspicious OAuth grant — finance mailbox",
    status: "open",
    recoveryStatus: "investigating",
    stateVersion: 1,
    updatedAt: minsAgo(38),
    reason: "newly_ingested",
    detail: "Evidence ingested; no plan generated yet.",
  },
];

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

export const recentlyUpdated: RecentlyUpdatedCase[] = [
  {
    caseId: "CASE-78A34EA9",
    title: "Repeated failed logins then success — svc-backup",
    status: "investigating",
    recoveryStatus: "containing",
    stateVersion: 7,
    updatedAt: minsAgo(6),
    change: "state_version",
    delta: "v6 to v7 — containment plan recorded",
  },
  {
    caseId: "CASE-3C43ED8A",
    title: "Phishing payload opened — HR laptop",
    status: "contained",
    recoveryStatus: "eradicating",
    stateVersion: 9,
    updatedAt: minsAgo(29),
    change: "status_change",
    delta: "Investigating to Contained",
  },
  {
    caseId: "CASE-EC68D5E8",
    title: "Credential stuffing against VPN gateway",
    status: "open",
    recoveryStatus: "investigating",
    stateVersion: 2,
    updatedAt: minsAgo(23),
    change: "evidence_added",
    delta: "login_logs.csv ingested",
  },
];

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
];

export const pendingApprovalCount = pendingApprovals.length;
