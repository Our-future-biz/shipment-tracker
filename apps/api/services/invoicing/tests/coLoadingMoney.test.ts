import { describe, expect, it } from "vitest";
import { CHARGE_CODES } from "../../../lib/chargeCodes";
import { basketOf, BOX_COVERED_CODES, codeOf, coLoadingMoney, INLAND_DELIVERY_CODES, type MoneyBuyRow, type MoneySellRow } from "../lib/coLoadingMoney";

const buy = (category: string, est: string, more: Partial<MoneyBuyRow> = {}): MoneyBuyRow => ({
  category,
  estQty: null,
  estAmount: est,
  estCurrency: "EUR",
  realQty: null,
  realAmount: null,
  realCurrency: "EUR",
  sourceTruckingRef: null,
  sourceMasterJobRef: null,
  ...more,
});
let n = 0;
const sell = (amount: string, more: Partial<MoneySellRow> = {}): MoneySellRow => ({ id: `s${++n}`, qty: null, amount, currency: "EUR", invoice: true, ...more });
const RATES = { EUR: 25, USD: 22 };
const NONE = new Set<string>();

describe("basketOf", () => {
  it("counts inland delivery by its codes, by their labels, and every row Trucking wrote", () => {
    for (const code of INLAND_DELIVERY_CODES) expect(basketOf(buy(code, "1")), code).toBe("inland");
    expect(basketOf(buy("Inland collection / delivery", "1"))).toBe("inland");
    expect(basketOf(buy("other", "1", { sourceTruckingRef: "trucking:trip:1" }))).toBe("inland");
  });

  it("leaves out what the box itself pays for: the main carriage, its fuel, terminal and CFS handling", () => {
    for (const code of ["ocean_freight", "lcl_fuel", "cfs_origin", "cfs_destination", "fcl_thc_destination", "lcl_terminal_handling", "Ocean freight", "freight", "locals"]) expect(basketOf(buy(code, "1")), code).toBe("box");
  });

  it("counts what one shipment causes by itself, though the catalogue files it under freight or local charges", () => {
    // The warehouse's Heavy Cargo Handling Fee is written under "handling".
    for (const code of ["handling", "Handling", "lashing", "lcl_delivery_order", "lcl_documentation", "fcl_documentation", "documentation", "ams_ens", "vgm", "cross_docking", "air_screening"])
      expect(basketOf(buy(code, "1")), code).toBe("other");
  });

  it("reads a code in any letter case", () => {
    expect(codeOf("OCEAN_FREIGHT")).toBe("ocean_freight");
    expect(basketOf(buy("OCEAN_FREIGHT", "1"))).toBe("box");
    expect(basketOf(buy("Inland_Collection", "1"))).toBe("inland");
    expect(basketOf(buy(" Customs_Import ", "1"))).toBe("other");
    expect(codeOf("Sea freight")).toBe("Sea freight");
  });

  it("puts every code of the catalogue into the basket written down here: a new code must be placed by hand", () => {
    const inCatalogue = new Set(CHARGE_CODES.map((c) => c.code));
    for (const code of [...BOX_COVERED_CODES, ...INLAND_DELIVERY_CODES]) expect(inCatalogue.has(code), code).toBe(true);
    expect(BOX_COVERED_CODES.filter((c) => INLAND_DELIVERY_CODES.includes(c))).toEqual([]);
    const baskets = { box: 0, inland: 0, other: 0 };
    for (const { code } of CHARGE_CODES) baskets[basketOf(buy(code, "1")) as "box" | "inland" | "other"]++;
    // 23 the box pays for, 13 inland delivery, the rest the shipment's own. A code added to the
    // catalogue lands in "other" and moves this count: decide its basket, then change the figure.
    expect(baskets).toEqual({ box: 23, inland: 13, other: CHARGE_CODES.length - 36 });
    expect(CHARGE_CODES.length).toBe(89);
  });

  it("leaves out a master job's share, whatever it is for", () => {
    expect(basketOf(buy("inland_collection", "1", { sourceMasterJobRef: "master:m:l" }))).toBe("master_job");
    expect(basketOf(buy("customs_import", "1", { sourceMasterJobRef: "master:m:l" }))).toBe("master_job");
  });

  it("takes the rest as the shipment's own: customs, insurance, storage, a collection at origin, text it does not know", () => {
    for (const code of ["customs_import", "insurance", "cfs_storage", "container_demurrage", "pickup", "rail_pre_carriage", "TEST freight", ""]) expect(basketOf(buy(code, "1")), code).toBe("other");
  });
});

