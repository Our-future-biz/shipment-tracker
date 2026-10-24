import { describe, expect, it } from "vitest";
import {
  asksHeavyPieces,
  changedBands,
  HEAVY_BANDS,
  HEAVY_PAIR_ID,
  heavyBandsFor,
  missingWarehouseFee,
  heavyPiecesProblems,
  heavyTotal,
  WAREHOUSE_PAIR_ID,
  warehouseStanding,
  withHeavyPieces,
  withinWeight,
  type QuoteHeavyPieces,
} from "./heavyPieces";
import type { CostLine, QuoteWarehouseInquiry } from "./types";

const band = (key: string) => HEAVY_BANDS.find((b) => b.key === key)!;

describe("asksHeavyPieces", () => {
  it("asks on a Sea LCL quote of over 2 t only", () => {
    expect(asksHeavyPieces("Sea LCL", 2001)).toBe(true);
    expect(asksHeavyPieces("Sea LCL", 2000)).toBe(false);
    expect(["Sea FCL", "Air", "Road", "Rail", undefined].map((t) => asksHeavyPieces(t, 5000))).toEqual([false, false, false, false, false]);
  });
});

describe("heavyBandsFor", () => {
  it("offers only the bands a piece of the shipment's weight can be in", () => {
    expect(heavyBandsFor(2500).map((b) => b.key)).toEqual(["2000"]);
    expect(heavyBandsFor(7900).map((b) => b.key)).toEqual(["2000", "3000", "5000", "7500"]);
    expect(heavyBandsFor(12499).map((b) => b.key)).toEqual(["2000", "3000", "5000", "7500", "10000"]);
    expect(heavyBandsFor(12500).map((b) => b.key)).toEqual(["2000", "3000", "5000", "7500", "10000", "12500"]);
  });

  it("drops what an earlier answer had in bands the weight no longer allows", () => {
    const earlier: QuoteHeavyPieces = { anyOver2t: true, pieces: { "2000": 1, "5000": 1 }, surcharge: { "5000": 150 }, reason: "x" };
    expect(withinWeight(earlier, 3000)).toEqual({ anyOver2t: true, pieces: { "2000": 1 }, surcharge: {}, reason: "x" });
  });
});

describe("the surcharge", () => {
  it("is the agreed rate per piece of each band", () => {
    expect(HEAVY_BANDS.map((b) => b.rate)).toEqual([50, 100, 200, 350, 500, null]);
    const heavy: QuoteHeavyPieces = { anyOver2t: true, pieces: { "2000": 2, "3000": 1, "5000": 1, "7500": 1, "10000": 1 } };
    expect(heavyTotal(heavy)).toBe(2 * 50 + 100 + 200 + 350 + 500);
    expect(changedBands(heavy)).toEqual([]);
    expect(heavyPiecesProblems(heavy)).toEqual([]);
  });

  it("takes a surcharge the user changed, which then needs a reason", () => {
    const heavy: QuoteHeavyPieces = { anyOver2t: true, pieces: { "2000": 2 }, surcharge: { "2000": 80 } };
    expect(heavyTotal(heavy)).toBe(80);
    expect(changedBands(heavy)).toEqual([band("2000")]);
    expect(heavyPiecesProblems(heavy)).toEqual(["Give the reason for the changed surcharge"]);
    expect(heavyPiecesProblems({ ...heavy, reason: "Long-standing customer" })).toEqual([]);
    // Typed back to the rate, it is no change.
    expect(changedBands({ ...heavy, surcharge: { "2000": 100 } })).toEqual([]);
  });

  it("asks the warehouse for a piece of 12.5 t or more; a figure typed for it is no surcharge", () => {
    const heavy: QuoteHeavyPieces = { anyOver2t: true, pieces: { "12500": 1 } };
    expect(heavyPiecesProblems(heavy)).toEqual(["Inquire Warehouse about the pieces of 12,500 kg and more"]);
    expect(heavyTotal({ ...heavy, surcharge: { "12500": 900 } })).toBe(0);
    expect(changedBands({ ...heavy, surcharge: { "12500": 900 } })).toEqual([]);
  });

  it("needs at least one piece once the answer is yes; no needs nothing", () => {
    expect(heavyPiecesProblems({ anyOver2t: true, pieces: {} })).toEqual(["Enter how many pieces are over 2 t"]);
    expect(heavyPiecesProblems({ anyOver2t: false })).toEqual([]);
    expect(heavyTotal({ anyOver2t: false, pieces: { "2000": 3 } })).toBe(0);
  });
});

