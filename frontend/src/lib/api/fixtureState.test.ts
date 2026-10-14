import { expect, it } from "vitest";
import { FixtureProvider } from "./fixtureProvider";
import { INFOSTEALER_CASE_ID } from "../fixtures/infostealer";

it("keeps prior synthetic graph versions unchanged and requires explicit re-analysis", async () => {
  const p = new FixtureProvider();
  const first = await p.getStateVersion(INFOSTEALER_CASE_ID, 1);
  expect(first.kind).toBe("ok");
  const original = first.kind === "ok" ? JSON.stringify(first.value.data) : "";
  const revealed = await p.revealNextEvidenceBatch(INFOSTEALER_CASE_ID);
  expect(revealed.kind).toBe("ok");
  const plansBefore = await p.getPlans(INFOSTEALER_CASE_ID);
  expect(plansBefore.kind === "ok" && plansBefore.value.data).toHaveLength(1);
  const second = await p.getStateVersion(INFOSTEALER_CASE_ID, 2);
  expect(second.kind === "ok" && second.value.data.parentVersion).toBe(1);
  const replanned = await p.createAnalysisRun(INFOSTEALER_CASE_ID);
  expect(replanned.kind === "ok" && replanned.value.data.basedOnStateVersion).toBe(2);
  const plansAfter = await p.getPlans(INFOSTEALER_CASE_ID);
  expect(plansAfter.kind === "ok" && plansAfter.value.data).toHaveLength(2);

  await p.submitDecision(INFOSTEALER_CASE_ID, "ACT-IS-2F", "approve");
  const simulated = await p.executeAction(INFOSTEALER_CASE_ID, "ACT-IS-2F");
  expect(simulated.kind).toBe("ok");
  const later = await p.getCurrentState(INFOSTEALER_CASE_ID);
  expect(later.kind === "ok" && later.value.data.version).toBe(3);
  if (later.kind === "ok") expect(later.value.data.relationships.some((r) => r.category === "response" && r.executionId)).toBe(true);
  const again = await p.getStateVersion(INFOSTEALER_CASE_ID, 1);
  expect(again.kind === "ok" && JSON.stringify(again.value.data)).toBe(original);
});
