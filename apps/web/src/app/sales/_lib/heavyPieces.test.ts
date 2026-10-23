import { describe, expect, it } from "vitest";
import {
  asksHeavyPieces,
  changedBands,
  HEAVY_BANDS,
  HEAVY_PAIR_ID,
  heavyBandsFor,
  heavyPiecesProblems,
  heavyTotal,
  withHeavyPieces,
  withInquiryAnswer,
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

  it("asks the warehouse for a piece of 12.5 t or more: its figure and a reason are needed", () => {
    const heavy: QuoteHeavyPieces = { anyOver2t: true, pieces: { "12500": 1 } };
    expect(heavyPiecesProblems(heavy)).toEqual([
      "Inquire Warehouse and enter the surcharge for the pieces of 12,500 kg and more",
      "Give the reason for the changed surcharge",
    ]);
    expect(heavyPiecesProblems({ ...heavy, surcharge: { "12500": 900 }, reason: "Warehouse quote of 23.10." })).toEqual([]);
    expect(heavyTotal({ ...heavy, surcharge: { "12500": 900 } })).toBe(900);
  });

  it("needs at least one piece once the answer is yes; no needs nothing", () => {
    expect(heavyPiecesProblems({ anyOver2t: true, pieces: {} })).toEqual(["Enter how many pieces are over 2 t"]);
    expect(heavyPiecesProblems({ anyOver2t: false })).toEqual([]);
    expect(heavyTotal({ anyOver2t: false, pieces: { "2000": 3 } })).toBe(0);
  });
});

describe("withHeavyPieces", () => {
  const freight: CostLine = { type: "Ocean freight", description: "LCL", currency: "EUR", amount: 300 };

  it("adds the surcharge as a buying and a selling line of the same amount, keeping the other lines", () => {
    const patch = withHeavyPieces({ buyingLines: [freight], sellingLines: [freight] }, { anyOver2t: true, pieces: { "2000": 2, "5000": 1 } });
    const line = { type: "Handling", chargeCode: "handling", description: "Extra handling - heavy pieces (2× 2,000 – 2,999 kg, 1× 5,000 – 7,499 kg)", currency: "EUR", amount: 300, pairId: HEAVY_PAIR_ID };
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

  it("fills the approved price × pieces and the reason, keeping what was entered by hand", () => {
    expect(withInquiryAnswer(heavy(), inquiry())).toEqual({ anyOver2t: true, pieces: { "12500": 2 }, surcharge: { "12500": 800 }, reason: "Warehouse approved EUR 400 per piece (Marie Manager, 23.10.)" });
    expect(withInquiryAnswer(heavy({ surcharge: { "12500": 700 }, reason: "agreed" }), inquiry())).toEqual(heavy({ surcharge: { "12500": 700 }, reason: "agreed" }));
    // The reason written while the question waited gives way to the answer.
    expect(withInquiryAnswer(heavy({ reason: "The warehouse was asked 22.10. — waiting for its figure" }), inquiry()).reason).toBe("Warehouse approved EUR 400 per piece (Marie Manager, 23.10.)");
    expect(withInquiryAnswer(heavy(), inquiry({ status: "rejected" }))).toEqual(heavy());
    expect(withInquiryAnswer(heavy({ pieces: { "7500": 1 } }), inquiry())).toEqual(heavy({ pieces: { "7500": 1 } }));
  });

  it("saves without the warehouse's figure while its answer is awaited", () => {
    const waiting = withInquiryAnswer(heavy(), inquiry({ status: "pending", decidedAt: null, priceEurPerPiece: null }));
    expect(waiting.reason).toBe("The warehouse was asked 22.10. — waiting for its figure");
    expect(heavyPiecesProblems(waiting)).toEqual(["Inquire Warehouse and enter the surcharge for the pieces of 12,500 kg and more"]);
    expect(heavyPiecesProblems(waiting, { warehouseAsked: true })).toEqual([]);
  });
});
