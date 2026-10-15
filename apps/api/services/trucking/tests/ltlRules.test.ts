import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import {
  capacityOf,
  cleanHub,
  cleanLtlChoice,
  deadlineOf,
  EMPTY_HUB,
  gateChange,
  hubPlace,
  legEnds,
  legKindsFor,
  ltlPromise,
  ltlStampRefusal,
  ltlStatus,
  ltlTripStatus,
  neededBy,
  nextStopOrder,
  tripFill,
  tripWarnings,
  type LtlFacts,
} from "../lib/ltlRules";
import { DEFAULT_SERVICE_LEVELS, DEFAULT_VEHICLE_TYPES } from "../lib/settingsRules";
import { stop } from "./truckingFakes";

const D1 = DEFAULT_SERVICE_LEVELS.find((l) => l.code === "D1")!;
const D2 = DEFAULT_SERVICE_LEVELS.find((l) => l.code === "D2")!;
const at = (iso: string) => new Date(iso);

const facts = (over: Partial<LtlFacts> = {}): LtlFacts => ({
  cancelledAt: null,
  pickedUpAt: null,
  gateInAt: null,
  gateOutAt: null,
  deliveredAt: null,
  podReceivedAt: null,
  readyToBillAt: null,
  legs: [
    { kind: "PICKUP", status: "OPEN", orderSent: false },
    { kind: "DELIVERY", status: "OPEN", orderSent: false },
  ],
  ...over,
});

describe("our warehouse (hub)", () => {
  it("is empty until set, and a set hub needs the name, a CZ postcode and the city", () => {
    expect(cleanHub(undefined)).toEqual(EMPTY_HUB);
    expect(cleanHub({ ...EMPTY_HUB })).toEqual(EMPTY_HUB);
    expect(cleanHub({ name: " Sklad ", street: "Skladová 1", postcode: "250 01", city: "Brandýs", country: "CZ" })).toEqual({
      name: "Sklad",
      street: "Skladová 1",
      postcode: "25001",
      city: "Brandýs",
      country: "CZ",
    });
    expect(() => cleanHub({ name: "Sklad", street: "", postcode: "", city: "Brno", country: "CZ" })).toThrow(/name, postcode and city/);
    expect(() => cleanHub({ name: "Sklad", street: "", postcode: "12", city: "Brno", country: "CZ" })).toThrow(/CZ postcode/);
    expect(hubPlace(EMPTY_HUB)).toEqual({ text: "Our warehouse", postcode: "" });
  });
});

describe("legs of an LTL consignment", () => {
  it("has a pick-up unless the customer brings the goods, a line haul only to a partner's depot that is not the hub, and the delivery", () => {
    expect(legKindsFor({ selfDelivered: false, lastMile: "OWN_RUN" }, true)).toEqual(["PICKUP", "DELIVERY"]);
    expect(legKindsFor({ selfDelivered: true, lastMile: "OWN_RUN" }, true)).toEqual(["DELIVERY"]);
    expect(legKindsFor({ selfDelivered: false, lastMile: "PARTNER" }, true)).toEqual(["PICKUP", "DELIVERY"]);
    expect(legKindsFor({ selfDelivered: false, lastMile: "PARTNER" }, false)).toEqual(["PICKUP", "LINEHAUL", "DELIVERY"]);
  });

  it("runs pick-up → our warehouse → depot → consignee", () => {
    const c = { pickup: stop({ name: "Alfa", postcode: "11000", city: "Praha" }), delivery: stop({ name: "Beta", postcode: "60200", city: "Brno" }) };
    const hub = { text: "Sklad, 250 01 Brandýs", postcode: "25001" };
    const depot = { text: "Gama depot, 70030 Ostrava", postcode: "70030" };
    expect(legEnds("PICKUP", c, hub, null)).toEqual({ from: { text: "Alfa, 110 00 Praha", postcode: "11000" }, to: hub });
    expect(legEnds("LINEHAUL", c, hub, depot)).toEqual({ from: hub, to: depot });
    expect(legEnds("DELIVERY", c, hub, depot).from).toEqual(depot);
    expect(legEnds("DELIVERY", c, hub, null)).toEqual({ from: hub, to: { text: "Beta, 602 00 Brno", postcode: "60200" } });
  });

  it("keeps the partner only for a partner last mile", () => {
    const partner = "00000000-0000-0000-0000-0000000000a1";
    expect(cleanLtlChoice({ lastMile: "PARTNER", partnerHaulierCustomerId: partner })).toEqual({ selfDelivered: false, lastMile: "PARTNER", partnerHaulierCustomerId: partner });
    expect(cleanLtlChoice({ lastMile: "OWN_RUN", partnerHaulierCustomerId: partner }).partnerHaulierCustomerId).toBeNull();
    expect(cleanLtlChoice({}).lastMile).toBe("OWN_RUN");
    expect(() => cleanLtlChoice({ lastMile: "DRONE" })).toThrow();
  });
});

