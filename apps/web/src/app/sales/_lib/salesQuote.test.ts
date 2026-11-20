import { describe, expect, it } from "vitest";
import type { CostLine, SalesQuoteData } from "./types";
import type { QuoteTotals } from "./salesQuote";
import { chargeBasis } from "@/lib/chargeBasis";
import { baseRef, computeCargo, cyAtDestination, cyAtOrigin, cyTermsOf, fxNote, hasReefer, isReeferType, reeferMissing, followStored, followUpLines, quoteProfitIn, quoteFamily, lineRate, revisionRoot, routingMissing, routingNeeds, withLineBasis, withRate, withBasis, basisChangeNote, basisMismatches, basisOffered, basisUnits, computeTotals, isAirQuote, perBasisText, CONTAINER_UNIT, KG_UNIT, WM_UNIT, type SalesQuote, isDraftQuote } from "./salesQuote";

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

  it("keeps the editor's prices on the revision of a Won quote: it stays Won with its prices open", () => {
    const draft = { buyingLines: [{ type: "Air freight", description: "", currency: "EUR", amount: 999 }], allIn: true };
    const won = { ...stored, quoteStatus: "won", wonRevisionOf: "QCZ20261010001" };
    expect(followStored(draft, won, "won")).toEqual({ ...draft, quoteStatus: "won", wonRevisionOf: "QCZ20261010001" });
    // Any other Won quote has its prices as stored.
    expect(followStored(draft, { ...stored, quoteStatus: "won" }, "won")).toEqual({ buyingLines: stored.buyingLines, currency: "EUR", quoteStatus: "won" });
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

  // The chair's finding (User Council, 20 Nov 2026): a change of basis keeps the line's total.
  it("keeps its total once set back to a lump sum: rate × quantity becomes the lump sum", () => {
    expect(withLineBasis({ ...cargo, buyingLines: [perWm(40, { basis: "lumpsum" })] })?.buyingLines).toEqual([line({ basis: "lumpsum", amount: 302.04 })]);
  });

  it("prices a line charged per container at its amount per container, the number of containers as its quantity", () => {
    const boxes = { serviceType: "Sea FCL", containers: [{ qty: 2, type: "40' HC" }, { qty: 1, type: "20' GP" }] };
    const perBox = (rate: number, n: number) => line({ basis: "container", value: n, qty: n, unit: CONTAINER_UNIT, unitPrice: rate, amount: rate * n });
    expect(withLineBasis({ ...boxes, buyingLines: [line({ basis: "container", amount: 1750 })] })?.buyingLines).toEqual([perBox(1750, 3)]);
    // It follows the containers, and keeps its total once set back to a lump sum.
    expect(withLineBasis({ ...boxes, containers: [{ qty: 5, type: "40' HC" }], buyingLines: [perBox(1750, 3)] })?.buyingLines).toEqual([perBox(1750, 5)]);
    expect(withLineBasis({ ...boxes, buyingLines: [{ ...perBox(1750, 3), basis: "lumpsum" }] })?.buyingLines).toEqual([line({ basis: "lumpsum", amount: 5250 })]);
  });

  it("counts only a full-container quote's containers: those another mode kept from an earlier one are not shown, and not charged", () => {
    const perBox = (rate: number, n: number) => line({ basis: "container", value: n, qty: n, unit: CONTAINER_UNIT, unitPrice: rate, amount: rate * n });
    const kept = { serviceType: "Sea LCL", containers: [{ qty: 3, type: "40' HC" }] };
    expect(withLineBasis({ ...kept, buyingLines: [perBox(1750, 3)] })?.buyingLines).toEqual([perBox(1750, 0)]);
  });

  it("gives a selling line its buying line's basis, and prices it by that at the total it had", () => {
    const data = { ...cargo, buyingLines: [perWm(40, { pairId: "p1" })], sellingLines: [line({ basis: "lumpsum", amount: 339.8, pairId: "p1" }), line({ value: 1 })] };
    // The second selling line goes with no buying line (the first is taken by its pair): it keeps its own.
    // The lump sum of 339.80 is 45.00 per W/M at 7.551 W/M, not 339.80 per W/M.
    expect(withLineBasis(data)).toEqual({ buyingLines: data.buyingLines, sellingLines: [perWm(45, { pairId: "p1" }), line({ value: 1 })] });
    // Set back to a lump sum with its buying line, it keeps its total too.
    const back = { ...cargo, buyingLines: [line({ basis: "lumpsum", amount: 302.04, pairId: "p1" })], sellingLines: [perWm(45, { pairId: "p1" })] };
    expect(withLineBasis(back)?.sellingLines).toEqual([line({ basis: "lumpsum", value: undefined, amount: 339.8, pairId: "p1" })]);
  });

  it("is null when every line is priced by its basis already, or there is no W/M line", () => {
    expect(withLineBasis({ ...cargo, buyingLines: [perWm(40)], sellingLines: [perWm(45)] })).toBeNull();
    expect(withLineBasis({ ...cargo, buyingLines: [line({ value: 1 })] })).toBeNull();
  });

  it("leaves a line priced per unit by a tariff as it is", () => {
    expect(withLineBasis({ ...cargo, buyingLines: [line({ qty: 3, unit: "pallet", unitPrice: 20, amount: 60 })] })).toBeNull();
  });
});

