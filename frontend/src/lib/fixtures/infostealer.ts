/**
 * Deterministic synthetic fixture data for FixtureProvider.
 *
 * This models the COMPLETE intended product contract (six-state lifecycle,
 * plan history, separate simulation and validation, structured report) so the
 * frontend can be developed and demonstrated end-to-end without a backend.
 * It is explicitly synthetic: every surface that reads it is flagged with a
 * "Synthetic demo data" indicator, and nothing here is presented as real.
 *
 * NOW is a fixed instant so renders are deterministic.
 */
import type {
  AnalysisVM,
  CaseStatus,
  EvidenceItemVM,
  PlanActionState,
  Severity,
  Stage,
  TimelineEventVM,
} from "../types";

export const NOW = new Date("2026-10-08T09:40:00Z");
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

export const INFOSTEALER_CASE_ID = "CASE-INFOSTL01";

export interface FxCase {
  caseId: string;
  title: string;
  description?: string;
  status: CaseStatus;
  severity: Severity | null;
  classification: string | null;
  stage: Stage | null;
  stateVersion: number;
  updatedAt: string;
  createdAt: string;
}

export interface FxAction {
  actionId: string;
  version: number;
  basedOnStateVersion: number;
  stage: Stage;
  tool: string;
  target: string;
  targetType: "host" | "account" | "domain" | "file" | "ip" | "process";
  risk: "low" | "moderate" | "high";
  escalationRequired: boolean;
  rationale: string;
  policyRefs: string[];
  evidenceIds: string[];
  expectedEffect: string;
  validationChecks: string[];
  state: PlanActionState;
  requiredApprover: string;
}

export interface FxPlan {
  planId: string;
  version: number;
  stage: Stage;
  basedOnStateVersion: number;
  createdAt: string;
  missingEvidence: string[];
  actionIds: string[];
}

// ---- Dashboard case list (synthetic) --------------------------------------

export const cases: FxCase[] = [
  {
    caseId: INFOSTEALER_CASE_ID,
    title: "Infostealer to session hijack — Farah (Sales)",
    status: "investigating",
    severity: "high",
    classification: "Credential theft / session hijack",
    stage: "containment",
    stateVersion: 1,
    updatedAt: minsAgo(3),
    createdAt: minsAgo(40),
  },
  {
    caseId: "CASE-PHISH204",
    title: "Phishing to account takeover — Hakim (Finance)",
    status: "investigating",
    severity: "medium",
    classification: "Account takeover",
    stage: "assessment",
    stateVersion: 2,
    updatedAt: minsAgo(18),
    createdAt: minsAgo(70),
  },
  {
    caseId: "CASE-BACKUP118",
    title: "Planned backup migration — FS-01 (false alarm)",
    status: "open",
    severity: "low",
    classification: null,
    stage: "assessment",
    stateVersion: 1,
    updatedAt: minsAgo(26),
    createdAt: minsAgo(55),
  },
  {
    caseId: "CASE-TRIAGE77",
    title: "Unusual admin logon — build server",
    status: "open",
    severity: null,
    classification: null,
    stage: null,
    stateVersion: 0,
    updatedAt: minsAgo(52),
    createdAt: minsAgo(52),
  },
  {
    caseId: "CASE-CLOSED12",
    title: "Mis-scoped firewall rule — resolved",
    status: "closed",
    severity: "low",
    classification: "Misconfiguration",
    stage: "restoration",
    stateVersion: 6,
    updatedAt: minsAgo(600),
    createdAt: minsAgo(1440),
  },
];

// ---- Infostealer evidence, in two reveal batches --------------------------

