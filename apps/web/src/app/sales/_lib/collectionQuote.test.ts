import { describe, expect, it } from "vitest";
import {
  addressPostcode,
  collectionDescription,
  collectionFreightOf,
  collectionOffersRequest,
  collectionRouteOf,
  collectionRouteProblem,
  collectionVersionId,
  isCollectionLine,
  isInlandCollectionLine,
  longestPieceCm,
  withCollectionOffer,
  type CollectionOffer,
} from "./collectionQuote";
import type { CostLine, SalesQuoteData } from "./types";

const TODAY = "2026-10-28";
const HUBS = [
  { freightMode: "sea_lcl" as const, postcode: "25261", country: "CZ", label: "CFS Jeneč" },
  { freightMode: "air" as const, postcode: "16100", country: "CZ", label: "PRG cargo" },
];

const QUOTE: SalesQuoteData = {
  direction: "Import",
  serviceType: "Sea LCL",
  delivery: "Průmyslová 12, 602 00 Brno",
  pickup: "Hlavní 1, 110 00 Praha",
  readyDate: "2026-11-15",
  packages: [
    { qty: 2, type: "Pallets", length: 120, width: 80, height: 150, weight: 300 },
    { qty: 1, type: "Crate", length: 380, width: 60, height: 40, weight: 200 },
  ],
};

const offer = (over: Partial<CollectionOffer> = {}): CollectionOffer => ({
  versionId: "version-1",
  versionNo: 1,
  tariffId: "tariff-1",
  tariffName: "TOPTRANS – CZ / SK",
  supplierCustomerId: "toptrans",
  supplierName: "TOPTRANS EU, a.s.",
  validTo: null,
  hubPlace: "Dobrovíz",
  customerPlace: "Brno",
  matrixLabel: "CZ → CZ",
  distanceKm: 206,
  zoneLabel: "300 km",
  chargeableKg: 800,
  chargeableBy: "weight",
  bandLabel: "up to 1,000 kg",
  price: 4724,
  surcharges: [{ label: "Oversize (over 350 cm)", amount: 2362 }],
  total: 7086,
  currency: "CZK",
  ...over,
});

const collectionLine: CostLine = {
  type: "Inland collection / delivery",
  chargeCode: "inland_collection",
  description: "Inland collection / delivery",
  supplier: "",
  currency: "EUR",
  amount: 0,
  value: 1,
  basis: "wm",
  qty: 2.2,
  unit: "W/M",
  unitPrice: 0,
  pairId: "p1",
};

describe("collectionRouteOf", () => {
  it("reads an import as a delivery from our LCL hub to the delivery address's postcode, with the cargo and the ready date", () => {
    expect(collectionRouteOf(QUOTE, HUBS, TODAY)).toEqual({
      freightMode: "sea_lcl",
      leg: "delivery",
      hubPostcode: "252 61",
      customerPostcode: "602 00",
      date: "2026-11-15",
      weightKg: 800,
      cbm: 3.792,
      longestCm: 380,
    });
  });

  it("reads an export as a collection from the pickup address to our air hub, today when no ready date", () => {
    const route = collectionRouteOf({ ...QUOTE, direction: "Export", serviceType: "Air", readyDate: "" }, HUBS, TODAY);
    expect(route).toMatchObject({ freightMode: "air", leg: "collection", hubPostcode: "161 00", customerPostcode: "110 00", date: TODAY });
  });

  it("leaves what the quote does not give empty", () => {
    const route = collectionRouteOf({ serviceType: "Sea LCL", delivery: "Brno" }, [], TODAY);
    expect(route).toMatchObject({ hubPostcode: "", customerPostcode: "", weightKg: null, cbm: null, longestCm: null });
  });
});

