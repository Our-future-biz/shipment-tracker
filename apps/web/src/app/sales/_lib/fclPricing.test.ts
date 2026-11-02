import { describe, expect, it } from "vitest";
import { fclBlocks, fclLines, fclOfferRows, priceFclBlock, usesFclPricing, withFclPricing } from "./fclPricing";
import { computeTotals, convertLine } from "./salesQuote";
import type { CostLine, SalesQuoteData } from "./types";

// CZK per 1 unit.
const SHEET = { USD: 23, EUR: 25 };

// A charge per container of a type, bought at `rate` per container.
const perCtr = (code: string, type: string, rate: number, qty: number, more: Partial<CostLine> = {}): CostLine => ({
  type: code,
  chargeCode: code,
  description: code,
  currency: "USD",
  basis: "container",
  containerType: type,
  qty,
  value: qty,
  unit: type,
  unitPrice: rate,
  amount: rate * qty,
  pairId: `${code}-${type}`,
  ...more,
});
const perShipment = (code: string, amount: number, more: Partial<CostLine> = {}): CostLine => ({
  type: code,
  chargeCode: code,
  description: code,
  currency: "USD",
  basis: "lumpsum",
  amount,
  pairId: code,
  ...more,
});

const quote = (over: Partial<SalesQuoteData> = {}): SalesQuoteData => ({
  serviceType: "Sea FCL",
  currency: "USD",
  containers: [
    { qty: 2, type: "20' DC", weight: 12000 },
    { qty: 1, type: "40' HC" },
  ],
  buyingLines: [
    perCtr("ocean_freight", "20' DC", 1000, 2),
    perCtr("fcl_baf", "20' DC", 100, 2),
    perCtr("fcl_thc_origin", "20' DC", 200, 2),
    perCtr("inland_haulage", "20' DC", 500, 2),
    perCtr("ocean_freight", "40' HC", 1800, 1),
    perShipment("fcl_documentation", 60),
  ],
  fclPricing: { blocks: {} },
  ...over,
});

const block = (data: SalesQuoteData, key: string) => fclBlocks(data).find((b) => b.key === key)!;
const profits = (data: SalesQuoteData, key: string) => priceFclBlock(data, SHEET, block(data, key)).charges.map((c) => c.profit);

describe("FCL pricing blocks", () => {
  it("has a block per container type of the cargo, then one for the charges per shipment", () => {
    const blocks = fclBlocks(quote());
    expect(blocks.map((b) => [b.key, b.label, b.units, b.perContainer, b.lines])).toEqual([
      ["20' DC", "20' DC", 2, true, [0, 1, 2, 3]],
      ["40' HC", "40' HC", 1, true, [4]],
      ["", "Per shipment", 1, false, [5]],
    ]);
    expect(blocks[0]!.weights).toEqual([12000]);
  });

  it("puts a per-container charge without a type in the only type there is, else in a block of all containers", () => {
    const untyped = perCtr("vgm", "", 10, 3, { containerType: undefined });
    expect(fclBlocks(quote({ containers: [{ qty: 3, type: "40' HC" }], buyingLines: [untyped] })).map((b) => [b.key, b.lines])).toEqual([
      ["40' HC", [0]],
      ["", []],
    ]);
    expect(fclBlocks(quote({ buyingLines: [untyped] })).map((b) => [b.key, b.units, b.lines])).toEqual([
      ["20' DC", 2, []],
      ["40' HC", 1, []],
      ["*", 3, [0]],
      ["", 1, []],
    ]);
  });

  it("is the layout of every open Sea FCL quote, and of a sent one only if it was priced in it", () => {
    expect(usesFclPricing(quote({ fclPricing: undefined }), false)).toBe(true);
    expect(usesFclPricing(quote({ fclPricing: undefined }), true)).toBe(false);
    expect(usesFclPricing(quote(), true)).toBe(true);
    expect(usesFclPricing(quote({ serviceType: "Sea LCL" }), false)).toBe(false);
  });
});

