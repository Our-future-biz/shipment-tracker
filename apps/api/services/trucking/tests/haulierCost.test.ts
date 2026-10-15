import { describe, expect, it } from "vitest";
import { haulierCostOf, type LegRealCost } from "../lib/haulierCost";

const real = (realCzk: number, invoiceNumber: string): LegRealCost => ({ legId: "l", consignmentId: "c", tripId: null, realCzk, invoiceNumber });

describe("haulier cost of a consignment", () => {
  it("is the estimate of its parts until an approved invoice covers them", () => {
    expect(haulierCostOf([{ estCzk: 16087.5, real: null }], 15000)).toEqual({ buyCzk: 16087.5, buyReal: false, buyInvoiceNumbers: [] });
  });

  it("is real once every priced part is invoiced and approved", () => {
    expect(haulierCostOf([{ estCzk: 16087.5, real: real(13337.5, "TEST-PINV-001") }], 15000)).toEqual({ buyCzk: 13337.5, buyReal: true, buyInvoiceNumbers: ["TEST-PINV-001"] });
  });

  it("mixes real and estimate parts (not real as a whole), each invoice once, rounded to the cent", () => {
    const parts = [
      { estCzk: 166.666, real: real(150.333, "PINV-1") },
      { estCzk: 800, real: null },
      { estCzk: null, real: null },
      { estCzk: 200, real: real(210, "PINV-1") },
    ];
    expect(haulierCostOf(parts, null)).toEqual({ buyCzk: 1160.33, buyReal: false, buyInvoiceNumbers: ["PINV-1"] });
  });

  it("falls back to the estimate from pricing without any priced part", () => {
    expect(haulierCostOf([{ estCzk: null, real: null }], 9000)).toEqual({ buyCzk: 9000, buyReal: false, buyInvoiceNumbers: [] });
    expect(haulierCostOf([], null)).toEqual({ buyCzk: null, buyReal: false, buyInvoiceNumbers: [] });
  });
});