describe("collectionRouteProblem", () => {
  const route = collectionRouteOf(QUOTE, HUBS, TODAY);

  it("asks for the freight, our hub, the customer's postcode and a weight or volume, in that order", () => {
    expect(collectionRouteProblem({ ...route, freightMode: null })).toContain("Sea LCL and air");
    expect(collectionRouteProblem({ ...route, hubPostcode: "" })).toContain("hub");
    expect(collectionRouteProblem({ ...route, customerPostcode: "602" })).toContain("delivery postcode");
    expect(collectionRouteProblem({ ...route, weightKg: null, cbm: null })).toContain("weight or the volume");
    expect(collectionRouteProblem({ ...route, weightKg: null })).toBeNull();
  });

  it("sends the postcodes as 5 digits", () => {
    expect(collectionOffersRequest(route)).toEqual({ freightMode: "sea_lcl", hubPostcode: "25261", customerPostcode: "60200", date: "2026-11-15", weightKg: 800, cbm: 3.792, longestCm: 380 });
    expect(collectionOffersRequest({ ...route, hubPostcode: "" })).toBeNull();
  });
});

describe("quote helpers", () => {
  it("knows the freight the collections tariffs serve", () => {
    expect(collectionFreightOf("Sea LCL")).toBe("sea_lcl");
    expect(collectionFreightOf("Air")).toBe("air");
    expect(collectionFreightOf("Sea FCL")).toBeNull();
  });

  it("finds a postcode in an address", () => {
    expect(addressPostcode("Průmyslová 1, 25261 Jeneč")).toBe("252 61");
    expect(addressPostcode("Hall 1234/56")).toBe("");
  });

  it("takes the longest side of any piece", () => {
    expect(longestPieceCm(QUOTE)).toBe(380);
    expect(longestPieceCm({})).toBeNull();
  });

  it("knows the line by its charge code, or by the label of an older line", () => {
    expect(isInlandCollectionLine(collectionLine)).toBe(true);
    expect(isInlandCollectionLine({ type: "Inland collection / delivery" })).toBe(true);
    expect(isInlandCollectionLine({ type: "Ocean freight", chargeCode: "ocean_freight" })).toBe(false);
  });
});

describe("collectionDescription", () => {
  const route = collectionRouteOf(QUOTE, HUBS, TODAY);

  it("names the way the consignment goes, how far and its weight band", () => {
    expect(collectionDescription(offer(), route)).toBe("Delivery Dobrovíz → Brno · 206 km · up to 1,000 kg");
    expect(collectionDescription(offer(), { ...route, leg: "collection" })).toBe("Collection Brno → Dobrovíz · 206 km · up to 1,000 kg");
  });

  it("uses the postcodes and the zone for a tariff by postcode area", () => {
    expect(collectionDescription(offer({ hubPlace: "", customerPlace: "", distanceKm: null, zoneLabel: "Zone 3" }), route)).toBe("Delivery 252 61 → 602 00 · Zone 3 · up to 1,000 kg");
  });
});

describe("withCollectionOffer", () => {
  const route = collectionRouteOf(QUOTE, HUBS, TODAY);

  it("makes the picked line one lump sum from the haulier, tagged with the tariff version", () => {
    const lines = withCollectionOffer([collectionLine, { ...collectionLine, chargeCode: "other" }], 0, offer(), route);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      type: "Inland collection / delivery",
      chargeCode: "inland_collection",
      description: "Delivery Dobrovíz → Brno · 206 km · up to 1,000 kg",
      supplier: "TOPTRANS EU, a.s.",
      supplierCustomerId: "toptrans",
      currency: "CZK",
      amount: 7086,
      value: 1,
      basis: "lumpsum",
      pairId: "p1",
      tariffRef: "collection:version-1",
    });
    expect(isCollectionLine(lines[0]!)).toBe(true);
    expect(collectionVersionId(lines[0]!)).toBe("version-1");
    expect(lines[1]!.chargeCode).toBe("other");
  });

  it("replaces an earlier pick on the line", () => {
    const first = withCollectionOffer([collectionLine], 0, offer(), route);
    const again = withCollectionOffer(first, 0, offer({ versionId: "version-2", total: 6900 }), route);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ amount: 6900, tariffRef: "collection:version-2" });
  });
});