describe("LTL consignment status", () => {
  it("walks BOOKED → PLANNED → ORDERED → PICKED_UP → AT_HUB → OUT_FOR_DELIVERY → DELIVERED → POD → READY_TO_BILL", () => {
    expect(ltlStatus(facts())).toBe("BOOKED");
    const oneOpen = facts({ legs: [{ kind: "PICKUP", status: "PLANNED", orderSent: false }, { kind: "DELIVERY", status: "OPEN", orderSent: false }] });
    expect(ltlStatus(oneOpen)).toBe("BOOKED");
    const planned = facts({ legs: [{ kind: "PICKUP", status: "PLANNED", orderSent: false }, { kind: "DELIVERY", status: "PLANNED", orderSent: false }] });
    expect(ltlStatus(planned)).toBe("PLANNED");
    const ordered = { ...planned, legs: [{ ...planned.legs[0]!, orderSent: true }, planned.legs[1]!] };
    expect(ltlStatus(ordered)).toBe("ORDERED");
    expect(ltlStatus({ ...ordered, pickedUpAt: at("2026-10-15T08:00:00Z") })).toBe("PICKED_UP");
    const atHub = { ...ordered, pickedUpAt: at("2026-10-15T08:00:00Z"), gateInAt: at("2026-10-15T14:00:00Z") };
    expect(ltlStatus(atHub)).toBe("AT_HUB");
    expect(ltlStatus({ ...atHub, gateOutAt: at("2026-10-16T06:00:00Z") })).toBe("OUT_FOR_DELIVERY");
    expect(ltlStatus({ ...atHub, gateOutAt: at("2026-10-16T06:00:00Z"), deliveredAt: at("2026-10-16T10:00:00Z") })).toBe("DELIVERED");
    expect(ltlStatus({ ...atHub, deliveredAt: at("2026-10-16T10:00:00Z"), podReceivedAt: at("2026-10-16T11:00:00Z") })).toBe("POD_RECEIVED");
    expect(ltlStatus({ ...atHub, podReceivedAt: at("2026-10-16T11:00:00Z"), readyToBillAt: at("2026-10-16T11:00:00Z") })).toBe("READY_TO_BILL");
    expect(ltlStatus({ ...atHub, cancelledAt: at("2026-10-16T11:00:00Z") })).toBe("CANCELLED");
  });

  it("goes ON_LINEHAUL at the gate-out when a line haul follows; a consignment brought by the customer goes PLANNED → AT_HUB", () => {
    const viaDepot = facts({
      legs: [
        { kind: "PICKUP", status: "DONE", orderSent: true },
        { kind: "LINEHAUL", status: "PLANNED", orderSent: false },
        { kind: "DELIVERY", status: "PLANNED", orderSent: false },
      ],
      gateInAt: at("2026-10-15T14:00:00Z"),
      gateOutAt: at("2026-10-16T05:00:00Z"),
    });
    expect(ltlStatus(viaDepot)).toBe("ON_LINEHAUL");
    const brought = facts({ legs: [{ kind: "DELIVERY", status: "PLANNED", orderSent: false }] });
    expect(ltlStatus(brought)).toBe("PLANNED");
    expect(ltlStatus({ ...brought, gateInAt: at("2026-10-15T09:00:00Z") })).toBe("AT_HUB");
  });

  it("an LTL trip: DRAFT → ORDERED → CONFIRMED → IN_TRANSIT (departed) → DONE (arrived)", () => {
    const t = { cancelledAt: null, orderSentAt: null, confirmedAt: null, departedAt: null, arrivedAt: null };
    const now = at("2026-10-15T08:00:00Z");
    expect(ltlTripStatus(t)).toBe("DRAFT");
    expect(ltlTripStatus({ ...t, orderSentAt: now })).toBe("ORDERED");
    expect(ltlTripStatus({ ...t, orderSentAt: now, confirmedAt: now })).toBe("CONFIRMED");
    expect(ltlTripStatus({ ...t, orderSentAt: now, departedAt: now })).toBe("IN_TRANSIT");
    expect(ltlTripStatus({ ...t, orderSentAt: now, departedAt: now, arrivedAt: now })).toBe("DONE");
    expect(ltlTripStatus({ ...t, arrivedAt: now, cancelledAt: now })).toBe("CANCELLED");
  });

  it("stamps of an LTL consignment: no own confirmation, no pick-up when brought, delivery after the gate-in", () => {
    const c = { cancelledAt: null, selfDelivered: false, gateInAt: null, deliveredAt: null };
    const opts = { hasPod: false, manager: false };
    expect(ltlStampRefusal("confirmed", c, [], opts)).toMatch(/trip's transport order/);
    expect(ltlStampRefusal("pickedUp", c, [{ kind: "PICKUP", orderSent: false }], opts)).toMatch(/pick-up run's transport order/);
    expect(ltlStampRefusal("pickedUp", c, [{ kind: "PICKUP", orderSent: true }], opts)).toBeNull();
    expect(ltlStampRefusal("pickedUp", { ...c, selfDelivered: true }, [], opts)).toMatch(/customer brings/);
    expect(ltlStampRefusal("delivered", c, [], opts)).toMatch(/no gate-in/);
    expect(ltlStampRefusal("delivered", { ...c, gateInAt: at("2026-10-15T08:00:00Z") }, [], opts)).toBeNull();
    expect(ltlStampRefusal("podReceived", { ...c, deliveredAt: at("2026-10-15T08:00:00Z") }, [], opts)).toMatch(/Upload the POD/);
  });
});

describe("LTL promised date", () => {
  it("is an estimate from the planned pick-up day before the gate-in", () => {
    // Thu 15 Oct 2026, D1 → Fri 16 Oct
    expect(ltlPromise(D1, null, "2026-10-15", [])).toEqual({ promisedDate: "2026-10-16", final: false });
  });

  it("counts D+N working days from the confirmed gate-in; after the cut-off from the next working day", () => {
    // 15 Oct 2026 11:30 Prague (before the 12:00 cut-off) → D1 = Fri 16 Oct
    expect(ltlPromise(D1, at("2026-10-15T09:30:00Z"), "2026-10-14", [])).toEqual({ promisedDate: "2026-10-16", final: true });
    // 15 Oct 2026 12:30 Prague (after the cut-off) → counted from Fri 16 → D1 = Mon 19 Oct
    expect(ltlPromise(D1, at("2026-10-15T10:30:00Z"), "2026-10-14", [])).toEqual({ promisedDate: "2026-10-19", final: true });
    // Fri 23 Oct 2026 gate-in, D2 → Tue 27 Oct; 28 Oct is a holiday (Wed) so a D3 is Thu 29 Oct
    expect(ltlPromise(D2, at("2026-10-23T08:00:00Z"), "2026-10-23", [])!.promisedDate).toBe("2026-10-27");
    expect(ltlPromise({ ...D2, workingDays: 3, code: "D3" }, at("2026-10-23T08:00:00Z"), "2026-10-23", [])!.promisedDate).toBe("2026-10-29");
  });

  it("gives no date without a level or for a date agreed per order", () => {
    expect(ltlPromise(null, null, "2026-10-15", [])).toBeNull();
    expect(ltlPromise({ ...D1, code: "EXP_FIXED" }, null, "2026-10-15", [])).toBeNull();
  });
});

describe("planning board deadlines", () => {
  it("a pick-up is due on the pick-up date, a delivery on the promised date", () => {
    const c = { pickupDate: "2026-10-15", promisedDate: "2026-10-17" };
    expect(neededBy("PICKUP", c)).toBe("2026-10-15");
    expect(neededBy("DELIVERY", c)).toBe("2026-10-17");
    expect(neededBy("DELIVERY", { ...c, promisedDate: null })).toBe("2026-10-15");
    expect(deadlineOf("2026-10-14", "2026-10-15")).toBe("overdue");
    expect(deadlineOf("2026-10-15", "2026-10-15")).toBe("today");
    expect(deadlineOf("2026-10-16", "2026-10-15")).toBe("tomorrow");
    expect(deadlineOf("2026-10-20", "2026-10-15")).toBe("later");
  });
});

describe("trip fill and warnings", () => {
  const tautliner = capacityOf(DEFAULT_VEHICLE_TYPES.find((v) => v.code === "tautliner_136")!)!;
  const van = capacityOf(DEFAULT_VEHICLE_TYPES.find((v) => v.code === "van")!)!;
  const leg = (over: Partial<{ consignmentRef: string; adr: boolean; tailLift: boolean; promisedDate: string | null }> = {}) => ({
    consignmentRef: "TCZ2026000001",
    adr: false,
    tailLift: false,
    promisedDate: "2026-10-20",
    ...over,
  });

  it("adds up LDM, kg and pallet places against the vehicle", () => {
    const fill = tripFill(
      [
        { ldm: 4, weightKg: 6000, palletPlaces: 10 },
        { ldm: 7.2, weightKg: 3840, palletPlaces: 17 },
      ],
      tautliner,
    );
    expect(fill).toEqual({ ldm: 11.2, kg: 9840, palletPlaces: 27, ldmPercent: 82.4, kgPercent: 41 });
    expect(tripFill([{ ldm: 1, weightKg: 1, palletPlaces: 1 }], null).ldmPercent).toBeNull();
  });

  it("warns (never blocks) over capacity, ADR on a haulier without ADR, a promise the trip cannot keep, and a tail lift missing", () => {
    const fill = tripFill([{ ldm: 3.5, weightKg: 1300, palletPlaces: 7 }], van);
    const warnings = tripWarnings({
      kind: "PICKUP_RUN",
      date: "2026-10-15",
      capacity: van,
      fill,
      haulierName: "Bravo",
      haulierAdrCapable: false,
      legs: [leg({ adr: true }), leg({ consignmentRef: "TCZ2026000002", promisedDate: "2026-10-15", tailLift: true })],
    });
    expect(warnings).toEqual([
      "Over capacity: 3.5 of 3 LDM",
      "Over capacity: 1 300 of 1 200 kg",
      "Over capacity: 7 of 6 pallet places",
      "TCZ2026000001 is ADR goods and Bravo is not ADR-capable",
      "TCZ2026000002 is promised for 15 Oct 2026, before this trip can get it there (16 Oct 2026)",
      "TCZ2026000002 needs a tail lift and the Van has none",
    ]);
    const ok = tripWarnings({ kind: "DELIVERY_RUN", date: "2026-10-15", capacity: tautliner, fill, haulierName: "Bravo", haulierAdrCapable: true, legs: [leg({ adr: true, promisedDate: "2026-10-15" })] });
    expect(ok).toEqual([]);
  });

  it("keeps the stop order, drops removed legs, puts new legs last; a given order must name every leg once", () => {
    expect(nextStopOrder(["a", "b", "c"], ["c", "a", "d"], null)).toEqual(["a", "c", "d"]);
    expect(nextStopOrder(["a", "b"], ["a", "b"], ["b", "a"])).toEqual(["b", "a"]);
    expect(() => nextStopOrder(["a", "b"], ["a", "b"], ["a"])).toThrow(/every leg/);
    expect(() => nextStopOrder(["a", "b"], ["a", "b"], ["a", "a"])).toThrow(/every leg/);
  });
});

describe("the warehouse's gate", () => {
  const base = { selfDelivered: false, gateInAt: null, gateOutAt: null, deliveredAt: null, pickupOpen: true };
  const t = at("2026-10-15T12:00:00Z");

  it("gate-in lands on a consignment with its pick-up open or brought by the customer, once", () => {
    expect(gateChange("gateIn", "gateIn", t, base)).toEqual({ gateInAt: t });
    expect(gateChange("gateIn", "gateIn", t, { ...base, pickupOpen: false })).toBeNull();
    expect(gateChange("gateIn", "gateIn", t, { ...base, pickupOpen: false, selfDelivered: true })).toEqual({ gateInAt: t });
    expect(gateChange("gateIn", "gateIn", t, { ...base, gateInAt: t })).toBeNull();
  });

  it("gate-out follows the gate-in and comes before the delivery", () => {
    expect(gateChange("gateOut", "gateOut", t, base)).toBeNull();
    expect(gateChange("gateOut", "gateOut", t, { ...base, gateInAt: t })).toEqual({ gateOutAt: t });
    expect(gateChange("gateOut", "gateOut", t, { ...base, gateInAt: t, deliveredAt: t })).toBeNull();
  });

  it("a voided stamp is taken back, the later step first", () => {
    expect(gateChange("voided", "gateOut", t, { ...base, gateInAt: t, gateOutAt: t })).toEqual({ gateOutAt: null });
    expect(gateChange("voided", "gate_in", t, { ...base, gateInAt: t })).toEqual({ gateInAt: null });
    expect(gateChange("voided", "gateIn", t, { ...base, gateInAt: t, gateOutAt: t })).toBeNull();
    expect(gateChange("voided", "impRelease", t, { ...base, gateInAt: t })).toBeNull();
  });
});
