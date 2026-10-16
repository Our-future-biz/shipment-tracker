import { describe, expect, it } from "vitest";
import type { ConsignmentDetail, ConsignmentStatus, TripDetail } from "@/hooks/useTruckingConsignments";
import {
  CONSIGNMENT_CHIPS,
  CONSIGNMENT_FLOW,
  CONSIGNMENT_STATUS_CHIP,
  CONSIGNMENT_TILES,
  TRIP_STATUS_CHIP,
  attentionSummary,
  consignmentActions,
  consignmentLifecycle,
  consignmentViewOf,
  jobConsignmentsHref,
  loadText,
  marginState,
  buyLabel,
  buySource,
  marginText,
  nextStep,
  reasonsBesideNotices,
  stampKindsFor,
  routeText,
  stampTimeProblem,
} from "./consignments";
import { formatPsc } from "./hauliers";

const NO_STAMPS = { confirmed: null, pickedUp: null, delivered: null, podReceived: null };
const MANAGER = { canCancel: true, canApproveMargin: true, canVoidStamp: true };
const USER = { canCancel: false, canApproveMargin: false, canVoidStamp: false };

type ActionInput = Parameters<typeof consignmentActions>[0];
const consignment = (status: ConsignmentStatus, extra: Partial<ActionInput> = {}): ActionInput => ({
  status,
  tripId: status === "BOOKED" ? null : "trip-1",
  belowFloor: false,
  marginApproved: false,
  permissions: USER,
  ...extra,
});
const trip = (extra: Partial<TripDetail> = {}) =>
  ({ status: "ORDERED", haulierStatus: "ok", haulierIssues: [], transportOrder: null, ...extra }) as Pick<TripDetail, "status" | "haulierStatus" | "haulierIssues" | "transportOrder">;

describe("status chips", () => {
  it("name every consignment and trip status", () => {
    expect(Object.keys(CONSIGNMENT_STATUS_CHIP)).toHaveLength(12);
    expect(CONSIGNMENT_STATUS_CHIP.AT_HUB.label).toBe("At our warehouse");
    expect(CONSIGNMENT_STATUS_CHIP.POD_RECEIVED.label).toBe("POD received");
    expect(CONSIGNMENT_STATUS_CHIP.CANCELLED.tone).toBe("r");
    expect(TRIP_STATUS_CHIP.IN_TRANSIT.label).toBe("In transit");
  });
});

describe("consignmentLifecycle", () => {
  const base = { createdAt: "2026-10-14T08:00:00Z", stamps: NO_STAMPS, tripId: null, podReceivedAt: null } as Pick<ConsignmentDetail, "createdAt" | "stamps" | "tripId" | "podReceivedAt">;

  it("ticks every step up to the status, with the stamp times", () => {
    const l = consignmentLifecycle({ ...base, status: "PICKED_UP", tripId: "t", stamps: { ...NO_STAMPS, pickedUp: { at: "2026-10-15T09:00:00Z", by: "Jana" } } });
    expect(l.steps.map((s) => s.done)).toEqual([true, true, true, true, true, false, false, false]);
    expect(l.steps[4]).toMatchObject({ label: "Picked up", at: "2026-10-15T09:00:00Z" });
    expect(l.at).toBe("2026-10-15T09:00:00Z");
    expect(l.steps).toHaveLength(CONSIGNMENT_FLOW.length);
  });

  it("takes the order's sent time from the trip", () => {
    const l = consignmentLifecycle({ ...base, status: "ORDERED", tripId: "t" }, { transportOrder: { sentAt: "2026-10-14T10:00:00Z", confirmedAt: null } as TripDetail["transportOrder"] });
    expect(l.steps[2]).toMatchObject({ stage: "ORDERED", at: "2026-10-14T10:00:00Z", done: true });
  });

  it("keeps what a cancelled consignment reached", () => {
    const l = consignmentLifecycle({ ...base, status: "CANCELLED", tripId: "t" });
    expect(l.label).toBe("Cancelled");
    expect(l.steps.filter((s) => s.done).map((s) => s.stage)).toEqual(["BOOKED", "PLANNED"]);
  });
});

