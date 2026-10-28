import { describe, expect, it } from "vitest";
import {
  isOceanFreightLine,
  oceanAllIn,
  oceanContainersOf,
  oceanDescription,
  oceanOffersRequest,
  oceanPlaceCode,
  oceanRouteOf,
  oceanRouteProblem,
  oceanVersionId,
  withOceanOffer,
  type OceanOffer,
} from "./oceanQuote";
import type { CostLine, SalesQuoteData } from "./types";

const TODAY = "2026-10-28";

const QUOTE: SalesQuoteData = {
  direction: "Export",
  serviceType: "Sea FCL",
  pol: "Hamburg (DEHAM)",
  pod: "Shanghai (CNSHA)",
  readyDate: "2026-05-12",
  dangerous: false,
  containers: [{ qty: 2, type: "40' HC", weight: 18000 }],
};

const offer = (over: Partial<OceanOffer> = {}): OceanOffer => ({
  rateId: "rate-1",
  versionId: "version-1",
  versionNo: 1,
  tariffId: "tariff-1",
  tariffName: "OOCL Export FAK",
  supplierCustomerId: "oocl",
  supplierName: "OOCL",
  validTo: "2026-05-31",
  tableLabel: "Far East direct calls",
  polCode: "DEHAM",
  polName: "HAM",
  podCode: "CNSHA",
  podName: "Shanghai",
  via: "",
  note: "",
  currency: "USD",
  lines: [{ type: "40' HC", qty: 2, equipment: "40HC", price: 25, amount: 50 }],
  freight: 50,
  surcharges: [
    { name: "EBS Emergency Bunker Surcharge", code: "EBS", charge: "fcl_baf", basis: "teu", units: 4, rate: 70, total: 280, currency: "USD" },
    { name: "Advanced Manifest Filing Fee", code: "AMS", charge: "ams_ens", basis: "bl", units: 1, rate: 25, total: 25, currency: "EUR" },
    { name: "Emission Trading System", code: "ETS", charge: "other", basis: "teu", units: 4, rate: 45, total: 180, currency: "USD" },
  ],
  totals: [
    { currency: "USD", amount: 510 },
    { currency: "EUR", amount: 25 },
  ],
  ...over,
});

const freightLine: CostLine = { type: "Ocean freight (OF / BAS)", chargeCode: "ocean_freight", description: "Ocean freight", supplier: "", currency: "USD", amount: 0, value: 2, basis: "container", pairId: "p1" };

describe("oceanRouteOf", () => {
  it("reads the ports, an export, the ready date and the containers of a Sea FCL quote", () => {
    expect(oceanRouteOf(QUOTE, TODAY)).toEqual({
      fcl: true,
      direction: "export",
      pol: "Hamburg (DEHAM)",
      pod: "Shanghai (CNSHA)",
      comparePols: false,
      date: "2026-05-12",
      containers: [{ type: "40' HC", qty: 2 }],
      dangerous: false,
    });
  });

  it("reads an import, today without a ready date, dangerous goods, and leaves a port that is no place empty", () => {
    expect(oceanRouteOf({ ...QUOTE, direction: "Import", readyDate: "", dangerous: true, pod: "Shanghai" }, TODAY)).toMatchObject({
      direction: "import",
      date: TODAY,
      dangerous: true,
      pod: "",
    });
  });

  it("takes the container lines with a type and a number, GP as DC, and none on a quote that is not full containers", () => {
    expect(oceanContainersOf({ ...QUOTE, containers: [{ qty: 1, type: "20' GP" }, { qty: 0, type: "40' DC" }, { qty: 3, type: "" }] })).toEqual([{ type: "20' DC", qty: 1 }]);
    expect(oceanContainersOf({ ...QUOTE, serviceType: "Sea LCL" })).toEqual([]);
  });
});

describe("oceanRouteProblem and oceanOffersRequest", () => {
  const route = oceanRouteOf(QUOTE, TODAY);

  it("asks for a Sea FCL quote, containers, a port of loading (unless compared) and a port of discharge", () => {
    expect(oceanRouteProblem({ ...route, fcl: false })).toContain("Sea FCL");
    expect(oceanRouteProblem({ ...route, containers: [] })).toContain("containers");
    expect(oceanRouteProblem({ ...route, pol: "" })).toContain("port of loading");
    expect(oceanRouteProblem({ ...route, pol: "", comparePols: true })).toBeNull();
    expect(oceanRouteProblem({ ...route, pod: "" })).toContain("port of discharge");
    expect(oceanRouteProblem(route)).toBeNull();
  });

  it("asks the API with the ports' UN/LOCODEs", () => {
    expect(oceanOffersRequest(route)).toEqual({
      direction: "export",
      polCode: "DEHAM",
      podCode: "CNSHA",
      comparePols: false,
      date: "2026-05-12",
      containers: [{ type: "40' HC", qty: 2 }],
      dangerous: false,
    });
    expect(oceanOffersRequest({ ...route, pod: "" })).toBeNull();
    expect(oceanPlaceCode("Hamburg (DEHAM)")).toBe("DEHAM");
    expect(oceanPlaceCode("Hamburg")).toBeNull();
  });
});

