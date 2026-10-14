import { describe, expect, it } from "vitest";
import { fxActionFor } from "../lib/quoteFx";

const fx = { date: "2026-10-14", fixingDate: "2026-10-13", roePct: 102, rates: { EUR: 24.375 }, lockedAt: "x" };

describe("fxActionFor", () => {
  it("stores the rates when a quote is sent", () => {
    expect(fxActionFor({ quoteStatus: "quoted" })).toBe("stamp");
    expect(fxActionFor({ quoteStatus: "won" })).toBe("stamp"); // reached without passing through quoted
  });

  it("never changes rates already stored on a sent quote", () => {
    for (const s of ["quoted", "feedback", "won", "lost", "expired"]) expect(fxActionFor({ quoteStatus: s, fx })).toBe("keep");
  });

  it("drops stored rates when a quote is revised or back in draft", () => {
    expect(fxActionFor({ quoteStatus: "revised", fx })).toBe("clear");
    expect(fxActionFor({ quoteStatus: "draft", fx })).toBe("clear");
    expect(fxActionFor({ quoteStatus: "ready_to_send" })).toBe("keep");
  });

  it("leaves non-sales quotes alone", () => {
    expect(fxActionFor({})).toBe("keep");
    expect(fxActionFor(null)).toBe("keep");
  });
});