describe("withHeavyPieces", () => {
  const freight: CostLine = { type: "Ocean freight", description: "LCL", currency: "EUR", amount: 300 };

  it("adds the surcharge as a buying and a selling line of the same amount, the pieces as its quantity, keeping the other lines", () => {
    const patch = withHeavyPieces({ buyingLines: [freight], sellingLines: [freight] }, { anyOver2t: true, pieces: { "2000": 2, "5000": 1 } });
    const line = { type: "Handling", chargeCode: "handling", description: "Extra handling - heavy pieces (2× 2,000 – 2,999 kg, 1× 5,000 – 7,499 kg)", currency: "EUR", amount: 300, value: 3, pairId: HEAVY_PAIR_ID };
    expect(patch.buyingLines).toEqual([freight, line]);
    expect(patch.sellingLines).toEqual([freight, line]);
    expect(patch.heavyPieces).toEqual({ anyOver2t: true, pieces: { "2000": 2, "5000": 1 } });
  });

  it("replaces the surcharge lines of an earlier answer, and a no removes them", () => {
    const first = withHeavyPieces({ buyingLines: [freight] }, { anyOver2t: true, pieces: { "2000": 1 } });
    const again = withHeavyPieces({ buyingLines: first.buyingLines, sellingLines: first.sellingLines }, { anyOver2t: true, pieces: { "3000": 1 } });
    expect(again.buyingLines?.map((l) => l.amount)).toEqual([300, 100]);
    const no = withHeavyPieces({ buyingLines: again.buyingLines, sellingLines: again.sellingLines }, { anyOver2t: false, pieces: { "3000": 1 } });
    expect(no.buyingLines).toEqual([freight]);
    expect(no.sellingLines).toEqual([]);
    expect(no.heavyPieces).toEqual({ anyOver2t: false });
  });

  it("keeps only the bands with pieces, and a surcharge or reason only where it differs from the rate", () => {
    const patch = withHeavyPieces({}, { anyOver2t: true, pieces: { "2000": 2, "3000": 0 }, surcharge: { "2000": 100, "3000": 80 }, reason: "old" });
    expect(patch.heavyPieces).toEqual({ anyOver2t: true, pieces: { "2000": 2 } });
    // A surcharge typed for a band set back to 0 pieces is no change to give a reason for.
    expect(changedBands({ anyOver2t: true, pieces: { "3000": 0 }, surcharge: { "3000": 80 } })).toEqual([]);
  });

  it("charges nothing when the surcharge was changed to 0", () => {
    const patch = withHeavyPieces({}, { anyOver2t: true, pieces: { "2000": 1 }, surcharge: { "2000": 0 }, reason: "Waived" });
    expect(patch.buyingLines).toEqual([]);
  });
});

