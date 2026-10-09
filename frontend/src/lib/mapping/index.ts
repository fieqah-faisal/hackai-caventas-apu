/**
 * Mapping / compatibility layer: backend DTO -> stable view model.
 *
 * This is the ONLY place derivation happens. Components receive view models and
 * never derive from raw DTOs. The real backend's action `status` vocabulary is
 * reconciled here into the canonical six-state PlanActionState; derived fields
 * the backend does not supply (severity, classification, stage on the Case) are
 * computed from incident state / plans, or returned null (honest absent) — never
 * fabricated.
 */
import type {
  ActionStatusDTO,
  CaseDTO,
  EvidenceItemDTO,
  IncidentStateDTO,
  PlanDocDTO,
  ProposedActionDTO,
  RunResponseDTO,
  StoredActionDTO,
  StructuredReportDTO,
} from "../api/dto";
import type {
  CaseHeaderVM,
  CaseStatus,
  EntityType,
  EvidenceCategory,
  EvidenceItemVM,
  PlanActionState,
  PlanVM,
  RecentCaseRow,
  RecoveryStatus,
  ReportSectionVM,
  ReportVM,
  ResponsePlanActionVM,
  Risk,
  Severity,
  Stage,
} from "../types";

// ---- Action status -> canonical six-state ---------------------------------

/**
 * Reconcile the real backend action status into the canonical six-state model.
 * Backend lifecycle: awaiting_approval/recommended -> approved|rejected ->
 * verified|failed (verified means executed + validated effective; failed means
 * executed but not effective). The backend has no explicit "simulated" or
 * "superseded"; those are intended-model states fixture mode exercises fully.
 */
export function mapActionState(status: ActionStatusDTO): PlanActionState {
  switch (status) {
    case "awaiting_approval":
    case "recommended":
      return "proposed";
    case "approved":
      return "approved";
    case "rejected":
      // A rejected action is no longer part of the live plan.
      return "superseded";
    case "verified":
      return "validated_effective";
    case "failed":
      return "validated_ineffective";
    default:
      return "proposed";
  }
}

// ---- Risk / severity ------------------------------------------------------

export function mapRisk(raw: string): Risk {
  const r = raw.toLowerCase();
  if (r.includes("high")) return "high";
  if (r.includes("mod") || r.includes("med")) return "moderate";
  return "low";
}

const KNOWN_SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
export function mapSeverity(raw: string | null | undefined): Severity | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  return KNOWN_SEVERITIES.includes(s as Severity) ? (s as Severity) : null;
}

// ---- Stage ----------------------------------------------------------------

/** Derive the current stage from the latest plan; null when no plan exists. */
export function stageFromPlans(plans: PlanDocDTO[]): Stage | null {
  if (plans.length === 0) return null;
  const latest = plans[plans.length - 1];
  return latest.stage;
}

// ---- Recovery -------------------------------------------------------------

export function recoveryFromState(
  state: IncidentStateDTO | null,
): RecoveryStatus | null {
  return state?.recovery_status ?? null;
}

// ---- Case header ----------------------------------------------------------

export function toCaseHeaderVM(
  dto: CaseDTO,
  state: IncidentStateDTO | null,
  plans: PlanDocDTO[],
  agentState: string | null = null,
): CaseHeaderVM {
  return {
    caseId: dto.case_id,
    title: dto.title,
    status: dto.status as CaseStatus,
    severity: null, // backend Case carries no severity; only analysis supplies it
    stage: stageFromPlans(plans),
    recoveryStatus: recoveryFromState(state),
    updatedAt: dto.updated_at,
    agentState,
  };
}

export function toRecentCaseRow(
  dto: CaseDTO,
  _state: IncidentStateDTO | null,
  plans: PlanDocDTO[],
): RecentCaseRow {
  return {
    caseId: dto.case_id,
    title: dto.title,
    classification: null, // only analysis supplies classification
    stage: stageFromPlans(plans),
    status: dto.status as CaseStatus,
    updatedAt: dto.updated_at,
  };
}

// ---- Evidence -------------------------------------------------------------

/** Heuristic category from the normalized evidence fields / source file. */
export function categorizeEvidence(dto: EvidenceItemDTO): EvidenceCategory {
  const hay = (
    dto.source_file +
    " " +
    Object.keys(dto.fields).join(" ") +
    " " +
    Object.values(dto.fields).map(String).join(" ")
  ).toLowerCase();
  if (/\bnote|analyst|comment\b/.test(hay)) return "analyst_note";
  if (/\bhost|process|endpoint|device|laptop|disk|memory\b/.test(hay))
    return "endpoint";
  if (/\baccount|user|login|session|credential|mfa|identity\b/.test(hay))
    return "identity";
  if (/\bip|domain|dns|beacon|traffic|network|c2|exfil\b/.test(hay))
    return "network";
  if (/\bapp|oauth|mailbox|crm|portal|application\b/.test(hay))
    return "application";
  return "other";
}