describe("consignmentActions", () => {
  it("plans a trip only for a booked consignment", () => {
    expect(consignmentActions(consignment("BOOKED"), null, false).planTrip.allowed).toBe(true);
    expect(consignmentActions(consignment("PLANNED"), trip({ status: "DRAFT" }), false).planTrip).toEqual({ allowed: false, reason: "Already on a trip" });
  });

  it("refuses the transport order while the margin is below the floor and not approved", () => {
    const a = consignmentActions(consignment("PLANNED", { belowFloor: true }), trip({ status: "DRAFT" }), false);
    expect(a.sendOrder.allowed).toBe(false);
    expect(a.printOrder.reason).toMatch(/manager must approve/);
    expect(consignmentActions(consignment("PLANNED", { belowFloor: true, marginApproved: true }), trip({ status: "DRAFT" }), false).sendOrder.allowed).toBe(true);
  });

  it("refuses the transport order to a blocked haulier, saying why", () => {
    const a = consignmentActions(consignment("PLANNED"), trip({ haulierStatus: "blocked", haulierIssues: [{ code: "insurance_expired", severity: "block", message: "Insurance expired" }] }), false);
    expect(a.sendOrder.reason).toBe("The haulier is blocked: Insurance expired");
  });

  it("allows the stamps in order", () => {
    expect(consignmentActions(consignment("PLANNED"), trip(), false).pickedUp.reason).toBe("Record the transport order as sent first");
    expect(consignmentActions(consignment("ORDERED"), trip(), false).pickedUp.allowed).toBe(true);
    expect(consignmentActions(consignment("ORDERED"), trip(), false).recordConfirmation.allowed).toBe(true);
    expect(consignmentActions(consignment("CONFIRMED"), trip(), false).recordConfirmation.reason).toBe("Already confirmed");
    expect(consignmentActions(consignment("CONFIRMED"), trip(), false).delivered.reason).toBe("Stamp Picked up first");
    expect(consignmentActions(consignment("PICKED_UP"), trip(), false).delivered.allowed).toBe(true);
    expect(consignmentActions(consignment("PICKED_UP"), trip(), false).sendOrder.reason).toBe("Already picked up");
  });

  it("stamps POD received with a POD document, or by a manager without one", () => {
    expect(consignmentActions(consignment("DELIVERED"), trip(), false).podReceived.reason).toMatch(/Upload the POD first/);
    expect(consignmentActions(consignment("DELIVERED"), trip(), true).podReceived.allowed).toBe(true);
    expect(consignmentActions(consignment("DELIVERED", { permissions: MANAGER }), trip(), false).podReceived.allowed).toBe(true);
  });

  it("lets only a manager cancel, and not after the pick-up", () => {
    expect(consignmentActions(consignment("PLANNED"), trip(), false).cancel.reason).toBe("Only a manager can cancel a consignment");
    expect(consignmentActions(consignment("PLANNED", { permissions: MANAGER }), trip(), false).cancel.allowed).toBe(true);
    expect(consignmentActions(consignment("PICKED_UP", { permissions: MANAGER }), trip(), false).cancel.reason).toMatch(/no longer be cancelled/);
  });

  it("offers the margin approval to a manager when below the floor", () => {
    expect(consignmentActions(consignment("BOOKED", { belowFloor: true }), null, false).approveMargin.reason).toMatch(/Only a manager/);
    expect(consignmentActions(consignment("BOOKED", { belowFloor: true, permissions: MANAGER }), null, false).approveMargin.allowed).toBe(true);
    expect(consignmentActions(consignment("BOOKED", { permissions: MANAGER }), null, false).approveMargin.reason).toMatch(/above the floor/);
  });

  it("limits editing after the pick-up and stops it on a cancelled consignment", () => {
    expect(consignmentActions(consignment("PICKED_UP"), trip(), false).editLimited).toBe(true);
    expect(consignmentActions(consignment("CANCELLED"), null, false).edit.allowed).toBe(false);
    expect(consignmentActions(consignment("CANCELLED", { permissions: MANAGER }), null, false).voidStamp).toBe(false);
  });
});

describe("nextStep", () => {
  it("names the one primary action of a status", () => {
    expect(nextStep({ status: "BOOKED" })).toBe("planTrip");
    expect(nextStep({ status: "PLANNED" })).toBe("sendOrder");
    expect(nextStep({ status: "DELIVERED" })).toBe("podReceived");
    expect(nextStep({ status: "READY_TO_BILL" })).toBeNull();
  });
});

