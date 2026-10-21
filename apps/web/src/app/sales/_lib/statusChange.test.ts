import { describe, expect, it } from "vitest";
import { asksValidity, transitionRequest } from "./statusChange";

describe("asksValidity", () => {
  it("asks for days when the quote has no validity, or one that has passed", () => {
    expect(asksValidity(null, "2026-10-21")).toBe(true);
    expect(asksValidity("2026-10-20", "2026-10-21")).toBe(true);
    expect(asksValidity("2026-10-21", "2026-10-21")).toBe(false);
  });
});

describe("transitionRequest", () => {
  it("sends validity only to Quoted and the reason only to Lost", () => {
    expect(transitionRequest({ status: "quoted", validityDays: 15, lostReason: "x" })).toEqual({
      to: "quoted",
      comment: undefined,
      validityDays: 15,
      lostReason: undefined,
    });
    expect(transitionRequest({ status: "lost", validityDays: 15, lostReason: "Pricing: Price too high" })).toEqual({
      to: "lost",
      comment: undefined,
      validityDays: undefined,
      lostReason: "Pricing: Price too high",
    });
  });

  it("trims the comment and drops a blank one", () => {
    expect(transitionRequest({ status: "won", comment: "  ordered  " }).comment).toBe("ordered");
    expect(transitionRequest({ status: "won", comment: "   " }).comment).toBeUndefined();
  });

  it("never carries rates: the server stamps them", () => {
    expect(Object.keys(transitionRequest({ status: "quoted" }))).not.toContain("exchange");
  });
});
