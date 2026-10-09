import type { DiffCategory, PlanDiffEntryVM, PlanDiffVM, PlanVM, ResponsePlanActionVM } from "../types";
import { INFOSTEALER_REPLAN_EXPLANATION } from "./config";

/** Identity for comparing actions across plan versions (tool + target). */
function actionKey(a: ResponsePlanActionVM): string {
  return `${a.tool}::${a.target}`;
}

/** Policy-triggered heuristic: high-impact actions that require escalation. */
function isPolicyTriggered(a: ResponsePlanActionVM): boolean {
  return a.escalationRequired || a.policyRefs.length > 1;
}

/**
 * Compute the plan diff from v1 -> v2. Every v2 action is assigned to EXACTLY
 * one of four mutually-exclusive, collectively-exhaustive categories:
 *   - policy_triggered: added by a policy rule (escalation / multi-policy)
 *   - added: present in v2, absent in v1
 *   - replaced_or_insufficient: present in both but re-targeted/insufficient
 *     (same key, but v1's intent was found insufficient — flagged on the action)
 *   - unchanged: present in both, materially the same
 */
export function computePlanDiff(
  v1: PlanVM,
  v2: PlanVM,
  explanation: string = INFOSTEALER_REPLAN_EXPLANATION,
): PlanDiffVM {
  const v1Keys = new Set(v1.actions.map(actionKey));
  // Any v1 action whose intent is explicitly superseded in v2 (same target,
  // different tool) marks the carried-over action as insufficient.
  const v1Targets = new Map<string, string[]>();
  for (const a of v1.actions) {
    const list = v1Targets.get(a.target) ?? [];
    list.push(a.tool);
    v1Targets.set(a.target, list);
  }

  const entries: PlanDiffEntryVM[] = v2.actions.map((a) => {
    let category: DiffCategory;
    if (isPolicyTriggered(a) && !v1Keys.has(actionKey(a))) {
      category = "policy_triggered";
    } else if (!v1Keys.has(actionKey(a))) {
      // new action; if it addresses a target v1 also touched, it reinforces an
      // insufficient v1 response; otherwise it is simply added.
      category = v1Targets.has(a.target) ? "replaced_or_insufficient" : "added";
    } else {
      category = "unchanged";
    }
    return { action: a, category };
  });

  return { fromVersion: v1.version, toVersion: v2.version, explanation, entries };
}

/** Verify every v2 action lands in exactly one category (used by tests). */
export function diffIsMECE(diff: PlanDiffVM, v2: PlanVM): boolean {
  if (diff.entries.length !== v2.actions.length) return false;
  const seen = new Set<string>();
  for (const e of diff.entries) {
    if (seen.has(e.action.actionId)) return false;
    seen.add(e.action.actionId);
  }
  return v2.actions.every((a) => seen.has(a.actionId));
}