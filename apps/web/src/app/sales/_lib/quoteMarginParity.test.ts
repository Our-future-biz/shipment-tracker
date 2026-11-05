import { describe, expect, it } from "vitest";
import { computeTotals } from "./salesQuote";
import type { CostLine, SalesQuoteData } from "./types";
// The server's margin of a quote (quotes service). It has no imports of its own, so it runs here
// beside the editor's totals: the two must give the same figures for the same quote (Council
// Outlay 6, D4), or the rep and the gate would read different margins.
import { quoteMargin } from "../../../../../api/services/quotes/lib/quoteMargin";

// Today's ČNB sheet (CZK per unit) and company ROE %, as both sides get them from fx /fx/rates.
const SHEET = { CZK: 1, EUR: 25.12, USD: 23.47, GBP: 29.81 };
const ROE = 102;

const line = (amount: number, currency: string, over: Partial<CostLine> = {}): CostLine => ({ type: "Ocean freight", description: "", currency, amount, ...over });
const quote = (over: Partial<SalesQuoteData>): SalesQuoteData => ({ quoteNumber: "QCZ20261103001", ...over }) as SalesQuoteData;

// The editor's totals and the server's margin of one quote, side by side.
function both(data: SalesQuoteData) {
  const editor = computeTotals(data, SHEET, { roePct: ROE, fixingDate: "2026-11-03" } as Parameters<typeof computeTotals>[2]);
  const server = quoteMargin(data, { today: "2026-11-03", rates: SHEET, roePct: ROE })!;
  return { editor, server };
}

const QUOTES: [string, SalesQuoteData][] = [
  [
    "a Sea FCL draft in EUR with USD, CZK and EUR lines",
    quote({
      serviceType: "Sea FCL",
      currency: "EUR",
      quoteStatus: "draft",
      sellingLines: [line(2150, "USD"), line(4500, "CZK"), line(85.5, "EUR")],
      buyingLines: [line(1980, "USD"), line(3900, "CZK"), line(60, "EUR")],
    }),
  ],
  [
    "an Air quote in CZK with EUR selling and buying",
    quote({ serviceType: "Air", currency: "CZK", sellingLines: [line(1234.56, "EUR"), line(1800, "CZK")], buyingLines: [line(1100.1, "EUR")] }),
  ],
  [
    "a quote with no currency named (EUR), lines without a currency",
    quote({ serviceType: "Sea LCL", sellingLines: [line(410, "")], buyingLines: [line(9500, "CZK")] }),
  ],
  [
    "a sent quote keeping the rates and ROE % it stored",
    quote({
      serviceType: "Rail",
      currency: "EUR",
      quoteStatus: "quoted",
      fx: { date: "2026-10-20", fixingDate: "2026-10-20", roePct: 100, rates: { EUR: 24.8, USD: 23.1 }, lockedAt: "2026-10-20T08:00:00.000Z" },
      sellingLines: [line(3000, "USD")],
      buyingLines: [line(2600, "EUR")],
    } as Partial<SalesQuoteData>),
  ],
  [
    "a draft whose own typed rate fills a currency the sheet lacks",
    quote({
      serviceType: "Sea Break Bulk",
      currency: "CZK",
      quoteStatus: "draft",
      rates: { CHF: { rate: 26.4 } },
      sellingLines: [line(5000, "CHF")],
      buyingLines: [line(110000, "CZK")],
    } as Partial<SalesQuoteData>),
  ],
  ["a quote that sells at a loss", quote({ serviceType: "Road", currency: "CZK", sellingLines: [line(9000, "CZK")], buyingLines: [line(9450, "CZK")] })],
  [
    "lines with no amount but a quantity and unit price (an older document)",
    quote({
      serviceType: "Road",
      currency: "CZK",
      sellingLines: [{ ...line(0, "CZK"), amount: null as unknown as number, qty: 2, unitPrice: 4500 }],
      buyingLines: [{ ...line(0, "EUR"), amount: "" as unknown as number, qty: 3, unitPrice: 100 }],
    }),
  ],
];

describe("the server's quote margin and the editor's totals", () => {
  for (const [name, data] of QUOTES) {
    it(`agree on ${name}`, () => {
      const { editor, server } = both(data);
      expect(server.currency).toBe(editor.currency);
      expect(server.selling).toBe(editor.selling);
      expect(server.buying).toBe(editor.buying);
      expect(server.profit).toBe(editor.profit);
      expect(server.marginPercent).toBe(editor.margin);
      expect(server.problem).toBeNull();
      // In CZK the profit is the editor's profit at the quote currency's rate.
      const rate = data.currency === "CZK" ? 1 : (data.fx?.rates?.[editor.currency] ?? SHEET[editor.currency as keyof typeof SHEET]);
      expect(server.marginCzk).toBeCloseTo(editor.profit * rate, 2);
    });
  }

  it("both leave out a line no rate converts, and name the rate", () => {
    const data = quote({ serviceType: "Air", currency: "EUR", sellingLines: [line(900, "EUR"), line(4000, "CNY")], buyingLines: [line(700, "EUR")] });
    const { editor, server } = both(data);
    expect(server.selling).toBe(editor.selling);
    expect(editor.missingRates).toEqual(["CNY"]);
    expect(server.problem).toBe("No ČNB rate for CNY on 2026-11-03");
    expect(server.marginCzk).toBeNull();
  });
});
