import { describe, expect, it } from "vitest";
import {
  WHOLE_INVOICE,
  fullCreditLines,
  fullCreditTotalsAfter,
  partialCreditLines,
  partialCreditTotals,
  planPartialCredit,
  remainingLines,
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
