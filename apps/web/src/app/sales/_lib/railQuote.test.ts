import { describe, expect, it } from "vitest";
import { isInlandHaulageLine, railContainersOf, railDescription, railOffersRequest, railRouteOf, railRouteProblem, railVersionId, withRailOffer, type RailOffer } from "./railQuote";
import type { CostLine, SalesQuoteData } from "./types";

const TODAY = "2026-10-28";

const QUOTE: SalesQuoteData = {
  direction: "Import",
  serviceType: "Sea FCL",
  pol: "Shanghai (CNSHA)",
  pod: "Hamburg (DEHAM)",
  origin: "Shanghai (CNSHA)",
  destination: "Brno (CZBRQ)",
  delivery: "Průmyslová 12, 602 00 Brno",
  readyDate: "2026-11-15",
  containers: [{ qty: 2, type: "20' DC", weight: 12000 }],
};

const offer = (over: Partial<RailOffer> = {}): RailOffer => ({
  rateId: "rate-1",
  versionId: "version-1",
  versionNo: 1,
  tariffId: "tariff-1",
  tariffName: "Hamburg – Czechia",
  supplierCustomerId: "metrans",
  supplierName: "METRANS a.s.",
  currency: "EUR",
  place: "Brno",
  postcode: "60200",
  region: "",
  via: "Cetr",
  emptyDepot: "Cetr",
  note: "",
  validTo: "2026-12-31",
  lines: [{ type: "20' DC", qty: 2, bandCode: "20ft-25t", bandLabel: "20'<25 t", price: 905, amount: 1810 }],
  total: 1810,
  ...over,
});

const haulage: CostLine = { type: "Inland container haulage", chargeCode: "inland_haulage", description: "Inland container haulage", supplier: "", currency: "EUR", amount: 0, value: 2, basis: "container" };

describe("railRouteOf", () => {
  it("reads an import from the port of discharge to the postcode of the delivery address, on the ready date", () => {
    expect(railRouteOf(QUOTE, TODAY)).toEqual({
      port: "DEHAM",
      direction: "import",
      place: "602 00",
      country: "CZ",
      date: "2026-11-15",
      containers: [{ type: "20' DC", qty: 2, cargoKg: 12000 }],
    });
  });

  it("reads an export from the pickup address to the port of loading, else the Origin town, today", () => {
    const route = railRouteOf({ ...QUOTE, direction: "Export", pol: "Koper (SIKOP)", origin: "Zlín (CZZLN)", pickup: "", readyDate: "" }, TODAY);
    expect(route).toMatchObject({ port: "SIKOP", direction: "export", place: "Zlín", country: "CZ", date: TODAY });
  });

  it("leaves the port open when the quote's port has no rail tariffs", () => {
    expect(railRouteOf({ ...QUOTE, pod: "Gdansk (PLGDN)" }, TODAY).port).toBeNull();
  });
});

describe("railContainersOf", () => {
  it("takes the container lines with a type and a number, an unknown weight as null and GP as DC", () => {
    const containers = [
      { qty: 1, type: "40' GP" },
      { qty: 0, type: "20' DC", weight: 5000 },
      { qty: 3, type: "", weight: 1000 },
    ];
    expect(railContainersOf({ ...QUOTE, containers })).toEqual([{ type: "40' DC", qty: 1, cargoKg: null }]);
  });

  it("has none on a quote that is not full containers", () => {
    expect(railContainersOf({ ...QUOTE, serviceType: "Sea LCL" })).toEqual([]);
  });
});

describe("railRouteProblem", () => {
  it("asks for containers, a port and a place, in that order", () => {
    const route = railRouteOf(QUOTE, TODAY);
    expect(railRouteProblem({ ...route, containers: [] })).toContain("containers");
    expect(railRouteProblem({ ...route, port: null })).toContain("port");
    expect(railRouteProblem({ ...route, place: " " })).toContain("place");
    expect(railRouteProblem(route)).toBeNull();
    expect(railOffersRequest({ ...route, port: null })).toBeNull();
  });
});