export const infostealerEvidenceBatch1: EvidenceItemVM[] = [
  {
    evidenceId: "EV-IS-001",
    category: "network",
    title: "Download from fake PDF-editor domain pdf-editor-free[.]example",
    eventTime: minsAgo(240),
    kind: "json",
    relationshipStatus: "observed",
    sha256: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    sourceFile: "proxy_logs.json",
    sourceLocation: "row 142",
    relatedEntities: ["HOST::SALES-LT-07", "DOMAIN::pdf-editor-free.example"],
    attackMapping: [],
    stateVersion: 1,
    fields: { domain: "pdf-editor-free.example", action: "download" },
  },
  {
    evidenceId: "EV-IS-002",
    category: "endpoint",
    title: "Unsigned installer executed: PDFEditorSetup.exe",
    eventTime: minsAgo(238),
    kind: "csv",
    relationshipStatus: "observed",
    sha256: "b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3",
    sourceFile: "edr_process.csv",
    sourceLocation: "row 58",
    relatedEntities: ["HOST::SALES-LT-07", "PROCESS::SALES-LT-07::pdfeditorsetup.exe"],
    attackMapping: ["T1204.002"],
    stateVersion: 1,
    fields: { process: "PDFEditorSetup.exe", signed: "false" },
  },
  {
    evidenceId: "EV-IS-003",
    category: "endpoint",
    title: "Browser credential store accessed by unsigned process",
    eventTime: minsAgo(236),
    kind: "csv",
    relationshipStatus: "observed",
    sha256: "c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4",
    sourceFile: "edr_process.csv",
    sourceLocation: "row 61",
    relatedEntities: ["HOST::SALES-LT-07", "ACCOUNT::farah"],
    attackMapping: ["T1555.003"],
    stateVersion: 1,
    fields: { target: "Login Data", process: "PDFEditorSetup.exe" },
  },
  {
    evidenceId: "EV-IS-004",
    category: "network",
    title: "Upload of stolen data to 203.0.113.45",
    eventTime: minsAgo(234),
    kind: "json",
    relationshipStatus: "observed",
    sha256: "d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5",
    sourceFile: "proxy_logs.json",
    sourceLocation: "row 190",
    relatedEntities: ["HOST::SALES-LT-07", "IP::203.0.113.45"],
    attackMapping: ["T1041"],
    stateVersion: 1,
    fields: { dest_ip: "203.0.113.45", bytes: 48213 },
  },
];

export const infostealerEvidenceBatch2: EvidenceItemVM[] = [
  {
    evidenceId: "EV-IS-010",
    category: "identity",
    title: "Session replay from 198.51.100.23 — new browser, no MFA prompt",
    eventTime: minsAgo(80),
    kind: "json",
    relationshipStatus: "observed",
    sha256: "e5f6a7b8c9d0e5f6a7b8c9d0e5f6a7b8c9d0e5f6a7b8c9d0e5f6a7b8c9d0e5f6",
    sourceFile: "idp_signins.json",
    sourceLocation: "row 77",
    relatedEntities: ["ACCOUNT::farah", "IP::198.51.100.23"],
    attackMapping: ["T1550.004"],
    stateVersion: 2,
    fields: { src_ip: "198.51.100.23", mfa: "not_prompted" },
  },
  {
    evidenceId: "EV-IS-011",
    category: "application",
    title: "Export of 1,200 customer records from CRM",
    eventTime: minsAgo(76),
    kind: "csv",
    relationshipStatus: "observed",
    sha256: "f6a7b8c9d0e1f6a7b8c9d0e1f6a7b8c9d0e1f6a7b8c9d0e1f6a7b8c9d0e1f6a7",
    sourceFile: "crm_audit.csv",
    sourceLocation: "row 2041",
    relatedEntities: ["ACCOUNT::farah", "HOST::CRM"],
    attackMapping: ["T1213"],
    stateVersion: 2,
    fields: { records: 1200, object: "customer" },
  },
];

// ---- Timeline (held-back items gated by batch) ----------------------------

export const infostealerTimelineBatch1: TimelineEventVM[] = [
  { id: "TL-1", time: minsAgo(240), label: "Fake PDF-editor domain downloaded", kind: "relevant", relationshipStatus: "observed", evidenceId: "EV-IS-001" },
  { id: "TL-2", time: minsAgo(238), label: "Unsigned installer executed", kind: "relevant", relationshipStatus: "observed", evidenceId: "EV-IS-002" },
  { id: "TL-3", time: minsAgo(236), label: "Browser credential store accessed", kind: "relevant", relationshipStatus: "observed", evidenceId: "EV-IS-003" },
  { id: "TL-4", time: minsAgo(234), label: "Data uploaded to 203.0.113.45", kind: "relevant", relationshipStatus: "observed", evidenceId: "EV-IS-004" },
  { id: "TL-D1", time: minsAgo(235), label: "Routine Windows update check", kind: "benign_decoy", relationshipStatus: "observed", evidenceId: null },
  { id: "TL-5", time: minsAgo(40), label: "Analyst opened the alert", kind: "analyst_added", relationshipStatus: "observed", evidenceId: null },
];

