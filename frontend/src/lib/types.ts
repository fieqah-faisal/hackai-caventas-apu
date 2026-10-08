/**
 * Types mirroring the backend Pydantic schemas
 * (backend/app/schemas/{case,incident_state,plan}.py).
 * Kept deliberately close to the server contract so the UI never invents
 * a shape the API does not own.
 */

export type CaseStatus =
  | "open"
  | "investigating"
  | "contained"
  | "recovered"
  | "closed";

export type RecoveryStatus =
  | "investigating"
  | "containing"
  | "eradicating"
  | "recovering"
  | "resolved";

export type Stage =
  | "assessment"
  | "preservation"
  | "containment"
  | "eradication"
  | "hardening"
  | "restoration";

export type EntityType =
  | "host"
  | "account"
  | "process"
  | "file"
  | "ip"
  | "domain"
  | "other";

export interface CaseSummary {
  caseId: string;
  title: string;
  status: CaseStatus;
  recoveryStatus: RecoveryStatus;
  stateVersion: number;
  updatedAt: string; // ISO
}

/** Why a case surfaced into "requires attention". */
export type AttentionReason =
  | "awaiting_decision"
  | "missing_evidence"
  | "newly_ingested"
  | "replan_needed"
  | "escalation_pending";

export interface AttentionCase extends CaseSummary {
  reason: AttentionReason;
  detail: string;
}

/**
 * The four legible states an action moves through. Kept distinct on purpose:
 * a completed execution is "executed", never automatically "effective".
 */
export type ActionState =
  | "proposed"
  | "approved"
  | "executed"
  | "effective"
  | "failed";

export interface PendingApproval {
  actionId: string;
  version: number;
  caseId: string;
  caseTitle: string;
  toolName: string;
  targetId: string;
  targetType: EntityType;
  stage: Stage;
  risk: "low" | "moderate" | "high";
  escalationRequired: boolean;
  basedOnStateVersion: number;
  rationale: string;
}

export type RunPhase = "analyze" | "sufficiency" | "propose";
export type RunStatus = "running" | "complete" | "blocked";

export interface AgentRun {
  runId: string;
  caseId: string;
  caseTitle: string;
  stage: Stage;
  phase: RunPhase;
  status: RunStatus;
  startedAt: string; // ISO
  note?: string;
}

export type CaseChange =
  | "state_version"
  | "status_change"
  | "evidence_added"
  | "action_executed";

export interface RecentlyUpdatedCase extends CaseSummary {
  change: CaseChange;
  delta: string;
}

export type AuditKind =
  | "case_created"
  | "evidence_ingested"
  | "plan_created"
  | "approval_recorded"
  | "action_executed"
  | "state_version_created";

export interface AuditEvent {
  eventId: string;
  kind: AuditKind;
  caseId: string;
  summary: string;
  at: string; // ISO
}
