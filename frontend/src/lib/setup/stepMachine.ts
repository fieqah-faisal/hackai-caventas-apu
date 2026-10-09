import type { StepId } from "../types";

export type StepStatus = "complete" | "active" | "locked";

export interface SetupState {
  active: StepId;
  // step 1
  title: string;
  description: string;
  analystNote: string;
  // persistence
  caseCreated: boolean; // POST /cases succeeded; title+description become read-only
  // step 2
  acceptedFileCount: number;
  clientRejectedCount: number;
  // step 3
  reviewConfirmed: boolean;
  // step 4
  runStarted: boolean;
}

export const STEP_ORDER: StepId[] = ["details", "evidence", "review", "start"];

export const STEP_LABEL: Record<StepId, string> = {
  details: "Case details",
  evidence: "Evidence",
  review: "Evidence review",
  start: "Start analysis",
};

export function initialSetupState(): SetupState {
  return {
    active: "details",
    title: "",
    description: "",
    analystNote: "",
    caseCreated: false,
    acceptedFileCount: 0,
    clientRejectedCount: 0,
    reviewConfirmed: false,
    runStarted: false,
  };
}

const TITLE_MAX = 200;

export function titleValid(title: string): boolean {
  const t = title.trim();
  return t.length > 0 && t.length <= TITLE_MAX;
}

/** Whether a step's prerequisites are met (i.e. it may be entered/completed). */
export function prerequisiteMet(step: StepId, s: SetupState): boolean {
  switch (step) {
    case "details":
      return true;
    case "evidence":
      return titleValid(s.title) && s.caseCreated;
    case "review":
      return s.acceptedFileCount > 0;
    case "start":
      return s.reviewConfirmed;
  }
}

/** Short reason a step is disabled (empty when enabled). */
export function prerequisiteReason(step: StepId, s: SetupState): string {
  if (prerequisiteMet(step, s)) return "";
  switch (step) {
    case "evidence":
      return !titleValid(s.title)
        ? "Enter a case title (1–200 characters) first."
        : "Create the case first.";
    case "review":
      return "Upload at least one evidence file first.";
    case "start":
      return "Confirm the evidence review first.";
    default:
      return "";
  }
}

export function stepStatuses(s: SetupState): Record<StepId, StepStatus> {
  const out = {} as Record<StepId, StepStatus>;
  for (const step of STEP_ORDER) {
    if (step === s.active) out[step] = "active";
    else if (STEP_ORDER.indexOf(step) < STEP_ORDER.indexOf(s.active) && prerequisiteMet(step, s))
      out[step] = "complete";
    else out[step] = "locked";
  }
  return out;
}

/** Can the analyst move to `target` right now? Always allowed to go backward. */
export function canGoTo(target: StepId, s: SetupState): boolean {
  const ti = STEP_ORDER.indexOf(target);
  const ai = STEP_ORDER.indexOf(s.active);
  if (ti <= ai) return true; // backward or current always allowed
  // forward only if every intervening prerequisite is met
  for (let i = ai + 1; i <= ti; i++) {
    if (!prerequisiteMet(STEP_ORDER[i], s)) return false;
  }
  return true;
}

/**
 * Editing an earlier input invalidates later-step progress. Returns the next
 * state with downstream confirmations cleared when an earlier field changed.
 */
export function editTitle(s: SetupState, title: string): SetupState {
  // title can only change before the case is created
  if (s.caseCreated) return s;
  return { ...s, title };
}

export function markCaseCreated(s: SetupState): SetupState {
  return { ...s, caseCreated: true };
}

export function addAcceptedFile(s: SetupState): SetupState {
  // changing evidence invalidates a prior review confirmation
  return { ...s, acceptedFileCount: s.acceptedFileCount + 1, reviewConfirmed: false };
}

export function addClientRejected(s: SetupState): SetupState {
  return { ...s, clientRejectedCount: s.clientRejectedCount + 1 };
}

export function confirmReview(s: SetupState): SetupState {
  return { ...s, reviewConfirmed: true };
}

export function markRunStarted(s: SetupState): SetupState {
  return { ...s, runStarted: true };
}

export function goTo(s: SetupState, target: StepId): SetupState {
  return canGoTo(target, s) ? { ...s, active: target } : s;
}