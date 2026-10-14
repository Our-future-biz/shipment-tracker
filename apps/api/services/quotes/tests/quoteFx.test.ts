import { describe, expect, it } from "vitest";
import { fxWriteFor, mayStampFx, planQuoteFx } from "../lib/quoteFx";

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

describe("fxWriteFor", () => {
  const today = { date: "2026-10-14", fixingDate: "2026-10-14", roePct: 100, rates: { EUR: 24.3 }, lockedAt: "2026-10-14T10:00:00.000Z" };
  const stored = { ...today, date: "2026-10-01", lockedAt: "2026-10-01T10:00:00.000Z" };

  it("stamps today's rates on a quote sent or won without stored rates", () => {
    expect(fxWriteFor("quoted", { quoteStatus: "draft" }, today)).toEqual({ fx: today });
    expect(fxWriteFor("won", { quoteStatus: "ready_to_send" }, today)).toEqual({ fx: today });
  });

  it("keeps the rates a sent quote already stores", () => {
    expect(fxWriteFor("won", { quoteStatus: "quoted", fx: stored }, today)).toBeUndefined();
  });

  it("drops stored rates when the quote goes back to a draft status, once", () => {
    expect(fxWriteFor("revised", { fx: stored }, undefined)).toEqual({ fx: null });
    expect(fxWriteFor("revised", { fx: null }, undefined)).toBeUndefined();
  });

  it("gives a Lost quote no rates", () => {
    expect(fxWriteFor("lost", { quoteStatus: "draft" }, undefined)).toBeUndefined();
  });

  it("refuses to stamp without today's rates instead of storing none", () => {
    expect(() => fxWriteFor("quoted", {}, undefined)).toThrow("today's rates are needed");
  });

  it("knows which statuses may need today's rates", () => {
    expect(["quoted", "feedback", "won"].every(mayStampFx)).toBe(true);
    expect(["draft", "ready_to_send", "revised", "lost"].some(mayStampFx)).toBe(false);
  });
});
