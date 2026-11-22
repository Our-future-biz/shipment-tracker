import { describe, expect, it } from "vitest";
import {
  WHOLE_INVOICE,
  fullCreditLines,
  fullCreditTotalsAfter,
  partialCreditLines,
  partialCreditTotals,
  planPartialCredit,
  remainingLines,
  owedWhenAsked,
  sameCreditsOwed,
  sameOwedAsAsked,
  settleTruckingCredit,
  type CreditLineCalc,
  type OpenCreditDiff,
  type StoredLine,
} from "../lib/partialCredit";
import { calculateInvoice } from "../lib/invoiceCalc";

// An EUR invoice: THC 2 × 150 EUR (S21) and customs 1 × 2 500 CZK converted at 0.04 (OUT).
const THC: StoredLine = { id: "l1", description: "THC", qty: "2.00", unitPrice: "150.00", unitCurrency: "EUR", net: "300.00", vatCode: "S21", vatRate: "21.00", fxRate: "1", sourceSellingCostId: "s1" };
const CUSTOMS: StoredLine = { id: "l2", description: "Customs", qty: "1.00", unitPrice: "2500.00", unitCurrency: "CZK", net: "100.00", vatCode: "OUT", vatRate: "0.00", fxRate: "0.04", sourceSellingCostId: "s2" };
const INVOICE = {
  net: "400.00", vat: "63.00", gross: "463.00", netCzk: "10000.00", vatCzk: "1575.00", grossCzk: "11575.00",
  vatSummary: [
    { vatCode: "S21" as const, vatRate: 21, base: 300, vat: 63, baseCzk: 7500, vatCzk: 1575 },
    { vatCode: "OUT" as const, vatRate: 0, base: 100, vat: 0, baseCzk: 2500, vatCzk: 0 },
  ],
};
const FX = 25; // CZK per EUR

describe("remainingLines", () => {
  it("is the whole line while nothing was credited", () => {
    const [thc, customs] = remainingLines([THC, CUSTOMS], []);
    expect(thc).toMatchObject({ lineId: "l1", amount: 300, remainingAmount: 300, net: 300, remainingNet: 300, sourceSellingCostId: "s1" });
    expect(customs).toMatchObject({ amount: 2500, remainingAmount: 2500, remainingNet: 100, fxRate: 0.04 });
  });

  it("takes off what credit note lines took of each line", () => {
    const credit: StoredLine = { ...THC, id: "c1", qty: "-1.00", unitPrice: "50.00", net: "-50.00", correctsLineId: "l1" };
    const [thc, customs] = remainingLines([THC, CUSTOMS], [credit]);
    expect(thc).toMatchObject({ remainingAmount: 250, remainingNet: 250 });
    expect(customs).toMatchObject({ remainingAmount: 2500, remainingNet: 100 });
  });
});

describe("partialCreditLines", () => {
  const remaining = remainingLines([THC, CUSTOMS], []);

  it("credits each asked line by its amount in the line's own currency, at the line's rate", () => {
    const plan = partialCreditLines(remaining, [{ lineId: "l2", amount: "500" }]);
    expect(plan).toEqual({
      lines: [
        expect.objectContaining({ correctsLineId: "l2", qty: -1, unitPrice: 500, unitCurrency: "CZK", net: -20, vatCode: "OUT", fxRate: 0.04, sourceSellingCostId: "s2" }),
      ],
    });
  });

  it("takes exactly what is left of the net when a line is credited to its end", () => {
    const odd = remainingLines([{ ...CUSTOMS, unitPrice: "333.00", net: "13.33" }], []);
    const plan = partialCreditLines(odd, [{ lineId: "l2", amount: "333" }]);
    expect("lines" in plan && plan.lines[0]!.net).toBe(-13.33);
  });

  it("refuses an amount above what is left, below zero, with more than two decimals, or a line twice", () => {
    expect(partialCreditLines(remaining, [{ lineId: "l1", amount: "300.01" }])).toEqual({ problem: '"THC" has 300.00 EUR left to credit' });
    expect(partialCreditLines(remaining, [{ lineId: "l1", amount: "0" }])).toMatchObject({ problem: expect.stringMatching(/Enter the amount/) });
    expect(partialCreditLines(remaining, [{ lineId: "l1", amount: "-5" }])).toMatchObject({ problem: expect.stringMatching(/Enter the amount/) });
    expect(partialCreditLines(remaining, [{ lineId: "l1", amount: "1.005" }])).toMatchObject({ problem: expect.stringMatching(/two decimals/) });
    expect(partialCreditLines(remaining, [{ lineId: "l1", amount: "1" }, { lineId: "l1", amount: "2" }])).toMatchObject({ problem: expect.stringMatching(/picked twice/) });
    expect(partialCreditLines(remaining, [{ lineId: "nope", amount: "1" }])).toMatchObject({ problem: expect.stringMatching(/not on this invoice/) });
    expect(partialCreditLines(remaining, [])).toMatchObject({ problem: expect.stringMatching(/at least one line/) });
  });

  it("accepts a decimal comma", () => {
    const plan = partialCreditLines(remaining, [{ lineId: "l1", amount: "12,50" }]);
    expect("lines" in plan && plan.lines[0]!.unitPrice).toBe(12.5);
  });
});

