import { describe, expect, it } from "vitest";
import type { ConsignmentDetail, Leg, PlanningLeg, PlanningTrip, TripDetail } from "@/hooks/useTruckingConsignments";
import {
  DEADLINE_BADGE,
  addLegsWarnings,
  depotSites,
  dropStop,
  emptyPriceForm,
  groupLegsByZone,
  ltlTripRateRequest,
  legTimeline,
  ltlTripOrderActions,
  moveStop,
  openTrips,
  orderChanged,
  priceInput,
  priceProblems,
  projectedFill,
  stopDeadline,
  promisedText,
  tripFillPercent,
  tripFillTone,
  vehicleCapacity,
  warningSummary,
  planningDayOf,
  planningHref,
} from "./planning";

const leg = (id: string, extra: Partial<PlanningLeg> = {}): PlanningLeg => ({
  legId: id,
  kind: "DELIVERY",
  status: "OPEN",
  seq: 1,
  consignmentId: `c-${id}`,
  consignmentRef: `TCZ${id}`,
  jobNumber: "R2026001",
  customerName: "ACME",
  fromText: "Our warehouse",
  toText: "Brno",
  fromPostcode: "25301",
  fromCity: "Hostivice",
  toPostcode: "60200",
  toCity: "Brno",
  zoneLabel: "Zone 3",
  serviceLevel: "D1",
  pieces: 2,
  palletPlaces: 2,
  ldm: 0.8,
  weightKg: 500,
  chargeableKg: 600,
  adr: false,
  tailLift: false,
  pickupDate: "2026-10-15",
  promisedDate: "2026-10-16",
  promisedFinal: false,
  deadline: "later",
  ...extra,
});

describe("stopDeadline", () => {
  it("flags a stop promised before or on the trip's day", () => {
    expect(stopDeadline("2026-10-15", "2026-10-16")).toBe("overdue");
    expect(stopDeadline("2026-10-16", "2026-10-16")).toBe("today");
    expect(stopDeadline("2026-10-17", "2026-10-16")).toBeNull();
    expect(stopDeadline(null, "2026-10-16")).toBeNull();
  });
});

describe("deadline badges", () => {
  it("are red for overdue and today, amber for tomorrow, plain later", () => {
    expect(DEADLINE_BADGE.overdue.tone).toBe("r");
    expect(DEADLINE_BADGE.today.tone).toBe("r");
    expect(DEADLINE_BADGE.tomorrow.tone).toBe("a");
    expect(DEADLINE_BADGE.later.tone).toBe("");
  });
});

describe("groupLegsByZone", () => {
  it("groups by zone (no zone last), the most urgent first, with totals", () => {
    const groups = groupLegsByZone([
      leg("1", { zoneLabel: "Zone 10" }),
      leg("2", { zoneLabel: "" }),
      leg("3", { zoneLabel: "Zone 2", deadline: "tomorrow" }),
      leg("4", { zoneLabel: "Zone 2", deadline: "overdue", promisedDate: "2026-10-14" }),
      leg("5", { zoneLabel: "Zone 2", deadline: "tomorrow", promisedDate: "2026-10-15" }),
    ]);
    expect(groups.map((g) => g.zone)).toEqual(["Zone 2", "Zone 10", "No zone"]);
    expect(groups[0]!.legs.map((l) => l.legId)).toEqual(["4", "5", "3"]);
    expect(groups[0]).toMatchObject({ palletPlaces: 6, ldm: 2.4, weightKg: 1500, deadline: "overdue" });
  });

  it("is empty for no legs", () => {
    expect(groupLegsByZone([])).toEqual([]);
  });
});

describe("trip fill", () => {
  it("takes the fuller of LDM and kg for the colour", () => {
    expect(tripFillPercent({ ldmPercent: 40, kgPercent: 95 })).toBe(95);
    expect(tripFillTone({ ldmPercent: 40, kgPercent: 95 })).toBe("bg-amber-500");
    expect(tripFillTone({ ldmPercent: 104, kgPercent: 20 })).toBe("bg-red-500");
    expect(tripFillTone({ ldmPercent: 50, kgPercent: 60 })).toBe("bg-indigo-500");
    expect(tripFillPercent({ ldmPercent: null, kgPercent: null })).toBeNull();
    expect(tripFillTone({ ldmPercent: null, kgPercent: null })).toBe("bg-slate-200");
  });

  it("projects the fill with more legs", () => {
    const fill = projectedFill({ ldm: 12, kg: 20000, palletPlaces: 30 }, [leg("1", { ldm: 2, weightKg: 1000, palletPlaces: 4 })], { ldm: 13.6, kg: 24000, palletPlaces: 33 });
    expect(fill).toEqual({ ldm: 14, kg: 21000, palletPlaces: 34, ldmPercent: 103, kgPercent: 88 });
    expect(projectedFill({ ldm: 1, kg: 1, palletPlaces: 1 }, [], null).ldmPercent).toBeNull();
  });
});

