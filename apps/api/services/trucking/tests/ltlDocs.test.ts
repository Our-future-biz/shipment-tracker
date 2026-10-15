import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { capacityText, labelDocs, ltlTransportOrderDoc, manifestDoc, type DocConsignment, type DocLeg } from "../lib/ltlDocs";
import { partnerLegCosts, tripJobCosts } from "../lib/truckingLinks";
import { capacityOf, tripFill } from "../lib/ltlRules";
import { DEFAULT_VEHICLE_TYPES } from "../lib/settingsRules";
import { EMPTY_PARTY } from "../lib/truckingDocs";
import { load, stop } from "./truckingFakes";

const hub = { name: "Sklad Brandýs", street: "Skladová 1", postcode: "25001", city: "Brandýs nad Labem", country: "CZ" as const };
const consignment = (ref: string, over: Partial<DocConsignment> = {}): DocConsignment => ({
  ref,
  jobNumber: "CZ00000042",
  customerName: "Alfa s.r.o.",
  pickup: stop({ name: "Alfa s.r.o.", postcode: "11000", city: "Praha" }),
  delivery: stop({ name: "Beta s.r.o.", postcode: "60200", city: "Brno", street: "Nová 5" }),
  load: load({ pieces: 3, palletPlaces: 3, ldm: 1.2, weightKg: 900 }),
  ...over,
});
const trip = { ref: "LCZ2026000007", kind: "DELIVERY_RUN" as const, plannedPickupDate: "2026-10-16", tractorPlate: "1AB2345", trailerPlate: "", driverName: "Petr", driverPhone: "+420 1", buy: null };
const legs: DocLeg[] = [
  { kind: "DELIVERY", toText: "", toPostcode: "", consignment: consignment("TCZ2026000001") },
  {
    kind: "DELIVERY",
    toText: "",
    toPostcode: "",
    consignment: consignment("TCZ2026000002", { jobNumber: "CZ00000043", load: load({ pieces: 1, palletPlaces: 1, ldm: 0.4, weightKg: 300, adr: true, adrUn: "1263", adrClass: "3", adrPackingGroup: "II", tailLift: true }) }),
  },
];

