/**
 * Synthetic response bodies with the exact field names, value shapes and
 * ordering the real backend returned in the link API-mode run (Firestore
 * emulator). Shared by the mapping and RealProvider contract tests.
 */
import type { PlanDocDTO } from "@/lib/api/dto";

/**
 * GET /cases/{id}/plans as real Firestore returned it: document-ID order,
 * NOT creation order (newest, middle, oldest). Stages differ here so the
 * "latest plan" is observable in assertions.
 */
export const PLANS_IN_DOC_ID_ORDER: PlanDocDTO[] = [
  {
    plan_id: "PLAN-4e0000000003",
    case_id: "CASE-TEST0001",
    based_on_state_version: 2,
    stage: "eradication",
    missing_evidence: [],
    action_ids: ["ACT-000000000003"],
    created_at: "2026-10-12T02:45:53.467460+00:00",
  },
  {
    plan_id: "PLAN-730000000002",
    case_id: "CASE-TEST0001",
    based_on_state_version: 2,
    stage: "containment",
    missing_evidence: [],
    action_ids: ["ACT-000000000002"],
    created_at: "2026-10-12T02:45:53.460138+00:00",
  },
  {
    plan_id: "PLAN-f10000000001",
    case_id: "CASE-TEST0001",
    based_on_state_version: 2,
    stage: "assessment",
    missing_evidence: [],
    action_ids: ["ACT-000000000001"],
    created_at: "2026-10-12T02:43:38.195695+00:00",
  },
];
