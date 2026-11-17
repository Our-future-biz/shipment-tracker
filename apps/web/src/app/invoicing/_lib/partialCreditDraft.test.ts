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

  it("is nothing while no line is picked", () => {
    expect(partialCreditDraft([THC], {})).toMatchObject({ ok: false, wholeInvoice: false, gross: 0 });
  });
});