describe("planPartialCredit", () => {
  // A discount line below zero: each line alone can't tell that crediting the THC would credit more than the invoice.
  const DISCOUNT: StoredLine = { ...THC, id: "l3", description: "Discount", qty: "1.00", unitPrice: "-100.00", net: "-100.00", sourceSellingCostId: "s3" };

  it("refuses to credit more than is left of an invoice with a discount line", () => {
    const remaining = remainingLines([THC, CUSTOMS, DISCOUNT], []);
    // 300 + 100 - 100 = 300 left; THC 250 and customs 2 000 CZK (80 EUR) take 330.
    expect(planPartialCredit(remaining, [{ lineId: "l1", amount: "250" }, { lineId: "l2", amount: "2000" }])).toEqual({
      problem: "This credits more than is left of the invoice (300.00 without VAT): credit less, or credit the whole invoice instead",
    });
    expect(planPartialCredit(remaining, [{ lineId: "l1", amount: "250" }])).toHaveProperty("lines");
  });

  it("sees the whole invoice in every line it can credit to its end, or in a credit that leaves nothing", () => {
    const remaining = remainingLines([THC, CUSTOMS, DISCOUNT], []);
    expect(planPartialCredit(remaining, [{ lineId: "l1", amount: "300" }, { lineId: "l2", amount: "2500" }])).toEqual({ problem: WHOLE_INVOICE });
    // THC 200 + customs 2 500 CZK (100 EUR) = 300, all that is left.
    expect(planPartialCredit(remaining, [{ lineId: "l1", amount: "200" }, { lineId: "l2", amount: "2500" }])).toEqual({ problem: WHOLE_INVOICE });
  });

  it("refuses a partial credit note that would credit the whole invoice", () => {
    const remaining = remainingLines([THC, CUSTOMS], []);
    expect(planPartialCredit(remaining, [{ lineId: "l1", amount: "300" }, { lineId: "l2", amount: "2500" }])).toEqual({ problem: WHOLE_INVOICE });
    expect(planPartialCredit(remaining, [{ lineId: "l1", amount: "300" }])).toHaveProperty("lines");
  });
});

describe("partialCreditTotals", () => {
  it("sums the credit note's lines with their VAT, in the invoice currency and in CZK", () => {
    const remaining = remainingLines([THC, CUSTOMS], []);
    const plan = partialCreditLines(remaining, [{ lineId: "l1", amount: "100" }, { lineId: "l2", amount: "500" }]);
    if (!("lines" in plan)) throw new Error(plan.problem);
    expect(partialCreditTotals(plan.lines, FX)).toMatchObject({ net: -120, vat: -21, gross: -141, netCzk: -3000, vatCzk: -525, grossCzk: -3525 });
  });
});

