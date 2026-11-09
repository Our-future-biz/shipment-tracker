import { describe, expect, it } from "vitest";
import { fclBlocks, fclChanges, fclLines, fclOfferRows, fclProfitBlock, isInAllIn, priceFclBlock, usesFclPricing, withFclPricing } from "./fclPricing";
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

});

describe("a profit per charge", () => {
  const sum = (value: number) => ({ mode: "sum" as const, value });
  const byCharge = (lines: CostLine[], over: Partial<SalesQuoteData> = {}) => quote({ allIn: true, buyingLines: lines, fclPricing: { blocks: {}, byCharge: true }, ...over });

  it("is on any charge, in the all-in price or not, the freight or not", () => {
    const lines = quote().buyingLines!.map((l, i) => (i === 1 ? { ...l, chargeProfit: sum(10), inAllIn: false } : i === 2 ? { ...l, chargeProfit: sum(20) } : l));
    const priced = priceFclBlock(byCharge(lines), SHEET, block(byCharge(lines), "20' DC"));
    expect(priced.charges.map((c) => c.takesProfit)).toEqual([true, true, true, true]);
    expect(priced.charges.map((c) => c.profit)).toEqual([0, 10, 20, 0]);
  });

  it("does not round a block without one up to fives, and rounds one with it", () => {
    const lines = quote().buyingLines!.map((l, i) => (i === 0 ? { ...l, unitPrice: 1001 } : l));
    const none = byCharge(lines, { fclPricing: { blocks: {}, byCharge: true, roundUp: true } });
    expect(priceFclBlock(none, SHEET, block(none, "20' DC")).profit).toBe(0);
    const some = byCharge(lines.map((l, i) => (i === 3 ? { ...l, chargeProfit: sum(1) } : l)), { fclPricing: { blocks: {}, byCharge: true, roundUp: true } });
    expect(priceFclBlock(some, SHEET, block(some, "20' DC")).selling % 5).toBe(0);
  });

  it("adds the ticked charges to the all-in price and leaves the others on their own lines", () => {
    const lines = quote().buyingLines!.map((l, i) => (i === 1 ? { ...l, inAllIn: false, chargeProfit: sum(5) } : i === 0 ? { ...l, chargeProfit: sum(100) } : l));
    const data = byCharge(lines);
    expect(fclOfferRows(data, fclLines(data, SHEET)!.sellingLines!, (l) => Number(l.amount))).toEqual([
      { label: "All-in rate - 2 × 20' DC", amount: 3600 },
      { label: "All-in rate - 1 × 40' HC", amount: 1800 },
      { label: "All-in rate - per shipment", amount: 60 },
      { label: "fcl_baf - 2 × 20' DC", amount: 210 },
    ]);
  });

  describe("an open quote brought over", () => {
    const sellingOf = (data: SalesQuoteData, options?: Parameters<typeof withFclPricing>[3]) => withFclPricing(data, SHEET, undefined, options)!.sellingLines!.map((l) => l.amount);

    it("starts a new quote with every charge in the all-in price", () => {
      const out = withFclPricing(quote({ fclPricing: undefined }), SHEET, undefined, { open: true })!;
      expect(out.allIn).toBe(true);
      expect(out.fclPricing!.byCharge).toBe(true);
      expect(out.buyingLines!.every(isInAllIn)).toBe(true);
    });

    it("keeps a breakdown offer's prices and leaves every charge on its own line", () => {
      const data = quote({ fclPricing: { blocks: { "20' DC": { mode: "sum", value: 100 } } } });
      const out = withFclPricing(data, SHEET, undefined, { open: true })!;
      expect(out.sellingLines!.map((l) => l.amount)).toEqual(sellingOf(data));
      expect(out.allIn).toBe(true);
      expect(out.buyingLines!.some(isInAllIn)).toBe(false);
      expect(fclOfferRows({ ...data, ...out }, out.sellingLines!, (l) => Number(l.amount)).some((r) => r.label.startsWith("All-in"))).toBe(false);
    });

    it("keeps an all-in offer's ticks and a charge at cost at no profit", () => {
      const lines = quote().buyingLines!.map((l, i) => (i === 2 ? { ...l, inAllIn: false } : l));
      const data = quote({ allIn: true, buyingLines: lines, fclPricing: { blocks: { "20' DC": { mode: "sum", value: 160 } } } });
      const out = withFclPricing(data, SHEET, undefined, { open: true })!;
      expect(out.sellingLines!.map((l) => l.amount)).toEqual(sellingOf(data));
      expect(out.buyingLines!.map(isInAllIn)).toEqual([true, true, false, true, true, true]);
      expect(out.buyingLines![2]!.chargeProfit).toEqual({ mode: "sum", value: 0 });
    });

    it("keeps a block's % as each charge's, and a charge's own profit", () => {
      const percent = quote({ fclPricing: { blocks: { "20' DC": { mode: "percent", value: 10 } } } });
      expect(withFclPricing(percent, SHEET, undefined, { open: true })!.buyingLines![0]!.chargeProfit).toEqual({ mode: "percent", value: 10 });
      const lines = quote().buyingLines!.map((l, i) => (i === 0 ? { ...l, chargeProfit: { mode: "percent" as const, value: 7 } } : l));
      const own = quote({ buyingLines: lines, fclPricing: { blocks: { "20' DC": { mode: "percent", value: 0, perCharge: true } } } });
      expect(withFclPricing(own, SHEET, undefined, { open: true })!.buyingLines![0]!.chargeProfit).toEqual({ mode: "percent", value: 7 });
    });

    it("is done once: a quote already brought over stays as it is", () => {
      const data = quote({ fclPricing: { blocks: { "20' DC": { mode: "sum", value: 100 } } } });
      const once = withFclPricing(data, SHEET, undefined, { open: true })!;
      const twice = withFclPricing({ ...data, ...once }, SHEET, undefined, { open: true })!;
      expect(twice.buyingLines).toEqual(once.buyingLines);
      expect(twice.sellingLines).toEqual(once.sellingLines);
    });

    it("leaves a sent quote as it was sent", () => {
      const data = quote({ fclPricing: { blocks: { "20' DC": { mode: "sum", value: 100 } } } });
      const out = withFclPricing(data, SHEET)!;
      expect(out.fclPricing!.byCharge).toBeUndefined();
      expect(out.allIn).toBeUndefined();
      expect(out.buyingLines![0]!.chargeProfit).toBeUndefined();
    });
  });
});

