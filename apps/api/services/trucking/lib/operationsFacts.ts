import { addDays, businessDay, businessMinutes } from "../../../lib/businessDate";
import { isCzechHoliday, isWeekend, nextWorkingDay, weekday, workingDaysAfter } from "../../../lib/workingDays";
import { formatDay } from "./format";
import type { ConsignmentStatus, TruckingConsignmentFacts, TruckingIssue, TruckingShipmentFacts } from "../interfaces/interfaces";
import type { FailedReason } from "../interfaces/avizace.interfaces";
import type { TruckingConsignmentRecord, TruckingLegRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { TruckingExceptionRecord } from "../schemas/avizace.schema";
import { exceptionLineText, podMissing } from "./avizaceRules";
import { ltlLegsOf } from "./ltlView";

// Shipments → Managers (Council Outlay 11, step 5, D29 / D30): Trucking's own judgement of what is
// wrong with a job's consignments, so the operations cockpit and Trucking never disagree. Pure: the
// service reads the rows and the holidays and hands them here.
//
// Trucking's own rules are reused where it has one:
//  - lib/consignmentRules.ts attentionReasons: "Pick-up within 24 h and no trip" (BOOKED),
//    "… and the transport order is not sent" (PLANNED), "The haulier rejected the transport order",
//    "Pick-up date passed and no pick-up stamped" (ORDERED / CONFIRMED) - same facts, same words;
//  - lib/tripQueues.ts "Ordered, not confirmed" (ORDERED, the haulier has not confirmed);
//  - lib/avizaceRules.ts podMissing: delivered more than 2 working days ago, the company's holidays
//    counted (the Consignments tab's "POD missing" chip);
//  - an exception not closed keeps the consignment from Ready to bill (schemas/avizace.schema.ts).
// Where Trucking has no number of its own, the step 2 contract's are used (the constants below).

/** Ordered, not confirmed, pick-up tomorrow: said from this minute of the day (14:00 Prague) - the morning is the dispatcher's. */
export const HAULIER_TOMORROW_FROM_MINUTES = 14 * 60;
/** An exception not decided: needs attention this many hours after it was recorded… */
export const EXCEPTION_ATTENTION_HOURS = 24;
/** …and is URGENT from this many. A decided one not closed needs attention after the same 24 h from the decision, never urgent. */
export const EXCEPTION_URGENT_HOURS = 48;
/** POD missing turns URGENT this many working days after the delivery (it holds the job's Billing). */
export const POD_MISSING_URGENT_WORKING_DAYS = 5;

/** The status as the Trucking pages show it (apps/web/src/app/trucking/_lib/consignments.ts CONSIGNMENT_STATUS_CHIP). */
export const STATUS_LABEL: Record<ConsignmentStatus, string> = {
  BOOKED: "Booked",
  PLANNED: "Planned",
  ORDERED: "Ordered",
  CONFIRMED: "Confirmed",
  PICKED_UP: "Picked up",
  AT_HUB: "At our warehouse",
  ON_LINEHAUL: "On line haul",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  POD_RECEIVED: "POD received",
  READY_TO_BILL: "Ready to bill",
  CANCELLED: "Cancelled",
};

/** A failed delivery's reason as the Trucking pages show it (apps/web/src/app/trucking/_lib/exceptions.ts). */
export const FAILED_REASON_LABEL: Record<FailedReason, string> = {
  CLOSED: "Closed",
  ABSENT: "Nobody there",
  REFUSED: "Refused",
  WRONG_ADDRESS: "Wrong address",
  REFUSED_DAMAGED: "Refused — damaged",
  NO_AVIZACE: "No avizace",
  OTHER: "Other",
};

/** The day and the moment the rules judge by, and the company's own holidays (beyond the statutory ones). */
export interface IssueClock {
  /** Prague day, YYYY-MM-DD */
  today: string;
  now: Date;
  holidays: readonly string[];
}

const HOUR_MS = 3_600_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * When a pick-up counted as "soon" is, in a tag's words: "within 24 h" for today or tomorrow (and
 * one that passed) - Trucking's own words; "on Mon 23.11." for one further out, which only the
 * next working day after a weekend or a holiday reaches: on a Friday a Monday pick-up is not
 * within 24 h, and Trucking's own page, counting the calendar day after today, says nothing of it yet.
 */