describe("a full credit note after a partial one", () => {
  it("reverses what is left, so the invoice and its credit notes come to nothing", () => {
    const remaining = remainingLines([THC, CUSTOMS], []);
    const plan = partialCreditLines(remaining, [{ lineId: "l1", amount: "100" }]);
    if (!("lines" in plan)) throw new Error(plan.problem);
    const partial = partialCreditTotals(plan.lines, FX);
    const partialStored: StoredLine[] = plan.lines.map((l, i) => ({ ...l, id: `c${i}`, vatRate: l.vatRate, sourceSellingCostId: null }));

    const left = remainingLines([THC, CUSTOMS], partialStored);
    const lines = fullCreditLines(left);
    // THC was credited in part: one unit of what is left; customs untouched: as on the invoice.
    expect(lines).toEqual([
      expect.objectContaining({ correctsLineId: "l1", qty: -1, unitPrice: 200, net: -200 }),
      expect.objectContaining({ correctsLineId: "l2", qty: -1, unitPrice: 2500, net: -100 }),
    ]);
    const full = fullCreditTotalsAfter(INVOICE, [partial]);
    for (const key of ["net", "vat", "gross", "netCzk", "vatCzk", "grossCzk"] as const) {
      expect(Number(INVOICE[key]) + partial[key] + full[key]).toBeCloseTo(0, 2);
    }
    expect(full.vatSummary).toEqual([
      { vatCode: "S21", vatRate: 21, base: -200, vat: -42, baseCzk: -5000, vatCzk: -1050 },
      { vatCode: "OUT", vatRate: 0, base: -100, vat: -0, baseCzk: -2500, vatCzk: -0 },
    ]);
  });

  it("is the invoice line by line, negated, when nothing was credited before", () => {
    const lines = fullCreditLines(remainingLines([THC], []));
    expect(lines).toEqual([expect.objectContaining({ correctsLineId: "l1", qty: -2, unitPrice: 150, net: -300 })]);
  });
});

describe("the same rate as the invoice", () => {
  it("credits a converted line at the rate the invoice used", () => {
    const calc = calculateInvoice({
      rows: [{ id: "s2", category: "customs", qty: "1", amount: "2500", currency: "CZK", invoice: true, vatCode: "OUT" }],
      currency: "EUR",
      rates: { CZK: 1, EUR: 25 },
      tradeDirection: "Export",
      vatPayer: true,
    });
    const line = calc.lines[0]!;
    const stored: StoredLine = { ...line, id: "l2", sourceSellingCostId: "s2" };
    const plan = partialCreditLines(remainingLines([stored], []), [{ lineId: "l2", amount: "1250" }]);
    expect("lines" in plan && plan.lines[0]!.net).toBe(-50);
  });
});

