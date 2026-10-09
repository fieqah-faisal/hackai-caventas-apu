import { describe, it, expect } from "vitest";
import { evaluateChangeReference } from "./falseAlarm";
import { FALSE_ALARM_CHANGE_REFERENCE } from "./config";

describe("false-alarm evidence gate", () => {
  it("classifies a false positive ONLY on the exact change reference", () => {
    expect(evaluateChangeReference(FALSE_ALARM_CHANGE_REFERENCE).outcome).toBe("false_positive");
  });

  it("keeps the case open for any non-matching input", () => {
    expect(evaluateChangeReference("CHG-2026-119").outcome).toBe("pending");
    expect(evaluateChangeReference("chg-2026-118").outcome).toBe("pending"); // case-sensitive
    expect(evaluateChangeReference(" CHG-2026-118 ").outcome).toBe("pending"); // no trimming to match
    expect(evaluateChangeReference("").outcome).toBe("pending");
  });

  it("reports a no-match message with the supplied value", () => {
    const r = evaluateChangeReference("CHG-9999");
    expect(r.outcome).toBe("pending");
    if (r.outcome === "pending") expect(r.message).toContain("CHG-9999");
  });
});