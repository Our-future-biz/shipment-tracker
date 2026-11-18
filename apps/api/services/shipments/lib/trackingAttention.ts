// What a shipment's dates say needs doing, beyond the deadlines coming up: a date that passed with
// nothing recorded, a date waiting to be confirmed, the customer not told, a job that arrived and
// isn't being billed (Council Outlay 8, D15). Pure, so it is unit-tested.

import { isDeliveryDated } from "../../../lib/deliveryDated";
import { addDays } from "../../../lib/businessDate";
import { isWorkingDay, workingDaysAfter } from "../../../lib/workingDays";
import type { TrackingAttentionFlag } from "../interfaces/interfaces";
import { toldDifferences } from "./customerNotice";
import type { DetentionClock } from "./detentionClock";
import { TRACKING_KINDS, SOURCE_LABELS, isTrackingKind, isTruckingJob, type TrackingSource } from "./trackingEvents";
import {
  ARRIVAL_LATE_AFTER_DAYS,
  EXPORT_DEPARTURE_LATE_AFTER_DAYS,
  NOT_RELEASED_AFTER_WORKING_DAYS,
  NO_EVENT_AFTER_DAYS,
  NO_ONWARD_AFTER_WORKING_DAYS,
  TAX_DATE_LATE_DAYS,
  TAX_DATE_WARN_DAYS,
} from "./trackingThresholds";

export interface AttentionShipment {
  tradeDirection: string;
  freightMode: string;
  department: string;
  status: string;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
  etaWarehouse: string | null;
  warehouseReceivedDate: string | null;
  plannedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
}

export interface AttentionFacts {
  proposed: readonly { kind: string; source: string; effectValue: string | null; occurredOn: string }[];
  /** The latest day anything was recorded as happening; null when nothing was. */
  lastEventDay: string | null;
  arrivedAtHub: boolean;
  lastNotice: { etaPod: string | null; etaWarehouse: string | null; plannedDelivery: string | null } | null;
  /** The clocks of the job's boxes that have free time set. */
  clocks?: readonly { containerNumber: string; clock: DetentionClock }[];
}

/**
 * The numbers the date rules run on. The Tracking tab, the bell and Needs Attention judge by
 * DEFAULT_ATTENTION_RULES, the single thresholds of lib/trackingThresholds; Shipments → Managers
 * hands in its own, per mode (lib/cockpitThresholds, Council Outlay 11, D8).
 */
export interface AttentionRules {
  /** Days after the ETA with no ATA before it asks for attention. */
  arrivalLateAfterDays: number;
  /** Days after the ETD with no ATD before it asks for attention. */
  departureLateAfterDays: number;
  /** Whether a job that is no export is asked for its ATD too - while it has neither an ATA nor an actual delivery: once it arrived, its departure is history. */
  departureLateForImports: boolean;
  /** Working days after the ATA with no gate-in, hub arrival or delivery before it asks for attention. */
  noOnwardAfterWorkingDays: number;
  /** Days after departure with no event before it asks for attention. Null turns the row off. */
  noEventAfterDays: number | null;
  /** Days off on top of the weekends and the statutory holidays (the company's own, from the holidays service). */
  extraHolidays: readonly string[];
}

export const DEFAULT_ATTENTION_RULES: AttentionRules = {
  arrivalLateAfterDays: ARRIVAL_LATE_AFTER_DAYS,
  departureLateAfterDays: EXPORT_DEPARTURE_LATE_AFTER_DAYS,
  departureLateForImports: false,
  noOnwardAfterWorkingDays: NO_ONWARD_AFTER_WORKING_DAYS,
  noEventAfterDays: NO_EVENT_AFTER_DAYS,
  extraHolidays: [],
};

/**
 * Working days after `from` up to and including `to`, as lib/workingDays counts them, less the
 * `extraHolidays` that fell on a working day in between. With none it is workingDaysAfter itself.
 */
export function workingDaysSince(from: string, to: string, extraHolidays: readonly string[] = []): number {
  const worked = workingDaysAfter(from, to);
  if (extraHolidays.length === 0) return worked;
  return worked - new Set(extraHolidays.filter((h) => h > from && h <= to && isWorkingDay(h))).size;
}

const czDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const isReleased = (status: string) => /^bill/i.test(status.trim());

/** The actual date the job is taxed by, null until there is one. */
function taxDayOf(s: AttentionShipment): string | null {
  if (isDeliveryDated(s)) return s.actualDeliveryDate;
  return s.tradeDirection.trim().toLowerCase() === "export" ? s.actualDeparture : s.actualArrival;
}

/**
 * The shipment's flags, the most urgent first. It is an active one: not invoiced, not cancelled.
 * `rules` are the thresholds it is judged by: left out, the ones everybody but the managers'
 * cockpit uses.
 */