describe("the warehouse inquiry (pieces of 12.5 t or more)", () => {
  const inquiry = (over: Partial<QuoteWarehouseInquiry> = {}): QuoteWarehouseInquiry => ({
    id: "i1",
    status: "approved",
    pieces: 2,
    grossWeightKg: 26000,
    note: "",
    requestedById: "u1",
    requestedByName: "Martin",
    requestedAt: "2026-10-22T08:00:00Z",
    decidedById: "u2",
    decidedByName: "Marie Manager",
    decidedAt: "2026-10-23T08:00:00Z",
    priceEurPerPiece: 400,
    comment: "",
    answerSeenAt: null,
    ...over,
  });
  const heavy = (over: Partial<QuoteHeavyPieces> = {}): QuoteHeavyPieces => ({ anyOver2t: true, pieces: { "12500": 2 }, ...over });

  it("saves the pieces only once the warehouse approved that many", () => {
    expect(warehouseStanding(heavy(), null)).toBe("ask");
    expect(warehouseStanding(heavy(), inquiry({ status: "pending", decidedAt: null, priceEurPerPiece: null }))).toBe("pending");
    expect(heavyPiecesProblems(heavy(), inquiry({ status: "pending" }))).toEqual(["The warehouse has not answered yet - the pieces can be saved once it approves"]);
    expect(heavyPiecesProblems(heavy(), inquiry({ status: "rejected", comment: "too heavy" }))).toEqual([
      "The warehouse rejected the pieces of 12,500 kg and more - change the pieces or ask again",
    ]);
    expect(heavyPiecesProblems(heavy(), inquiry())).toEqual([]);
    // Approved for 2 pieces, but there are 3 now: asked again.
    expect(warehouseStanding(heavy({ pieces: { "12500": 3 } }), inquiry())).toBe("ask");
    // A question waiting holds the pieces even when none of 12.5 t is left.
    expect(warehouseStanding(heavy({ pieces: { "7500": 1 } }), inquiry({ status: "pending" }))).toBe("pending");
    expect(warehouseStanding(heavy({ pieces: { "7500": 1 } }), inquiry())).toBe("none");
  });

  it("keeps the fee the approval put to Pricing, and drops it once no piece of 12.5 t is left", () => {
    const fee: CostLine = { type: "Handling", chargeCode: "handling", description: "Heavy Cargo Handling Fee", currency: "EUR", amount: 800, pairId: WAREHOUSE_PAIR_ID };
    const sold: CostLine = { ...fee, amount: 900, changeReason: "agreed" };
    const kept = withHeavyPieces({ buyingLines: [fee], sellingLines: [sold] }, heavy({ pieces: { "12500": 2, "2000": 1 } }));
    expect(kept.buyingLines).toEqual([fee, expect.objectContaining({ pairId: HEAVY_PAIR_ID, amount: 50, value: 1, description: "Extra handling - heavy pieces (1× 2,000 – 2,999 kg)" })]);
    expect(kept.sellingLines?.[0]).toEqual(sold);
    const gone = withHeavyPieces({ buyingLines: [fee], sellingLines: [sold] }, heavy({ pieces: { "2000": 1 } }));
    expect(gone.buyingLines?.map((l) => l.pairId)).toEqual([HEAVY_PAIR_ID]);
    expect(gone.sellingLines?.map((l) => l.pairId)).toEqual([HEAVY_PAIR_ID]);
  });

  it("adds the fee of an approval that has no lines in Pricing yet, buying and selling EUR 50 above", () => {
    const freight: CostLine = { type: "Ocean freight", description: "LCL", currency: "EUR", amount: 300 };
    const data = { heavyPieces: heavy(), warehouseInquiry: inquiry(), buyingLines: [freight], sellingLines: [] };
    const fee = { type: "Handling", chargeCode: "handling", description: "Heavy Cargo Handling Fee", currency: "EUR", value: 2, pairId: WAREHOUSE_PAIR_ID };
    expect(missingWarehouseFee(data)).toEqual({ buyingLines: [freight, { ...fee, amount: 800 }], sellingLines: [{ ...fee, amount: 850 }] });
    // Not once a line is there, nor after Sales removed it for this answer, nor for other pieces or no approval.
    expect(missingWarehouseFee({ ...data, sellingLines: [{ ...freight, ...fee, amount: 900 }] })).toBeNull();
    // Lines put there before they had a quantity get the pieces asked about; nothing else changes.
    const uncounted = { ...fee, value: undefined };
    expect(missingWarehouseFee({ ...data, buyingLines: [freight, { ...uncounted, amount: 800 }], sellingLines: [{ ...uncounted, amount: 900 }] })).toEqual({
      buyingLines: [freight, { ...fee, amount: 800 }],
      sellingLines: [{ ...fee, amount: 900 }],
    });
    expect(missingWarehouseFee({ ...data, heavyFeeRemoved: { inquiryId: "i1", reason: "waived" } })).toBeNull();
    expect(missingWarehouseFee({ ...data, heavyFeeRemoved: { inquiryId: "older", reason: "waived" } })).not.toBeNull();
    expect(missingWarehouseFee({ ...data, heavyPieces: heavy({ pieces: { "12500": 3 } }) })).toBeNull();
    expect(missingWarehouseFee({ ...data, warehouseInquiry: inquiry({ status: "pending" }) })).toBeNull();
  });
});
