import { describe, expect, it } from "vitest";
import type { RateLevelResult } from "@/hooks/useTrucking";
import {
  approvalReasonProblem,
  defaultPick,
  floorText,
  isRoadQuote,
  isTruckingLine,
  lineOverridden,
  lineTariffTag,
  marginState,
  marginText,
  pscOf,
  rateFormToRoad,
  roadInputDefaults,
  roadInputProblems,
  roadToRateForm,
  sendBlockedText,
  sideOverridden,
  truckingVersionId,
  type RoadMargin,
} from "./roadQuote";
import type { CostLine, QuoteRoadPricing } from "./types";

const TODAY = "2026-10-15";

const line = (patch: Partial<CostLine> = {}): CostLine => ({
  type: "Road freight",
  chargeCode: "road_freight",
  description: "Freight 1 001 – 1 500 kg, zone 3",
  currency: "CZK",
  amount: 3000,
  qty: 1,
  unit: "consignment",
  unitPrice: 3000,
  tariffRef: "trucking:ver-sell-3:D1",
  ...patch,
});

const pricing: QuoteRoadPricing = {
  ratedAt: "2026-10-15T08:00:00Z",
  serviceLevel: "D1",
  serviceLabel: "+1 day",
  promisedDate: "2026-10-16",
  promisedTime: null,
  promiseNote: "",
  sell: { tariffId: "t1", tariffName: "Standard", tariffVersionId: "ver-sell-3", versionNo: 3, currency: "CZK", total: 3375, totalCzk: 3375 },
  buy: { haulierCustomerId: "h1", haulierName: "Haul s.r.o.", tariffVersionId: "ver-buy-2", versionNo: 2, currency: "EUR", total: 100, totalCzk: 2500, preferred: true },
};

const margin = (patch: Partial<RoadMargin> = {}): RoadMargin => ({
  sellingCzk: 9000,
  buyingCzk: 8620,
  marginCzk: 380,
  marginPercent: 4.2,
  floorPercent: 8,
  floorMinCzk: 300,
  belowFloor: true,
  approval: null,
  approvalValid: false,
  needsApproval: true,
  problem: null,
  ...patch,
});

describe("trucking lines", () => {
  it("are told by their tariffRef and name their version", () => {
    expect(isTruckingLine(line())).toBe(true);
    expect(isTruckingLine(line({ tariffRef: undefined }))).toBe(false);
    expect(isTruckingLine(line({ tariffRef: "air:abc" }))).toBe(false);
    expect(truckingVersionId(line())).toBe("ver-sell-3");
    expect(truckingVersionId(line({ tariffRef: undefined }))).toBeNull();
  });

  it("make a quote a road quote, as does the Road freight mode", () => {
    expect(isRoadQuote({ serviceType: "Road" })).toBe(true);
    expect(isRoadQuote({ serviceType: "Air" })).toBe(false);
    expect(isRoadQuote({ serviceType: "Air", buyingLines: [line()] })).toBe(true);
    expect(isRoadQuote({ serviceType: "Sea FCL", sellingLines: [line({ tariffRef: undefined })] })).toBe(false);
  });
});

describe("override detection", () => {
  it("tags a priced line with its tariff version", () => {
    expect(lineTariffTag(line(), pricing, "selling")).toEqual({ label: "Tariff v3", override: false });
    expect(lineTariffTag(line({ tariffRef: "trucking:ver-buy-2:D1", currency: "EUR", amount: 100, unitPrice: 100 }), pricing, "buying")).toEqual({
      label: "Tariff v2",
      override: false,
    });
    expect(lineTariffTag(line({ tariffRef: undefined }), pricing, "selling")).toBeNull();
    // A line of an older pricing has no version to name.
    expect(lineTariffTag(line({ tariffRef: "trucking:old:D2" }), pricing, "selling")).toEqual({ label: "Tariff", override: false });
  });

  it("flags a line whose amount or currency was changed by hand", () => {
    expect(lineOverridden(line({ amount: 2800 }), "CZK")).toBe(true);
    expect(lineOverridden(line({ currency: "EUR" }), "CZK")).toBe(true);
    // Rounding to whole CZK is not a change.
    expect(lineOverridden(line({ qty: 1250, unitPrice: 2.4, amount: 3000 }), "CZK")).toBe(false);
    expect(lineOverridden(line({ qty: undefined, unitPrice: undefined, amount: 1 }), "CZK")).toBe(false);
    expect(lineTariffTag(line({ amount: 2500 }), pricing, "selling")?.override).toBe(true);
  });

  it("flags a side whose trucking lines no longer add up to the priced total", () => {
    const sell = [line(), line({ description: "Fuel surcharge 12.5 %", amount: 375, unitPrice: 375 }), line({ tariffRef: undefined, amount: 999 })];
    expect(sideOverridden(sell, pricing.sell)).toBe(false);
    expect(sideOverridden(sell.slice(1), pricing.sell)).toBe(true);
    expect(sideOverridden([], null)).toBe(false);
  });
});