describe("railDescription", () => {
  it("names the way the container goes", () => {
    expect(railDescription(offer(), "DEHAM", "import")).toBe("Rail Hamburg → Brno via Cetr");
    expect(railDescription(offer(), "NLRTM", "export")).toBe("Rail Brno → Rotterdam via Cetr");
  });
});

describe("withRailOffer", () => {
  it("prices a line per container when every container costs the same, with the operator as supplier", () => {
    const pick = withRailOffer([haulage], 0, offer(), "DEHAM", "import", QUOTE);
    expect(pick).toMatchObject({ at: 0, count: 1, removed: [] });
    expect(pick.lines[0]).toMatchObject({
      chargeCode: "inland_haulage",
      description: "Rail Hamburg → Brno via Cetr",
      supplier: "METRANS a.s.",
      supplierCustomerId: "metrans",
      currency: "EUR",
      basis: "container",
      unitPrice: 905,
      qty: 2,
      amount: 1810,
      tariffRef: "rail:version-1:rate-1",
    });
    expect(railVersionId(pick.lines[0]!)).toBe("version-1");
  });

  it("makes a lump-sum line per container type when they cost differently", () => {
    const mixed = offer({
      lines: [
        { type: "20' DC", qty: 2, bandCode: "20ft-25t", bandLabel: "20'<25 t", price: 905, amount: 1810 },
        { type: "40' HC", qty: 1, bandCode: "40ft-27t", bandLabel: "40' 0<27 t", price: 1133, amount: 1133 },
      ],
      total: 2943,
    });
    const quote = { ...QUOTE, containers: [...QUOTE.containers!, { qty: 1, type: "40' HC", weight: 20000 }] };
    const pick = withRailOffer([{ ...haulage, pairId: "p1" }, { ...haulage, chargeCode: "other", description: "Other" }], 0, mixed, "DEHAM", "import", quote);
    expect(pick).toMatchObject({ at: 0, count: 2 });
    expect(pick.lines.map((l) => [l.description, l.basis, l.qty, l.unit, l.unitPrice, l.amount, l.pairId])).toEqual([
      ["Rail Hamburg → Brno via Cetr - 2 × 20' DC", "lumpsum", 2, "20' DC", 905, 1810, "p1"],
      ["Rail Hamburg → Brno via Cetr - 1 × 40' HC", "lumpsum", 1, "40' HC", 1133, 1133, undefined],
      ["Other", "container", undefined, undefined, undefined, 0, undefined],
    ]);
  });

  it("makes a lump-sum line when the offer does not price every container of the quote", () => {
    const quote = { ...QUOTE, containers: [...QUOTE.containers!, { qty: 1, type: "" }] };
    const pick = withRailOffer([haulage], 0, offer(), "DEHAM", "import", quote);
    expect(pick.lines.map((l) => [l.basis, l.qty, l.unitPrice, l.amount])).toEqual([["lumpsum", 2, 905, 1810]]);
  });

  it("replaces the lines an earlier pick on the line made", () => {
    const earlier = { ...haulage, tariffRef: "rail:version-1:old" };
    const lines = [earlier, { ...haulage, chargeCode: "other" }, { ...earlier, description: "second size" }];
    const pick = withRailOffer(lines, 2, offer(), "DEHAM", "import", QUOTE);
    expect(pick.removed).toEqual([0]);
    expect(pick.at).toBe(1);
    expect(pick.lines.map((l) => l.chargeCode)).toEqual(["other", "inland_haulage"]);
  });
});

describe("isInlandHaulageLine", () => {
  it("knows the line by its charge code, or by the label of an older line", () => {
    expect(isInlandHaulageLine(haulage)).toBe(true);
    expect(isInlandHaulageLine({ type: "Inland container haulage" })).toBe(true);
    expect(isInlandHaulageLine({ type: "Ocean freight", chargeCode: "ocean_freight" })).toBe(false);
  });
});