export function pickupWhen(pickupDate: string, today: string): string {
  if (pickupDate <= addDays(today, 1)) return "within 24 h";
  return `on ${WEEKDAYS[weekday(pickupDate)]} ${pickupDate.slice(8, 10)}.${pickupDate.slice(5, 7)}.`;
}

type Consignment = Pick<
  TruckingConsignmentRecord,
  | "id"
  | "ref"
  | "shipmentId"
  | "scope"
  | "status"
  | "pickupDate"
  | "promisedDate"
  | "tripId"
  | "confirmedAt"
  | "deliveredAt"
  | "podReceivedAt"
  | "readyToBillAt"
  | "cancelledAt"
  | "createdAt"
>;
type Trip = Pick<TruckingTripRecord, "id" | "createdAt" | "orderSentAt" | "confirmedAt" | "rejectedAt" | "cancelledAt">;
type OpenException = Pick<TruckingExceptionRecord, "consignmentId" | "kind" | "failedReason" | "decision" | "description" | "waitingMinutes" | "createdAt" | "decidedAt" | "closedAt">;

/**
 * Still in play: not cancelled, not Ready to bill, and either without its POD or with a delivery
 * exception not closed (that holds Billing). `openExceptions` undefined = not read: a consignment
 * with its POD is then left out (nothing known keeps it in play).
 */
export function inPlay(c: Pick<Consignment, "cancelledAt" | "readyToBillAt" | "podReceivedAt">, openExceptions: readonly unknown[] | undefined): boolean {
  if (c.cancelledAt || c.readyToBillAt) return false;
  if (!c.podReceivedAt) return true;
  return !!openExceptions?.length;
}

/**
 * The trip the consignment's haulier is judged on, as the Consignments list shows it: FTL its trip,
 * LTL the trip of its first planned leg (consignment.service.ts currentTrip). A cancelled trip is none.
 */
export function shownTrip<T extends Trip>(c: Pick<Consignment, "id" | "scope" | "tripId">, legs: TruckingLegRecord[], tripOf: ReadonlyMap<string, T>): T | null {
  let trip: T | null = null;
  if (c.scope === "LTL") {
    const leg = ltlLegsOf(c.id, legs).find((l) => l.status === "PLANNED" && l.tripId);
    trip = leg?.tripId ? (tripOf.get(leg.tripId) ?? null) : null;
  } else if (c.tripId) {
    trip = tripOf.get(c.tripId) ?? null;
  }
  return trip && !trip.cancelledAt ? trip : null;
}

/**
 * No haulier, haulier not confirmed, not picked up. `trip` undefined = the trips were not read: none
 * of these is said (an LTL consignment's confirmation is its trip's). "Tomorrow" is the next working
 * day (weekends, public and the company's holidays skipped), so on a Friday a Monday pick-up counts -
 * as does one on the weekend between; Trucking's own list counts the calendar day after today, its
 * words are kept for today and tomorrow, and a later day is named (pickupWhen, m22).
 *  - BOOKED, pick-up by the next working day: "Pick-up within 24 h and no trip" (no_haulier) -
 *    "Pick-up on Mon 23.11. and no trip" on a Friday
 *  - PLANNED, pick-up by the next working day: "… and the transport order is not sent" (haulier_not_confirmed)
 *  - the trip's order rejected and nothing confirmed: "The haulier rejected the transport order"
 *  - ORDERED and not confirmed: pick-up today, or later up to the next working day from 14:00 Prague:
 *    "Ordered, not confirmed: pick-up today / tomorrow / on 23 Nov 2026"
 *  - ORDERED / CONFIRMED and the pick-up day passed: "Pick-up date passed and no pick-up stamped" (not_picked_up)
 * URGENT when the pick-up day is today or passed; a missed pick-up always.
 */
