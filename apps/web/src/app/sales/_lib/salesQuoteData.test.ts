import { describe, expect, it } from "vitest";
import { asData, unsavedChanges, validUntilAfter } from "./salesQuote";

describe("asData", () => {
  it("reads only a plain object as a document", () => {
    expect(asData({ origin: "Prague" })).toEqual({ origin: "Prague" });
    expect(asData(null)).toEqual({});
    expect(asData("x")).toEqual({});
    expect(asData([{ origin: "x" }])).toEqual({});
  });
});

describe("unsavedChanges", () => {
  it("keeps only what the user changed, by value", () => {
    const line = { type: "Ocean freight", description: "", currency: "EUR", amount: 100 };
    const base = { origin: "Prague", buyingLines: [line], currency: "EUR" };
    const draft = { origin: "Brno", buyingLines: [{ ...line }], currency: "EUR", destination: "Hamburg" };
    expect(unsavedChanges(base, draft)).toEqual({ origin: "Brno", destination: "Hamburg" });
  });

  it("includes a key the user cleared", () => {
    expect(unsavedChanges({ origin: "Prague" }, {})).toEqual({ origin: undefined });
  });

  it("never carries keys only the server writes", () => {
    expect(unsavedChanges({ quoteStatus: "draft" }, { quoteStatus: "won", fx: undefined, origin: "x" })).toEqual({ origin: "x" });
  });
});

describe("validUntilAfter", () => {
  it("counts days on the Prague calendar", () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Prague.
    expect(validUntilAfter("2026-10-31T23:30:00Z", 10)).toBe("2026-11-11");
    expect(validUntilAfter("2026-03-01T10:00:00Z", 30)).toBe("2026-03-31");
  });

  it("gives null for an unreadable date", () => {
    expect(validUntilAfter("not a date", 10)).toBeNull();
  });
});