export const infostealerTimelineBatch2: TimelineEventVM[] = [
  { id: "TL-10", time: minsAgo(80), label: "Session replay from new IP, no MFA", kind: "newly_introduced", relationshipStatus: "observed", evidenceId: "EV-IS-010" },
  { id: "TL-11", time: minsAgo(76), label: "1,200 CRM records exported", kind: "newly_introduced", relationshipStatus: "inferred", evidenceId: "EV-IS-011" },
];

// ---- Analysis (per batch) -------------------------------------------------

export const infostealerAnalysisBatch1: AnalysisVM = {
  classification: "Credential theft via infostealer",
  summary: "Synthetic records support credential access and outbound transfer from one workstation.",
  confidence: { value: 0.72, basis: "Model-reported by the deterministic fixture; advisory and not a calibrated probability.", advisory: true },
  planner: { kind: "deterministic", adapter: "FixtureProvider", model: "deterministic-fixture-v1" },
  affectedEntities: [
    { id: "HOST::SALES-LT-07", type: "host", name: "SALES-LT-07" },
    { id: "ACCOUNT::farah", type: "account", name: "farah" },
  ],
  attackTechniques: ["T1204.002", "T1555.003", "T1041"],
  missingEvidence: ["Identity sign-in logs for the affected account"],
  hypotheses: ["Stolen browser credentials may enable session replay"],
};

export const infostealerAnalysisBatch2: AnalysisVM = {
  classification: "Credential theft escalating to session hijack + data exfiltration",
  summary: "Synthetic records support credential theft followed by session reuse and a CRM export.",
  confidence: { value: 0.9, basis: "Model-reported by the deterministic fixture; advisory and not a calibrated probability.", advisory: true },
  planner: { kind: "deterministic", adapter: "FixtureProvider", model: "deterministic-fixture-v1" },
  affectedEntities: [
    { id: "HOST::SALES-LT-07", type: "host", name: "SALES-LT-07" },
    { id: "ACCOUNT::farah", type: "account", name: "farah" },
    { id: "HOST::CRM", type: "host", name: "CRM" },
  ],
  attackTechniques: ["T1204.002", "T1555.003", "T1041", "T1550.004", "T1213"],
  missingEvidence: [],
  hypotheses: ["Exported customer records may trigger a data-protection notification duty"],
};

// ---- Plans: v1 (batch 1) and v2 (batch 2) ---------------------------------

function act(partial: Partial<FxAction> & Pick<FxAction, "actionId" | "tool" | "target" | "targetType" | "rationale">): FxAction {
  return {
    version: 1,
    basedOnStateVersion: 1,
    stage: "containment",
    risk: "moderate",
    escalationRequired: false,
    policyRefs: [],
    evidenceIds: [],
    expectedEffect: "",
    validationChecks: [],
    state: "proposed",
    requiredApprover: "soc_analyst",
    ...partial,
  } as FxAction;
}

