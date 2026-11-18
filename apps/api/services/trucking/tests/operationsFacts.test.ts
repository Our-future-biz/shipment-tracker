import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import {
  EXCEPTION_ATTENTION_HOURS,
  EXCEPTION_URGENT_HOURS,
  HAULIER_TOMORROW_FROM_MINUTES,
  POD_MISSING_URGENT_WORKING_DAYS,
  exceptionIssues,
  haulierIssues,
  inPlay,
  podIssue,
  shownTrip,
  truckingShipmentFacts,
  workingDaysSince,
  type IssueClock,
} from "../lib/operationsFacts";
import type { TruckingConsignmentRecord, TruckingLegRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { TruckingExceptionRecord } from "../schemas/avizace.schema";

// Shipments → Managers, step 5: Trucking's own judgement of a job's consignments - the haulier and
// pick-up rules of the Consignments list, the open delivery exceptions, POD missing in working days -
// and which consignments are still in play. Wed 18 Nov 2026; Tue 17 Nov is a Czech public holiday.

const TODAY = "2026-11-18";
/** 09:00 Prague (CET = UTC+1) */
const MORNING = new Date("2026-11-18T08:00:00Z");
const clock = (now = MORNING, holidays: string[] = []): IssueClock => ({ today: TODAY, now, holidays });
const hoursAgo = (h: number, from = MORNING) => new Date(from.getTime() - h * 3_600_000);

const consignment = (over: Partial<TruckingConsignmentRecord> = {}) =>
  ({
    id: "c1",
    ref: "TCZ2026000001",
    shipmentId: "s1",
    scope: "FTL",
    status: "BOOKED",
    pickupDate: TODAY,
    promisedDate: "2026-11-20",
    tripId: null,
    confirmedAt: null,
    deliveredAt: null,
    podReceivedAt: null,
    readyToBillAt: null,
    cancelledAt: null,
    createdAt: new Date("2026-11-10T09:00:00Z"),
    ...over,
  }) as TruckingConsignmentRecord;

const trip = (over: Partial<TruckingTripRecord> = {}) =>
  ({
    id: "t1",
    createdAt: new Date("2026-11-12T09:00:00Z"),
    orderSentAt: null,
    confirmedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    ...over,
  }) as TruckingTripRecord;

const exception = (over: Partial<TruckingExceptionRecord> = {}) =>
  ({
    consignmentId: "c1",
    kind: "DAMAGE",
    failedReason: null,
    decision: "PENDING",
    description: "",
    waitingMinutes: null,
    createdAt: hoursAgo(1),
    decidedAt: null,
    closedAt: null,
    ...over,
  }) as TruckingExceptionRecord;

describe("no haulier and the haulier not confirmed (the Consignments list's rules)", () => {
  it("says nothing when the trips were not read", () => {
    expect(haulierIssues(consignment(), undefined, clock())).toEqual([]);
  });

  it("BOOKED within 24 h: no trip, urgent on the pick-up day or after it, nothing further out", () => {
    const at = (pickupDate: string) => haulierIssues(consignment({ pickupDate }), null, clock());
    expect(at("2026-11-19")).toEqual([{ kind: "no_haulier", text: "Pick-up within 24 h and no trip", urgent: false, since: "2026-11-10T09:00:00.000Z" }]);
    expect(at(TODAY)[0]).toMatchObject({ kind: "no_haulier", urgent: true });
    expect(at("2026-11-16")[0]).toMatchObject({ kind: "no_haulier", urgent: true });
    expect(at("2026-11-20")).toEqual([]);
  });

  it("PLANNED within 24 h: the transport order is not sent, since the trip was made", () => {
    const t = trip();
    expect(haulierIssues(consignment({ status: "PLANNED", tripId: "t1", pickupDate: "2026-11-19" }), t, clock())).toEqual([
      { kind: "haulier_not_confirmed", text: "Pick-up within 24 h and the transport order is not sent", urgent: false, since: "2026-11-12T09:00:00.000Z" },
    ]);
    expect(haulierIssues(consignment({ status: "PLANNED", tripId: "t1", pickupDate: TODAY }), t, clock())[0]!.urgent).toBe(true);
    expect(haulierIssues(consignment({ status: "PLANNED", tripId: "t1", pickupDate: "2026-11-20" }), t, clock())).toEqual([]);
  });

  it("ORDERED, not confirmed: pick-up today is urgent at any hour", () => {
    const t = trip({ orderSentAt: new Date("2026-11-16T10:00:00Z") });
    expect(haulierIssues(consignment({ status: "ORDERED", tripId: "t1" }), t, clock())).toEqual([
      { kind: "haulier_not_confirmed", text: "Ordered, not confirmed: pick-up today", urgent: true, since: "2026-11-16T10:00:00.000Z" },
    ]);
  });

  it("ORDERED, not confirmed: pick-up tomorrow is said from 14:00 Prague, not urgent; later days not at all", () => {
    expect(HAULIER_TOMORROW_FROM_MINUTES).toBe(14 * 60);
    const t = trip({ orderSentAt: new Date("2026-11-16T10:00:00Z") });
    const c = consignment({ status: "ORDERED", tripId: "t1", pickupDate: "2026-11-19" });
    expect(haulierIssues(c, t, clock(new Date("2026-11-18T12:59:00Z")))).toEqual([]);
    expect(haulierIssues(c, t, clock(new Date("2026-11-18T13:00:00Z")))).toEqual([
      { kind: "haulier_not_confirmed", text: "Ordered, not confirmed: pick-up tomorrow", urgent: false, since: "2026-11-16T10:00:00.000Z" },
    ]);
    expect(haulierIssues(consignment({ status: "ORDERED", tripId: "t1", pickupDate: "2026-11-20" }), t, clock(new Date("2026-11-18T16:00:00Z")))).toEqual([]);
  });

  it("'tomorrow' is the next working day: on a Friday afternoon a Monday pick-up counts, and the weekend between", () => {
    // Fri 20 Nov 2026, 14:00 Prague.
    const friday = (holidays: string[] = []): IssueClock => ({ today: "2026-11-20", now: new Date("2026-11-20T13:00:00Z"), holidays });
    const t = trip({ orderSentAt: new Date("2026-11-19T10:00:00Z") });
    const booked = (pickupDate: string, at = friday()) => haulierIssues(consignment({ pickupDate }), null, at);
    const ordered = (pickupDate: string, at = friday()) => haulierIssues(consignment({ status: "ORDERED", tripId: "t1", pickupDate }), t, at);
    // Trucking's 24 h rules keep their words, only the day moves.
    expect(booked("2026-11-23")).toEqual([{ kind: "no_haulier", text: "Pick-up within 24 h and no trip", urgent: false, since: "2026-11-10T09:00:00.000Z" }]);
    expect(booked("2026-11-21")[0]).toMatchObject({ kind: "no_haulier", urgent: false });
    expect(booked("2026-11-24")).toEqual([]);
    expect(haulierIssues(consignment({ status: "PLANNED", tripId: "t1", pickupDate: "2026-11-23" }), t, friday())[0]).toMatchObject({
      text: "Pick-up within 24 h and the transport order is not sent",
      urgent: false,
    });
    expect(ordered("2026-11-23")).toEqual([{ kind: "haulier_not_confirmed", text: "Ordered, not confirmed: pick-up on 23 Nov 2026", urgent: false, since: "2026-11-19T10:00:00.000Z" }]);
    expect(ordered("2026-11-21")[0]!.text).toBe("Ordered, not confirmed: pick-up tomorrow");
    expect(ordered("2026-11-24")).toEqual([]);
    // Before 14:00 on the Friday, not yet.
    expect(ordered("2026-11-23", { today: "2026-11-20", now: new Date("2026-11-20T12:59:00Z"), holidays: [] })).toEqual([]);
    // A company holiday on the Monday: the next working day is the Tuesday.
    expect(booked("2026-11-24", friday(["2026-11-23"]))[0]).toMatchObject({ kind: "no_haulier" });
    expect(ordered("2026-11-24", friday(["2026-11-23"]))[0]!.text).toBe("Ordered, not confirmed: pick-up on 24 Nov 2026");
    // A public holiday: on Mon 16 Nov the next working day is Wed 18 (17 Nov).
    const monday: IssueClock = { today: "2026-11-16", now: new Date("2026-11-16T13:00:00Z"), holidays: [] };
    expect(haulierIssues(consignment({ pickupDate: "2026-11-18" }), null, monday)[0]).toMatchObject({ kind: "no_haulier", urgent: false });
    expect(haulierIssues(consignment({ status: "ORDERED", tripId: "t1", pickupDate: "2026-11-18" }), t, monday)[0]!.text).toBe("Ordered, not confirmed: pick-up on 18 Nov 2026");
  });

  it("an LTL consignment is confirmed with its trip: ORDERED with the trip confirmed is fine", () => {
    const t = trip({ orderSentAt: hoursAgo(30), confirmedAt: hoursAgo(20) });
    expect(haulierIssues(consignment({ scope: "LTL", status: "ORDERED" }), t, clock())).toEqual([]);
  });

  it("a rejected order: said whatever the day, urgent on the pick-up day; no longer once confirmed", () => {
    const rejected = trip({ orderSentAt: hoursAgo(30), rejectedAt: new Date("2026-11-17T15:00:00Z") });
    expect(haulierIssues(consignment({ status: "ORDERED", tripId: "t1", pickupDate: "2026-11-24" }), rejected, clock())).toEqual([
      { kind: "haulier_not_confirmed", text: "The haulier rejected the transport order", urgent: false, since: "2026-11-17T15:00:00.000Z" },
    ]);
    expect(haulierIssues(consignment({ status: "ORDERED", tripId: "t1" }), rejected, clock())).toEqual([
      { kind: "haulier_not_confirmed", text: "The haulier rejected the transport order", urgent: true, since: "2026-11-17T15:00:00.000Z" },
    ]);
    const confirmedAfter = consignment({ status: "CONFIRMED", tripId: "t1", confirmedAt: hoursAgo(2) });
    expect(haulierIssues(confirmedAfter, rejected, clock())).toEqual([]);
  });

  it("the pick-up day passed (ORDERED or CONFIRMED): not picked up, urgent, since that day - and not also 'not confirmed'", () => {
    const t = trip({ orderSentAt: hoursAgo(60) });
    expect(haulierIssues(consignment({ status: "ORDERED", tripId: "t1", pickupDate: "2026-11-16" }), t, clock())).toEqual([
      { kind: "not_picked_up", text: "Pick-up date passed and no pick-up stamped", urgent: true, since: "2026-11-16" },
    ]);
    expect(haulierIssues(consignment({ status: "CONFIRMED", tripId: "t1", confirmedAt: hoursAgo(50), pickupDate: "2026-11-16" }), t, clock())[0]).toMatchObject({ kind: "not_picked_up" });
    expect(haulierIssues(consignment({ status: "CONFIRMED", tripId: "t1", confirmedAt: hoursAgo(50) }), t, clock())).toEqual([]);
    expect(haulierIssues(consignment({ status: "PICKED_UP", tripId: "t1", pickupDate: "2026-11-16" }), t, clock())).toEqual([]);
  });
});

describe("the trip a consignment is judged on", () => {
  const leg = (over: Partial<TruckingLegRecord>) => ({ consignmentId: "c1", kind: "PICKUP", seq: 1, status: "OPEN", tripId: null, ...over }) as TruckingLegRecord;
  it("FTL its trip; LTL the trip of its first planned leg; a cancelled trip is none", () => {
    const a = trip({ id: "a" });
    const b = trip({ id: "b" });
    const gone = trip({ id: "g", cancelledAt: new Date() });
    const trips = new Map([a, b, gone].map((t) => [t.id, t]));
    expect(shownTrip(consignment({ tripId: "a" }), [], trips)).toBe(a);
    expect(shownTrip(consignment({ tripId: "g" }), [], trips)).toBeNull();
    expect(shownTrip(consignment({ tripId: null }), [], trips)).toBeNull();
    const legs = [leg({ seq: 1, status: "DONE", tripId: "a" }), leg({ seq: 2, kind: "LINEHAUL", status: "PLANNED", tripId: "b" }), leg({ consignmentId: "other", status: "PLANNED", tripId: "a" })];
    expect(shownTrip(consignment({ scope: "LTL" }), legs, trips)).toBe(b);
    expect(shownTrip(consignment({ scope: "LTL" }), [leg({ status: "OPEN" })], trips)).toBeNull();
  });
});

describe("delivery exceptions not closed", () => {
  it("says nothing when the exceptions were not read", () => {
    expect(exceptionIssues(consignment(), undefined, clock())).toEqual([]);
  });

  it("a failed delivery not yet delivered again is urgent the same day, with its reason", () => {
    expect(exceptionIssues(consignment(), [exception({ kind: "FAILED_DELIVERY", failedReason: "ABSENT", createdAt: hoursAgo(1) })], clock())).toEqual([
      { kind: "failed_delivery", text: "Failed delivery: Nobody there", urgent: true, since: hoursAgo(1).toISOString() },
    ]);
    expect(exceptionIssues(consignment(), [exception({ kind: "FAILED_DELIVERY", failedReason: "REFUSED_DAMAGED" })], clock())[0]!.text).toBe("Failed delivery: Refused — damaged");
  });

  it("a failed delivery decided (a redelivery planned) is attention, not urgent, until it is delivered or closed", () => {
    const decided = exception({ kind: "FAILED_DELIVERY", failedReason: "ABSENT", decision: "CHARGE_CUSTOMER", createdAt: hoursAgo(5), decidedAt: hoursAgo(2) });
    expect(exceptionIssues(consignment(), [decided], clock())).toEqual([
      { kind: "failed_delivery", text: "Failed delivery: Nobody there — decided, not delivered yet", urgent: false, since: hoursAgo(5).toISOString() },
    ]);
    // Delivered since: a decided exception not closed, after 24 h from the decision.
    expect(exceptionIssues(consignment({ deliveredAt: hoursAgo(1) }), [decided], clock())).toEqual([]);
    expect(exceptionIssues(consignment({ deliveredAt: hoursAgo(1) }), [{ ...decided, decidedAt: hoursAgo(30) }], clock())[0]).toMatchObject({
      kind: "exception_open",
      text: "Failed delivery: decided, not closed",
      urgent: false,
    });
    expect(exceptionIssues(consignment(), [{ ...decided, closedAt: hoursAgo(1) }], clock())).toEqual([]);
  });

  it("a failed delivery delivered since is an exception to decide like any other", () => {
    const delivered = consignment({ deliveredAt: hoursAgo(5) });
    expect(exceptionIssues(delivered, [exception({ kind: "FAILED_DELIVERY", failedReason: "ABSENT", createdAt: hoursAgo(23) })], clock())).toEqual([]);
    expect(exceptionIssues(delivered, [exception({ kind: "FAILED_DELIVERY", failedReason: "ABSENT", createdAt: hoursAgo(30) })], clock())).toEqual([
      { kind: "exception_open", text: "Failed delivery: not decided", urgent: false, since: hoursAgo(30).toISOString() },
    ]);
  });

  it("not decided: attention from 24 h, urgent from 48 h, in Trucking's line text", () => {
    expect([EXCEPTION_ATTENTION_HOURS, EXCEPTION_URGENT_HOURS]).toEqual([24, 48]);
    const at = (h: number, over: Partial<TruckingExceptionRecord> = {}) => exceptionIssues(consignment(), [exception({ createdAt: hoursAgo(h), ...over })], clock());
    expect(at(23.9)).toEqual([]);
    expect(at(24)).toEqual([{ kind: "exception_open", text: "Damage: not decided", urgent: false, since: hoursAgo(24).toISOString() }]);
    expect(at(47.9)[0]!.urgent).toBe(false);
    expect(at(48)[0]!.urgent).toBe(true);
    expect(at(30, { kind: "WAITING_TIME", waitingMinutes: 45 })[0]!.text).toBe("Waiting time 45 min: not decided");
    expect(at(30, { kind: "OTHER", description: "Pallet left at the gate" })[0]!.text).toBe("Pallet left at the gate: not decided");
  });

  it("decided and not closed: attention 24 h after the decision, never urgent; a closed one says nothing", () => {
    const decided = (h: number) => exception({ decision: "ABSORB", createdAt: hoursAgo(200), decidedAt: hoursAgo(h) });
    expect(exceptionIssues(consignment(), [decided(23)], clock())).toEqual([]);
    expect(exceptionIssues(consignment(), [decided(100)], clock())).toEqual([
      { kind: "exception_open", text: "Damage: decided, not closed", urgent: false, since: hoursAgo(100).toISOString() },
    ]);
    expect(exceptionIssues(consignment(), [exception({ createdAt: hoursAgo(100), decision: "ABSORB", decidedAt: hoursAgo(90), closedAt: hoursAgo(80) })], clock())).toEqual([]);
  });
});

describe("POD missing in working days (Trucking's podMissing)", () => {
  const delivered = (at: string) => consignment({ status: "DELIVERED", deliveredAt: new Date(at) });

  it("more than 2 working days after the delivery day, holidays skipped; nothing without a delivery or with the POD", () => {
    expect(podIssue(consignment(), clock())).toBeNull();
    // Fri 13 Nov: Mon 16 and Wed 18 (17 Nov a holiday) are 2 → not yet.
    expect(podIssue(delivered("2026-11-13T10:00:00Z"), clock())).toBeNull();
    // Thu 12 Nov: Fri 13, Mon 16, Wed 18 → 3.
    expect(podIssue(delivered("2026-11-12T10:00:00Z"), clock())).toEqual({
      kind: "pod_missing",
      text: "Delivered 3 working days ago — POD missing",
      urgent: false,
      since: "2026-11-12T10:00:00.000Z",
    });
    expect(podIssue({ ...delivered("2026-11-12T10:00:00Z"), podReceivedAt: new Date() }, clock())).toBeNull();
  });

  it("counts the delivery day in Prague", () => {
    // 23:30 Prague on Thu 12 Nov is still the 12th; 00:30 Prague on the 13th is the 13th.
    expect(podIssue(delivered("2026-11-12T22:30:00Z"), clock())).not.toBeNull();
    expect(podIssue(delivered("2026-11-12T23:30:00Z"), clock())).toBeNull();
  });

  it("counts the company's own holidays too", () => {
    expect(podIssue(delivered("2026-11-12T10:00:00Z"), clock(MORNING, ["2026-11-16"]))).toBeNull();
    expect(workingDaysSince("2026-11-12", TODAY, ["2026-11-16"])).toBe(2);
    // A company holiday on a weekend or a public holiday is not taken off twice.
    expect(workingDaysSince("2026-11-12", TODAY, ["2026-11-15", "2026-11-17"])).toBe(3);
  });

  it("urgent once 5 working days have passed", () => {
    expect(POD_MISSING_URGENT_WORKING_DAYS).toBe(5);
    // Wed 11 Nov: 12, 13, 16, 18 → 4; Tue 10 Nov: 11, 12, 13, 16, 18 → 5.
    expect(podIssue(delivered("2026-11-11T10:00:00Z"), clock())).toMatchObject({ urgent: false, text: "Delivered 4 working days ago — POD missing" });
    expect(podIssue(delivered("2026-11-10T10:00:00Z"), clock())).toMatchObject({ urgent: true, text: "Delivered 5 working days ago — POD missing" });
  });
});

describe("still in play", () => {
  it("not cancelled, not Ready to bill; without the POD, or with an exception not closed", () => {
    expect(inPlay(consignment(), [])).toBe(true);
    expect(inPlay(consignment({ cancelledAt: new Date() }), [])).toBe(false);
    expect(inPlay(consignment({ podReceivedAt: new Date(), readyToBillAt: new Date() }), [{}])).toBe(false);
    expect(inPlay(consignment({ podReceivedAt: new Date() }), [])).toBe(false);
    expect(inPlay(consignment({ podReceivedAt: new Date() }), [{}])).toBe(true);
    // The exceptions not read: one with its POD is left out, one without stays.
    expect(inPlay(consignment({ podReceivedAt: new Date() }), undefined)).toBe(false);
    expect(inPlay(consignment(), undefined)).toBe(true);
  });
});

describe("the jobs' facts", () => {
  const base = {
    shipmentIds: ["s1", "s2", "s3"],
    trips: { legs: [], tripOf: new Map() },
    exceptions: [] as TruckingExceptionRecord[],
    updates: new Map([["s3", { waiting: 2, failed: 1 }]]),
    clock: clock(),
  };

  it("in the order asked; consignments by pick-up then ref with the status as Trucking shows it; a job with nothing is left out", () => {
    const facts = truckingShipmentFacts({
      ...base,
      consignments: [
        consignment({ id: "b", ref: "TCZ2026000009", shipmentId: "s1", pickupDate: "2026-11-25" }),
        consignment({ id: "a", ref: "TCZ2026000005", shipmentId: "s1", status: "PICKED_UP", pickupDate: "2026-11-17" }),
        consignment({ id: "done", shipmentId: "s2", status: "POD_RECEIVED", podReceivedAt: new Date() }),
      ],
    });
    expect(facts.map((f) => f.shipmentId)).toEqual(["s1", "s3"]);
    expect(facts[0]).toEqual({
      shipmentId: "s1",
      consignments: [
        { id: "a", ref: "TCZ2026000005", status: "Picked up", pickupDate: "2026-11-17", deliveryDate: "2026-11-20", issues: [] },
        { id: "b", ref: "TCZ2026000009", status: "Booked", pickupDate: "2026-11-25", deliveryDate: "2026-11-20", issues: [] },
      ],
      updatesWaiting: 0,
      updatesFailed: 0,
    });
    expect(facts[1]).toEqual({ shipmentId: "s3", consignments: [], updatesWaiting: 2, updatesFailed: 1 });
  });

  it("a part not read gives none of its issues or figures", () => {
    const c = consignment({ shipmentId: "s1", status: "DELIVERED", deliveredAt: new Date("2026-11-10T10:00:00Z") });
    const facts = truckingShipmentFacts({ ...base, consignments: [c], trips: undefined, exceptions: undefined, updates: undefined });
    expect(facts).toEqual([
      {
        shipmentId: "s1",
        consignments: [expect.objectContaining({ status: "Delivered", issues: [expect.objectContaining({ kind: "pod_missing", urgent: true })] })],
        updatesWaiting: null,
        updatesFailed: null,
      },
    ]);
    // Nothing read: nothing to say.
    expect(truckingShipmentFacts({ ...base, consignments: undefined, updates: undefined })).toEqual([]);
  });

  it("an open exception keeps a consignment with its POD in play and is said", () => {
    const c = consignment({ shipmentId: "s2", status: "POD_RECEIVED", deliveredAt: hoursAgo(80), podReceivedAt: hoursAgo(70) });
    const facts = truckingShipmentFacts({ ...base, consignments: [c], exceptions: [exception({ createdAt: hoursAgo(60) })] });
    expect(facts[0]).toMatchObject({ shipmentId: "s2", consignments: [{ status: "POD received", issues: [{ kind: "exception_open", text: "Damage: not decided", urgent: true }] }] });
  });
});
