import { describe, expect, it } from "vitest";
import { asksValidity, transitionRequest, withSentBy } from "./statusChange";

describe("asksValidity", () => {
  it("asks for days when the quote has no validity, or one that has passed", () => {
    expect(asksValidity(null, "2026-10-21")).toBe(true);
    expect(asksValidity("2026-10-20", "2026-10-21")).toBe(true);
    expect(asksValidity("2026-10-21", "2026-10-21")).toBe(false);
  });
});

describe("transitionRequest", () => {
  it("sends validity only to Quoted and the reason only to Lost", () => {
    expect(transitionRequest({ status: "quoted", validUntil: "2026-11-30", lostReason: "x" })).toEqual({
      to: "quoted",
      comment: undefined,
      validUntil: "2026-11-30",
      lostReason: undefined,
    });
    expect(transitionRequest({ status: "lost", validUntil: "2026-11-30", lostReason: "Pricing: Price too high" })).toEqual({
      to: "lost",
      comment: undefined,
      validUntil: undefined,
      lostReason: "Pricing: Price too high",
    });
  });

  it("trims the comment and drops a blank one", () => {
    expect(transitionRequest({ status: "won", comment: "  ordered  " }).comment).toBe("ordered");
    expect(transitionRequest({ status: "won", comment: "   " }).comment).toBeUndefined();
  });

  it("names the status the screen showed, so a page that still shows Quoted cannot change a quote a colleague made Won", () => {
    expect(transitionRequest({ status: "won" }, "quoted")).toEqual({ to: "won", comment: undefined, validUntil: undefined, lostReason: undefined, expectedStatus: "quoted" });
    // The status as shown: an expired quote is Expired, whatever it is stored as.
    expect(transitionRequest({ status: "draft" }, "expired").expectedStatus).toBe("expired");
    // Asked without one (no screen behind it), the server goes by the move alone.
    expect(transitionRequest({ status: "won" })).not.toHaveProperty("expectedStatus");
  });

  it("never carries rates: the server stamps them", () => {
    expect(Object.keys(transitionRequest({ status: "quoted" }))).not.toContain("exchange");
  });
});

describe("how a quote set to Quoted by hand was sent (User Council S21)", () => {
  it("goes into the history in front of the comment", () => {
    expect(withSentBy(" Called Petr ", "Phone")).toBe("How it was sent: Phone. Called Petr");
    expect(withSentBy("", "PDF handed over")).toBe("How it was sent: PDF handed over.");
  });

  it("leaves the comment as it is when nobody said", () => {
    expect(withSentBy("As agreed", null)).toBe("As agreed");
    expect(withSentBy("", undefined)).toBe("");
  });
});
