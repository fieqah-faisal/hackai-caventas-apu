import { describe, it, expect } from "vitest";
import {
  initialSetupState,
  prerequisiteMet,
  canGoTo,
  editTitle,
  markCaseCreated,
  addAcceptedFile,
  confirmReview,
  titleValid,
} from "./stepMachine";

describe("create-case step gating", () => {
  it("blocks evidence until a valid title and case creation", () => {
    let s = initialSetupState();
    expect(prerequisiteMet("evidence", s)).toBe(false);
    s = editTitle(s, "  ");
    expect(prerequisiteMet("evidence", s)).toBe(false); // whitespace only
    s = editTitle(s, "Infostealer case");
    expect(prerequisiteMet("evidence", s)).toBe(false); // not created yet
    s = markCaseCreated(s);
    expect(prerequisiteMet("evidence", s)).toBe(true);
  });

  it("rejects over-long titles", () => {
    expect(titleValid("x".repeat(200))).toBe(true);
    expect(titleValid("x".repeat(201))).toBe(false);
  });

  it("blocks review until a file is accepted, and start until review confirmed", () => {
    let s = markCaseCreated(editTitle(initialSetupState(), "Case"));
    expect(prerequisiteMet("review", s)).toBe(false);
    s = addAcceptedFile(s);
    expect(prerequisiteMet("review", s)).toBe(true);
    expect(prerequisiteMet("start", s)).toBe(false);
    s = confirmReview(s);
    expect(prerequisiteMet("start", s)).toBe(true);
  });

  it("clears a prior review confirmation when evidence changes", () => {
    let s = confirmReview(addAcceptedFile(markCaseCreated(editTitle(initialSetupState(), "Case"))));
    expect(s.reviewConfirmed).toBe(true);
    s = addAcceptedFile(s);
    expect(s.reviewConfirmed).toBe(false); // editing an earlier step invalidates later
  });

  it("allows backward navigation but blocks forward past an unmet prerequisite", () => {
    const s = initialSetupState();
    expect(canGoTo("details", s)).toBe(true);
    expect(canGoTo("start", s)).toBe(false);
  });

  it("locks the title after case creation", () => {
    let s = markCaseCreated(editTitle(initialSetupState(), "Original"));
    s = editTitle(s, "Changed");
    expect(s.title).toBe("Original"); // read-only after creation
  });
});