describe("LTL documents", () => {
  it("the manifest lists every leg in stop order with totals and the vehicle's fill", () => {
    const cap = capacityOf(DEFAULT_VEHICLE_TYPES.find((v) => v.code === "solo_72_lift")!);
    const fill = tripFill([{ ldm: 1.6, weightKg: 1200, palletPlaces: 4 }], cap);
    const doc = manifestDoc({ language: "en", trip, ourCompany: EMPTY_PARTY, haulier: EMPTY_PARTY, vehicle: { label: "Solo truck 7.2 m with tail lift", tailLift: true }, capacity: cap, fill, hub, legs });
    expect(doc.tripKindLabel).toBe("Delivery run");
    expect(doc.from.name).toBe("Sklad Brandýs");
    expect(doc.from.postcode).toBe("250 01");
    expect(doc.to).toBeNull();
    expect(doc.rows.map((r) => [r.seq, r.consignmentRef, r.toPostcode, r.adr])).toEqual([
      [1, "TCZ2026000001", "602 00", null],
      [2, "TCZ2026000002", "602 00", "UN 1263, 3, II"],
    ]);
    expect(doc.rows[1]!.notes).toBe("tail lift");
    expect(doc.totals).toEqual({ pieces: 4, palletPlaces: 4, ldm: 1.6, weightKg: 1200 });
    expect(doc.capacityText).toBe("7.2 LDM / 9 000 kg — 22.2 % LDM, 13.3 % kg");
    expect(doc.vehicleText).toBe("Solo truck 7.2 m with tail lift, tail lift");
    expect(capacityText(null, fill)).toBe("");
  });

  it("a line haul's manifest runs from our warehouse to the partner's depot", () => {
    const lh = manifestDoc({
      language: "cs",
      trip: { ...trip, kind: "LINEHAUL" },
      ourCompany: EMPTY_PARTY,
      haulier: EMPTY_PARTY,
      vehicle: null,
      capacity: null,
      fill: tripFill([], null),
      hub,
      legs: [{ kind: "LINEHAUL", toText: "Gama depot, 702 00 Ostrava", toPostcode: "70200", consignment: consignment("TCZ2026000003") }],
    });
    expect(lh.tripKindLabel).toBe("Linková přeprava");
    expect(lh.to?.name).toBe("Gama depot, 702 00 Ostrava");
    expect(lh.to?.postcode).toBe("702 00");
  });

  it("labels: one per piece with n / N, or one per consignment", () => {
    const c = { ...consignment("TCZ2026000001"), serviceLabel: "+1 day", zoneLabel: "Brno" };
    const each = labelDocs([c], true);
    expect(each.map((l) => [l.pieceNo, l.pieceCount])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(each[0]).toMatchObject({ consignee: "Beta s.r.o.", toStreet: "Nová 5", toPostcode: "602 00", toCity: "Brno", zoneLabel: "Brno", serviceLabel: "+1 day", adr: false });
    expect(labelDocs([c], false)).toHaveLength(1);
    expect(labelDocs([c], false)[0]!.pieceNo).toBeNull();
  });

  it("the transport order of a run lists every stop and prints the ADR terms when any leg is ADR", () => {
    const doc = ltlTransportOrderDoc({
      language: "en",
      issuedAt: new Date("2026-10-15T08:00:00Z"),
      ourCompany: EMPTY_PARTY,
      haulier: EMPTY_PARTY,
      paymentDays: 30,
      trip,
      vehicle: null,
      hub,
      legs,
      pickupPin: null,
      podLink: null,
    });
    expect(doc.orderNumber).toBe("LCZ2026000007");
    expect(doc.pickup.name).toBe("Sklad Brandýs");
    expect(doc.stops.map((s) => [s.kind, s.consignmentRef, s.name])).toEqual([
      ["DELIVERY", "TCZ2026000001", "Beta s.r.o."],
      ["DELIVERY", "TCZ2026000002", "Beta s.r.o."],
    ]);
    expect(doc.totals).toEqual({ pieces: 4, palletPlaces: 4, ldm: 1.6, weightKg: 1200 });
    expect(doc.load.adr).toEqual({ un: "1263", className: "3", packingGroup: "II" });
    expect(doc.terms.some((t) => t.includes("dangerous goods"))).toBe(true);
    expect(doc.consignmentRef).toBe("TCZ2026000001, TCZ2026000002");
  });
});

describe("costs of LTL trips and partner deliveries", () => {
  const t = { id: "trip-1", ref: "LCZ2026000007", kind: "PICKUP_RUN" as const, haulierCustomerId: "h1", haulierName: "Bravo", priced: true };

  it("one buying line per job: its share of the trip, named with how many of the trip's consignments are the job's", () => {
    expect(tripJobCosts(t, { shipmentId: "s1", consignments: 3, shareCzk: 1234.56 }, 18)).toEqual({
      sourceRef: "trucking:trip:trip-1:job:s1",
      buying: [
        {
          chargeCode: "road_freight",
          description: "LCZ2026000007 pick-up run share (3 of 18 consignments)",
          qty: 1,
          unit: "trip",
          unitPrice: 1234.56,
          amount: 1234.56,
          currency: "CZK",
          vendor: "Bravo",
          haulierId: "h1",
        },
      ],
      selling: [],
    });
    expect(tripJobCosts({ ...t, priced: false }, { shipmentId: "s1", consignments: 1, shareCzk: 0 }, 1).buying).toEqual([]);
  });

  it("a partner's delivery has its own lines", () => {
    const buy = { source: "MANUAL" as const, tariffId: null, tariffVersionId: null, versionNo: null, tariffName: "", serviceLevel: null, currency: "CZK" as const, total: 450, totalCzk: 450, lines: [{ code: "AGREED", label: "Agreed price", qty: 1, unit: "trip", unitPrice: 450, amount: 450 }], ratedAt: "", overrideReason: "deal" };
    const p = partnerLegCosts({ id: "leg-1", buy }, "TCZ2026000001", { id: "h2", name: "Gama" });
    expect(p.sourceRef).toBe("trucking:leg:leg-1");
    expect(p.buying[0]).toMatchObject({ description: "TCZ2026000001 partner delivery · Agreed price", amount: 450, vendor: "Gama", haulierId: "h2" });
  });
});
