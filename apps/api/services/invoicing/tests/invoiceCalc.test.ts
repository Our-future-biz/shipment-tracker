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

describe("dates", () => {
  it("parses ISO and grid dates", () => {
    expect(parseShipmentDate("2026-10-02")).toBe("2026-10-02");
    expect(parseShipmentDate("10/02/26")).toBe("2026-10-02");
    expect(parseShipmentDate("4/9/2026")).toBe("2026-04-09");
    expect(parseShipmentDate("")).toBe("");
    expect(parseShipmentDate(null)).toBe("");
  });

  it("defaults DUZP to the tax date: ATA for imports, ATD for exports", () => {
    const s = { estimatedArrival: "10/20/26", estimatedDeparture: "10/01/26", actualArrival: "2026-10-19", actualDeparture: "2026-10-02" };
    expect(defaultDuzp({ ...s, tradeDirection: "Import" }, "2026-10-13")).toBe("2026-10-19");
    expect(defaultDuzp({ ...s, tradeDirection: "Export" }, "2026-10-13")).toBe("2026-10-02");
  });

  it("defaults DUZP to ETA for imports, ETD for exports until ATA / ATD is known, else today", () => {
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
  it("adds the ROE % only to lines in another currency than the invoice", () => {
    const c = calculateInvoice({
      rows: [row({ id: "a", amount: "1000.00", currency: "EUR" }), row({ id: "b", category: "THC Destination", amount: "4999.50" })],
      currency: "CZK",
      rates,
      roePct: 102,
      tradeDirection: "Import",
      vatPayer: true,
    });
    expect(c.lines.map((l) => [l.net, l.fxRate])).toEqual([[25500, 25.5], [4999.5, 1]]);
  });

  it("keeps the CZK tax amounts at the raw ČNB rate whatever the ROE %", () => {
    const c = calculateInvoice({
      rows: [row({ id: "a", amount: "1000.00", currency: "EUR", vatCode: "S21" })],
      currency: "EUR",
      rates,
      roePct: 102,
      tradeDirection: "Domestic",
      vatPayer: true,
    });
    // same currency: no buffer on the line; CZK recap at 25 (ČNB), never 25.5
    expect(c).toMatchObject({ net: 1000, fxRate: 25, netCzk: 25000, vatCzk: 5250 });
  });

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

  it("prints the Invoice text on the line, the category when it is empty", () => {
    const c = calculateInvoice({
      rows: [
        row({ id: "a", amount: "1500.00", invoiceText: "Rail freight Hamburg → Prague, 1x40HC" }),
        row({ id: "b", category: "Delivery", amount: "500.00", invoiceText: "   " }),
      ],
      currency: "CZK",
      rates,
      tradeDirection: "Import",
      vatPayer: true,
    });
    expect(c.lines.map((l) => l.description)).toEqual(["Rail freight Hamburg → Prague, 1x40HC", "Delivery"]);
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