describe("texts", () => {
  it("summarises what needs attention", () => {
    expect(attentionSummary([])).toBeNull();
    expect(attentionSummary(["Pick-up within 24 h and no trip", "No POD"])).toEqual({ first: "Pick-up within 24 h and no trip", more: 1 });
  });

  it("writes the margin and the route", () => {
    expect(marginText({ marginCzk: null, marginPercent: null })).toBe("—");
    expect(marginText({ marginCzk: 1250, marginPercent: 12.5 })).toMatch(/^1.250 CZK · 12\.5 %$/);
    expect(routeText({ pickupPostcode: "11000", pickupCity: "Praha", deliveryPostcode: "60200", deliveryCity: "Brno" }, formatPsc)).toBe("110 00 Praha → 602 00 Brno");
  });
});

describe("buy: real or estimate", () => {
  it("labels the buy the way the Reports count it", () => {
    const real = { buyCzk: 13337.5, buyReal: true, buyInvoiceNumbers: ["TEST-PINV-001"] };
    expect([buySource(real), buyLabel(real)]).toEqual(["real", "Buy (real, invoice TEST-PINV-001)"]);
    const partly = { buyCzk: 3700, buyReal: false, buyInvoiceNumbers: ["A", "B"] };
    expect([buySource(partly), buyLabel(partly)]).toEqual(["partly real", "Buy (partly real, invoices A, B)"]);
    const estimate = { buyCzk: 16087.5, buyReal: false, buyInvoiceNumbers: [] };
    expect([buySource(estimate), buyLabel(estimate)]).toEqual(["estimate", "Buy (estimate)"]);
    const none = { buyCzk: null, buyReal: false, buyInvoiceNumbers: [] };
    expect([buySource(none), buyLabel(none)]).toEqual(["", "Buy"]);
  });
});

describe("stampTimeProblem", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  it("allows now and up to 7 days back, never the future", () => {
    expect(stampTimeProblem(null, now)).toBeNull();
    expect(stampTimeProblem("2026-10-10T12:00:00Z", now)).toBeNull();
    expect(stampTimeProblem("2026-10-07T12:00:00Z", now)).toBe("At most 7 days back");
    expect(stampTimeProblem("2026-10-15T14:00:00Z", now)).toBe("The time cannot be in the future");
    expect(stampTimeProblem("nonsense", now)).toBe("Not a valid time");
  });
});

describe("LTL consignments", () => {
  const ltl = (status: ConsignmentStatus, extra: Partial<ActionInput> = {}): ActionInput => ({ ...consignment(status), scope: "LTL", selfDelivered: false, ...extra });

  it("are planned on the Planning tab and ordered per trip", () => {
    const a = consignmentActions(ltl("BOOKED"), null, false);
    expect(a.planTrip).toEqual({ allowed: false, reason: "LTL legs are planned on the Planning tab" });
    expect(a.sendOrder.allowed).toBe(false);
    expect(a.recordConfirmation.allowed).toBe(false);
  });

  it("stamp picked up after the order, delivered after the warehouse gate-out", () => {
    expect(consignmentActions(ltl("ORDERED"), null, false).pickedUp.allowed).toBe(true);
    expect(consignmentActions(ltl("ORDERED", { selfDelivered: true }), null, false).pickedUp.reason).toBe("The customer brings the goods to our warehouse");
    expect(consignmentActions(ltl("AT_HUB"), null, false).delivered.reason).toBe("Waits for the warehouse gate-out");
    expect(consignmentActions(ltl("OUT_FOR_DELIVERY"), null, false).delivered.allowed).toBe(true);
    expect(consignmentActions(ltl("ON_LINEHAUL"), null, false).delivered.allowed).toBe(true);
    expect(consignmentActions(ltl("AT_HUB", { permissions: MANAGER }), null, false).cancel.reason).toMatch(/Picked up/);
  });

  it("have their own next step and no confirmed stamp", () => {
    expect(nextStep({ status: "BOOKED", scope: "LTL" })).toBeNull();
    expect(nextStep({ status: "ORDERED", scope: "LTL" })).toBe("pickedUp");
    expect(nextStep({ status: "OUT_FOR_DELIVERY", scope: "LTL" })).toBe("delivered");
    expect(stampKindsFor("LTL")).toEqual(["pickedUp", "delivered", "podReceived"]);
    expect(stampKindsFor("FTL")).toHaveLength(4);
  });

  it("show the warehouse in the lifecycle, the line haul only when there is one", () => {
    const base = { createdAt: "2026-10-14T08:00:00Z", stamps: NO_STAMPS, tripId: null, podReceivedAt: null, scope: "LTL" as const };
    const l = consignmentLifecycle({ ...base, status: "AT_HUB", gateInAt: "2026-10-15T07:00:00Z", legs: [] });
    expect(l.steps.map((s) => s.stage)).toEqual(["BOOKED", "PLANNED", "ORDERED", "PICKED_UP", "AT_HUB", "OUT_FOR_DELIVERY", "DELIVERED", "POD_RECEIVED", "READY_TO_BILL"]);
    expect(l.steps.map((s) => s.done)).toEqual([true, true, true, true, true, false, false, false, false]);
    expect(l.at).toBe("2026-10-15T07:00:00Z");
    const withLinehaul = consignmentLifecycle({ ...base, status: "BOOKED", legs: [{ kind: "LINEHAUL" } as ConsignmentDetail["legs"][number]] });
    expect(withLinehaul.steps.map((s) => s.stage)).toContain("ON_LINEHAUL");
  });
});

