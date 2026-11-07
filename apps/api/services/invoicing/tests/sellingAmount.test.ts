import { describe, expect, it } from "vitest";
import { answerProblem, centsOf, needsApproval } from "../lib/sellingAmount";

describe("selling a cost on for another amount", () => {
  it("takes approval only below the cost, to the cent", () => {
    expect(needsApproval("89.88", "89.89")).toBe(true);
    expect(needsApproval("89.89", "89.89")).toBe(false);
    expect(needsApproval("89.90", "89.89")).toBe(false);
    expect(needsApproval("0", "89.89")).toBe(true);
  });

  it("compares written differently but equal amounts as equal", () => {
    expect(centsOf("89.9")).toBe(centsOf("89.90"));
    expect(needsApproval("100", "100.00")).toBe(false);
  });

  it("asks a reason of a rejection, not of an approval", () => {
    expect(answerProblem("reject", " ")).toMatch(/why/);
    expect(answerProblem("reject", "too low")).toBeNull();
    expect(answerProblem("approve", "")).toBeNull();
    expect(answerProblem("counter", "x")).toMatch(/decision/);
  });
});
