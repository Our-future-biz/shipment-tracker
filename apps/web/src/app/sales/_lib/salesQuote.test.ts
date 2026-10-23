import { describe, expect, it } from "vitest";
import type { SalesQuoteData } from "./types";
import { baseRef, computeCargo, hasReefer, isReeferType, reeferMissing, followStored, followUpLines, quoteProfitIn, quoteFamily, revisionRoot, withoutPricing, type SalesQuote } from "./salesQuote";

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

describe("followUpLines", () => {
  it("is the follow-ups and changes to Feedback of a quote's history, newest first", () => {
    const timeline = [
      { kind: "status" as const, status: "quoted" as const, at: "2026-10-01T08:00:00Z" },
      { kind: "follow_up" as const, at: "2026-10-05T09:00:00Z", user: "Lukáš" },
      { kind: "owner" as const, at: "2026-10-06T09:00:00Z", comment: "Owner: Jana" },
      { kind: "follow_up" as const, at: "2026-10-09T10:30:00Z", user: "Jana", comment: "decision next week" },
      { kind: "status" as const, status: "feedback" as const, at: "2026-10-12T11:00:00Z", comment: "price too high" },
      { status: "feedback" as const, at: "2026-10-13T11:00:00Z" },
    ];
    expect(followUpLines({ timeline }).map((e) => e.at)).toEqual(["2026-10-13T11:00:00Z", "2026-10-12T11:00:00Z", "2026-10-09T10:30:00Z", "2026-10-05T09:00:00Z"]);
    expect(followUpLines({})).toEqual([]);
  });
});

describe("quoteProfitIn", () => {
  // A sent EUR quote: its rates are the ones stored when it was sent, not today's.
  const data = {
    currency: "EUR",
    quoteStatus: "quoted",
    fx: { date: "2026-10-22", fixingDate: "2026-10-22", roePct: 100, rates: { EUR: 25, USD: 20 } },
    sellingLines: [{ amount: 275, currency: "EUR" }],
    buyingLines: [{ amount: 150, currency: "EUR" }],
  } as unknown as SalesQuoteData;
  const today = { EUR: 24.26, USD: 21.593 };

  it("is the quote's profit at the quote's own rates, in any currency", () => {
    expect(quoteProfitIn(data, today, "EUR")).toBe(125);
    expect(quoteProfitIn(data, today, "CZK")).toBe(3125);
    expect(quoteProfitIn(data, today, "USD")).toBe(156.25);
  });

  it("is null for a currency nobody has a rate for", () => {
    expect(quoteProfitIn(data, today, "GBP")).toBeNull();
  });
});

describe("computeCargo", () => {
  it("takes the totals typed for the shipment when the packages give no weight or volume", () => {
    const cargo = computeCargo({ packages: [{ qty: 1, type: "Pallets" }], weight: 1800, cbm: 2.5 });
    expect(cargo).toMatchObject({ totalPackages: 1, grossWeight: 1800, cbm: 2.5, weightFromLines: false, cbmFromLines: false });
    // 1.8 t against 2.5 cbm: the volume is the greater
    expect(cargo.weightMeasure).toBe(2.5);
  });

  it("goes by the packages for what they give, figure by figure", () => {
    const cargo = computeCargo({ packages: [{ qty: 2, type: "Pallets", weight: 1500 }], weight: 999, cbm: 1.2 });
    expect(cargo).toMatchObject({ grossWeight: 3000, cbm: 1.2, weightFromLines: true, cbmFromLines: false, weightMeasure: 3 });
    const dims = computeCargo({ packages: [{ qty: 2, type: "Pallets", length: 120, width: 80, height: 100, weight: 200 }], weight: 999, cbm: 9 });
    expect(dims).toMatchObject({ grossWeight: 400, cbm: 1.92, cbmFromLines: true, weightMeasure: 1.92, volumetricWeight: 320, chargeableWeight: 400 });
  });

  it("has nothing to measure without weight and volume", () => {
    expect(computeCargo({})).toMatchObject({ grossWeight: 0, cbm: 0, weightMeasure: 0, totalContainers: 0, teu: 0, equipment: "" });
  });

  it("counts a full-container quote's boxes, their TEU and the cargo weight declared per box", () => {
    const cargo = computeCargo({
      serviceType: "Sea FCL",
      containers: [{ qty: 2, type: "40' HC", weight: 18000 }, { qty: 1, type: "20' GP" }],
      weight: 999,
      cbm: 100,
    });
    expect(cargo).toMatchObject({ totalContainers: 3, teu: 5, equipment: "2× 40' HC, 1× 20' GP", grossWeight: 36000, weightFromLines: true, weightFromContainers: true, cbm: 100 });
  });

  it("takes the typed total of a full-container quote whose boxes declare no weight", () => {
    const cargo = computeCargo({ containers: [{ qty: 1, type: "40' HC" }, { qty: 1, type: "40' HC" }], weight: 21000 });
    expect(cargo).toMatchObject({ totalContainers: 2, teu: 4, equipment: "2× 40' HC", grossWeight: 21000, weightFromLines: false, weightFromContainers: false });
  });
});

describe("reefer containers", () => {
  const fcl = (type: string) => ({ serviceType: "Sea FCL", containers: [{ qty: 1, type: "20' GP" }, { qty: 1, type }] });

  it("knows a reefer box by its type, 20' or 40', RF or HR", () => {
    expect(["20' RF", "40' HRF", "40' HR"].map(isReeferType)).toEqual([true, true, true]);
    expect(["40' HC", "20' GP", "40' FR", "", undefined].map(isReeferType)).toEqual([false, false, false, false, false]);
  });

  it("asks the reefer requirements of a Sea FCL quote with a reefer among its containers", () => {
    expect(hasReefer(fcl("40' RF"))).toBe(true);
    expect(hasReefer(fcl("40' HC"))).toBe(false);
    expect(hasReefer({ serviceType: "Sea LCL", containers: [{ qty: 1, type: "40' RF" }] })).toBe(false);
  });

  it("requires the set-point, and a tolerance's value once one is required", () => {
    expect(reeferMissing(fcl("40' RF"))).toBe("Enter the reefer set-point temperature");
    expect(reeferMissing({ ...fcl("40' RF"), reefer: { setPoint: -18 } })).toBeNull();
    expect(reeferMissing({ ...fcl("40' RF"), reefer: { setPoint: 5, toleranceRequired: true } })).toBe("Enter the set-point tolerance");
    expect(reeferMissing({ ...fcl("40' RF"), reefer: { setPoint: 5, toleranceRequired: true, tolerance: 2 } })).toBeNull();
    expect(reeferMissing(fcl("40' HC"))).toBeNull();
  });
});