export function toEvidenceItemVM(dto: EvidenceItemDTO): EvidenceItemVM {
  const loc = dto.source_location;
  const locLabel = loc.row != null ? `row ${loc.row}` : loc.line != null ? `line ${loc.line}` : loc.file;
  const title =
    (typeof dto.fields.event === "string" && dto.fields.event) ||
    (typeof dto.fields.summary === "string" && dto.fields.summary) ||
    (typeof dto.fields.message === "string" && dto.fields.message) ||
    `${dto.kind.toUpperCase()} record`;
  return {
    evidenceId: dto.evidence_id,
    category: categorizeEvidence(dto),
    title: String(title),
    eventTime: dto.event_time ?? null,
    kind: dto.kind,
    relationshipStatus: "observed",
    sha256: dto.sha256,
    sourceFile: dto.source_file,
    sourceLocation: locLabel,
    relatedEntities: [],
    attackMapping: [],
    stateVersion: 0,
    fields: dto.fields,
  };
}

// ---- Response-plan actions ------------------------------------------------

function targetTypeOf(
  targetId: string,
  state: IncidentStateDTO | null,
): EntityType | null {
  const e = state?.entities.find((x) => x.id === targetId);
  return (e?.type as EntityType) ?? null;
}

export function toResponsePlanActionVM(
  dto: StoredActionDTO,
  stage: Stage,
  state: IncidentStateDTO | null,
): ResponsePlanActionVM {
  const p: ProposedActionDTO = dto.proposal;
  return {
    actionId: dto.action_id,
    version: dto.version,
    basedOnStateVersion: dto.based_on_state_version,
    stage,
    tool: p.tool_name,
    target: p.target_id,
    targetType: targetTypeOf(p.target_id, state),
    risk: mapRisk(p.risk),
    escalationRequired: /isolate|disable|block|revoke|reset/i.test(p.tool_name),
    approvalRequired: true,
    state: mapActionState(dto.status),
    rationale: p.rationale,
    policyRefs: p.policy_refs,
    evidenceIds: p.evidence_ids,
    expectedEffect: p.expected_effect,
    validationChecks: p.validation_checks,
  };
}

export function toPlanVM(
  run: RunResponseDTO,
  ordinal: number,
  state: IncidentStateDTO | null,
): PlanVM {
  return {
    planId: run.plan_id,
    version: ordinal,
    basedOnStateVersion: run.based_on_state_version,
    stage: run.stage,
    createdAt: run.created_at,
    missingEvidence: run.missing_evidence,
    actions: run.actions.map((a) => toResponsePlanActionVM(a, run.stage, state)),
  };
}

// ---- Report ---------------------------------------------------------------

const REPORT_SECTION_ORDER: { key: string; title: string }[] = [
  { key: "executive_summary", title: "Executive summary" },
  { key: "classification", title: "Incident classification" },
  { key: "timeline", title: "Timeline" },
  { key: "affected", title: "Affected assets and identities" },
  { key: "evidence_index", title: "Evidence" },
  { key: "attack", title: "ATT&CK mappings" },
  { key: "decisions", title: "Decisions and approvals" },
  { key: "actions", title: "Recommended / simulated actions" },
  { key: "validation", title: "Validation results" },
  { key: "open_questions", title: "Unresolved gaps" },
  { key: "recommendations", title: "Lessons and hardening" },
];

export function toReportVM(dto: StructuredReportDTO): ReportVM {
  const sections: ReportSectionVM[] = REPORT_SECTION_ORDER.map(({ key, title }) => {
    let lines: string[] = [];
    switch (key) {
      case "executive_summary":
        lines = dto.executive_summary.text ? [dto.executive_summary.text] : [];
        break;
      case "classification": {
        const c = dto.classification;
        lines = [
          `Type: ${c.incident_type}`,
          `Status: ${c.status}`,
          `Severity: ${c.severity} (${c.severity_reason})`,
          `Phase: ${c.current_phase}`,
          `Analyst-confirmed: ${c.confirmed_by_analyst ? "yes" : "no"}`,
        ];
        break;
      }
      case "timeline":
        lines = dto.timeline.map((t) => `[${t.side}] ${t.event}`);
        break;
      case "affected":
        lines = dto.affected.map((a) => `${a.asset_id} (${a.type})`);
        break;
      case "evidence_index":
        lines = dto.evidence_index.map((e) => `${e.evidence_id} — ${e.source_file}`);
        break;
      case "attack":
        lines = dto.classification.attack_techniques.slice();
        break;
      case "decisions":
        lines = dto.actions
          .filter((a) => a.decided_by)
          .map((a) => `${a.status.toUpperCase()} by ${a.decided_by}: ${a.recommendation}`);
        break;
      case "actions":
        lines = dto.actions.map((a) => `${a.status}: ${a.recommendation}`);
        break;
      case "validation":
        lines = dto.actions
          .filter((a) => a.result)
          .map((a) => `${a.recommendation} → ${a.result}`);
        break;
      case "open_questions":
        lines = dto.open_questions.map((q) => q.question);
        break;
      case "recommendations":
        lines = (dto.recommendations as string[]).map(String);
        break;
    }
    return { key, title, present: lines.length > 0, lines };
  });

  return {
    reportId: dto.report_id,
    caseId: dto.incident_id,
    title: dto.title || dto.incident_id,
    organisation: dto.organisation,
    status: dto.status,
    generatedAt: dto.created_at,
    sections,
    completeness: {
      present: sections.filter((s) => s.present).length,
      total: sections.length,
    },
    pdfAvailable: false,
  };
}