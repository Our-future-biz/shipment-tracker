import { describe, expect, it } from "vitest";
import {
  actionForLapsed,
  applyTariffActions,
  offersRequestOf,
  roadActionFor,
  roadPricingOf,
  roadRatingDay,
  isTariffCheckable,
  sameLines,
  tariffRefsOf,
  type OfferSummary,
  type RoadRated,
  type TariffAction,
  type TariffUpdate,
} from "../lib/tariffOvernight";
import { tariffUpdateGateMessage, withoutRoadUpdates } from "../utils/tariffDirection.utils";

const OLD = "ocean:v1:r1";
const freight = { type: "Ocean freight", description: "Ocean freight Hamburg → Newark (OOCL)", currency: "USD", basis: "container", containerType: "40' DC", qty: 2, unitPrice: 600, amount: 1200, tariffRef: OLD, pairId: "p1", supplier: "OOCL" };
const baf = { type: "BAF", description: "BAF", currency: "EUR", basis: "lumpsum", amount: 100, tariffRef: OLD };
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
  lines: [{ containerType: "40' DC", currency: "USD", amount: 1200 }, { containerType: null, currency: "EUR", amount: 100 }],
  ...over,
});
const asked = (offers: OfferSummary[]) => ({ offers, refused: null });
const lapsed = (offers: OfferSummary[], tariffId: string | null = "t1") => actionForLapsed(OLD, quote, tariffId, asked(offers));

describe("the tariffs behind a quote", () => {
  it("are listed once, tariff lines only", () => {
    expect(tariffRefsOf(quote)).toEqual([OLD]);
  });
});

describe("a tariff that has lapsed", () => {
  it("moves quietly to the current rate of the same tariff when every line costs the same", () => {
    expect(lapsed([offer()])).toEqual({ ref: OLD, do: "swap", newRef: "ocean:v2:r9" });
  });

  it("waits for approval when the money differs", () => {
    const action = lapsed([offer({ totals: [{ currency: "USD", amount: 1350 }, { currency: "EUR", amount: 100 }] })]);
    expect(action).toMatchObject({ do: "update", update: { oldRef: OLD, newVersionId: "v2", newRateId: "r9", was: [{ currency: "EUR", amount: 100 }, { currency: "USD", amount: 1200 }] } });
  });

  it("waits for approval when the same total is split differently between the sizes", () => {
    // 20' 1,000 + 40' 1,800 then, 20' 1,100 + 40' 1,700 now: 2,800 USD either way.
    const twoSizes = {
      ...quote,
      containers: [{ type: "20' DC", qty: 1 }, { type: "40' DC", qty: 1 }],
      buyingLines: [
        { ...freight, containerType: "20' DC", qty: 1, unitPrice: 1000, amount: 1000 },
        { ...freight, containerType: "40' DC", qty: 1, unitPrice: 1800, amount: 1800, pairId: undefined },
      ],
    };
    const now = offer({
      totals: [{ currency: "USD", amount: 2800 }],
      lines: [{ containerType: "20' DC", currency: "USD", amount: 1100 }, { containerType: "40' DC", currency: "USD", amount: 1700 }],
    });
    const action = actionForLapsed(OLD, twoSizes, "t1", asked([now]));
    expect(action.do).toBe("update");
    const { messages } = applyTariffActions(twoSizes, [action]);
    expect(messages[0]).toContain("the same USD 2800.00 in all, split differently between its lines");
    // The same rates per size, in another order of the lines, are the same rate.
    const same = offer({ totals: [{ currency: "USD", amount: 2800 }], lines: [{ containerType: "40' DC", currency: "USD", amount: 1800 }, { containerType: "20' DC", currency: "USD", amount: 1000 }] });
    expect(actionForLapsed(OLD, twoSizes, "t1", asked([same])).do).toBe("swap");
  });

  it("compares a line priced for all the quote's containers with the rates of all its sizes", () => {
    const allBoxes = [{ ...freight, containerType: undefined, amount: 2800 }];
    expect(sameLines(allBoxes, [{ containerType: "20' DC", currency: "USD", amount: 1000 }, { containerType: "40' DC", currency: "USD", amount: 1800 }])).toBe(true);
    expect(sameLines(allBoxes, [{ containerType: "20' DC", currency: "USD", amount: 1100 }, { containerType: "40' DC", currency: "USD", amount: 1800 }])).toBe(false);
  });

  it("waits for approval when a surcharge costs another amount at the same total", () => {
    const twoCharges = { ...quote, buyingLines: [freight, baf, { ...baf, description: "THC", amount: 50 }] };
    const now = offer({
      totals: [{ currency: "USD", amount: 1200 }, { currency: "EUR", amount: 150 }],
      lines: [{ containerType: "40' DC", currency: "USD", amount: 1200 }, { containerType: null, currency: "EUR", amount: 50 }, { containerType: null, currency: "EUR", amount: 100 }],
    });
    expect(actionForLapsed(OLD, twoCharges, "t1", asked([now])).do).toBe("update");
  });

  it("is removed when only other tariffs price the route, or its version is gone", () => {
    expect(lapsed([offer({ tariffId: "t2" })])).toEqual({ ref: OLD, do: "remove" });
    expect(lapsed([])).toEqual({ ref: OLD, do: "remove" });
    expect(lapsed([offer()], null)).toEqual({ ref: OLD, do: "remove" });
  });

  it("is kept, and only told, when the route can't be asked or the tariffs refuse it", () => {
    expect(actionForLapsed(OLD, quote, "t1", null, "the quote needs its ports")).toEqual({ ref: OLD, do: "unchecked", reason: "the quote needs its ports" });
    expect(actionForLapsed(OLD, quote, "t1", { offers: [], refused: "No rail tariffs for this port" })).toEqual({ ref: OLD, do: "unchecked", reason: "No rail tariffs for this port" });
    // A version that is gone has nothing to ask about.
    expect(actionForLapsed(OLD, quote, null, null, "x")).toEqual({ ref: OLD, do: "remove" });
  });

  it("prefers the offer via the same terminal", () => {
    const line = { ...quote, buyingLines: [{ ...freight, description: "Ocean freight via Kaohsiung" }] };
    const action = actionForLapsed(OLD, line, "t1", asked([offer({ rateId: "a", via: "Singapore" }), offer({ rateId: "b", via: "Kaohsiung" })]));
    expect(action).toMatchObject({ update: { newRateId: "b" } });
  });
});

