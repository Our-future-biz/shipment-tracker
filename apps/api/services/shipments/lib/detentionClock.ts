// A container's free time at the carrier (Council Outlay 8, D21): how long the box may stay out
// before the carrier charges for it. It belongs to the box and the booking, not to our yard, so the
// warehouse reads it from here. Pure, so it is unit-tested.
//
//   start        the day it was discharged, or the day it left the terminal, as the booking says
//   free days    typed per container; the carrier's stated last free day wins over counting them
//   counting     calendar days; the day after the start is the first free day
//   stop         the day the empty was returned; only an import's clock runs (sea and rail)
//
// One number of free days: demurrage and detention aren't told apart, and neither is a price held.

import { addDays } from "../../../lib/businessDate";
import { freightKindOf } from "./trackingEvents";
import { FREE_TIME_WARN_DAYS } from "./trackingThresholds";

export const FREE_TIME_FROM = ["discharge", "gate_out"] as const;
export type FreeTimeFrom = (typeof FREE_TIME_FROM)[number];

export type ClockState = "unknown" | "not_started" | "running" | "ending" | "chargeable" | "returned";

export interface DetentionClock {
  state: ClockState;
  /** The day counting starts from; null until it happened. */
  startDay: string | null;
  /** The last day without a charge; null while it can't be told. */
  lastFreeDay: string | null;
  /** Free days left today; null without a last free day. Below 0 when it passed. */
  daysLeft: number | null;
  /** Days past the last free day: to the return, else to today. */
  chargeableDays: number;
  /** The day the empty went back; null until then. */
  stopDay: string | null;
}

export interface ClockInput {
  freeTimeDays: number | null;
  freeTimeFrom: string;
  /** The last free day the carrier stated. */
  lastFreeDayStated: string | null;
  discharged: string | null;
  gateOut: string | null;
  emptyReturned: string | null;
  today: string;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function detentionClock(c: ClockInput): DetentionClock {
  const startDay = c.freeTimeFrom === "gate_out" ? c.gateOut : c.discharged;
  const stopDay = c.emptyReturned;
  const counted = startDay && c.freeTimeDays != null ? addDays(startDay, c.freeTimeDays) : null;
  const lastFreeDay = c.lastFreeDayStated ?? counted;
  if (!lastFreeDay) return { state: c.freeTimeDays == null ? "unknown" : "not_started", startDay, lastFreeDay: null, daysLeft: null, chargeableDays: 0, stopDay };
  const daysLeft = daysBetween(c.today, lastFreeDay);
  const chargeableDays = Math.max(0, daysBetween(lastFreeDay, stopDay ?? c.today));
  const state: ClockState = stopDay ? "returned" : chargeableDays > 0 ? "chargeable" : daysLeft <= FREE_TIME_WARN_DAYS ? "ending" : "running";
  return { state, startDay, lastFreeDay, daysLeft, chargeableDays, stopDay };
}

/** Only an import's box runs a clock here: a plane has none, a road job's truck comes back by itself. */
export function clockApplies(s: { tradeDirection: string; freightMode: string }): boolean {
  if (s.tradeDirection.trim().toLowerCase() === "export") return false;
  const kind = freightKindOf(s);
  return kind === "sea" || kind === "rail";
}

export const CLOCK_EVENT_KINDS = ["discharged", "terminal_out", "empty_returned"] as const;

export interface ClockEvent {
  kind: string;
  occurredOn: string;
  containerNumber: string;
  effect: string;
}

/** The day a thing happened to this box: said of the box itself, else of the whole shipment. The earliest counts. */
function dayOf(events: readonly ClockEvent[], kind: string, containerNumber: string): string | null {
  const ofKind = events.filter((e) => e.kind === kind && e.effect !== "dismissed" && e.effect !== "proposed");
  const own = ofKind.filter((e) => e.containerNumber === containerNumber);
  const days = (own.length > 0 ? own : ofKind.filter((e) => !e.containerNumber)).map((e) => e.occurredOn).sort();
  return days[0] ?? null;
}

export interface ClockContainer {
  containerNumber: string;
  freeTimeDays: number | null;
  freeTimeFrom: string;
  lastFreeDay: string | null;
}

/** A box's clock from what the shipment's events say. */
export function clockOf(container: ClockContainer, events: readonly ClockEvent[], today: string): DetentionClock {
  return detentionClock({
    freeTimeDays: container.freeTimeDays ?? null,
    freeTimeFrom: container.freeTimeFrom,
    lastFreeDayStated: container.lastFreeDay ?? null,
    discharged: dayOf(events, "discharged", container.containerNumber),
    gateOut: dayOf(events, "terminal_out", container.containerNumber),
    emptyReturned: dayOf(events, "empty_returned", container.containerNumber),
    today,
  });
}