describe("a block's profit", () => {
  it("as a % of the selling price goes on the profit basis charges pro rata in a breakdown offer - the freight by default", () => {
    // 10 % of selling on 1,500 bought: 166.67, split 1000 : 500.
    const data = quote({ fclPricing: { blocks: { "20' DC": { mode: "percent", value: 10 } } } });
    expect(profits(data, "20' DC")).toEqual([111.11, 0, 0, 55.56]);
    const priced = priceFclBlock(data, SHEET, block(data, "20' DC"));
    expect([priced.buying, priced.profit, priced.selling, priced.percent]).toEqual([1800, 166.67, 1966.67, 8]);
    expect(priced.charges.map((c) => c.takesProfit)).toEqual([true, false, false, true]);
  });

  it("as a sum is per container, and the cents rounding leaves go to the ocean freight", () => {
    const lines = quote().buyingLines!.map((l, i) => (i === 1 ? { ...l, profitBasis: true, unitPrice: 1000 } : i === 3 ? { ...l, unitPrice: 1000 } : l));
    const data = quote({ buyingLines: lines, fclPricing: { blocks: { "20' DC": { mode: "sum", value: 100 } } } });
    expect(profits(data, "20' DC")).toEqual([33.34, 33.33, 0, 33.33]);
  });

  it("in an all-in offer goes on the charges in the all-in price; one kept out of it is at cost", () => {
    const lines = quote().buyingLines!.map((l, i) => (i === 2 ? { ...l, inAllIn: false } : l));
    const data = quote({ allIn: true, buyingLines: lines, fclPricing: { blocks: { "20' DC": { mode: "sum", value: 160 } } } });
    // 1000 : 100 : 500 of 1600.
    expect(profits(data, "20' DC")).toEqual([100, 10, 0, 50]);
  });

  it("is each charge's own when set per charge, a charge without one taking the block's %", () => {
    const lines = quote().buyingLines!.map((l, i) => (i === 0 ? { ...l, chargeProfit: { mode: "sum" as const, value: 50 } } : l));
    const data = quote({ buyingLines: lines, fclPricing: { blocks: { "20' DC": { mode: "percent", value: 20, perCharge: true } } } });
    // IHI: 20 % of selling on 500 = 125.
    expect(profits(data, "20' DC")).toEqual([50, 0, 0, 125]);
  });

  it("says so when no charge of the block takes the profit set", () => {
    const lines = quote().buyingLines!.map((l) => ({ ...l, profitBasis: false }));
    const data = quote({ buyingLines: lines, fclPricing: { blocks: { "20' DC": { mode: "sum", value: 100 } } } });
    expect(priceFclBlock(data, SHEET, block(data, "20' DC")).profitUnplaced).toBe(true);
  });
});

describe("the selling lines of an FCL-priced quote", () => {
  it("are the buying lines with their profit, per container, in each charge's own currency", () => {
    const lines = quote().buyingLines!.map((l, i) => (i === 3 ? { ...l, currency: "EUR" } : l));
    const data = quote({ buyingLines: lines, fclPricing: { blocks: { "20' DC": { mode: "sum", value: 200 } } } });
    const selling = fclLines(data, SHEET)!.sellingLines!;
    // IHI 500 EUR = 543.48 USD; 200 split 1000 : 543.48 → 129.58 / 70.42 USD; 70.42 USD = 64.79 EUR.
    expect(selling.map((l) => [l.chargeCode, l.currency, l.unitPrice, l.amount, l.supplier])).toEqual([
      ["ocean_freight", "USD", 1129.58, 2259.16, undefined],
      ["fcl_baf", "USD", 100, 200, undefined],
      ["fcl_thc_origin", "USD", 200, 400, undefined],
      ["inland_haulage", "EUR", 564.79, 1129.58, undefined],
      ["ocean_freight", "USD", 1800, 1800, undefined],
      ["fcl_documentation", "USD", undefined, 60, undefined],
    ]);
    expect(selling.every((l, i) => l.pairId === data.buyingLines![i]!.pairId)).toBe(true);
  });

  it("leave out a charge priced at nothing, and keep the trucking lines as the trucking tariffs priced them", () => {
    const trucking: CostLine = { ...perShipment("road_freight", 300), tariffRef: "trucking:v1" };
    const data = quote({ buyingLines: [perCtr("ocean_freight", "20' DC", 0, 2), { ...trucking, amount: 250 }], sellingLines: [trucking] });
    expect(fclLines(data, SHEET)!.sellingLines).toEqual([trucking]);
  });

  it("wait for the rates a charge in another currency needs", () => {
    const data = quote({ buyingLines: [perCtr("ocean_freight", "20' DC", 1000, 2, { currency: "GBP" })] });
    expect(fclLines(data, SHEET)).toBeNull();
  });
});