describe("a lapsed tariff that could not be checked", () => {
  const action: TariffAction = { ref: OLD, do: "unchecked", reason: "the quote needs its ports" };

  it("keeps its lines and tells it once", () => {
    const first = applyTariffActions(quote, [action]);
    expect(first.changed).toBe(true);
    expect(first.data.buyingLines).toEqual(quote.buyingLines);
    expect(first.data.sellingLines).toEqual(quote.sellingLines);
    expect(first.data.tariffUnchecked).toEqual([OLD]);
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0]).toContain("could not be asked for it: the quote needs its ports. Its lines were kept");
    const again = applyTariffActions(first.data, [action]);
    expect(again).toMatchObject({ messages: [], changed: false });
  });

  it("is forgotten once it is valid again or replaced", () => {
    const told = applyTariffActions(quote, [action]).data;
    const { data, changed, messages } = applyTariffActions(told, [{ ref: OLD, do: "keep" }]);
    expect(changed).toBe(true);
    expect(messages).toEqual([]);
    expect(data).not.toHaveProperty("tariffUnchecked");
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

  it("no longer hold it once its buying lines are priced again, whatever a selling line copied from them is tagged", () => {
    const waiting = applyTariffActions(quote, [update]).data;
    const approved = { ...waiting, buyingLines: [{ tariffRef: "ocean:v2:r9" }], sellingLines: [{ tariffRef: OLD, amount: 1500 }] };
    expect(tariffUpdateGateMessage(approved)).toBeNull();
  });

  // jsonb keeps an object's keys shorter first, then by their bytes: not as they were written.
  const asJsonb = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(asJsonb)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, asJsonb(v)]),
          )
        : value;

  it("change nothing on a night that finds the same rate waiting, as the database gives it back", () => {
    const stored = asJsonb(applyTariffActions(quote, [update]).data) as Record<string, unknown>;
    expect(Object.keys((stored.tariffUpdates as TariffUpdate[])[0]!)[0]).toBe("now");
    expect(applyTariffActions(stored, [update])).toMatchObject({ messages: [], changed: false });
    const road = { ...update, update: { ...update.update, kind: "road" as const, buyWas: [{ currency: "CZK", amount: 3000 }], buyNow: [{ currency: "CZK", amount: 3100 }] } } as TariffAction;
    const storedRoad = asJsonb(applyTariffActions(quote, [road]).data) as Record<string, unknown>;
    expect(applyTariffActions(storedRoad, [road]).changed).toBe(false);
  });

  it("say what approving does to the selling price of a Sea FCL quote", () => {
    expect(applyTariffActions(quote, [update]).messages[0]).toContain("approving moves it with the new buying, each charge keeping its profit");
    expect(applyTariffActions({ ...quote, serviceType: "Sea LCL" }, [update]).messages[0]).toContain("The selling price has not changed.");
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
  // Today's rating: the sides as a pricing records them, and the buying lines the buy price makes.
  const rated = (sellSide: ReturnType<typeof side>, buySide: ReturnType<typeof side>, haulier = { haulierCustomerId: "h1", haulierName: "Haulier" }): RoadRated => ({
    sell: sellSide,
    buy: { ...buySide, ...haulier },
    buyLines: [
      { type: "Road freight", chargeCode: "road_freight", description: "Freight", supplier: haulier.haulierName, supplierCustomerId: haulier.haulierCustomerId, currency: "CZK", amount: buySide.total - 200, qty: 1, unit: "shipment", unitPrice: buySide.total - 200, tariffRef: `trucking:${buySide.tariffVersionId}:EXPRESS` },
      { type: "Road freight", chargeCode: "road_freight", description: "Fuel surcharge", supplier: haulier.haulierName, supplierCustomerId: haulier.haulierCustomerId, currency: "CZK", amount: 200, qty: 1, unit: "shipment", unitPrice: 200, tariffRef: `trucking:${buySide.tariffVersionId}:EXPRESS` },
    ],
  });

  it("is rated today once its pickup date has passed, else on that date", () => {
    expect(roadRatingDay("2026-11-01", "2026-11-09")).toBe("2026-11-09");
    expect(roadRatingDay("2026-11-20", "2026-11-09")).toBe("2026-11-20");
    expect(roadRatingDay(null, "2026-11-09")).toBe("2026-11-09");
  });

  it("has no road pricing without lines priced from it", () => {
    expect(roadPricingOf({ ...roadQuote, buyingLines: [], sellingLines: [] })).toBeNull();
  });

  it("stays when today's rate is the same, and is left alone when it can't be rated but its tariffs still hold", () => {
    const keep = roadActionFor(pricing, rated(side("sv1", 4250), side("bv1", 3000, 3)), true);
    expect(keep.do).toBe("keep");
    expect(applyTariffActions(roadQuote, [keep]).changed).toBe(false);
    expect(roadActionFor(pricing, null, true).do).toBe("keep");
  });

  it("moves quietly to a new version at the same price", () => {
    const action = roadActionFor(pricing, rated(side("sv2", 4250, 5), side("bv1", 3000, 3)), true);
    expect(action.do).toBe("roadSwap");
    const { data, messages } = applyTariffActions(roadQuote, [action]);
    expect(messages).toEqual([]);
    expect((data.sellingLines as { tariffRef?: string }[])[0]!.tariffRef).toBe("trucking:sv2:EXPRESS");
    expect((data.buyingLines as { tariffRef?: string }[])[0]!.tariffRef).toBe("trucking:bv1:EXPRESS");
    expect(data.roadPricing).toMatchObject({ sell: { tariffVersionId: "sv2", versionNo: 5, total: 4250 } });
  });

  describe("whose tariff versions still hold, rated otherwise today", () => {
    it("refreshes its buying quietly, keeps its selling, says so once and holds nothing", () => {
      const action = roadActionFor(pricing, rated(side("sv1", 4250), side("bv1", 3100, 3)), true);
      expect(action.do).toBe("roadRefresh");
      const { data, messages, changed } = applyTariffActions(roadQuote, [action]);
      expect(changed).toBe(true);
      // The road buying lines are today's, in their place; the other lines and the selling stay.
      expect(data.buyingLines).toEqual([...(action as Extract<TariffAction, { do: "roadRefresh" }>).buyLines, roadQuote.buyingLines[1]]);
      expect(data.sellingLines).toEqual(roadQuote.sellingLines);
      expect(data.roadPricing).toMatchObject({ sell, buy: { haulierCustomerId: "h1", tariffVersionId: "bv1", total: 3100 } });
      expect(data.marginApproval).toEqual(roadQuote.marginApproval);
      expect(data).not.toHaveProperty("tariffUpdates");
      expect(tariffUpdateGateMessage(data)).toBeNull();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("Buying was CZK 3000.00, now CZK 3100.00; the road buying lines were updated.");
      expect(messages[0]).toContain("so no approval of a new rate is needed");
      // The next night finds it as it is: nothing to write, nothing to tell.
      const again = applyTariffActions(data, [roadActionFor(roadPricingOf(data)!, rated(side("sv1", 4250), side("bv1", 3100, 3)), true)]);
      expect(again).toMatchObject({ changed: false, messages: [] });
    });

    it("says when the buying now comes from another haulier", () => {
      const action = roadActionFor(pricing, rated(side("sv1", 4250), side("bv9", 3000, 1), { haulierCustomerId: "h2", haulierName: "Other Haulier" }), true);
      expect(action.do).toBe("roadRefresh");
      const { data, messages } = applyTariffActions(roadQuote, [action]);
      expect(messages[0]).toContain("Buying (now from Other Haulier) stays CZK 3000.00");
      expect(data.roadPricing).toMatchObject({ buy: { haulierCustomerId: "h2", haulierName: "Other Haulier", tariffVersionId: "bv9" } });
      expect((data.buyingLines as { supplier?: string }[])[0]!.supplier).toBe("Other Haulier");
    });

    it("tells today's selling once, keeping the quote's, and forgets it once they agree again", () => {
      // A discount, or a new fuel index on the sell side: the buying is the same.
      const today = rated(side("sv1", 4500), side("bv1", 3000, 3));
      const action = roadActionFor(pricing, today, true);
      expect(action).toMatchObject({ do: "roadRefresh", buy: null, buyLines: [] });
      const first = applyTariffActions(roadQuote, [action]);
      expect(first.changed).toBe(true);
      expect(first.data.buyingLines).toEqual(roadQuote.buyingLines);
      expect(first.data.sellingLines).toEqual(roadQuote.sellingLines);
      expect(first.messages[0]).toContain("Selling from the tariff would now be CZK 4500.00; the quote keeps its CZK 4250.00");
      expect(tariffUpdateGateMessage(first.data)).toBeNull();
      const again = applyTariffActions(first.data, [roadActionFor(roadPricingOf(first.data)!, today, true)]);
      expect(again).toMatchObject({ changed: false, messages: [] });
      const agreed = applyTariffActions(first.data, [roadActionFor(roadPricingOf(first.data)!, rated(side("sv1", 4250), side("bv1", 3000, 3)), true)]);
      expect(agreed.changed).toBe(true);
      expect(agreed.messages).toEqual([]);
      expect(agreed.data.roadPricing).not.toHaveProperty("sellNoted");
    });

    it("drops a rate that waited from before, as nothing holds the quote now", () => {
      const waiting = { ...roadQuote, tariffUpdates: [{ oldRef: "trucking:sv1:EXPRESS", kind: "road", newVersionId: "sv1", newRateId: null, supplierName: "Standard", was: [], now: [] }] };
      const { data, changed } = applyTariffActions(waiting, [roadActionFor(pricing, rated(side("sv1", 4250), side("bv1", 3000, 3)), true)]);
      expect(changed).toBe(true);
      expect(data).not.toHaveProperty("tariffUpdates");
    });
  });

  it("waits for approval once its tariff versions lapsed and either price moved, saying both, and changes no line", () => {
    const action = roadActionFor(pricing, rated(side("sv2", 4500), side("bv1", 3100)), false);
    const { data, messages } = applyTariffActions(roadQuote, [action]);
    expect(data.sellingLines).toEqual(roadQuote.sellingLines);
    expect(data.buyingLines).toEqual(roadQuote.buyingLines);
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

describe("which quotes the check may move", () => {
  it("is those not sent yet, and the revision of a Won quote - never a Won quote that is no revision", () => {
    for (const status of ["draft", "ready_to_send", "revised"]) expect(isTariffCheckable(status, {})).toBe(true);
    expect(isTariffCheckable("won", { wonRevisionOf: "QCZ20261101001" })).toBe(true);
    expect(isTariffCheckable("won", {})).toBe(false);
    expect(isTariffCheckable("won", { wonRevisionOf: "" })).toBe(false);
    for (const status of ["quoted", "feedback", "lost", "replaced"]) expect(isTariffCheckable(status, { wonRevisionOf: "QCZ20261101001" })).toBe(false);
  });
});