export const infostealerPlanV1Actions: FxAction[] = [
  act({ actionId: "ACT-IS-1A", tool: "isolate_host", target: "HOST::SALES-LT-07", targetType: "host", risk: "high", rationale: "Isolate Farah's laptop to stop further infostealer activity.", policyRefs: ["POL-04"], evidenceIds: ["EV-IS-002", "EV-IS-004"], expectedEffect: "Host removed from the network.", validationChecks: ["Host unreachable from corp network"], basedOnStateVersion: 1, stage: "containment" }),
  act({ actionId: "ACT-IS-1B", tool: "preserve_evidence", target: "HOST::SALES-LT-07", targetType: "host", risk: "low", rationale: "Preserve memory and disk before re-imaging.", policyRefs: ["POL-05"], evidenceIds: ["EV-IS-003"], expectedEffect: "Forensic images captured.", validationChecks: ["Image hash recorded"], stage: "preservation" }),
  act({ actionId: "ACT-IS-1C", tool: "block_domain", target: "DOMAIN::pdf-editor-free.example", targetType: "domain", risk: "low", rationale: "Block the malicious PDF-editor domain at the proxy.", policyRefs: ["POL-09"], evidenceIds: ["EV-IS-001"], expectedEffect: "Domain resolution blocked.", validationChecks: ["Proxy denies the domain"], stage: "containment" }),
  act({ actionId: "ACT-IS-1D", tool: "reimage_host", target: "HOST::SALES-LT-07", targetType: "host", risk: "moderate", escalationRequired: true, requiredApprover: "it_manager", rationale: "Re-image the laptop after preservation completes.", policyRefs: ["POL-01", "POL-06"], evidenceIds: ["EV-IS-002"], expectedEffect: "Clean OS restored.", validationChecks: ["Host rebuilt from gold image"], stage: "eradication" }),
  act({ actionId: "ACT-IS-1E", tool: "revoke_sessions", target: "ACCOUNT::farah", targetType: "account", risk: "moderate", rationale: "Revoke Farah's browser sessions because browser credentials were accessed.", policyRefs: ["POL-07"], evidenceIds: ["EV-IS-003"], expectedEffect: "Existing sessions invalidated.", validationChecks: ["No active sessions remain"], stage: "containment" }),
];

export const infostealerPlanV2Actions: FxAction[] = [
  // unchanged (carried from v1)
  { ...infostealerPlanV1Actions[1], version: 2, basedOnStateVersion: 2 }, // preserve
  { ...infostealerPlanV1Actions[2], version: 2, basedOnStateVersion: 2 }, // block domain
  // replaced-or-insufficient: re-image alone is now insufficient
  { ...infostealerPlanV1Actions[3], version: 2, basedOnStateVersion: 2 },
  // added
  act({ actionId: "ACT-IS-2E", tool: "revoke_sessions", target: "ACCOUNT::farah", targetType: "account", risk: "moderate", rationale: "Retry session revocation after the CRM-side revocation fault; replay confirms the stolen session remained valid.", policyRefs: ["POL-07"], evidenceIds: ["EV-IS-010"], expectedEffect: "All sessions invalidated.", validationChecks: ["No active sessions remain"], version: 2, basedOnStateVersion: 2, stage: "containment" }),
  act({ actionId: "ACT-IS-2F", tool: "reset_password", target: "ACCOUNT::farah", targetType: "account", risk: "moderate", rationale: "Reset the password exposed by the infostealer.", policyRefs: ["POL-07"], evidenceIds: ["EV-IS-003"], expectedEffect: "Password rotated.", validationChecks: ["Old password rejected"], version: 2, basedOnStateVersion: 2, stage: "eradication" }),
  // policy-triggered
  act({ actionId: "ACT-IS-2G", tool: "disable_account", target: "ACCOUNT::farah", targetType: "account", risk: "high", escalationRequired: true, requiredApprover: "it_manager", rationale: "Request IT-manager approval before disabling the account (high-impact).", policyRefs: ["POL-02"], evidenceIds: ["EV-IS-010"], expectedEffect: "Account disabled pending review.", validationChecks: ["Account cannot authenticate"], version: 2, basedOnStateVersion: 2, stage: "containment" }),
];

export const infostealerPlanV1: FxPlan = {
  planId: "PLAN-IS-V1",
  version: 1,
  stage: "containment",
  basedOnStateVersion: 1,
  createdAt: minsAgo(200),
  missingEvidence: ["Identity sign-in logs"],
  actionIds: infostealerPlanV1Actions.map((a) => a.actionId),
};

export const infostealerPlanV2: FxPlan = {
  planId: "PLAN-IS-V2",
  version: 2,
  stage: "containment",
  basedOnStateVersion: 2,
  createdAt: minsAgo(60),
  missingEvidence: [],
  actionIds: infostealerPlanV2Actions.map((a) => a.actionId),
};