describe("worklist tiles and chips", () => {
  it("open exactly the server view a tile counts: Open FTL without haulier is the openFtl view, not every booked one", () => {
    expect(CONSIGNMENT_TILES.map((t) => [t.id, t.view])).toEqual([
      ["openFtlWithoutHaulier", "openFtl"],
      ["pickupToday", "pickupToday"],
      ["deliveryToday", "deliveryToday"],
    ]);
    expect(consignmentViewOf("openFtl")).toBe("openFtl");
    expect(consignmentViewOf("attention")).toBe("attention");
    expect(consignmentViewOf("BOOKED")).toBeNull();
    expect(CONSIGNMENT_CHIPS.map((c) => c.id)).not.toContain("openFtl");
  });

  it("link to one job's consignments", () => {
    expect(jobConsignmentsHref("0000-d1")).toBe("/trucking?job=0000-d1");
  });
});

describe("margin state", () => {
  it("says in words whether a margin below the floor needs approval or is approved, not by colour alone", () => {
    expect(marginState({ belowFloor: false, marginApproved: false })).toBeNull();
    expect(marginState({ belowFloor: true, marginApproved: false })).toMatchObject({ label: "Needs approval", tone: "r" });
    expect(marginState({ belowFloor: true, marginApproved: true })).toMatchObject({ label: "Approved", tone: "a" });
  });
});

describe("recorded-as-sent wording", () => {
  it("says the transport order is recorded as sent, never sent", () => {
    expect(CONSIGNMENT_STATUS_CHIP.ORDERED.hint).toMatch(/recorded as sent/);
    expect(TRIP_STATUS_CHIP.ORDERED.hint).toMatch(/recorded as sent/);
    expect(Object.values(CONSIGNMENT_STATUS_CHIP).map((c) => c.hint).join(" ")).not.toMatch(/order sent|Loaded/);
  });
});


describe("load in a line", () => {
  it("formats the numbers instead of printing them raw", () => {
    expect(loadText({ palletPlaces: 12, weightKg: 1250.5, adr: true })).toBe("12 pallet places · 1 250.5 kg · ADR");
    expect(loadText({ palletPlaces: 1, weightKg: 800, adr: false })).toBe("1 pallet place · 800 kg");
  });
});

describe("notices", () => {
  it("are left out of the other Needs-attention reasons (they are listed on their own, with Clear)", () => {
    const notice = { key: "diff:1", code: "PRICE_CHANGE_AFTER_INVOICE" as const, text: "Price changed after the invoice: +500.00 CZK billed as a difference", at: "2026-10-16T08:00:00Z" };
    expect(reasonsBesideNotices({ needsAttention: [notice.text, "POD missing"], notices: [notice] })).toEqual(["POD missing"]);
    expect(reasonsBesideNotices({ needsAttention: ["POD missing"], notices: [] })).toEqual(["POD missing"]);
  });
});