describe("addLegsWarnings", () => {
  const ctx = { capacity: { ldm: 13.6, kg: 24000, palletPlaces: 33 }, vehicleTailLift: false, haulierAdr: false, tripDate: "2026-10-16" };

  it("says what goes over and what the trip lacks, never refusing", () => {
    const w = addLegsWarnings({ ldm: 13, kg: 23800, palletPlaces: 32 }, [leg("1", { adr: true, tailLift: true, promisedDate: "2026-10-15", consignmentRef: "TCZ1" })], ctx);
    expect(w).toEqual([
      "Over capacity: 13.8 of 13.6 LDM",
      "Over capacity: 24 300 of 24 000 kg",
      "Over capacity: 34 of 33 pallet places",
      "TCZ1: ADR on a haulier without ADR",
      "TCZ1: tail-lift needed, the vehicle has none",
      "TCZ1: promised 15.10.2026, before the trip",
    ]);
  });

  it("is empty when it fits and nothing is unknown-bad", () => {
    expect(addLegsWarnings({ ldm: 1, kg: 100, palletPlaces: 1 }, [leg("1")], { ...ctx, vehicleTailLift: null, haulierAdr: null })).toEqual([]);
  });

  it("summarises a list for a card", () => {
    expect(warningSummary([])).toBeNull();
    expect(warningSummary(["A"])).toBe("A");
    expect(warningSummary(["A", "B", "C"])).toBe("A +2");
  });
});

