import { describe, expect, it } from "vitest";
import { planQuoteFx } from "../lib/quoteFx";

const stored = { date: "2026-10-14", fixingDate: "2026-10-13", roePct: 102, rates: { EUR: 24.375 }, lockedAt: "x" };
const forged = { date: "2026-10-14", fixingDate: "2026-10-13", roePct: 150, rates: { EUR: 1 }, lockedAt: "y" };

describe("planQuoteFx", () => {
  it("stamps today's rates when a quote is sent without stored ones", () => {
    expect(planQuoteFx({ quoteStatus: "quoted" })).toEqual({ action: "stamp" });
    expect(planQuoteFx({ quoteStatus: "won" }, { quoteStatus: "ready_to_send" })).toEqual({ action: "stamp" });
  });

  it("keeps the rates stored on a sent quote, whatever the client sends", () => {
    for (const s of ["quoted", "feedback", "won", "lost", "expired"]) {
      expect(planQuoteFx({ quoteStatus: s, fx: forged }, { fx: stored })).toEqual({ action: "reuse", fx: stored });
    }
  });

  it("never stores rates the client made up", () => {
    // no rates stored yet: a client-sent fx is replaced by a server stamp
    expect(planQuoteFx({ quoteStatus: "quoted", fx: forged }, { quoteStatus: "draft" })).toEqual({ action: "stamp" });
    expect(planQuoteFx({ quoteStatus: "quoted", fx: forged })).toEqual({ action: "stamp" });
  });

  it("drops rates from a quote that is revised or back in draft", () => {
    expect(planQuoteFx({ quoteStatus: "revised", fx: stored }, { fx: stored })).toEqual({ action: "clear" });
    expect(planQuoteFx({ quoteStatus: "draft", fx: forged })).toEqual({ action: "clear" });
    expect(planQuoteFx({ quoteStatus: "ready_to_send" })).toEqual({ action: "leave" });
  });

  it("leaves non-sales quotes alone", () => {
    expect(planQuoteFx({})).toEqual({ action: "leave" });
    expect(planQuoteFx(null)).toEqual({ action: "leave" });
  });
});