export function haulierIssues(c: Consignment, trip: Trip | null | undefined, clock: IssueClock): TruckingIssue[] {
  if (trip === undefined) return [];
  const { today } = clock;
  const nextDay = nextWorkingDay(today, clock.holidays);
  const soon = c.pickupDate <= nextDay;
  const due = c.pickupDate <= today;
  const out: TruckingIssue[] = [];
  const when = pickupWhen(c.pickupDate, today);
  if (c.status === "BOOKED" && soon) out.push({ kind: "no_haulier", text: `Pick-up ${when} and no trip`, urgent: due, since: iso(c.createdAt) });
  if (c.status === "PLANNED" && soon) {
    out.push({ kind: "haulier_not_confirmed", text: `Pick-up ${when} and the transport order is not sent`, urgent: due, since: iso(trip?.createdAt) });
  }
  const confirmed = c.confirmedAt ?? trip?.confirmedAt ?? null;
  if (trip?.rejectedAt && !confirmed) {
    out.push({ kind: "haulier_not_confirmed", text: "The haulier rejected the transport order", urgent: due, since: iso(trip.rejectedAt) });
  } else if (c.status === "ORDERED" && !confirmed) {
    const lateEnough = businessMinutes(clock.now) >= HAULIER_TOMORROW_FROM_MINUTES;
    if (c.pickupDate === today) {
      out.push({ kind: "haulier_not_confirmed", text: "Ordered, not confirmed: pick-up today", urgent: true, since: iso(trip?.orderSentAt) });
    } else if (c.pickupDate > today && c.pickupDate <= nextDay && lateEnough) {
      const when = c.pickupDate === addDays(today, 1) ? "tomorrow" : `on ${formatDay(c.pickupDate)}`;
      out.push({ kind: "haulier_not_confirmed", text: `Ordered, not confirmed: pick-up ${when}`, urgent: false, since: iso(trip?.orderSentAt) });
    }
  }
  if ((c.status === "ORDERED" || c.status === "CONFIRMED") && c.pickupDate < today) {
    out.push({ kind: "not_picked_up", text: "Pick-up date passed and no pick-up stamped", urgent: true, since: c.pickupDate });
  }
  return out;
}

/**
 * The delivery exceptions not closed. `exceptions` undefined = not read: none said.
 *  - a failed delivery while the consignment is not delivered: not decided → URGENT the same day;
 *    decided (a redelivery planned, a charge) → attention until it is delivered or closed (failed_delivery)
 *  - any other (a failed delivery after a later delivery included): not decided → attention from
 *    24 h after it was recorded, URGENT from 48 h; decided and not closed → attention 24 h after the
 *    decision, never urgent (exception_open)
 */
export function exceptionIssues(c: Pick<Consignment, "deliveredAt">, exceptions: readonly OpenException[] | undefined, clock: IssueClock): TruckingIssue[] {
  if (!exceptions) return [];
  const out: TruckingIssue[] = [];
  for (const e of exceptions) {
    if (e.closedAt) continue;
    if (e.kind === "FAILED_DELIVERY" && !c.deliveredAt) {
      const reason = e.failedReason ? FAILED_REASON_LABEL[e.failedReason] : null;
      const decided = e.decision !== "PENDING";
      const text = `${reason ? `Failed delivery: ${reason}` : "Failed delivery"}${decided ? " — decided, not delivered yet" : ""}`;
      out.push({ kind: "failed_delivery", text, urgent: !decided, since: iso(e.createdAt) });
      continue;
    }
    const decided = e.decision !== "PENDING";
    const from = decided ? (e.decidedAt ?? e.createdAt) : e.createdAt;
    const hours = (clock.now.getTime() - from.getTime()) / HOUR_MS;
    if (hours < EXCEPTION_ATTENTION_HOURS) continue;
    out.push({
      kind: "exception_open",
      text: `${exceptionLineText(e)}: ${decided ? "decided, not closed" : "not decided"}`,
      urgent: !decided && hours >= EXCEPTION_URGENT_HOURS,
      since: iso(from),
    });
  }
  return out;
}

/** Working days after `from` up to and including `to`, the company's own holidays left out too. */
export function workingDaysSince(from: string, to: string, holidays: readonly string[]): number {
  const extra = new Set(holidays.filter((h) => h > from && h <= to && !isWeekend(h) && !isCzechHoliday(h)));
  return Math.max(0, workingDaysAfter(from, to) - extra.size);
}