// User Council S1, owner answer Q10 (20 Nov 2026): an air quote is priced per chargeable kg.
describe("per chargeable kg", () => {
  const line = (over: Partial<CostLine> = {}): CostLine => ({ type: "Air freight", description: "PRG → ORD", currency: "EUR", amount: 2.1, ...over });
  // The tester's cargo: 4 pallets 120×80×100 cm, 350 kg - 3.84 cbm, volumetric 640 kg, chargeable 640 kg.
  const air: SalesQuoteData = { serviceType: "Air", packages: [{ qty: 4, type: "Pallet", length: 120, width: 80, height: 100, weight: 87.5 }] };
  const perKg = (rate: number, kg: number, over: Partial<CostLine> = {}) =>
    line({ basis: "kg", value: kg, qty: kg, unit: KG_UNIT, unitPrice: rate, amount: Math.round(rate * kg * 100) / 100, ...over });

  it("counts a line in the quote's chargeable weight, the figure Cargo details shows, not its W/M", () => {
    expect(computeCargo(air)).toMatchObject({ cbm: 3.84, volumetricWeight: 640, chargeableWeight: 640, weightMeasure: 3.84 });
    expect(basisUnits(air, "kg")).toBe(640);
    expect(basisUnits(air, "wm")).toBe(3.84);
  });

  it("prices a line set to it at its amount per kg: 640 kg at 2.10 is 1,344.00, on both sides", () => {
    const data = { ...air, buyingLines: [line({ basis: "kg", amount: 1.65 })], sellingLines: [line({ basis: "kg" })] };
    expect(withLineBasis(data)).toEqual({ buyingLines: [perKg(1.65, 640)], sellingLines: [perKg(2.1, 640)] });
    expect(perKg(2.1, 640).amount).toBe(1344);
    expect(withRate(line({ basis: "kg" }), 2.1, 640)).toMatchObject({ qty: 640, unit: "chargeable kg", unitPrice: 2.1, amount: 1344 });
  });

  // The job's rule, to 0.1 kg: a Won quote's line comes to Costs Breakdown with the kilos the job's Cargo Details shows.
  it("rounds the chargeable weight as the job does, so the quote's kilos are the job's", () => {
    const odd: SalesQuoteData = { serviceType: "Air", cbm: 3.844 };
    expect(computeCargo(odd).chargeableWeight).toBe(640.7);
    expect(computeCargo(odd).chargeableWeight).toBe(chargeBasis("Air Freight", computeCargo(odd).grossWeight, computeCargo(odd).cbm).value);
    expect(basisUnits(odd, "kg")).toBe(640.7);
    // Its line stays within the 2 decimals Costs Breakdown checks quantity × rate by.
    expect(withRate(line({ basis: "kg" }), 2.1, 640.7)).toMatchObject({ qty: 640.7, unitPrice: 2.1, amount: 1345.47 });
  });

  it("follows the cargo: heavier than its volume, the gross weight is charged", () => {
    const heavy = { ...air, packages: [{ qty: 4, type: "Pallet", length: 120, width: 80, height: 100, weight: 250 }], buyingLines: [perKg(2.1, 640)] };
    expect(withLineBasis(heavy)?.buyingLines).toEqual([perKg(2.1, 1000)]);
  });

  it("keeps its total once set back to a lump sum", () => {
    expect(withLineBasis({ ...air, buyingLines: [perKg(2.1, 640, { basis: "lumpsum" })] })?.buyingLines).toEqual([line({ basis: "lumpsum", amount: 1344 })]);
  });

  it("leaves a trucking tariff's line priced per kg as the lump sum it is", () => {
    expect(withLineBasis({ ...air, buyingLines: [line({ qty: 350, unit: "kg", unitPrice: 0.1, amount: 35 })] })).toBeNull();
  });

  it("keeps a W/M line an air quote saved before: it still counts the W/M", () => {
    const perWm = line({ basis: "wm", value: 3.84, qty: 3.84, unit: WM_UNIT, unitPrice: 2.1, amount: 8.06 });
    expect(withLineBasis({ ...air, buyingLines: [perWm] })).toBeNull();
  });

  it("is in the quote's totals and margin as rate × kg", () => {
    const data = { ...air, currency: "EUR", buyingLines: [perKg(1.65, 640)], sellingLines: [perKg(2.1, 640)] };
    expect(computeTotals(data, { CZK: 1, EUR: 25 })).toMatchObject({ selling: 1344, buying: 1056, profit: 288, margin: 21.4 });
  });

  it("names the basis in running text", () => {
    expect(["kg", "wm", "container", "lumpsum", undefined].map((b) => perBasisText(b as CostLine["basis"]))).toEqual([" per chargeable kg", " per W/M", " per container", "", ""]);
  });

  it("knows an air quote", () => {
    expect([isAirQuote({ serviceType: "Air" }), isAirQuote({ serviceType: "Sea LCL" }), isAirQuote({})]).toEqual([true, false, false]);
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

describe("CY terms", () => {
  it("reads the four terms, and a quote answered yes / no before as CY/CY / SD/SD", () => {
    expect(["CY/CY", "SD/CY", "SD/SD", "CY/SD"].map((cy) => cyTermsOf({ cy }))).toEqual(["CY/CY", "SD/CY", "SD/SD", "CY/SD"]);
    expect(cyTermsOf({ cy: true })).toBe("CY/CY");
    expect(cyTermsOf({ cy: false })).toBe("SD/SD");
    expect(cyTermsOf({})).toBeUndefined();
    expect(cyTermsOf({ cy: "yes" })).toBeUndefined();
  });

  it("puts a container yard at origin for CY/…, at destination for …/CY", () => {
    expect(["CY/CY", "SD/CY", "SD/SD", "CY/SD"].map((t) => [cyAtOrigin(cyTermsOf({ cy: t })), cyAtDestination(cyTermsOf({ cy: t }))])).toEqual([
      [true, true],
      [false, true],
      [false, false],
      [true, false],
    ]);
    expect([cyAtOrigin(undefined), cyAtDestination(undefined)]).toEqual([false, false]);
  });
});

describe("routingNeeds", () => {
  it("needs no Origin on an FOB import and no Destination on a CFR export", () => {
    expect(routingNeeds({ direction: "Import", incoterm: "FOB" })).toEqual({ origin: false, destination: true });
    expect(routingNeeds({ direction: "Export", incoterm: "CFR" })).toEqual({ origin: true, destination: false });
  });
  it("needs both otherwise", () => {
    for (const q of [{ direction: "Export", incoterm: "FOB" }, { direction: "Import", incoterm: "CFR" }, { direction: "Import", incoterm: "EXW" }, {}]) {
      expect(routingNeeds(q)).toEqual({ origin: true, destination: true });
    }
  });
});

describe("routingMissing", () => {
  it("lists only the places the terms need", () => {
    expect(routingMissing({ direction: "Import", incoterm: "FOB", destination: "Prague (CZPRG)" })).toEqual([]);
    expect(routingMissing({ direction: "Import", incoterm: "FOB" })).toEqual(["Place of Delivery"]);
    expect(routingMissing({ direction: "Export", incoterm: "CFR", origin: "Prague (CZPRG)" })).toEqual([]);
    expect(routingMissing({ direction: "Export", incoterm: "FOB", origin: "Prague (CZPRG)" })).toEqual(["Place of Delivery"]);
    expect(routingMissing({ direction: "Export", incoterm: "FOB", origin: " " })).toEqual(["Place of Loading", "Place of Delivery"]);
  });
});

// The chair's finding (User Council, 20 Nov 2026): a hand-worked lump sum of 1,344 set to per
// chargeable kg became 1,344 × 640 kg = 860,160 EUR without a word. A change of basis keeps the total.
describe("a change of basis", () => {
  const air: SalesQuoteData = { serviceType: "Air", packages: [{ qty: 4, type: "Pallet", length: 120, width: 80, height: 100, weight: 87.5 }] };
  const lump = (amount: number, over: Partial<CostLine> = {}): CostLine => ({ type: "Air freight", description: "PRG → ORD", currency: "EUR", amount, value: 1, ...over });

  it("from a lump sum to per chargeable kg sets the rate from the lump sum: 1,344.00 ÷ 640 kg = 2.10", () => {
    const line = withBasis(lump(1344, { basis: "lumpsum" }), "kg", air);
    expect(line).toMatchObject({ basis: "kg", qty: 640, value: 640, unit: KG_UNIT, unitPrice: 2.1, amount: 1344 });
    expect(basisChangeNote(lump(1344), line)).toBe("Rate set from the lump sum: 1,344.00 ÷ 640 kg = 2.10");
    // withLineBasis then leaves it as it is.
    expect(withLineBasis({ ...air, buyingLines: [line] })).toBeNull();
  });

  it("does the same for W/M and per container", () => {
    const lcl: SalesQuoteData = { serviceType: "Sea LCL", weight: 5917, cbm: 7.551 };
    const wm = withBasis(lump(302.04), "wm", lcl);
    expect(wm).toMatchObject({ basis: "wm", qty: 7.551, unit: WM_UNIT, unitPrice: 40, amount: 302.04 });
    expect(basisChangeNote(lump(302.04), wm)).toBe("Rate set from the lump sum: 302.04 ÷ 7.551 W/M = 40.00");
    const fcl: SalesQuoteData = { serviceType: "Sea FCL", containers: [{ qty: 2, type: "40' HC" }, { qty: 1, type: "20' GP" }] };
    const box = withBasis(lump(5250), "container", fcl);
    expect(box).toMatchObject({ basis: "container", qty: 3, unit: CONTAINER_UNIT, unitPrice: 1750, amount: 5250 });
    expect(basisChangeNote(lump(5250), box)).toBe("Rate set from the lump sum: 5,250.00 ÷ 3 containers = 1,750.00");
    const hc = withBasis(lump(3500, { containerType: "40' HC" }), "container", fcl);
    expect(hc).toMatchObject({ qty: 2, unit: "40' HC", unitPrice: 1750, amount: 3500 });
    expect(basisChangeNote(lump(3500, { containerType: "40' HC" }), hc)).toBe("Rate set from the lump sum: 3,500.00 ÷ 2 containers (40' HC) = 1,750.00");
  });

  it("rounds the rate to the cent, and says so when the total moves by it", () => {
    const line = withBasis(lump(1000), "kg", air);
    expect(line).toMatchObject({ qty: 640, unitPrice: 1.56, amount: 998.4 });
    expect(basisChangeNote(lump(1000), line)).toBe("Rate set from the lump sum: 1,000.00 ÷ 640 kg = 1.56; the line now comes to 998.40");
  });

  it("with no quantity in Cargo details yet sets no rate of the lump sum, and says so", () => {
    const line = withBasis(lump(1344), "kg", { serviceType: "Air" });
    expect(line).toMatchObject({ basis: "kg", qty: 0, unitPrice: 0, amount: 0 });
    expect(basisChangeNote(lump(1344), line)).toBe("Cargo details has no chargeable weight yet, so the lump sum of 1,344.00 could not be made a rate: type the rate per chargeable kg");
  });

  it("back to a lump sum keeps the total: rate × quantity becomes the lump sum", () => {
    const perKg = withBasis(lump(1344), "kg", air);
    const back = withBasis(perKg, "lumpsum", air);
    expect(back).toMatchObject({ basis: "lumpsum", amount: 1344 });
    expect(back).not.toHaveProperty("unitPrice");
    expect(back).not.toHaveProperty("qty");
    // Nor the 640 kg as its Quantity beside the kept total (mock council S2-2).
    expect(back).not.toHaveProperty("value");
    expect(basisChangeNote(perKg, back)).toBe("Lump sum set from the rate: 2.10 × 640 kg = 1,344.00");
  });

  it("from one per-unit basis to another keeps the total too", () => {
    const fcl: SalesQuoteData = { serviceType: "Sea FCL", weight: 5917, cbm: 7.551, containers: [{ qty: 3, type: "40' HC" }] };
    const wm = withBasis(lump(302.04), "wm", fcl);
    const box = withBasis(wm, "container", fcl);
    expect(box).toMatchObject({ basis: "container", qty: 3, unitPrice: 100.68, amount: 302.04 });
    expect(basisChangeNote(wm, box)).toBe("Rate set from the line's total: 302.04 ÷ 3 containers = 100.68");
  });

  it("notes nothing when the basis did not change, the line had no amount, or the line was not made from it", () => {
    expect(withBasis(lump(1344, { basis: "kg" }), "kg", air)).toEqual(lump(1344, { basis: "kg" }));
    expect(basisChangeNote(lump(1344), lump(1344))).toBeNull();
    expect(basisChangeNote(lump(0), withBasis(lump(0), "kg", air))).toBeNull();
    // A tariff picked onto the line meanwhile: another rate, no note.
    expect(basisChangeNote(lump(1344), withRate(lump(0, { basis: "kg" }), 1.8, 640))).toBeNull();
  });
});

// User Council S1: a line keeps the basis it has after the quote's mode changes - warned of, not changed.
describe("basisMismatches", () => {
  const line = (over: Partial<CostLine> = {}): CostLine => ({ type: "Air freight", description: "PRG → ORD", currency: "EUR", amount: 1344, ...over });
  const packages = [{ qty: 4, type: "Pallet", length: 120, width: 80, height: 100, weight: 87.5 }];

  it("offers per chargeable kg on air only, W/M on any other mode, per container only with containers", () => {
    expect(["lumpsum", "wm", "kg", "container"].map((b) => basisOffered({ serviceType: "Air" }, b as CostLine["basis"]))).toEqual([true, false, true, false]);
    expect(["lumpsum", "wm", "kg", "container"].map((b) => basisOffered({ serviceType: "Sea LCL" }, b as CostLine["basis"]))).toEqual([true, true, false, false]);
    expect(basisOffered({ serviceType: "Sea FCL", containers: [{ qty: 1, type: "40' HC" }] }, "container")).toBe(true);
  });

  it("says what a line per chargeable kg on a Sea quote is charged by now", () => {
    const data: SalesQuoteData = { serviceType: "Sea LCL", packages, buyingLines: [line({ basis: "kg", qty: 640, unitPrice: 2.1 })] };
    expect(basisMismatches(data)).toEqual(['Buying line "PRG → ORD" is charged per chargeable kg, which only an Air quote offers; this Sea LCL quote charges it by 640 kg now']);
  });

  it("says the same of a W/M line on an Air quote and a line per container with no containers", () => {
    const data: SalesQuoteData = { serviceType: "Air", packages, buyingLines: [line({ basis: "wm", description: "Handling" }), line({ basis: "container", description: "THC" }), line({ basis: "kg" })] };
    expect(basisMismatches(data)).toEqual([
      'Buying line "Handling" is charged per W/M, which an Air quote does not offer (it charges by chargeable weight); it is charged by 3.840 W/M now',
      'Buying line "THC" is charged per container, but the quote has no containers; it is charged by 0 containers now',
    ]);
  });

  it("tells of a selling line that has its buying line's basis with that buying line only", () => {
    const data: SalesQuoteData = {
      serviceType: "Sea LCL",
      packages,
      buyingLines: [line({ basis: "kg", pairId: "p1" })],
      sellingLines: [line({ basis: "kg", pairId: "p1" }), line({ basis: "kg", description: "Own", pairId: "p2" })],
    };
    expect(basisMismatches(data)).toHaveLength(2);
    expect(basisMismatches(data)[1]).toMatch(/^Selling line "Own"/);
    expect(basisMismatches({ ...data, serviceType: "Air" })).toEqual([]);
  });
});

describe("isDraftQuote (User Council S20)", () => {
  it("is a quote never made Ready to Send nor sent, or a revision being worked on", () => {
    expect(isDraftQuote({})).toBe(true);
    expect(isDraftQuote({ quoteStatus: "draft" })).toBe(true);
    expect(isDraftQuote({ quoteStatus: "revised" })).toBe(true);
    expect(isDraftQuote({ quoteStatus: "ready_to_send" })).toBe(false);
    expect(isDraftQuote({ quoteStatus: "won" })).toBe(false);
  });
});