describe("an open quote whose selling was typed line by line", () => {
  it("keeps every price: each charge's profit becomes its own sum per container", () => {
    const buying = [perCtr("ocean_freight", "20' DC", 1000, 2), perCtr("fcl_baf", "20' DC", 100, 2), perShipment("truck_waiting", 30)];
    const selling = [
      { ...perCtr("ocean_freight", "20' DC", 1200, 2), supplier: undefined },
      { ...perCtr("fcl_baf", "20' DC", 100, 2), supplier: undefined },
      // Sold without a cost.
      perShipment("handling", 50, { pairId: "h" }),
    ];
    const typed = quote({ containers: [{ qty: 2, type: "20' DC" }], buyingLines: buying, sellingLines: selling, fclPricing: undefined });
    const before = computeTotals(typed, SHEET);

    const fcl = withFclPricing(typed, SHEET)!;
    expect(fcl.fclPricing).toEqual({ blocks: { "20' DC": { mode: "sum", value: 200, perCharge: true }, "": { mode: "sum", value: 20, perCharge: true } } });
    expect(fcl.buyingLines!.map((l) => [l.chargeCode, l.amount, l.chargeProfit?.value])).toEqual([
      ["ocean_freight", 2000, 200],
      ["fcl_baf", 200, 0],
      ["truck_waiting", 30, -30],
      ["handling", 0, 50],
    ]);
    // The charge bought without a selling line is not sold now either.
    expect(fcl.sellingLines!.map((l) => [l.chargeCode, l.amount])).toEqual([
      ["ocean_freight", 2400],
      ["fcl_baf", 200],
      ["handling", 50],
    ]);
    const after = computeTotals({ ...typed, ...fcl }, SHEET);
    expect([after.buying, after.selling, after.profit]).toEqual([before.buying, before.selling, before.profit]);
  });

  it("starts with no profit when it has no selling yet", () => {
    const fcl = withFclPricing(quote({ fclPricing: undefined, sellingLines: [] }), SHEET)!;
    expect(fcl.fclPricing).toEqual({ blocks: {} });
    expect(fcl.sellingLines![0]!.unitPrice).toBe(1000);
  });
});

describe("the rate offer of an FCL-priced quote", () => {
  const usd = (l: CostLine) => convertLine(l, quote(), SHEET, { selling: true });

  it("is the selling lines one by one in a breakdown offer, each with its containers", () => {
    const selling = fclLines(quote(), SHEET)!.sellingLines!;
    expect(fclOfferRows(quote(), selling, usd).slice(0, 2)).toEqual([
      { label: "ocean_freight - 2 × 20' DC", amount: 2000 },
      { label: "fcl_baf - 2 × 20' DC", amount: 200 },
    ]);
  });

  it("is an all-in rate per container type and per shipment, then each charge kept out of it", () => {
    const lines = quote().buyingLines!.map((l, i) => (i === 2 ? { ...l, inAllIn: false } : l));
    const data = quote({ allIn: true, buyingLines: lines });
    const selling = fclLines(data, SHEET)!.sellingLines!;
    expect(fclOfferRows(data, selling, usd)).toEqual([
      { label: "All-in rate - 2 × 20' DC", amount: 3200 },
      { label: "All-in rate - 1 × 40' HC", amount: 1800 },
      { label: "All-in rate - per shipment", amount: 60 },
      { label: "fcl_thc_origin - 2 × 20' DC", amount: 400 },
    ]);
  });
});