/**
 * POD missing (Trucking's podMissing: delivered more than 2 working days ago, the company's holidays
 * counted), in the Consignments tab's words: "Delivered 3 working days ago — POD missing". URGENT once
 * 5 working days have passed since the delivery day (as the cockpit's own timeline rule counts "at 5").
 */
export function podIssue(c: Pick<Consignment, "deliveredAt" | "podReceivedAt" | "cancelledAt">, clock: IssueClock): TruckingIssue | null {
  if (!c.deliveredAt || !podMissing(c, clock.today, clock.holidays)) return null;
  const day = businessDay(c.deliveredAt);
  const days = workingDaysSince(day, clock.today, clock.holidays);
  return {
    kind: "pod_missing",
    text: `Delivered ${days} working day${days === 1 ? "" : "s"} ago — POD missing`,
    urgent: days >= POD_MISSING_URGENT_WORKING_DAYS,
    since: iso(c.deliveredAt),
  };
}

/** What was read; a part left undefined was not (its issues are not said). */
export interface OperationsFactsInput {
  /** The asked jobs, in the order asked */
  shipmentIds: string[];
  /** The jobs' consignments not cancelled and not Ready to bill; undefined = not read */
  consignments: Consignment[] | undefined;
  /** The LTL legs and the trips (FTL and LTL) by id; undefined = not read */
  trips: { legs: TruckingLegRecord[]; tripOf: ReadonlyMap<string, Trip> } | undefined;
  /** The exceptions not closed of those consignments; undefined = not read */
  exceptions: OpenException[] | undefined;
  /** Updates to the job waiting longer than the stale limit / failed, by job; undefined = not read */
  updates: ReadonlyMap<string, { waiting: number; failed: number }> | undefined;
  clock: IssueClock;
}

/** One consignment's facts, issues in the order: haulier, exceptions, POD. */
export function consignmentFacts(c: Consignment, trip: Trip | null | undefined, exceptions: OpenException[] | undefined, clock: IssueClock): TruckingConsignmentFacts {
  const pod = podIssue(c, clock);
  return {
    id: c.id,
    ref: c.ref,
    status: STATUS_LABEL[c.status] ?? c.status,
    pickupDate: c.pickupDate,
    deliveryDate: c.promisedDate,
    issues: [...haulierIssues(c, trip, clock), ...exceptionIssues(c, exceptions, clock), ...(pod ? [pod] : [])],
  };
}

/**
 * The jobs Trucking has something on: a consignment still in play, or an update waiting too long or
 * failed. A job with neither is left out. Consignments by planned pick-up, then ref.
 */
export function truckingShipmentFacts(input: OperationsFactsInput): TruckingShipmentFacts[] {
  const exceptionsOf = new Map<string, OpenException[]>();
  for (const e of input.exceptions ?? []) {
    if (e.closedAt) continue;
    const list = exceptionsOf.get(e.consignmentId) ?? [];
    list.push(e);
    exceptionsOf.set(e.consignmentId, list);
  }
  const byJob = new Map<string, Consignment[]>();
  for (const c of input.consignments ?? []) {
    const mine = input.exceptions ? (exceptionsOf.get(c.id) ?? []) : undefined;
    if (!inPlay(c, mine)) continue;
    const list = byJob.get(c.shipmentId) ?? [];
    list.push(c);
    byJob.set(c.shipmentId, list);
  }
  const out: TruckingShipmentFacts[] = [];
  for (const shipmentId of input.shipmentIds) {
    const mine = (byJob.get(shipmentId) ?? []).sort((a, b) => a.pickupDate.localeCompare(b.pickupDate) || a.ref.localeCompare(b.ref));
    const updates = input.updates ? (input.updates.get(shipmentId) ?? { waiting: 0, failed: 0 }) : null;
    if (!mine.length && !(updates && (updates.waiting || updates.failed))) continue;
    out.push({
      shipmentId,
      consignments: mine.map((c) =>
        consignmentFacts(
          c,
          input.trips ? shownTrip(c, input.trips.legs, input.trips.tripOf) : undefined,
          input.exceptions ? (exceptionsOf.get(c.id) ?? []) : undefined,
          input.clock,
        ),
      ),
      updatesWaiting: updates ? updates.waiting : null,
      updatesFailed: updates ? updates.failed : null,
    });
  }
  return out;
}
