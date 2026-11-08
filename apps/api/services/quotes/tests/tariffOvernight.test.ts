import { describe, expect, it } from "vitest";
import { actionForLapsed, applyTariffActions, offersRequestOf, roadActionFor, roadPricingOf, roadRatingDay, tariffRefsOf, type OfferSummary, type TariffAction } from "../lib/tariffOvernight";
import { tariffUpdateGateMessage, withoutRoadUpdates } from "../utils/tariffDirection.utils";

const OLD = "ocean:v1:r1";
const freight = { type: "Ocean freight", description: "Ocean freight Hamburg → Newark (OOCL)", currency: "USD", amount: 1200, tariffRef: OLD, pairId: "p1", supplier: "OOCL" };
const baf = { type: "BAF", description: "BAF", currency: "EUR", amount: 100, tariffRef: OLD };
const quote = {
  serviceType: "Sea FCL",
  direction: "Export",
  pol: "Hamburg (DEHAM)",
  pod: "Newark (USEWR)",
  containers: [{ type: "40' GP", qty: 2, weight: 9000 }],
  buyingLines: [freight, baf, { type: "Handling", description: "typed", currency: "EUR", amount: 50 }],
  sellingLines: [{ type: "Ocean freight", currency: "USD", amount: 1500, pairId: "p1" }, { type: "Handling", currency: "EUR", amount: 70, pairId: "p2" }],
};
const offer = (over: Partial<OfferSummary> = {}): OfferSummary => ({
  versionId: "v2",
  rateId: "r9",
  tariffId: "t1",
  supplierName: "OOCL",
  via: "",
  totals: [{ currency: "USD", amount: 1200 }, { currency: "EUR", amount: 100 }],
  ...over,
});
const lapsed = (offers: OfferSummary[], tariffId: string | null = "t1") => actionForLapsed(OLD, quote, tariffId, offers);

describe("the tariffs behind a quote", () => {
  it("are listed once, tariff lines only", () => {
    expect(tariffRefsOf(quote)).toEqual([OLD]);
  });
});

describe("a tariff that has lapsed", () => {
  it("moves quietly to the current rate of the same tariff when the money is the same", () => {
    expect(lapsed([offer()])).toEqual({ ref: OLD, do: "swap", newRef: "ocean:v2:r9" });
  });

  it("waits for approval when the money differs", () => {
    const action = lapsed([offer({ totals: [{ currency: "USD", amount: 1350 }, { currency: "EUR", amount: 100 }] })]);
    expect(action).toMatchObject({ do: "update", update: { oldRef: OLD, newVersionId: "v2", newRateId: "r9", was: [{ currency: "EUR", amount: 100 }, { currency: "USD", amount: 1200 }] } });
  });

  it("is removed when only other tariffs price the route, or its version is gone", () => {
    expect(lapsed([offer({ tariffId: "t2" })])).toEqual({ ref: OLD, do: "remove" });
    expect(lapsed([])).toEqual({ ref: OLD, do: "remove" });
    expect(lapsed([offer()], null)).toEqual({ ref: OLD, do: "remove" });
  });

  it("prefers the offer via the same terminal", () => {
    const line = { ...quote, buyingLines: [{ ...freight, description: "Ocean freight via Kaohsiung" }] };
    const action = actionForLapsed(OLD, line, "t1", [offer({ rateId: "a", via: "Singapore" }), offer({ rateId: "b", via: "Kaohsiung" })]);
    expect(action).toMatchObject({ update: { newRateId: "b" } });
  });
});