describe("settleTruckingCredit (a credit Trucking says is owed, Y1 / P1)", () => {
  // A credit note line of 50 EUR of a line made from row s1, at the invoice's rate 1.
  const credit = (unitPrice: number, over: Partial<CreditLineCalc> = {}): CreditLineCalc => ({
    sourceSellingCostId: "s1", description: "Freight", qty: -1, unitPrice, unitCurrency: "EUR", net: -unitPrice, vatCode: "S21", vatRate: 21, fxRate: 1, correctsLineId: "l1", ...over,
  });
  const owed: OpenCreditDiff = { id: "d1", ref: "trucking:consignment:c1:diff:1", currency: "EUR", amount: -50 };
  const diffsOf = (rowId: string | null) => (rowId === "s1" ? [owed] : []);
  let n = 0;
  const newId = () => `own${++n}`;

  it("credited exactly what is owed: the line settles the difference line, no row of its own", () => {
    expect(settleTruckingCredit([credit(50)], diffsOf, newId)).toEqual({ lines: [credit(50, { sourceSellingCostId: "d1" })], ownRows: [], shrink: [], rest: [], settled: [owed] });
  });

  it("credited less: it settles that much, the rest stays owed", () => {
    const out = settleTruckingCredit([credit(30)], diffsOf, newId);
    expect(out.lines).toEqual([credit(30, { sourceSellingCostId: "d1" })]);
    expect(out.shrink).toEqual([{ id: "d1", amount: 30 }]);
    expect(out.rest).toEqual([{ fromId: "d1", amount: 20, id: expect.any(String) }]);
  });

  it("two lines of one set settle the credit owed in turn: the second settles the rest the first left (m8)", () => {
    const two = settleTruckingCredit([credit(30), credit(20, { correctsLineId: "l2" })], diffsOf, () => "rest1");
    // The first bills the difference line (down to −30), the second the rest of −20 it left - no negative row of its own.
    expect(two.lines.map((l) => [l.unitPrice, l.sourceSellingCostId])).toEqual([[30, "d1"], [20, "rest1"]]);
    expect(two.ownRows).toEqual([]);
    expect(two.shrink).toEqual([{ id: "d1", amount: 30 }]);
    expect(two.rest).toEqual([{ fromId: "d1", amount: 20, id: "rest1" }]);
    expect(two.settled).toEqual([owed]);

    // The second credits less than the rest: the rest comes down to it, and what is left is owed on a row of its own.
    let k = 0;
    const less = settleTruckingCredit([credit(30), credit(15, { correctsLineId: "l2" })], diffsOf, () => `rest${++k}`);
    expect(less.lines.map((l) => [l.unitPrice, l.sourceSellingCostId])).toEqual([[30, "d1"], [15, "rest1"]]);
    expect(less.rest).toEqual([{ fromId: "d1", amount: 15, id: "rest1" }, { fromId: "d1", amount: 5, id: "rest2" }]);

    // The second credits more than the rest: the rest is settled, the line's other part is a credit of its own.
    let m = 0;
    const more = settleTruckingCredit([credit(30), credit(25, { correctsLineId: "l2" })], diffsOf, () => `id${++m}`);
    expect(more.lines.map((l) => [l.unitPrice, l.sourceSellingCostId])).toEqual([[30, "d1"], [20, "id1"], [5, "id2"]]);
    expect(more.ownRows.map((l) => l.sourceSellingCostId)).toEqual(["id2"]);
    expect(more.rest).toEqual([{ fromId: "d1", amount: 20, id: "id1" }]);
  });

  it("credited more: split - what is owed settles the difference line, the rest is a credit of its own; the net adds up to the line's", () => {
    const out = settleTruckingCredit([credit(80, { net: -2000.01, fxRate: 25 })], diffsOf, () => "own");
    expect(out.lines).toEqual([
      credit(50, { net: -1250, fxRate: 25, sourceSellingCostId: "d1" }),
      credit(30, { net: -750.01, fxRate: 25, sourceSellingCostId: "own" }),
    ]);
    expect(out.ownRows).toEqual([out.lines[1]]);
  });

  it("one line settles the credits owed in turn - its own set's first, then a line below nothing entered by hand - and only what goes beyond them is a credit of its own; the nets add up to the line's", () => {
    const hand: OpenCreditDiff = { id: "h1", ref: null, currency: "EUR", amount: -20 };
    const both = (rowId: string | null) => (rowId === "s1" ? [owed, hand] : []);
    const beyond = settleTruckingCredit([credit(80, { net: -2000.01, fxRate: 25 })], both, () => "own");
    expect(beyond.lines.map((l) => [l.unitPrice, l.net, l.sourceSellingCostId])).toEqual([[50, -1250, "d1"], [20, -500, "h1"], [10, -250.01, "own"]]);
    expect(beyond.ownRows).toEqual([beyond.lines[2]]);
    expect(beyond.settled).toEqual([owed, hand]);

    // Exactly what is owed in all: the last part takes what is left of the line's net.
    const exact = settleTruckingCredit([credit(70, { net: -1750.01, fxRate: 25 })], both, () => "own");
    expect(exact.lines.map((l) => [l.unitPrice, l.net, l.sourceSellingCostId])).toEqual([[50, -1250, "d1"], [20, -500.01, "h1"]]);
    expect(exact.ownRows).toEqual([]);

    // Less: the hand line is settled in part - it comes down to what was credited, the rest stays owed.
    const less = settleTruckingCredit([credit(60)], both, () => "rest1");
    expect(less.lines.map((l) => [l.unitPrice, l.sourceSellingCostId])).toEqual([[50, "d1"], [10, "h1"]]);
    expect(less.shrink).toEqual([{ id: "h1", amount: 10 }]);
    expect(less.rest).toEqual([{ fromId: "h1", amount: 10, id: "rest1" }]);
  });

  it("whether the credits owed are still what they were read: the same lines, each unchanged, for every credited row", () => {
    const hand: OpenCreditDiff = { id: "h1", ref: null, currency: "EUR", amount: -20 };
    const read = new Map([["s1", [owed, hand]]]);
    expect(sameCreditsOwed(read, new Map([["s1", [owed, hand]]]))).toBe(true);
    expect(sameCreditsOwed(new Map(), new Map([["s1", []]]))).toBe(true);
    // One came, one went, one changed - its amount, or its currency.
    expect(sameCreditsOwed(new Map(), read)).toBe(false);
    expect(sameCreditsOwed(read, new Map([["s1", [owed]]]))).toBe(false);
    expect(sameCreditsOwed(read, new Map([["s1", [owed, { ...hand, amount: -15 }]]]))).toBe(false);
    expect(sameCreditsOwed(read, new Map([["s1", [owed, { ...hand, currency: "CZK" }]]]))).toBe(false);
    // Review of system-22: by what they are, not by when they were written - the lines moved in the list (Duplicate's
    // new sort order) are the same credits owed; float noise below a cent is no change.
    expect(sameCreditsOwed(read, new Map([["s1", [hand, owed]]]))).toBe(true);
    expect(sameCreditsOwed(read, new Map([["s1", [owed, { ...hand, amount: -19.999999999 }]]]))).toBe(true);
  });

  // Review of system-22: what a request was asked on is kept with it and compared by content at its approval.
  describe("what a partial credit note request was asked on (owedWhenAsked / sameOwedAsAsked)", () => {
    const hand: OpenCreditDiff = { id: "h1", ref: null, currency: "EUR", amount: -20 };
    const documents = [
      { id: "inv1", status: "issued" },
      { id: "inv2", status: "credited" },
    ];
    const asked = owedWhenAsked(new Map([["s1", [owed, hand]]]), documents);

    it("keeps the credits owed by row and the documents by status, as JSON keeps them", () => {
      expect(asked).toEqual({ credits: [["s1", [owed, hand]]], documents });
      expect(JSON.parse(JSON.stringify(asked))).toEqual(asked);
      // Nothing more than what is compared: a read's other fields stay out.
      expect(owedWhenAsked(new Map([["s1", [{ ...hand, updatedAt: 1 } as OpenCreditDiff]]]), [{ id: "inv1", status: "issued", pdfKey: "x" } as never])).toEqual({
        credits: [["s1", [hand]]],
        documents: [{ id: "inv1", status: "issued" }],
      });
    });

    it("is what is owed now while nothing owed changed: the lines in another order, the documents too", () => {
      expect(sameOwedAsAsked(asked, new Map([["s1", [hand, owed]]]), [...documents].reverse())).toBe(true);
      expect(sameOwedAsAsked(owedWhenAsked(new Map(), []), new Map(), [])).toBe(true);
    });

    it("is not, once a credit owed changed, came or went, or a document came or changed its status", () => {
      // Trucking's 400 → 410 while it waited: the −20 replaced by a −10 (mock test S20-195).
      expect(sameOwedAsAsked(asked, new Map([["s1", [{ ...owed, id: "d2", amount: -10 }, hand]]]), documents)).toBe(false);
      expect(sameOwedAsAsked(asked, new Map([["s1", [owed, { ...hand, amount: -10 }]]]), documents)).toBe(false);
      expect(sameOwedAsAsked(asked, new Map([["s1", [owed]]]), documents)).toBe(false);
      expect(sameOwedAsAsked(asked, new Map(), documents)).toBe(false);
      // An invoice that took the credit off, another invoice's credit note, one credited or cancelled since.
      expect(sameOwedAsAsked(asked, new Map([["s1", [owed, hand]]]), [...documents, { id: "inv3", status: "issued" }])).toBe(false);
      expect(sameOwedAsAsked(asked, new Map([["s1", [owed, hand]]]), [{ id: "inv1", status: "cancelled" }, documents[1]!])).toBe(false);
      expect(sameOwedAsAsked(asked, new Map([["s1", [owed, hand]]]), [documents[0]!])).toBe(false);
    });
  });

  it("a line with no credit owed on its row, or in another currency, puts a negative row of its own on the shipment, as before; one difference line is settled once", () => {
    const out = settleTruckingCredit([credit(50, { sourceSellingCostId: "s2" }), credit(50, { unitCurrency: "CZK" }), credit(50), credit(10)], diffsOf, () => "own");
    expect(out.lines.map((l) => l.sourceSellingCostId)).toEqual(["own", "own", "d1", "own"]);
    expect(out.settled).toEqual([owed]);
  });
});
