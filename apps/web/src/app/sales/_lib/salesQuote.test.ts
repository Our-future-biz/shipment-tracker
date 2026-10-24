import { describe, expect, it } from "vitest";
import type { CostLine, SalesQuoteData } from "./types";
import type { QuoteTotals } from "./salesQuote";
import { baseRef, computeCargo, fxNote, hasReefer, isReeferType, reeferMissing, followStored, followUpLines, quoteProfitIn, quoteFamily, lineRate, revisionRoot, withoutPricing, withLineBasis, withRate, WM_UNIT, type SalesQuote } from "./salesQuote";

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
    // 2.5 cbm for 1.8 t
    expect(cargo.weightRatio).toBe(1.39);
  });

  it("gives the weight ratio - cbm per ton - once both the weight and the volume are known", () => {
    expect(computeCargo({ weight: 1500, cbm: 5 }).weightRatio).toBe(3.33);
    expect(computeCargo({ weight: 1500 }).weightRatio).toBeNull();
    expect(computeCargo({ cbm: 5 }).weightRatio).toBeNull();
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

describe("fxNote", () => {
  const totals = (over: Partial<QuoteTotals> = {}): QuoteTotals => ({
    currency: "EUR", selling: 0, buying: 0, profit: 0, margin: null,
    missingRates: [], missingSellingRates: [], missingBuyingRates: [],
    roePct: 102, fixingDate: "2026-10-23", fxLocked: false, lockedAt: null,
    ...over,
  } as QuoteTotals);

  it("names the company ROE as the adjustment of the ČNB rates", () => {
    expect(fxNote(totals())).toBe("Totals in EUR based on 2% adjustment of ČNB rates (23.10.2026) — stored on the quote when it is sent.");
    expect(fxNote(totals({ roePct: 98.5 }))).toBe("Totals in EUR based on -1.5% adjustment of ČNB rates (23.10.2026) — stored on the quote when it is sent.");
    expect(fxNote(totals({ roePct: 100 }))).toBe("Totals in EUR at today's ČNB rates (23.10.2026) — stored on the quote when it is sent.");
  });

  it("says the stored rates of a sent quote with their adjustment", () => {
    expect(fxNote(totals({ fxLocked: true, lockedAt: "2026-10-24T08:00:00Z" }))).toBe(
      "Totals in EUR based on 2% adjustment of the ČNB rates of 23.10.2026 — stored when the quote was sent 24.10.2026.",
    );
  });
});

describe("withLineBasis", () => {
  const line = (over: Partial<CostLine> = {}): CostLine => ({ type: "Ocean freight", description: "LCL", currency: "EUR", amount: 40, ...over });
  // 5,917 kg against 7.551 cbm: 7.551 W/M.
  const cargo = { weight: 5917, cbm: 7.551 };
  const perWm = (rate: number, over: Partial<CostLine> = {}) => line({ basis: "wm", value: 7.551, qty: 7.551, unit: WM_UNIT, unitPrice: rate, amount: Math.round(rate * 7.551 * 100) / 100, ...over });

  it("prices a line set to W/M at its amount per W/M, the weight / measure as its quantity; the others stay", () => {
    const data = { ...cargo, buyingLines: [line({ basis: "wm", value: 1 }), line({ basis: "lumpsum", value: 2 })], sellingLines: [line({ basis: "wm", amount: 45 })] };
    expect(withLineBasis(data)).toEqual({ buyingLines: [perWm(40), line({ basis: "lumpsum", value: 2 })], sellingLines: [perWm(45)] });
    expect(perWm(40).amount).toBe(302.04);
  });

  it("follows the cargo: the rate stays, the quantity and the amount change", () => {
    expect(withLineBasis({ weight: 5917, cbm: 2, buyingLines: [perWm(40)] })?.buyingLines).toEqual([line({ basis: "wm", value: 5.917, qty: 5.917, unit: WM_UNIT, unitPrice: 40, amount: 236.68 })]);
  });

  it("costs the rate again once set back to a lump sum", () => {
    expect(withLineBasis({ ...cargo, buyingLines: [perWm(40, { basis: "lumpsum" })] })?.buyingLines).toEqual([line({ basis: "lumpsum", value: 7.551 })]);
  });

  it("gives a selling line its buying line's basis, and prices it by that", () => {
    const data = { ...cargo, buyingLines: [perWm(40, { pairId: "p1" })], sellingLines: [line({ basis: "lumpsum", amount: 45, pairId: "p1" }), line({ value: 1 })] };
    // The second selling line goes with no buying line (the first is taken by its pair): it keeps its own.
    expect(withLineBasis(data)).toEqual({ buyingLines: data.buyingLines, sellingLines: [perWm(45, { pairId: "p1" }), line({ value: 1 })] });
  });

  it("is null when every line is priced by its basis already, or there is no W/M line", () => {
    expect(withLineBasis({ ...cargo, buyingLines: [perWm(40)], sellingLines: [perWm(45)] })).toBeNull();
    expect(withLineBasis({ ...cargo, buyingLines: [line({ value: 1 })] })).toBeNull();
  });

  it("leaves a line priced per unit by a tariff as it is", () => {
    expect(withLineBasis({ ...cargo, buyingLines: [line({ qty: 3, unit: "pallet", unitPrice: 20, amount: 60 })] })).toBeNull();
  });
});

describe("lineRate / withRate", () => {
  it("reads the Amount column: per W/M the rate, otherwise the whole line (also stored as text or not at all)", () => {
    const base: CostLine = { type: "Ocean freight", description: "LCL", currency: "EUR", amount: 302.04 };
    expect(lineRate({ ...base, basis: "wm", unitPrice: 40 })).toBe(40);
    expect(lineRate(base)).toBe(302.04);
    expect(lineRate({ ...base, amount: "750" as unknown as number })).toBe(750);
    expect(lineRate({ ...base, amount: undefined as unknown as number })).toBe(0);
    expect(withRate({ ...base, basis: "wm" }, 40, 7.551)).toMatchObject({ unitPrice: 40, qty: 7.551, amount: 302.04 });
    expect(withRate(base, 50, 7.551)).toEqual({ ...base, amount: 50 });
  });
});