describe("a profit on every container type before the quote goes out", () => {
  const twoTypes = (blocks: Record<string, { mode: "percent" | "sum"; value: number }>, over: Partial<SalesQuoteData> = {}) => quote({ fclPricing: { blocks }, ...over });
  const twenty = { mode: "sum" as const, value: 100 };

  it("names the types without one", () => {
    expect(fclProfitBlock(twoTypes({}), SHEET)).toMatch(/^No profit on 20' DC, 40' HC yet/);
    expect(fclProfitBlock(twoTypes({ "20' DC": twenty }), SHEET)).toMatch(/^No profit on 40' HC yet/);
  });

  it("lets it go once each has one", () => {
    expect(fclProfitBlock(twoTypes({ "20' DC": twenty, "40' HC": { mode: "percent", value: 10 } }), SHEET)).toBeNull();
  });

  it("does not take a profit per shipment for one on a container", () => {
    expect(fclProfitBlock(twoTypes({ "": twenty }), SHEET)).toMatch(/20' DC, 40' HC/);
  });

  it("holds a loss", () => {
    expect(fclProfitBlock(twoTypes({ "20' DC": twenty, "40' HC": { mode: "sum", value: -1 } }), SHEET)).toMatch(/^No profit on 40' HC yet/);
  });

  it("counts the charges per container of every type for each", () => {
    const buyingLines = [perCtr("ocean_freight", "20' DC", 1000, 2), perCtr("ocean_freight", "40' HC", 1800, 1), perCtr("fcl_baf", "", 50, 3, { profitBasis: true })];
    expect(fclProfitBlock(twoTypes({ "*": twenty }, { buyingLines }), SHEET)).toBeNull();
  });

  it("does not hold a type no container is chosen of, or another freight mode", () => {
    const containers = [{ qty: 2, type: "20' DC" }, { qty: 0, type: "40' HC" }];
    expect(fclProfitBlock(twoTypes({ "20' DC": twenty }, { containers }), SHEET)).toBeNull();
    expect(fclProfitBlock(twoTypes({}, { serviceType: "Sea LCL" }), SHEET)).toBeNull();
  });
});

describe("a block's selling, rounded up to full fives", () => {
  const rounded = (over: Partial<SalesQuoteData>, key = "20' DC") => {
    const data = quote(over);
    const withRound = { ...data, fclPricing: { ...data.fclPricing!, roundUp: true } };
    return priceFclBlock(withRound, SHEET, block(withRound, key));
  };

  it("goes up to the next 5, the difference more profit on the ocean freight", () => {
    // 10 % on 1,500 bought: 1,966.67 per container → 1,970.
    const priced = rounded({ fclPricing: { blocks: { "20' DC": { mode: "percent", value: 10 } } } });
    expect([priced.selling, priced.profit]).toEqual([1970, 170]);
    expect(priced.charges.map((c) => c.profit)).toEqual([114.44, 0, 0, 55.56]);
  });

  it("stays at a selling already on a five, and goes on from a cent above one", () => {
    // 100 profit on 1,800: 1,900.
    expect(rounded({ fclPricing: { blocks: { "20' DC": { mode: "sum", value: 100 } } } }).selling).toBe(1900);
    expect(rounded({ fclPricing: { blocks: { "20' DC": { mode: "sum", value: 100.01 } } } }).selling).toBe(1905);
    // 6,273 → 6,275; 6,278.74 → 6,280.
    const at = (sum: number) => rounded({ fclPricing: { blocks: { "20' DC": { mode: "sum", value: sum } } } }).selling;
    expect(at(6273 - 1800)).toBe(6275);
    expect(at(6278.74 - 1800)).toBe(6280);
  });

  it("puts the difference on a charge in the quote's currency first, so the ROE does not move it", () => {
    // The quote in EUR: the ocean freight in USD, the IHI in EUR.
    const lines = quote().buyingLines!.map((l, i) => (i === 3 ? { ...l, currency: "EUR" } : l));
    const over: Partial<SalesQuoteData> = {
      currency: "EUR",
      fx: { date: "2026-11-05", fixingDate: "2026-11-05", roePct: 103, rates: SHEET },
      buyingLines: lines,
      fclPricing: { blocks: { "20' DC": { mode: "percent", value: 10 } } },
    };
    const priced = rounded(over);
    expect(Math.round(priced.selling * 100) % 500).toBe(0);
    const unrounded = priceFclBlock(quote(over), SHEET, block(quote(over), "20' DC"));
    const profitOf = (p: typeof priced, i: number) => p.charges.find((c) => c.index === i)!.profit;
    // The IHI (EUR) takes the difference; the ocean freight (USD, sold at the ROE) keeps its profit.
    expect(profitOf(priced, 3)).toBeGreaterThan(profitOf(unrounded, 3));
    expect(profitOf(priced, 0)).toBe(profitOf(unrounded, 0));
  });

  it("is not done without a profit set, nor on a quote priced before (it keeps its prices as sent)", () => {
    expect(rounded({ fclPricing: { blocks: {} } }).selling).toBe(1800);
    const data = quote({ fclPricing: { blocks: { "20' DC": { mode: "percent", value: 10 } } } });
    expect(priceFclBlock(data, SHEET, block(data, "20' DC")).selling).toBe(1966.67);
  });

  it("is rounded at a draft's live ROE, so the totals are what the card shows", () => {
    // A draft in EUR (no rates of its own yet): the ocean freight in USD, sold at today's ROE of 102 %.
    const lines = quote().buyingLines!.map((l, i) => (i === 3 ? { ...l, currency: "EUR" } : l));
    const live = { roePct: 102, fixingDate: "2026-11-05" };
    const data = quote({ currency: "EUR", buyingLines: lines, fclPricing: { blocks: { "20' DC": { mode: "percent", value: 10 } } } });
    const priced = withFclPricing(data, SHEET, live, { roundUp: true })!;
    const card = priceFclBlock({ ...data, ...priced }, SHEET, block({ ...data, ...priced }, "20' DC"), live).selling;
    expect(Math.round(card * 100) % 500).toBe(0);
    // The 20' DC lines on the totals: 2 containers at the card's price, to the cent.
    const of20 = priced.sellingLines!.filter((l) => l.containerType === "20' DC");
    const sold = of20.reduce((sum, l) => sum + convertLine(l, { ...data, ...priced }, SHEET, { selling: true, live })!, 0);
    expect(Math.round(sold * 100)).toBe(Math.round(card * 200));
    expect(computeTotals({ ...data, ...priced }, SHEET, live).roePct).toBe(102);
  });

  // Charges in another currency than the quote's: the amounts that once left 6,915.01 on the totals.
  it.each([
    ["all in EUR", () => true],
    ["freight in USD, the rest in EUR", (l: CostLine) => l.chargeCode !== "ocean_freight"],
    ["freight in EUR, the rest in USD", (l: CostLine) => l.chargeCode === "ocean_freight"],
  ])("comes to full fives on the totals with %s, whatever the rates and profit", (_name, inEur) => {
    const sheets = [{ USD: 21.804, EUR: 24.345 }, { USD: 23, EUR: 25 }, { USD: 21.777, EUR: 24.513 }];
    for (const sheet of sheets) {
      for (const roePct of [100, 102, 101.5]) {
        for (let profit = 37.13; profit < 900; profit += 83.37) {
          const lines = quote().buyingLines!.filter((l) => l.basis === "container").map((l) => ({ ...l, currency: inEur(l) ? "EUR" : "USD", unitPrice: (l.unitPrice ?? 0) + 0.37, amount: l.amount + 0.37 * (l.qty ?? 1) }));
          const data = quote({
            buyingLines: lines,
            fclPricing: { blocks: { "20' DC": { mode: "sum", value: profit }, "40' HC": { mode: "percent", value: 11 } } },
          });
          const live = { roePct, fixingDate: "2026-11-06" };
          const priced = withFclPricing(data, sheet, live, { roundUp: true })!;
          const { selling } = computeTotals({ ...data, ...priced }, sheet, live);
          expect(Math.round(selling * 100) % 500).toBe(0);
        }
      }
    }
  });

  it("is the same when priced again, so nothing is saved for it", () => {
    const lines = quote().buyingLines!.map((l) => ({ ...l, currency: "EUR" }));
    const data = quote({ buyingLines: lines, fclPricing: { blocks: { "20' DC": { mode: "sum", value: 123.45 } } } });
    const live = { roePct: 101.5, fixingDate: "2026-11-06" };
    const first = withFclPricing(data, SHEET, live, { roundUp: true })!;
    const again = withFclPricing({ ...data, ...first }, SHEET, live, { roundUp: true })!;
    expect(fclChanges(again, { ...data, ...first })).toEqual({});
  });

  it("is asked for when an open quote is priced, and its selling lines follow", () => {
    const data = quote({ fclPricing: { blocks: { "20' DC": { mode: "percent", value: 10 } } } });
    const priced = withFclPricing(data, SHEET, undefined, { roundUp: true })!;
    expect(priced.fclPricing?.roundUp).toBe(true);
    const ocean20 = priced.sellingLines!.find((l) => l.chargeCode === "ocean_freight" && l.containerType === "20' DC")!;
    expect(ocean20.unitPrice).toBe(1114.44);
    expect(withFclPricing(data, SHEET)!.fclPricing?.roundUp).toBeUndefined();
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

describe("a charge in another currency than the quote's", () => {
  const LIVE = { roePct: 102, fixingDate: "2026-11-02" };

  it("is sold at the ROE %, so the block shows what the totals and the quotation show", () => {
    const eur = perCtr("ocean_freight", "20' DC", 1000, 2, { currency: "EUR" });
    const data = quote({ containers: [{ qty: 2, type: "20' DC" }], buyingLines: [eur], fclPricing: { blocks: { "20' DC": { mode: "sum", value: 100 } } } });
    const priced = priceFclBlock(data, SHEET, block(data, "20' DC"), LIVE);
    // 1000 EUR is 1086.96 USD; with 100 profit 1186.96, on which the ROE adds 2 %.
    expect(priced.charges.map((c) => [c.buying, c.profit, c.roe, c.selling])).toEqual([[1086.96, 100, 23.74, 1210.7]]);
    expect([priced.profit, priced.roe, priced.selling]).toEqual([100, 23.74, 1210.7]);
    const sold = { ...data, ...fclLines(data, SHEET)! };
    expect(computeTotals(sold, SHEET, LIVE).selling).toBeCloseTo(priced.selling * 2, 1);
    // In the quote's own currency the ROE adds nothing.
    const usd = quote({ containers: [{ qty: 2, type: "20' DC" }], buyingLines: [perCtr("ocean_freight", "20' DC", 1000, 2)] });
    expect(priceFclBlock(usd, SHEET, block(usd, "20' DC"), LIVE).roe).toBe(0);
  });

  it("keeps its price at the switch-over, though its selling line moves into the charge's own currency", () => {
    const bought = perCtr("ocean_freight", "20' DC", 1000, 2, { currency: "EUR" });
    const sold = perCtr("ocean_freight", "20' DC", 1200, 2, { currency: "USD" });
    const typed = quote({ containers: [{ qty: 2, type: "20' DC" }], buyingLines: [bought], sellingLines: [sold], fclPricing: undefined });
    const before = computeTotals(typed, SHEET, LIVE).selling;
    const fcl = withFclPricing(typed, SHEET, LIVE)!;
    expect(fcl.sellingLines![0]!.currency).toBe("EUR");
    expect(computeTotals({ ...typed, ...fcl }, SHEET, LIVE).selling).toBeCloseTo(before, 1);
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

  it("keeps a pair typed without a pairId together: one charge, its profit what it sells for above its cost", () => {
    // Typed on both sides, each line on its own: paired by their charge and text.
    const bought = perCtr("ocean_freight", "20' DC", 1000, 2, { pairId: undefined });
    const sold = perCtr("ocean_freight", "20' DC", 1200, 2, { pairId: undefined });
    const fcl = withFclPricing(quote({ containers: [{ qty: 2, type: "20' DC" }], buyingLines: [bought], sellingLines: [sold], fclPricing: undefined }), SHEET)!;
    expect(fcl.buyingLines!.map((l) => [l.amount, l.chargeProfit?.value])).toEqual([[2000, 200]]);
    expect(fcl.sellingLines!.map((l) => [l.amount, l.pairId])).toEqual([[2400, fcl.buyingLines![0]!.pairId]]);
  });

  it("leaves the trucking lines' pairing as the trucking tariffs made it", () => {
    const trucking: CostLine = { ...perShipment("road_freight", 300), tariffRef: "trucking:v1" };
    delete trucking.pairId;
    const fcl = withFclPricing(quote({ buyingLines: [perCtr("ocean_freight", "20' DC", 1000, 2), trucking], sellingLines: [trucking] }), SHEET)!;
    expect(fcl.buyingLines![1]).toBe(trucking);
  });

  it("starts with no profit when it has no selling yet", () => {
    const fcl = withFclPricing(quote({ fclPricing: undefined, sellingLines: [] }), SHEET)!;
    expect(fcl.fclPricing).toEqual({ blocks: {} });
    expect(fcl.sellingLines![0]!.unitPrice).toBe(1000);
  });
});

describe("what FCL pricing changes of a quote", () => {
  it("is nothing for a quote read back with its keys in another order", () => {
    const data = quote({ fclPricing: { blocks: { "20' DC": { mode: "sum", value: 100 } } } });
    const priced = { ...data, ...withFclPricing(data, SHEET)! };
    const reordered = JSON.parse(JSON.stringify(priced, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)));
    expect(fclChanges(withFclPricing(reordered, SHEET)!, reordered)).toEqual({});
    expect(Object.keys(fclChanges(withFclPricing(reordered, SHEET)!, { ...reordered, sellingLines: [] }))).toEqual(["sellingLines"]);
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
