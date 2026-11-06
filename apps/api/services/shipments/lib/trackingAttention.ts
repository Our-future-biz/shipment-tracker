// What a shipment's dates say needs doing, beyond the deadlines coming up: a date that passed with
// nothing recorded, a date waiting to be confirmed, the customer not told, a job that arrived and
// isn't being billed (Council Outlay 8, D15). Pure, so it is unit-tested.

import { isDeliveryDated } from "../../../lib/deliveryDated";
import { addDays } from "../../../lib/businessDate";
import { workingDaysAfter } from "../../../lib/workingDays";
import type { TrackingAttentionFlag } from "../interfaces/interfaces";
import { toldDifferences } from "./customerNotice";
import type { DetentionClock } from "./detentionClock";
import { TRACKING_KINDS, SOURCE_LABELS, isRoadJob, isTrackingKind, type TrackingSource } from "./trackingEvents";
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

const czDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const isReleased = (status: string) => /^bill/i.test(status.trim());

/** The actual date the job is taxed by, null until there is one. */
function taxDayOf(s: AttentionShipment): string | null {
  if (isDeliveryDated(s)) return s.actualDeliveryDate;
  return s.tradeDirection.trim().toLowerCase() === "export" ? s.actualDeparture : s.actualArrival;
}

/** The shipment's flags, the most urgent first. It is an active one: not invoiced, not cancelled. */
export function attentionFlags(s: AttentionShipment, facts: AttentionFacts, today: string): TrackingAttentionFlag[] {
  const flags: TrackingAttentionFlag[] = [];
  const add = (kind: TrackingAttentionFlag["kind"], severity: TrackingAttentionFlag["severity"], area: TrackingAttentionFlag["area"], label: string, detail: string) =>
    flags.push({ kind, severity, area, label, detail });

  const road = isRoadJob(s);
  const isExport = s.tradeDirection.trim().toLowerCase() === "export";

  for (const p of facts.proposed) {
    const what = isTrackingKind(p.kind) ? TRACKING_KINDS[p.kind].label : p.kind;
    const source = SOURCE_LABELS[p.source as TrackingSource] ?? "";
    add("to_confirm", "urgent", "tracking", "Date to confirm", [`${what} ${czDay(p.effectValue ?? p.occurredOn)}`, source].filter(Boolean).join(" · "));
  }

  if (!road) {
    if (s.estimatedArrival && !s.actualArrival && !(isExport && s.actualDeliveryDate) && s.estimatedArrival <= addDays(today, -ARRIVAL_LATE_AFTER_DAYS)) {
      add("eta_passed", "urgent", "tracking", "ETA passed, no ATA", `ETA ${czDay(s.estimatedArrival)}, ${daysBetween(s.estimatedArrival, today)} days ago`);
    }
    if (isExport && s.estimatedDeparture && !s.actualDeparture && s.estimatedDeparture <= addDays(today, -EXPORT_DEPARTURE_LATE_AFTER_DAYS)) {
      add("etd_passed", "urgent", "tracking", "ETD passed, no ATD", `ETD ${czDay(s.estimatedDeparture)}, ${daysBetween(s.estimatedDeparture, today)} days ago`);
    }
    const noOnward = !isExport && s.actualArrival && !s.warehouseReceivedDate && !s.actualDeliveryDate && !facts.arrivedAtHub;
    if (noOnward && workingDaysAfter(s.actualArrival!, today) >= NO_ONWARD_AFTER_WORKING_DAYS) {
      add("no_onward", "attention", "tracking", "Arrived, nothing since", `ATA ${czDay(s.actualArrival!)}: no gate-in, hub arrival or delivery`);
    }
    if (NO_EVENT_AFTER_DAYS !== null && s.actualDeparture && !s.actualArrival && !s.actualDeliveryDate) {
      const last = facts.lastEventDay && facts.lastEventDay > s.actualDeparture ? facts.lastEventDay : s.actualDeparture;
      if (daysBetween(last, today) >= NO_EVENT_AFTER_DAYS) add("no_event", "attention", "tracking", "No tracking", `Nothing recorded since ${czDay(last)}`);
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
    if (!isDeliveryDated(s) && !isReleased(s.status) && workingDaysAfter(taxDay, today) >= NOT_RELEASED_AFTER_WORKING_DAYS) {
      add("not_released", "attention", "finance", "Not released for billing", `${isExport ? "ATD" : "ATA"} ${czDay(taxDay)}`);
    }
  }
  if (!road && s.actualDeliveryDate && !isReleased(s.status)) {
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
