import { FALSE_ALARM_CHANGE_REFERENCE } from "./config";

export type FalseAlarmResult =
  | { outcome: "pending"; message: string }
  | { outcome: "false_positive" };

/**
 * The false-alarm evidence gate. The case is classified a false positive ONLY
 * when the supplied change reference exactly matches CHG-2026-118. Any other
 * input keeps the case open and reports a no-match.
 */
export function evaluateChangeReference(input: string): FalseAlarmResult {
  if (input === FALSE_ALARM_CHANGE_REFERENCE) {
    return { outcome: "false_positive" };
  }
  return {
    outcome: "pending",
    message:
      input.trim().length === 0
        ? "Provide the approved change reference to proceed."
        : `No approved change matched "${input}". The case stays open.`,
  };
}