describe("stop order", () => {
  it("moves and drops stops", () => {
    expect(moveStop(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveStop(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(dropStop(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(orderChanged(["a", "b"], ["a", "b"])).toBe(false);
    expect(orderChanged(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("offers only trips that can still take legs", () => {
    const t = (id: string, status: PlanningTrip["status"]) => ({ id, status }) as PlanningTrip;
    expect(openTrips([t("1", "DRAFT"), t("2", "IN_TRANSIT"), t("3", "CONFIRMED"), t("4", "DONE")]).map((x) => x.id)).toEqual(["1", "3"]);
  });
});

describe("legTimeline", () => {
  const l = (kind: Leg["kind"], extra: Partial<Leg> = {}): Leg => ({
    id: kind,
    consignmentId: "c1",
    seq: 1,
    kind,
    fromText: "",
    toText: "",
    tripId: null,
    tripRef: null,
    haulierCustomerId: null,
    depotSiteId: null,
    buy: null,
    costShareCzk: null,
    status: "OPEN",
    ...extra,
  });
  type Input = Parameters<typeof legTimeline>[0];
  const base: Input = { status: "PLANNED", legs: [], selfDelivered: false, lastMile: "OWN_RUN", gateInAt: null };

  it("runs pick-up → warehouse → delivery with trips, the first open step current", () => {
    const steps = legTimeline({ ...base, legs: [l("PICKUP", { tripId: "t1", tripRef: "LCZ1", status: "PLANNED" }), l("DELIVERY")] });
    expect(steps.map((s) => `${s.key}:${s.state}`)).toEqual(["pickup:current", "hub:waiting", "delivery:waiting"]);
    expect(steps[0]).toMatchObject({ detail: "Pick-up run", tripId: "t1", tripRef: "LCZ1" });
    expect(steps[2]!.detail).toBe("Delivery run — not planned");
  });

  it("adds the line haul and the partner network, the gate-in time from the warehouse", () => {
    const steps = legTimeline({
      ...base,
      status: "ON_LINEHAUL",
      lastMile: "PARTNER",
      gateInAt: "2026-10-15T07:30:00Z",
      legs: [l("PICKUP", { status: "DONE" }), l("LINEHAUL", { tripId: "t2", toText: "Ostrava depot" }), l("DELIVERY")],
    });
    expect(steps.map((s) => `${s.key}:${s.state}`)).toEqual(["pickup:done", "hub:done", "linehaul:current", "delivery:waiting"]);
    expect(steps[1]!.at).toBe("2026-10-15T07:30:00Z");
    expect(steps[2]).toMatchObject({ detail: "To Ostrava depot", tripId: "t2" });
    expect(steps[3]).toMatchObject({ detail: "Partner network", tripId: null });
  });

  it("marks the pick-up skipped when the customer brings the goods", () => {
    const steps = legTimeline({ ...base, status: "AT_HUB", selfDelivered: true, gateInAt: "2026-10-15T07:30:00Z", legs: [l("DELIVERY")] });
    expect(steps.map((s) => `${s.key}:${s.state}`)).toEqual(["pickup:skipped", "hub:done", "delivery:current"]);
    expect(steps[0]!.detail).toBe("Customer brings the goods to our warehouse");
  });

  it("is all done once delivered", () => {
    const steps = legTimeline({ ...base, status: "POD_RECEIVED", gateInAt: "x", legs: [l("PICKUP"), l("DELIVERY")] });
    expect(steps.every((s) => s.state === "done")).toBe(true);
  });
});

describe("promisedText", () => {
  type Input = Pick<ConsignmentDetail, "scope" | "promisedDate" | "promisedFinal">;
  it("says Estimated for LTL until the gate-in", () => {
    expect(promisedText({ scope: "LTL", promisedDate: "2026-10-19", promisedFinal: false } as Input)).toEqual({
      text: "19.10.2026",
      estimated: true,
      note: "Estimated until the warehouse confirms the gate-in",
    });
    expect(promisedText({ scope: "LTL", promisedDate: "2026-10-19", promisedFinal: true } as Input).estimated).toBe(false);
    expect(promisedText({ scope: "FTL", promisedDate: "2026-10-19", promisedFinal: false } as Input).estimated).toBe(false);
    expect(promisedText({ scope: "FTL", promisedDate: null, promisedFinal: false } as Input).text).toBe("Agreed per order");
  });
});

describe("prices and depots", () => {
  it("checks an agreed price and sends it trimmed", () => {
    expect(priceProblems(emptyPriceForm())).toEqual([]);
    expect(priceProblems({ ...emptyPriceForm(), source: "MANUAL" })).toEqual(["Agreed price: the total", "Agreed price: why the tariff is not used"]);
    expect(priceInput({ source: "MANUAL", total: 900, currency: "EUR", reason: " spot " })).toEqual({ source: "MANUAL", total: 900, currency: "EUR", reason: "spot" });
    expect(priceInput(emptyPriceForm())).toEqual({ source: "TARIFF" });
  });

  it("offers a partner's delivery sites as depots", () => {
    expect(depotSites([{ id: "a", kind: "loading" }, { id: "b", kind: "delivery" }, { id: "c", kind: "both" }]).map((s) => s.id)).toEqual(["b", "c"]);
  });
});

describe("vehicleCapacity", () => {
  it("reads the capacity of a vehicle type", () => {
    const types = [{ code: "solo", capacityLdm: 7.2, capacityKg: 9000, palletPlaces: 18 }];
    expect(vehicleCapacity(types, "solo")).toEqual({ ldm: 7.2, kg: 9000, palletPlaces: 18 });
    expect(vehicleCapacity(types, "x")).toBeNull();
    expect(vehicleCapacity(types, null)).toBeNull();
  });
});

describe("ltlTripRateRequest", () => {
  it("prices the legs together from the customer end to our warehouse for a pick-up run", () => {
    const req = ltlTripRateRequest("PICKUP_RUN", [leg("1", { fromPostcode: "60200", adr: true }), leg("2", { palletPlaces: 1, ldm: 0.4, weightKg: 250 })], "25301", "2026-10-16");
    expect(req).toMatchObject({ fromPostcode: "60200", toPostcode: "25301", scope: "LTL", pieces: 2, palletPlaces: 3, ldm: 1.2, weightKg: 750, includeBuy: true });
    expect(req.extras.adr).toBe(true);
  });

  it("leaves the warehouse on a line haul, priced as LINEHAUL", () => {
    const req = ltlTripRateRequest("LINEHAUL", [leg("1", { toPostcode: "70030" })], "25301", "2026-10-16");
    expect(req).toMatchObject({ fromPostcode: "25301", toPostcode: "70030", scope: "LINEHAUL" });
  });
});

describe("ltlTripOrderActions", () => {
  type Input = Parameters<typeof ltlTripOrderActions>[0];
  const t = (extra: Partial<Input> = {}): Input => ({ status: "DRAFT", haulierStatus: "ok", legs: [{ legId: "l1" } as TripDetail["legs"][number]], transportOrder: null, ...extra });

  it("prints and sends a draft with legs, confirms once ordered", () => {
    expect(ltlTripOrderActions(t())).toEqual({
      printOrder: { allowed: true, reason: "" },
      sendOrder: { allowed: true, reason: "" },
      recordConfirmation: { allowed: false, reason: "Record the transport order as sent first" },
    });
    expect(ltlTripOrderActions(t({ status: "ORDERED" })).recordConfirmation.allowed).toBe(true);
    expect(ltlTripOrderActions(t({ status: "IN_TRANSIT" })).sendOrder.reason).toBe("Already on its way");
  });

  it("refuses an empty trip, a blocked haulier and a closed trip", () => {
    expect(ltlTripOrderActions(t({ legs: [] })).printOrder.reason).toBe("No legs on the trip");
    expect(ltlTripOrderActions(t({ haulierStatus: "blocked" })).sendOrder.allowed).toBe(false);
    expect(ltlTripOrderActions(t({ status: "DONE" })).printOrder.reason).toBe("The trip is closed");
  });
});

describe("planning day in the address", () => {
  it("opens the day a link names and falls back to today for anything else", () => {
    expect(planningDayOf("2026-10-23", "2026-10-16")).toBe("2026-10-23");
    expect(planningDayOf(null, "2026-10-16")).toBe("2026-10-16");
    expect(planningDayOf("2026-02-30", "2026-10-16")).toBe("2026-10-16");
    expect(planningDayOf("friday", "2026-10-16")).toBe("2026-10-16");
  });

  it("links to the Planning tab on a day", () => {
    expect(planningHref("2026-10-23")).toBe("/trucking?tab=planning&date=2026-10-23");
    expect(planningHref(null)).toBe("/trucking?tab=planning");
  });
});
