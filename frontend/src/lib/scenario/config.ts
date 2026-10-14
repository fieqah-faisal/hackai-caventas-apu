/**
 * Scenario configuration. The fictional organisation label lives here in
 * exactly one place so the team can rename it later.
 */
export const DEMO_ORGANISATION = "Caventas Demo Organisation";

/** Exact UI copy required by the spec for the Infostealer re-plan. */
export const NEW_EVIDENCE_ANNOUNCEMENT = "New evidence received";
export const INFOSTEALER_REPLAN_EXPLANATION =
  "The first CRM session-revocation attempt did not complete; observed replay confirms the stolen session is still valid.";

/** False-alarm scenario gate (follow-on, but the config lives with scenarios). */
export const FALSE_ALARM_EVIDENCE_REQUEST =
  "Was there an approved change for FS-01 last night?";
export const FALSE_ALARM_CHANGE_REFERENCE = "CHG-2026-118";

/** Optional partner-portal Batch 3 (disabled by default). */
export const PARTNER_PORTAL_FLAG = false;