describe("road input", () => {
  it("starts from the quote's cargo, readiness date and goods", () => {
    const road = roadInputDefaults({
      readyDate: "2026-10-20",
      dangerous: true,
      packages: [
        { qty: 2, type: "Pallets", weight: 300, length: 120, width: 80, height: 100, stackable: false },
        { qty: 3, type: "Cartons", weight: 10 },
      ],
    });
    expect(road).toMatchObject({ pickupDate: "2026-10-20", pieces: 5, palletPlaces: 2, weightKg: 630, cbm: 1.92, scope: "LTL" });
    expect(road.extras).toMatchObject({ adr: true, nonStackable: true, tailLift: false });
    expect(roadInputDefaults({ readyDate: "next week" }).pickupDate).toBeNull();
    expect(roadInputDefaults({}).pieces).toBe(1);
  });

  it("reads postcodes as typed", () => {
    expect(pscOf("110 00")).toBe("11000");
    expect(pscOf(" 60200 ")).toBe("60200");
    expect(pscOf("110 0")).toBeNull();
    expect(pscOf("110 001")).toBeNull();
    expect(pscOf("D-80331")).toBeNull();
  });

  it("is checked like the rate calculator, with no date meaning today", () => {
    const road = { ...roadInputDefaults({ weight: 500 }), fromPostcode: "110 00", toPostcode: "602 00" };
    expect(roadInputProblems(road, TODAY)).toEqual([]);
    expect(roadInputProblems({ ...road, toPostcode: "602 0" }, TODAY)).toEqual(["To postcode has 5 digits"]);
    expect(roadInputProblems({ ...road, weightKg: 0 }, TODAY)).toEqual(["Enter the weight, pallet places, LDM or volume"]);
    expect(roadInputProblems({ ...road, pickupDate: "2026-10-01" }, TODAY)).toEqual(["Pick-up date is in the past"]);
    expect(roadToRateForm(road, TODAY, "c1")).toMatchObject({ fromPsc: "11000", toPsc: "60200", pickupDate: TODAY, customerId: "c1", includeBuy: true });
  });

  it("comes from the calculator with the postcodes shown the Czech way", () => {
    const form = roadToRateForm({ ...roadInputDefaults({ weight: 500 }), fromPostcode: "11000", toPostcode: "60200" }, TODAY, null);
    expect(rateFormToRoad(form)).toMatchObject({ fromPostcode: "110 00", toPostcode: "602 00", fromSiteId: null, pickupDate: TODAY, weightKg: 500 });
  });
});

describe("margin", () => {
  it("reads as amount and percent against the floor", () => {
    expect(marginText(380, 4.2)).toBe("380 CZK (4.2 %)");
    expect(marginText(380, null)).toBe("380 CZK");
    expect(marginText(null, null)).toBe("unknown");
    expect(floorText({ floorPercent: 8, floorMinCzk: 300 })).toBe("8 % / 300 CZK");
  });

  it("states whether a manager has to approve it", () => {
    expect(marginState(margin())).toBe("needsApproval");
    expect(marginState(margin({ needsApproval: false, approvalValid: true }))).toBe("approved");
    expect(marginState(margin({ belowFloor: false, needsApproval: false }))).toBe("ok");
  });

  it("blocks sending in the server's words", () => {
    expect(sendBlockedText(margin())).toBe(
      "The margin of 380 CZK (4.2 %) is below the floor of 8 % / 300 CZK. A manager must approve it before the quote is sent.",
    );
    expect(sendBlockedText(margin({ marginCzk: null, marginPercent: null, problem: "No ČNB rate for EUR on 2026-10-15" }))).toMatch(
      /^The margin of unknown is below .* sent\. No ČNB rate for EUR on 2026-10-15$/,
    );
    expect(sendBlockedText(margin({ needsApproval: false }))).toBeNull();
    expect(sendBlockedText(null)).toBeNull();
  });

  it("asks for a reason of 3 to 500 characters", () => {
    expect(approvalReasonProblem("  ok ")).toMatch(/at least 3/);
    expect(approvalReasonProblem("Strategic customer")).toBeNull();
    expect(approvalReasonProblem("x".repeat(501))).toMatch(/at most 500/);
  });
});

describe("picking a level and haulier", () => {
  const priced = { tariffId: "t", tariffName: "Standard", tariffVersionId: "v", versionNo: 1, ownerCustomerId: null, ownerName: null, currency: "CZK" as const, zoneCode: "1", zoneLabel: "", bandLabel: "", chargeable: { basis: "KG" as const, quantity: 1, explanation: "" }, lines: [], total: 1, totalCzk: 1, fx: null, preferred: false };
  const level = (serviceLevel: RateLevelResult["serviceLevel"], sellPriced: boolean, hauliers: string[] = []): RateLevelResult => ({
    serviceLevel,
    label: serviceLevel,
    promisedDate: null,
    promisedTime: null,
    promiseNote: "",
    sell: sellPriced ? priced : { reason: "No zone" },
    buy: hauliers.map((h) => ({ ...priced, ownerCustomerId: h })),
    excluded: [],
    internal: null,
    marginCzk: null,
    marginPercent: null,
    belowFloor: false,
  });

  it("starts on the level priced last, else the first with a sell price, with its first haulier", () => {
    const results = [level("D1", false, ["h0"]), level("D2", true, ["h1", "h2"]), level("D3", true)];
    expect(defaultPick(results)).toEqual({ serviceLevel: "D2", haulierCustomerId: "h1" });
    expect(defaultPick(results, "D3")).toEqual({ serviceLevel: "D3", haulierCustomerId: null });
    expect(defaultPick(results, "D1")).toEqual({ serviceLevel: "D2", haulierCustomerId: "h1" });
    expect(defaultPick([level("D1", false)])).toBeNull();
  });
});