export function attentionFlags(s: AttentionShipment, facts: AttentionFacts, today: string, rules: AttentionRules = DEFAULT_ATTENTION_RULES): TrackingAttentionFlag[] {
  const flags: TrackingAttentionFlag[] = [];
  const add = (kind: TrackingAttentionFlag["kind"], severity: TrackingAttentionFlag["severity"], area: TrackingAttentionFlag["area"], label: string, detail: string) =>
    flags.push({ kind, severity, area, label, detail });

  const trucking = isTruckingJob(s);
  const isExport = s.tradeDirection.trim().toLowerCase() === "export";

  for (const p of facts.proposed) {
    const what = isTrackingKind(p.kind) ? TRACKING_KINDS[p.kind].label : p.kind;
    const source = SOURCE_LABELS[p.source as TrackingSource] ?? "";
    add("to_confirm", "urgent", "tracking", "Date to confirm", [`${what} ${czDay(p.effectValue ?? p.occurredOn)}`, source].filter(Boolean).join(" · "));
  }

  if (!trucking) {
    if (s.estimatedArrival && !s.actualArrival && !(isExport && s.actualDeliveryDate) && s.estimatedArrival <= addDays(today, -rules.arrivalLateAfterDays)) {
      add("eta_passed", "urgent", "tracking", "ETA passed, no ATA", `ETA ${czDay(s.estimatedArrival)}, ${daysBetween(s.estimatedArrival, today)} days ago`);
    }
    const askedForAtd = isExport || (rules.departureLateForImports && !s.actualArrival && !s.actualDeliveryDate);
    if (askedForAtd && s.estimatedDeparture && !s.actualDeparture && s.estimatedDeparture <= addDays(today, -rules.departureLateAfterDays)) {
      add("etd_passed", "urgent", "tracking", "ETD passed, no ATD", `ETD ${czDay(s.estimatedDeparture)}, ${daysBetween(s.estimatedDeparture, today)} days ago`);
    }
    const noOnward = !isExport && s.actualArrival && !s.warehouseReceivedDate && !s.actualDeliveryDate && !facts.arrivedAtHub;
    if (noOnward && workingDaysSince(s.actualArrival!, today, rules.extraHolidays) >= rules.noOnwardAfterWorkingDays) {
      add("no_onward", "attention", "tracking", "Arrived, nothing since", `ATA ${czDay(s.actualArrival!)}: no gate-in, hub arrival or delivery`);
    }
    if (rules.noEventAfterDays !== null && s.actualDeparture && !s.actualArrival && !s.actualDeliveryDate) {
      const last = facts.lastEventDay && facts.lastEventDay > s.actualDeparture ? facts.lastEventDay : s.actualDeparture;
      if (daysBetween(last, today) >= rules.noEventAfterDays) add("no_event", "attention", "tracking", "No tracking", `Nothing recorded since ${czDay(last)}`);
    }
  }

  if (facts.lastNotice) {
    for (const d of toldDifferences(facts.lastNotice, s)) {
      add("not_told", "attention", "tracking", "Customer not told", `${d.what}: told ${czDay(d.told)}, now ${d.now ? czDay(d.now) : "no date"}`);
    }
  }

  const taxDay = taxDayOf(s);
  if (taxDay) {
    const age = daysBetween(taxDay, today);
    if (age >= TAX_DATE_WARN_DAYS) {
      add("tax_date", age >= TAX_DATE_LATE_DAYS ? "urgent" : "attention", "finance", "Tax date running out", `Tax date ${czDay(taxDay)}, ${age} days ago, no invoice`);
    }
    if (!isDeliveryDated(s) && !isReleased(s.status) && workingDaysSince(taxDay, today, rules.extraHolidays) >= NOT_RELEASED_AFTER_WORKING_DAYS) {
      add("not_released", "attention", "finance", "Not released for billing", `${isExport ? "ATD" : "ATA"} ${czDay(taxDay)}`);
    }
  }
  if (!trucking && s.actualDeliveryDate && !isReleased(s.status)) {
    add("delivered_not_billed", "attention", "finance", "Delivered, not billed", `Delivered ${czDay(s.actualDeliveryDate)}`);
  }

  const boxes = (rows: readonly { containerNumber: string; clock: DetentionClock }[], words: (clock: DetentionClock) => string) =>
    [...rows.slice(0, 3).map((r) => `${r.containerNumber} ${words(r.clock)}`), ...(rows.length > 3 ? [`and ${rows.length - 3} more`] : [])].join(" · ");
  const clocks = facts.clocks ?? [];
  const over = clocks.filter((c) => c.clock.state === "chargeable");
  const ending = clocks.filter((c) => c.clock.state === "ending");
  if (over.length > 0) add("free_time", "urgent", "tracking", "Free time over", boxes(over, (c) => `${c.chargeableDays} d over`));
  if (ending.length > 0) add("free_time", "attention", "tracking", "Free time ends", boxes(ending, (c) => (c.daysLeft ? `in ${c.daysLeft} d` : "today")));

  return flags.sort((a, b) => Number(b.severity === "urgent") - Number(a.severity === "urgent"));
}
