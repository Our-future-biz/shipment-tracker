import { describe, expect, it } from "vitest";
import { basketOf, coLoadingMoney, INLAND_DELIVERY_CODES, type MoneyBuyRow, type MoneySellRow } from "../lib/coLoadingMoney";

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

  it("leaves out what the box covers: freight and local charges", () => {
    for (const code of ["ocean_freight", "lcl_fuel", "cfs_origin", "cfs_destination", "fcl_thc_destination", "lcl_documentation", "Ocean freight"]) expect(basketOf(buy(code, "1")), code).toBe("box");
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

  it("is all zeros for a shipment with no lines", () => {
    expect(coLoadingMoney([], [], RATES, NONE)).toMatchObject({ sellingCzk: 0, invoicedCzk: 0, inlandCzk: 0, otherCzk: 0, ownBoxCzk: 0, masterJobCzk: 0, sellingLines: 0, untickedLines: 0 });
  });
});