describe("oceanDescription", () => {
  it("names the ports as the route does, a short tariff code by its UN/LOCODE, and the transshipment port", () => {
    const route = oceanRouteOf(QUOTE, TODAY);
    expect(oceanDescription(offer(), route)).toBe("Ocean freight Hamburg → Shanghai (OOCL)");
    expect(oceanDescription(offer({ polCode: "NLRTM", polName: "RTM", podName: "Fuqing", podCode: "CNFQG", via: "Kaohsiung" }), route)).toBe(
      "Ocean freight NLRTM → Fuqing (OOCL) via Kaohsiung",
    );
  });
});

describe("withOceanOffer", () => {
  const route = oceanRouteOf(QUOTE, TODAY);

  it("prices the freight per container and adds a line per surcharge on its charge, counted in its own unit", () => {
    const pick = withOceanOffer([freightLine], 0, offer(), route, QUOTE);
    expect(pick).toMatchObject({ at: 0, count: 4, removed: [] });
    expect(pick.lines[0]).toMatchObject({ chargeCode: "ocean_freight", basis: "container", unitPrice: 25, qty: 2, amount: 50, supplier: "OOCL", supplierCustomerId: "oocl", pairId: "p1", tariffRef: "ocean:version-1:rate-1" });
    expect(oceanVersionId(pick.lines[0]!)).toBe("version-1");
    expect(pick.lines.slice(1).map((l) => [l.chargeCode, l.description, l.basis, l.qty, l.unit, l.unitPrice, l.amount, l.currency, l.tariffRef, l.pairId])).toEqual([
      ["fcl_baf", "EBS – EBS Emergency Bunker Surcharge", "lumpsum", 4, "TEU", 70, 280, "USD", "ocean:version-1:rate-1", undefined],
      ["ams_ens", "AMS – Advanced Manifest Filing Fee", "lumpsum", 1, "B/L", 25, 25, "EUR", "ocean:version-1:rate-1", undefined],
      ["other", "ETS – Emission Trading System", "lumpsum", 4, "TEU", 45, 180, "USD", "ocean:version-1:rate-1", undefined],
    ]);
  });

  it("makes a lump-sum freight line per container type when the types cost differently", () => {
    const quote = { ...QUOTE, containers: [{ qty: 2, type: "40' HC" }, { qty: 1, type: "20' DC" }] };
    const mixed = offer({
      lines: [
        { type: "40' HC", qty: 2, equipment: "40HC", price: 25, amount: 50 },
        { type: "20' DC", qty: 1, equipment: "20DC", price: 20, amount: 20 },
      ],
      surcharges: [],
    });
    const pick = withOceanOffer([freightLine], 0, mixed, oceanRouteOf(quote, TODAY), quote);
    expect(pick.lines.map((l) => [l.description, l.basis, l.qty, l.unit, l.unitPrice, l.amount, l.pairId])).toEqual([
      ["Ocean freight Hamburg → Shanghai (OOCL) - 2 × 40' HC", "lumpsum", 2, "40' HC", 25, 50, "p1"],
      ["Ocean freight Hamburg → Shanghai (OOCL) - 1 × 20' DC", "lumpsum", 1, "20' DC", 20, 20, undefined],
    ]);
  });

  it("replaces the freight and surcharges of an earlier pick on the line", () => {
    const first = withOceanOffer([{ ...freightLine, chargeCode: "other", description: "keep" }, freightLine], 1, offer(), route, QUOTE);
    const again = withOceanOffer(first.lines, 1, offer({ rateId: "rate-2", surcharges: [] }), route, QUOTE);
    expect(again.removed).toEqual([2, 3, 4]);
    expect(again.lines.map((l) => l.description)).toEqual(["keep", "Ocean freight Hamburg → Shanghai (OOCL)"]);
    expect(again.lines[1]!.tariffRef).toBe("ocean:version-1:rate-2");
  });
});

describe("oceanAllIn and isOceanFreightLine", () => {
  it("adds every currency's total in the quote's currency, none without a rate", () => {
    const toEur = (amount: number, currency: string) => (currency === "USD" ? amount * 0.9 : null);
    expect(oceanAllIn(offer(), "EUR", toEur)).toBe(484);
    expect(oceanAllIn(offer(), "CZK", () => null)).toBeNull();
  });

  it("knows the ocean freight line by its charge, or by the label of an older line", () => {
    expect(isOceanFreightLine(freightLine)).toBe(true);
    expect(isOceanFreightLine({ type: "Ocean freight (OF / BAS)" })).toBe(true);
    expect(isOceanFreightLine({ type: "Inland container haulage", chargeCode: "inland_haulage" })).toBe(false);
  });
});
