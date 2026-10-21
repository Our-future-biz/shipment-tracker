import { describe, expect, it } from "vitest";
import { baseRef, followStored, quoteFamily, revisionRoot, withoutPricing, type SalesQuote } from "./salesQuote";

const quote = (quoteNumber: string): SalesQuote => ({ quoteNumber }) as SalesQuote;

describe("baseRef", () => {
  it("is the quote a variant or a revision branches off, as the server reads it", () => {
    expect(baseRef("QCZ20261010001")).toBe("QCZ20261010001");
    expect(baseRef("QCZ20261010001-3")).toBe("QCZ20261010001");
    expect(baseRef("QCZ20261010001-R2")).toBe("QCZ20261010001");
    expect(baseRef("QCZ20261010001-3-R1")).toBe("QCZ20261010001");
  });
});

describe("revisionRoot", () => {
  it("is the quote a revision is counted from", () => {
    expect(revisionRoot("QCZ20261010001")).toBe("QCZ20261010001");
    expect(revisionRoot("QCZ20261010001-R2")).toBe("QCZ20261010001");
    expect(revisionRoot("QCZ20261010001-2")).toBe("QCZ20261010001-2");
    expect(revisionRoot("QCZ20261010001-2-R1")).toBe("QCZ20261010001-2");
  });
});

describe("followStored", () => {
  const stored = { buyingLines: [{ type: "Air freight", description: "", currency: "EUR", amount: 1 }], currency: "EUR", quoteStatus: "quoted" };

  it("takes the prices of a quote that went out from the stored document, the editor's own dropped", () => {
    const draft = { buyingLines: [{ type: "Air freight", description: "", currency: "EUR", amount: 999 }], allIn: true, origin: "Praha" };
    expect(followStored(draft, stored, "quoted")).toEqual({ buyingLines: stored.buyingLines, currency: "EUR", origin: "Praha", quoteStatus: "quoted" });
  });

  it("keeps the editor's prices while the quote is open", () => {
    const draft = { buyingLines: [{ type: "Air freight", description: "", currency: "EUR", amount: 999 }], allIn: true };
    expect(followStored(draft, stored, "draft")).toEqual({ ...draft, quoteStatus: "quoted" });
  });
});

describe("withoutPricing", () => {
  it("drops the price keys of a patch, for a quote whose prices are closed", () => {
    expect(withoutPricing({ origin: "Praha", buyingLines: [], sellingLines: [], currency: "EUR", allIn: true })).toEqual({ origin: "Praha" });
  });
});

describe("quoteFamily", () => {
  it("holds the variants and their revisions, each revision after the quote it revises", () => {
    const refs = ["QCZ20261010001-2-R1", "QCZ20261010001-R2", "QCZ20261010001-2", "QCZ20261010001", "QCZ20261010001-R1", "QCZ20261010002"];
    const family = quoteFamily(refs.map(quote), "QCZ20261010001-R1").map((q) => q.quoteNumber);
    expect(family).toEqual(["QCZ20261010001", "QCZ20261010001-R1", "QCZ20261010001-R2", "QCZ20261010001-2", "QCZ20261010001-2-R1"]);
  });
});
