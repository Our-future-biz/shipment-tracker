import { describe, expect, it } from "vitest";
import { quoteLinesToCostRows } from "../../utils/quoteCostImport.utils";

// The quote of the audit: three buying lines in three currencies, two selling lines.
const QUOTE = {
  reference: "QCZ20261010001",
  customerName: "ITTEC s.r.o.",
  currency: "USD",
  buyingLines: [
    { type: "Ocean freight", description: "Shanghai - Hamburg, 1x40HC", supplier: "Maersk", currency: "USD", amount: 2000 },
    { type: "THC Destination", description: "", supplier: "Metrans", currency: "CZK", amount: 3500 },
    { type: "Handling", description: "Terminal handling", supplier: "", currency: "EUR", amount: 80 },
  ],
  sellingLines: [
    { type: "Ocean freight", description: "All-in rate", currency: "USD", amount: 2400 },
    { type: "Handling", description: "", currency: "EUR", amount: 120.5 },
  ],
};

const buying = (lines: unknown, quote: Record<string, unknown> = {}) => quoteLinesToCostRows({ ...quote, buyingLines: lines }).buying;
const selling = (lines: unknown, quote: Record<string, unknown> = {}) => quoteLinesToCostRows({ ...quote, sellingLines: lines }).selling;

describe("quoteLinesToCostRows", () => {
  it("makes one buying row per buying line, in the quote's order: type, description, supplier, and the amount as the estimate", () => {
    expect(quoteLinesToCostRows(QUOTE).buying).toEqual([
      {
        category: "ocean_freight",
        description: "Shanghai - Hamburg, 1x40HC",
        vendor: "Maersk",
        estQty: "1",
        estAmount: "2000.00",
        estCurrency: "USD",
        realQty: "1",
        realCurrency: "USD",
        unit: "",
      },
      { category: "thc_destination", description: "", vendor: "Metrans", estQty: "1", estAmount: "3500.00", estCurrency: "CZK", realQty: "1", realCurrency: "CZK", unit: "" },
      { category: "handling", description: "Terminal handling", vendor: "", estQty: "1", estAmount: "80.00", estCurrency: "EUR", realQty: "1", realCurrency: "EUR", unit: "" },
    ]);
  });

  it("makes one selling row per selling line, charged to the quote's customer and ticked for invoicing", () => {
    expect(quoteLinesToCostRows(QUOTE).selling).toEqual([
      { category: "ocean_freight", description: "All-in rate", customer: "ITTEC s.r.o.", qty: "1", amount: "2400.00", currency: "USD", invoice: true },
      { category: "handling", description: "", customer: "ITTEC s.r.o.", qty: "1", amount: "120.50", currency: "EUR", invoice: true },
    ]);
  });

  it("keeps every line a row of its own: two lines of one type, or of two currencies, are never added together", () => {
    const rows = buying([
      { type: "Ocean freight", currency: "USD", amount: 2000 },
      { type: "Ocean freight", currency: "USD", amount: 150 },
      { type: "Ocean freight", currency: "EUR", amount: 300 },
    ]);
    expect(rows.map((row) => [row.category, row.estAmount, row.estCurrency, row.realCurrency])).toEqual([
      ["ocean_freight", "2000.00", "USD", "USD"],
      ["ocean_freight", "150.00", "USD", "USD"],
      ["ocean_freight", "300.00", "EUR", "EUR"],
    ]);
  });

  it("reads an amount that was typed as text, decimal comma included", () => {
    const amounts = (values: unknown[]) => buying(values.map((amount) => ({ type: "Handling", description: "x", amount }))).map((row) => row.estAmount);
    expect(amounts(["1250,50", "1250.50", " 1 250,5 ", "1,250", "1,250.75", "1.250,75", "0,125", "-80", 99.999])).toEqual([
      "1250.50",
      "1250.50",
      "1250.50",
      "1250.00",
      "1250.75",
      "1250.75",
      "0.13",
      "-80.00",
      "100.00",
    ]);
  });

  it("leaves the amount open when the line holds none the column can take, and keeps the line for what it says", () => {
    const rows = buying([
      { type: "Customs clearance", description: "at cost", amount: "abc" },
      { type: "Insurance", description: "on request", amount: null },
      { type: "Storage", description: "per day" },
      { type: "Other", description: "too large", amount: 1e12 },
      { type: "Other", description: "too large once rounded", amount: 999999999999.999 },
      { type: "Other", description: "not a number", amount: Number.NaN },
      { type: "Other", description: "largest", amount: 999999999999.99 },
      { type: "Delivery", description: "free of charge", amount: 0 },
    ]);
    expect(rows.map((row) => row.estAmount)).toEqual([null, null, null, null, null, null, "999999999999.99", "0.00"]);
  });

  it("puts a line without a currency in the quote's currency - EUR when the quote stores none", () => {
    const lines = [{ type: "Handling", amount: 80 }, { type: "Handling", amount: 80, currency: "" }, { type: "Handling", amount: 80, currency: 7 }, { type: "Handling", amount: 80, currency: "CZK" }];
    expect(buying(lines, { currency: "USD" }).map((row) => row.estCurrency)).toEqual(["USD", "USD", "USD", "CZK"]);
    expect(buying(lines).map((row) => row.realCurrency)).toEqual(["EUR", "EUR", "EUR", "CZK"]);
    expect(selling(lines, { currency: "  " }).map((row) => row.currency)).toEqual(["EUR", "EUR", "EUR", "CZK"]);
  });

  it("skips a line nobody filled in: no amount, no description, no supplier", () => {
    const rows = buying([
      // What "Add line" puts into the editor.
      { type: "Ocean freight", description: "", supplier: "", currency: "EUR", amount: 0 },
      { type: "Ocean freight", description: "   ", supplier: " ", currency: "EUR", amount: "" },
      { type: "Handling", description: "", supplier: "", currency: "EUR", amount: 80 },
      { type: "Other", description: "", supplier: "DHL", currency: "EUR", amount: 0 },
      {},
    ]);
    expect(rows.map((row) => [row.category, row.vendor, row.estAmount])).toEqual([
      ["handling", "", "80.00"],
      ["other", "DHL", "0.00"],
    ]);
  });

  it("skips what is not a line, and reads lines that are not a list as none", () => {
    expect(buying([null, 5, "Ocean freight", ["Handling", 80], { type: "Handling", amount: 80 }])).toHaveLength(1);
    for (const lines of [undefined, null, "abc", 42, { type: "Handling", amount: 80 }]) {
      expect(quoteLinesToCostRows({ buyingLines: lines, sellingLines: lines })).toEqual({ buying: [], selling: [] });
    }
  });

  it("gives no rows for a document that is not an object", () => {
    for (const data of [undefined, null, "abc", 42, [QUOTE]]) {
      expect(quoteLinesToCostRows(data)).toEqual({ buying: [], selling: [] });
    }
  });

  it("takes text as text only, trimmed: a type, supplier or customer of another kind is empty", () => {
    expect(buying([{ type: 5, description: [" x "], supplier: { name: "Maersk" }, amount: 80 }])).toEqual([
      { category: "", description: "", vendor: "", estQty: "1", estAmount: "80.00", estCurrency: "EUR", realQty: "1", realCurrency: "EUR", unit: "" },
    ]);
    expect(selling([{ type: " Handling ", description: " per container ", amount: 80 }], { customerName: 42 })).toEqual([
      { category: "handling", description: "per container", customer: "", qty: "1", amount: "80.00", currency: "EUR", invoice: true },
    ]);
    expect(selling([{ type: "Handling", amount: 80 }], { customerName: " ITTEC s.r.o. " })[0]?.customer).toBe("ITTEC s.r.o.");
  });

  it("stores the charge code: the line's own, else its type read as a label; text of no code stays as typed", () => {
    const rows = buying([
      { type: "Road freight", chargeCode: "road_freight", amount: 80 },
      { type: "Road freight", amount: 80 },
      { type: "Others", amount: 80 },
      { type: "Courier", amount: 80 },
    ]);
    expect(rows.map((row) => row.category)).toEqual(["road_freight", "road_freight", "other", "Courier"]);
  });

  it("copies a line priced per unit as its quantity, unit and unit price; a quantity without a unit price is one charge", () => {
    const lines = [
      { type: "Road freight", qty: 420, unit: "km", unitPrice: 1.15, amount: 483 },
      { type: "Road freight", qty: "2,5", unit: "pallet", unitPrice: "40", amount: 100 },
      { type: "Road freight", qty: 3, unit: "pallet", amount: 120 },
      { type: "Road freight", qty: 0, unitPrice: 10, amount: 120 },
    ];
    expect(buying(lines).map((row) => [row.estQty, row.estAmount, row.realQty, row.unit])).toEqual([
      ["420.00", "1.15", "420.00", "km"],
      ["2.50", "40.00", "2.50", "pallet"],
      ["1", "120.00", "1", "pallet"],
      ["1", "120.00", "1", ""],
    ]);
    expect(selling(lines).map((row) => [row.qty, row.amount])).toEqual([
      ["420.00", "1.15"],
      ["2.50", "40.00"],
      ["1", "120.00"],
      ["1", "120.00"],
    ]);
  });

  it("copies one side without the other", () => {
    expect(quoteLinesToCostRows({ buyingLines: QUOTE.buyingLines })).toMatchObject({ buying: [{}, {}, {}], selling: [] });
    expect(quoteLinesToCostRows({ sellingLines: QUOTE.sellingLines })).toMatchObject({ buying: [], selling: [{}, {}] });
  });
});