describe("the night's actions on a quote", () => {
  it("remove the buying lines and the selling line made from them, and say so", () => {
    const { data, messages, changed } = applyTariffActions(quote, [{ ref: OLD, do: "remove" }]);
    expect(changed).toBe(true);
    expect(data.buyingLines).toHaveLength(1);
    expect(data.sellingLines).toEqual([quote.sellingLines[1]]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("no longer valid");
  });

  it("swap the reference with nothing to tell", () => {
    const { data, messages, changed } = applyTariffActions(quote, [{ ref: OLD, do: "swap", newRef: "ocean:v2:r9" }]);
    expect(changed).toBe(true);
    expect(messages).toEqual([]);
    expect((data.buyingLines as { tariffRef?: string }[])[1]!.tariffRef).toBe("ocean:v2:r9");
  });

  const update: TariffAction = { ref: OLD, do: "update", update: { oldRef: OLD, kind: "ocean", newVersionId: "v2", newRateId: "r9", supplierName: "OOCL", was: [{ currency: "USD", amount: 1200 }], now: [{ currency: "USD", amount: 1350 }] } };

  it("keep the lines and the selling price while a new rate waits, and tell it once", () => {
    const first = applyTariffActions(quote, [update]);
    expect(first.data.buyingLines).toEqual(quote.buyingLines);
    expect(first.data.sellingLines).toEqual(quote.sellingLines);
    expect(first.messages[0]).toContain("was USD 1200.00, now USD 1350.00");
    const again = applyTariffActions(first.data, [update]);
    expect(again.messages).toEqual([]);
    expect(again.changed).toBe(false);
  });

  it("drop a waiting rate once the tariff is valid again, and change nothing for a valid tariff", () => {
    const waiting = applyTariffActions(quote, [update]).data;
    const { data, changed } = applyTariffActions(waiting, [{ ref: OLD, do: "keep" }]);
    expect(changed).toBe(true);
    expect(data).not.toHaveProperty("tariffUpdates");
    expect(applyTariffActions(quote, [{ ref: OLD, do: "keep" }]).changed).toBe(false);
  });

  it("hold the quote back until the new rate is approved", () => {
    const waiting = applyTariffActions(quote, [update]).data;
    expect(tariffUpdateGateMessage(waiting)).toMatch(/approve it in Pricing/);
    expect(tariffUpdateGateMessage({ ...waiting, buyingLines: [{ tariffRef: "ocean:v2:r9" }] })).toBeNull();
    expect(tariffUpdateGateMessage(quote)).toBeNull();
  });
});

describe("what the tariffs are asked", () => {
  it("is the quote's route for an ocean line", () => {
    expect(offersRequestOf("ocean", quote, "2026-11-09")).toEqual({
      ocean: { direction: "export", polCode: "DEHAM", podCode: "USEWR", comparePols: false, date: "2026-11-09", containers: [{ type: "40' DC", qty: 2 }], dangerous: false },
    });
  });

  it("is nothing without a Trade Direction or containers", () => {
    expect(offersRequestOf("ocean", { ...quote, direction: undefined }, "2026-11-09")).toBeNull();
    expect(offersRequestOf("rail", { ...quote, containers: [] }, "2026-11-09")).toBeNull();
  });

  it("takes a rail route's postcode from the delivery address on an import", () => {
    const request = offersRequestOf("rail", { ...quote, direction: "Import", delivery: "ACME, Street 1, 60200 Brno", destination: "Brno (CZBRQ)" }, "2026-11-09");
    expect(request).toMatchObject({ rail: { port: "USEWR", direction: "import", place: "602 00", country: "CZ", containers: [{ type: "40' DC", qty: 2, cargoKg: 9000 }] } });
  });

  it("takes a collection's postcode and weight from the quote", () => {
    const request = offersRequestOf("collection", { serviceType: "Sea LCL", direction: "Export", pickup: "Street 1, 252 61 Dobrovíz", weight: 500, cbm: 2 }, "2026-11-09");
    expect(request).toEqual({ collection: { freightMode: "sea_lcl", customerPostcode: "25261", date: "2026-11-09", weightKg: 500, cbm: 2, longestCm: null } });
  });
});

describe("a road quote", () => {
  const sell = { tariffId: "s", tariffName: "Standard", tariffVersionId: "sv1", versionNo: 1, currency: "CZK", total: 4250 };
  const buy = { haulierCustomerId: "h1", haulierName: "Haulier", tariffVersionId: "bv1", versionNo: 3, currency: "CZK", total: 3000 };
  const roadQuote = {
    road: { pickupDate: "2026-11-01" },
    roadPricing: { serviceLevel: "EXPRESS", sell, buy },
    buyingLines: [{ type: "Road freight", currency: "CZK", amount: 3000, tariffRef: "trucking:bv1:EXPRESS" }, { type: "Handling", currency: "EUR", amount: 5 }],
    sellingLines: [{ type: "Road freight", currency: "CZK", amount: 4250, tariffRef: "trucking:sv1:EXPRESS" }],
    marginApproval: { reason: "x" },
  };
  const pricing = roadPricingOf(roadQuote)!;
  const side = (tariffVersionId: string, total: number, versionNo = 2) => ({ tariffVersionId, versionNo, currency: "CZK", total });

  it("is rated today once its pickup date has passed, else on that date", () => {
    expect(roadRatingDay("2026-11-01", "2026-11-09")).toBe("2026-11-09");
    expect(roadRatingDay("2026-11-20", "2026-11-09")).toBe("2026-11-20");
    expect(roadRatingDay(null, "2026-11-09")).toBe("2026-11-09");
  });

  it("has no road pricing without lines priced from it", () => {
    expect(roadPricingOf({ ...roadQuote, buyingLines: [], sellingLines: [] })).toBeNull();
  });

  it("stays when today's rate is the same, and is left alone when it can't be rated but its tariffs still hold", () => {
    expect(roadActionFor(pricing, { sell: side("sv1", 4250), buy: side("bv1", 3000) }, true).do).toBe("keep");
    expect(roadActionFor(pricing, null, true).do).toBe("keep");
  });

  it("moves quietly to a new version at the same price", () => {
    const action = roadActionFor(pricing, { sell: side("sv2", 4250, 5), buy: side("bv1", 3000, 3) }, true);
    expect(action.do).toBe("roadSwap");
    const { data, messages } = applyTariffActions(roadQuote, [action]);
    expect(messages).toEqual([]);
    expect((data.sellingLines as { tariffRef?: string }[])[0]!.tariffRef).toBe("trucking:sv2:EXPRESS");
    expect((data.buyingLines as { tariffRef?: string }[])[0]!.tariffRef).toBe("trucking:bv1:EXPRESS");
    expect(data.roadPricing).toMatchObject({ sell: { tariffVersionId: "sv2", versionNo: 5, total: 4250 } });
  });

  it("waits for approval when either price moved, saying both, and changes no line", () => {
    const action = roadActionFor(pricing, { sell: side("sv2", 4500), buy: side("bv1", 3100) }, true);
    const { data, messages } = applyTariffActions(roadQuote, [action]);
    expect(data.sellingLines).toEqual(roadQuote.sellingLines);
    expect(messages[0]).toContain("Selling was CZK 4250.00, now CZK 4500.00");
    expect(messages[0]).toContain("Buying was CZK 3000.00, now CZK 3100.00");
    expect(tariffUpdateGateMessage(data)).toMatch(/approve it in Pricing/);
    expect(withoutRoadUpdates(data)).toEqual({ tariffUpdates: [] });
  });

  it("loses only its road lines, pricing and margin approval when its tariff lapsed with no rate", () => {
    const action = roadActionFor(pricing, null, false);
    expect(action.do).toBe("roadRemove");
    const { data, messages } = applyTariffActions(roadQuote, [action]);
    expect(data.buyingLines).toEqual([roadQuote.buyingLines[1]]);
    expect(data.sellingLines).toEqual([]);
    expect(data).not.toHaveProperty("roadPricing");
    expect(data).not.toHaveProperty("marginApproval");
    expect(data.road).toEqual(roadQuote.road);
    expect(messages[0]).toContain("road tariff");
  });
});