describe("coLoadingMoney", () => {
  it("adds up selling ticked for invoice, and what of it is invoiced", () => {
    const rows = [sell("800"), sell("25", { qty: "2" }), sell("100", { invoice: false }), sell("0")];
    const money = coLoadingMoney([], rows, RATES, new Set([rows[0]!.id]));
    expect(money).toMatchObject({ sellingCzk: 21250, invoicedCzk: 20000, sellingLines: 2, untickedLines: 1 });
  });

  it("sorts buying lines into the baskets, the real cost once it is filled", () => {
    const money = coLoadingMoney(
      [
        buy("inland_collection", "180"),
        buy("road_freight", "90", { realAmount: "100", sourceTruckingRef: "trucking:trip:1" }),
        buy("customs_import", "60"),
        buy("ocean_freight", "900"),
        buy("cfs_destination", "40", { sourceMasterJobRef: "master:m:l" }),
      ],
      [],
      RATES,
      NONE,
    );
    expect(money).toMatchObject({ inlandCzk: 7000, otherCzk: 1500, ownBoxCzk: 22500, masterJobCzk: 1000, unrecognisedLines: 0 });
  });

  it("counts a line it does not know as the shipment's own, and says how many there are", () => {
    expect(coLoadingMoney([buy("TEST freight", "10"), buy("", "5"), buy("", "0")], [], RATES, NONE)).toMatchObject({ otherCzk: 375, unrecognisedLines: 2 });
    // A line whose real cost of 0 is filled in over its estimate has no value: nothing of it to remark on.
    const zero = coLoadingMoney([buy("TEST freight", "10", { realAmount: "0" }), buy("", "5", { realAmount: "8", realQty: "0" })], [], RATES, NONE);
    expect(zero).toMatchObject({ otherCzk: 0, unrecognisedLines: 0 });
  });

  it("leaves an amount without a rate out, names its currency, and keeps the rest", () => {
    const money = coLoadingMoney([buy("inland_collection", "100", { estCurrency: "GBP" }), buy("inland_collection", "100")], [sell("500", { currency: "CNY" }), sell("200", { currency: "CZK" })], RATES, NONE);
    expect(money).toMatchObject({ inlandCzk: 2500, sellingCzk: 200, missingCurrencies: ["CNY", "GBP"], sellingLines: 2 });
  });

  it("gives the job's own EUR rate, or none when it is not known", () => {
    expect(coLoadingMoney([], [], RATES, NONE).eurRate).toBe(25);
    const czkOnly = coLoadingMoney([buy("inland_collection", "100", { estCurrency: "CZK" })], [sell("1000", { currency: "CZK" })], {}, NONE);
    expect(czkOnly).toMatchObject({ eurRate: null, sellingCzk: 1000, inlandCzk: 100, missingCurrencies: [] });
  });

  it("counts a real cost of 0 filled in over an estimate as 0 - an amount or a quantity of 0 - and needs no rate for it", () => {
    const money = coLoadingMoney(
      [
        buy("inland_collection", "100", { realAmount: "0" }),
        buy("customs_import", "60", { realAmount: "40", realQty: "0" }),
        buy("insurance", "30", { realAmount: "0", realCurrency: "GBP" }),
        buy("customs_import", "10", { realAmount: "12" }),
      ],
      [],
      RATES,
      NONE,
    );
    expect(money).toMatchObject({ inlandCzk: 0, otherCzk: 300, missingCurrencies: [] });
  });

  it("is all zeros for a shipment with no lines", () => {
    expect(coLoadingMoney([], [], RATES, NONE)).toMatchObject({ sellingCzk: 0, invoicedCzk: 0, inlandCzk: 0, otherCzk: 0, ownBoxCzk: 0, masterJobCzk: 0, sellingLines: 0, untickedLines: 0 });
  });
});

describe("road freight typed by hand", () => {
  it("is counted as inland delivery and remarked on, a line Trucking wrote is not remarked on", () => {
    const m = coLoadingMoney([buy("road_freight", "100"), buy("road_toll", "10"), buy("road_freight", "200", { sourceTruckingRef: "trucking:trip:1" }), buy("road_fuel", "")], [], RATES, NONE);
    expect(m.inlandCzk).toBe(7750);
    expect(m.handRoadLines).toBe(2);
  });

  it("is not remarked on when its real cost of 0 is filled in over its estimate - an amount or a quantity of 0", () => {
    const m = coLoadingMoney([buy("road_freight", "100", { realAmount: "0" }), buy("road_toll", "10", { realAmount: "9", realQty: "0" })], [], RATES, NONE);
    expect([m.inlandCzk, m.handRoadLines]).toEqual([0, 0]);
  });
});
