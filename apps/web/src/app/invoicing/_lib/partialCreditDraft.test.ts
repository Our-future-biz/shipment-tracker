import { describe, expect, it } from "vitest";
import { partialCreditDraft } from "./partialCreditDraft";

const THC = { lineId: "l1", remainingAmount: 300, remainingNet: 300, fxRate: 1, vatRate: 21, unitCurrency: "EUR" };
const CUSTOMS = { lineId: "l2", remainingAmount: 2500, remainingNet: 100, fxRate: 0.04, vatRate: 0, unitCurrency: "CZK" };

describe("partialCreditDraft", () => {
  it("adds up the picked lines in the invoice currency, with VAT", () => {
    const d = partialCreditDraft([THC, CUSTOMS], { l1: "100", l2: "500" });
    expect(d).toMatchObject({ ok: true, wholeInvoice: false, net: 120, vat: 21, gross: 141 });
    expect(d.lines).toEqual([{ lineId: "l1", amount: "100.00" }, { lineId: "l2", amount: "500.00" }]);
  });

  it("refuses an empty, too large or too precise amount, line by line", () => {
    const d = partialCreditDraft([THC, CUSTOMS], { l1: "", l2: "2500.01" });
    expect(d.ok).toBe(false);
    expect(d.rows.l1!.problem).toBe("Enter an amount");
    expect(d.rows.l2!.problem).toBe("2500.00 CZK left");
    expect(partialCreditDraft([THC], { l1: "1.005" }).rows.l1!.problem).toBe("Two decimals at most");
  });

  it("takes a decimal comma", () => {
    expect(partialCreditDraft([THC], { l1: "12,5" }).lines).toEqual([{ lineId: "l1", amount: "12.50" }]);
  });

  it("sees the whole invoice credited, which needs no approval", () => {
    const d = partialCreditDraft([THC, CUSTOMS], { l1: "300", l2: "2500" });
    expect(d).toMatchObject({ wholeInvoice: true, ok: false });
    // a line with nothing left does not count
    expect(partialCreditDraft([THC, { ...CUSTOMS, remainingAmount: 0, remainingNet: 0 }], { l1: "300" }).wholeInvoice).toBe(true);
  });

  it("refuses more than is left of an invoice with a line below zero, as the API does", () => {
    const DISCOUNT = { lineId: "l3", remainingAmount: -150, remainingNet: -150, fxRate: 1, vatRate: 21, unitCurrency: "EUR" };
    // 300 + 100 - 150 = 250 left; THC 200 and customs 2 000 CZK (80 EUR) take 280.
    expect(partialCreditDraft([THC, CUSTOMS, DISCOUNT], { l1: "200", l2: "2000" })).toMatchObject({ ok: false, overInvoice: true, wholeInvoice: false, left: 250 });
    expect(partialCreditDraft([THC, CUSTOMS, DISCOUNT], { l1: "200" })).toMatchObject({ ok: true, overInvoice: false });
    // the THC and customs to their end: the whole invoice, not more than it
    expect(partialCreditDraft([THC, CUSTOMS, DISCOUNT], { l1: "300", l2: "2500" })).toMatchObject({ wholeInvoice: true, overInvoice: false, ok: false });
  });

  it("is nothing while no line is picked", () => {
    expect(partialCreditDraft([THC], {})).toMatchObject({ ok: false, wholeInvoice: false, gross: 0 });
  });
});
