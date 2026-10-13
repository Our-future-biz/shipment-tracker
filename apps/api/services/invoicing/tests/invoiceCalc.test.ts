import { describe, expect, it } from "vitest";
import {
  addDays,
  calculateInvoice,
  creditLines,
  defaultDuzp,
  defaultVatCode,
  dueDays,
  effectiveVatCode,
  isIsoDate,
  parseShipmentDate,
  pickRates,
  round2,
  summarise,
  type SellingRowInput,
} from "../lib/invoiceCalc";

const rates = { CZK: 1, EUR: 25, USD: 22 };

const row = (over: Partial<SellingRowInput>): SellingRowInput => ({
  id: "r",
  category: "Ocean freight",
  qty: "1.00",
  amount: null,
  currency: "CZK",
  invoice: true,
  vatCode: null,
  ...over,
});

describe("round2", () => {
  it("rounds half away from zero without binary noise", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("VAT codes", () => {
  it("defaults to §69 for international shipments, 21 % otherwise", () => {
    expect(defaultVatCode("Import")).toBe("Z69");
    expect(defaultVatCode("export")).toBe("Z69");
    expect(defaultVatCode("Domestic")).toBe("S21");
    expect(defaultVatCode("")).toBe("S21");
  });

  it("uses the chosen code, but never charges VAT for a non-payer", () => {
    expect(effectiveVatCode("RC", "Import", true)).toBe("RC");
    expect(effectiveVatCode(null, "Import", true)).toBe("Z69");
    expect(effectiveVatCode("bogus", "Domestic", true)).toBe("S21");
    expect(effectiveVatCode("S21", "Domestic", false)).toBe("NP");
    // NP is only for non-payers
    expect(effectiveVatCode("NP", "Domestic", true)).toBe("S21");
  });
});

describe("pickRates", () => {
  const rows = [
    { week: "2026-W42", validFrom: "2026-10-12", validTo: "2026-10-18", rateEur: "25.0000", rateUsd: "22.0000" },
    { week: "2026-W40", validFrom: "2026-09-28", validTo: "2026-10-04", rateEur: "24.5000", rateUsd: null },
  ];

  it("takes the week containing the date", () => {
    expect(pickRates(rows, "2026-10-14")).toEqual({ rates: { CZK: 1, EUR: 25, USD: 22 }, week: "2026-W42", source: "exact" });
  });

  it("falls back to the closest older week, then the newest", () => {
    expect(pickRates(rows, "2026-10-07")).toMatchObject({ week: "2026-W40", source: "older", rates: { CZK: 1, EUR: 24.5 } });
    expect(pickRates(rows, "2026-04-06")).toMatchObject({ week: "2026-W42", source: "newest" });
  });

  it("has only CZK when no rates exist", () => {
    expect(pickRates([], "2026-10-14")).toEqual({ rates: { CZK: 1 }, week: "", source: "none" });
  });
});

describe("dates", () => {
  it("parses ISO and grid dates", () => {
    expect(parseShipmentDate("2026-10-02")).toBe("2026-10-02");
    expect(parseShipmentDate("10/02/26")).toBe("2026-10-02");
    expect(parseShipmentDate("4/9/2026")).toBe("2026-04-09");
    expect(parseShipmentDate("")).toBe("");
    expect(parseShipmentDate(null)).toBe("");
  });

  it("defaults DUZP to ETA for imports, ETD for exports, else today", () => {
    const s = { estimatedArrival: "10/20/26", estimatedDeparture: "10/01/26" };
    expect(defaultDuzp({ ...s, tradeDirection: "Import" }, "2026-10-13")).toBe("2026-10-20");
    expect(defaultDuzp({ ...s, tradeDirection: "Export" }, "2026-10-13")).toBe("2026-10-01");
    expect(defaultDuzp({ estimatedArrival: null, estimatedDeparture: null, tradeDirection: "Import" }, "2026-10-13")).toBe("2026-10-13");
  });

  it("reads payment terms", () => {
    expect(dueDays("14 days", 30)).toBe(14);
    expect(dueDays("30 days", 14)).toBe(30);
    expect(dueDays("PREPAYMENT", 14)).toBe(0);
    expect(dueDays("", 14)).toBe(14);
    expect(dueDays(null, 21)).toBe(21);
  });

  it("adds days across month ends and validates ISO dates", () => {
    expect(addDays("2026-10-20", 14)).toBe("2026-11-03");
    expect(addDays("2026-12-25", 7)).toBe("2027-01-01");
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("13.10.2026")).toBe(false);
  });
});

describe("calculateInvoice", () => {
  it("converts every row by its own currency and leaves unticked rows out", () => {
    const c = calculateInvoice({
      rows: [
        row({ id: "a", amount: "1000.00", currency: "EUR" }),
        row({ id: "b", category: "THC Destination", amount: "4999.50" }),
        row({ id: "c", amount: "999.00", invoice: false }),
      ],
      currency: "CZK",
      rates,
      tradeDirection: "Import",
      vatPayer: true,
    });
    expect(c.lines.map((l) => [l.description, l.net, l.vatCode])).toEqual([
      ["Ocean freight", 25000, "Z69"],
      ["THC Destination", 4999.5, "Z69"],
    ]);
    expect(c).toMatchObject({ net: 29999.5, vat: 0, gross: 29999.5, grossCzk: 29999.5, fxRate: 1, missingCurrencies: [] });
  });

  it("calculates VAT per rate and shows it in CZK for a EUR invoice", () => {
    const c = calculateInvoice({
      rows: [
        row({ id: "a", amount: "1000.00", currency: "EUR", vatCode: "Z69" }),
        row({ id: "b", category: "Customs clearance", amount: "2500.00", currency: "CZK", vatCode: "S21" }),
      ],
      currency: "EUR",
      rates,
      tradeDirection: "Import",
      vatPayer: true,
    });
    // 2500 CZK = 100 EUR, VAT 21 % = 21 EUR; in CZK base 2500, VAT 525
    expect(c.vatSummary).toEqual([
      { vatCode: "S21", vatRate: 21, base: 100, vat: 21, baseCzk: 2500, vatCzk: 525 },
      { vatCode: "Z69", vatRate: 0, base: 1000, vat: 0, baseCzk: 25000, vatCzk: 0 },
    ]);
    expect(c).toMatchObject({ net: 1100, vat: 21, gross: 1121, netCzk: 27500, vatCzk: 525, grossCzk: 28025, fxRate: 25 });
  });

  it("computes VAT from the base per rate, not per line (§37)", () => {
    const c = calculateInvoice({
      rows: [row({ id: "a", amount: "0.05", vatCode: "S21" }), row({ id: "b", amount: "0.05", vatCode: "S21" })],
      currency: "CZK",
      rates,
      tradeDirection: "Domestic",
      vatPayer: true,
    });
    // per line 0.05 * 21 % = 0.0105 -> 0.01 each (0.02), per base 0.10 * 21 % = 0.021 -> 0.02
    expect(c.vat).toBe(0.02);
  });

  it("multiplies by quantity, keeps discounts and skips zero lines", () => {
    const c = calculateInvoice({
      rows: [
        row({ id: "a", amount: "1250.50", qty: "2.00" }),
        row({ id: "b", category: "Discount", amount: "-150.00" }),
        row({ id: "c", amount: "0.00" }),
        row({ id: "d", amount: null }),
      ],
      currency: "CZK",
      rates,
      tradeDirection: "Domestic",
      vatPayer: true,
    });
    expect(c.lines.map((l) => l.net)).toEqual([2501, -150]);
    expect(c.net).toBe(2351);
    expect(c.vat).toBe(493.71);
  });

  it("reports currencies without a rate instead of converting at 1", () => {
    const c = calculateInvoice({
      rows: [row({ id: "a", amount: "100.00", currency: "GBP" }), row({ id: "b", amount: "50.00" })],
      currency: "CZK",
      rates,
      tradeDirection: "Import",
      vatPayer: true,
    });
    expect(c.missingCurrencies).toEqual(["GBP"]);
    expect(c.net).toBe(50);
  });

  it("charges no VAT when the issuer is not a VAT payer", () => {
    const c = calculateInvoice({
      rows: [row({ id: "a", amount: "1000.00", vatCode: "S21" })],
      currency: "CZK",
      rates,
      tradeDirection: "Domestic",
      vatPayer: false,
    });
    expect(c.lines[0]!.vatCode).toBe("NP");
    expect(c.vat).toBe(0);
  });
});

describe("credit notes", () => {
  it("negates the lines and every total", () => {
    const original = calculateInvoice({
      rows: [row({ id: "a", amount: "1000.00", currency: "EUR", vatCode: "S21" })],
      currency: "EUR",
      rates,
      tradeDirection: "Domestic",
      vatPayer: true,
    });
    const lines = creditLines(original.lines);
    const credit = summarise(lines, original.fxRate);
    expect(lines[0]).toMatchObject({ qty: -1, net: -1000 });
    expect(credit).toMatchObject({ net: -1000, vat: -210, gross: -1210, netCzk: -25000, vatCzk: -5250, grossCzk: -30250 });
  });
});
