import { describe, expect, it } from "vitest";
import { chargeableWaitingBlocks, closeState, decisionChoices, decisionState, exceptionChip, exceptionDraftProblems, isExceptionOpen, waitingText } from "./exceptions";

describe("exception open / closed", () => {
  it("is open until decided and closed", () => {
    expect(isExceptionOpen({ decision: "PENDING", closedAt: null })).toBe(true);
    expect(isExceptionOpen({ decision: "ABSORB", closedAt: null })).toBe(true);
    expect(isExceptionOpen({ decision: "ABSORB", closedAt: "2026-10-15T10:00:00Z" })).toBe(false);
    expect(exceptionChip({ decision: "PENDING", closedAt: null }).label).toBe("Open");
    expect(exceptionChip({ decision: "CLAIM_HAULIER", closedAt: null }).label).toBe("Decided");
  });

  it("closes only when decided", () => {
    expect(closeState({ decision: "PENDING", closedAt: null })).toEqual({ allowed: false, reason: "Decide it first" });
    expect(closeState({ decision: "ABSORB", closedAt: null }).allowed).toBe(true);
    expect(closeState({ decision: "ABSORB", closedAt: "2026-10-15T10:00:00Z" }).allowed).toBe(false);
  });
});

describe("exception decisions per role", () => {
  it("offers a manager every decision and anyone else only absorbing", () => {
    expect(decisionChoices(true)).toEqual(["CHARGE_CUSTOMER", "CLAIM_HAULIER", "ABSORB"]);
    expect(decisionChoices(false)).toEqual(["ABSORB"]);
  });

  it("lets anyone absorb at no cost, a manager anything with an amount", () => {
    expect(decisionState("ABSORB", 0, false, "our fault").allowed).toBe(true);
    expect(decisionState("ABSORB", null, false, "our fault").allowed).toBe(true);
    expect(decisionState("ABSORB", 500, false, "our fault").allowed).toBe(false);
    expect(decisionState("CHARGE_CUSTOMER", 500, false, "waited").allowed).toBe(false);
    expect(decisionState("CHARGE_CUSTOMER", 500, true, "waited").allowed).toBe(true);
    expect(decisionState("ABSORB", 500, true, "goodwill").allowed).toBe(true);
  });

  it("needs an amount to charge or claim, and a reason", () => {
    expect(decisionState("CLAIM_HAULIER", 0, true, "broken pallet").reason).toBe("Enter the amount");
    expect(decisionState("CLAIM_HAULIER", 1200, true, "").reason).toBe("Give the reason");
    expect(decisionState("PENDING", 0, true, "x").allowed).toBe(false);
  });
});

describe("new exception", () => {
  it("asks what each kind needs", () => {
    const base = { failedReason: null, description: "Consignee closed", pieces: null, waitingMinutes: null };
    expect(exceptionDraftProblems({ ...base, kind: "FAILED_DELIVERY" })).toEqual(["Say why the delivery failed"]);
    expect(exceptionDraftProblems({ ...base, kind: "FAILED_DELIVERY", failedReason: "CLOSED" })).toEqual([]);
    expect(exceptionDraftProblems({ ...base, kind: "WAITING_TIME" })).toEqual(["Enter the minutes waited"]);
    expect(exceptionDraftProblems({ ...base, kind: "DAMAGE" })).toEqual(["Enter the pieces"]);
    expect(exceptionDraftProblems({ ...base, kind: "OTHER", description: "" })).toEqual(["Describe what happened"]);
  });

  it("charges waiting time per started 15 minutes beyond the free time", () => {
    expect(chargeableWaitingBlocks(30, 30)).toBe(0);
    expect(chargeableWaitingBlocks(31, 30)).toBe(1);
    expect(chargeableWaitingBlocks(75, 30)).toBe(3);
    expect(chargeableWaitingBlocks(150, 120)).toBe(2);
    expect(chargeableWaitingBlocks(null, 30)).toBe(0);
    expect(waitingText(75, 30)).toBe("75 min waited, 30 free → 3 × 15 min chargeable");
    expect(waitingText(20, 30)).toMatch(/nothing to charge/);
  });
});
