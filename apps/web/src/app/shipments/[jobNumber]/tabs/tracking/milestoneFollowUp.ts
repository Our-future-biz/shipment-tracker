import { getFilteredStatusOptions } from "@/lib/columnConfig";
import { addDays, formatDate } from "@/lib/date";
import { CANCELLED_STATUS } from "@/lib/enums";
import { isBillingStatus } from "@/app/shipments/_components/billingRelease";

// What the Record an event dialog says after a milestone (user council O3, owner's answer Q4 (a)):
// Shipment Status stays a field set by hand - recording "Departed" writes the ATD, never the status -
// so the dialog offers the status that usually follows, for the user to tick or pick; nothing
// changes by itself. And an ATD that reads before the cargo's Closing, or days before the ETD, is
// warned about (never refused): it is most often a typing slip on the tax date. Pure, so it is unit-tested.

/** The Shipment Status a milestone usually leads to, by Trade Direction (a Trucking job records nothing here). */
const NEXT_STATUS: Record<string, Partial<Record<string, string>>> = {
  // "Loaded - Customs Clearance In Progress" is the cargo loaded at the shipper, not on board at the
  // POL (that comes after export clearance): offered after the pick-up (mock council S7-Q2 / R14).
  Export: {
    picked_up: "Loaded - Customs Clearance In Progress [EXP]",
    departed: "Pre-Alert Sent [EXP]",
  },
  Import: {
    departed: "Pre-Alert Received - Further Transport To Be Booked [IMP]",
    arrived: "Arrival Notice Sent - Waiting For Instructions [IMP]",
    discharged: "Arrival Notice Sent - Waiting For Instructions [IMP]",
  },
};

/**
 * How far along each status is, by direction: the dropdown's order is not the order a job goes
 * through (an import's "Arrival Notice Sent" is listed before "Pre-Alert Received"), so a status is
 * suggested only when it is further than the job's - never a step back. Equal ranks are steps a job
 * may take in any order.
 */
const STATUS_RANK: Record<string, number> = {
  "Booking Confirmation Pending [IMP]": 0,
  "All Done - Waiting To Be Shipped [IMP]": 1,
  "Pre-Alert Received - Further Transport To Be Booked [IMP]": 2,
  "Arrival Notice Sent - Waiting For Instructions [IMP]": 3,
  "Booked For Further Transport [IMP]": 4,
  "Delivery Date Pending From Customer [IMP]": 4,
  "Customs Clearance Pending [IMP]": 4,
  "Booking Confirmation Pending [EXP]": 0,
  "Pick Up Date Pending From Customer [EXP]": 1,
  "All Done - Waiting To Be Shipped [EXP]": 2,
  "Loaded - Customs Clearance In Progress [EXP]": 3,
  "Pre-Alert Sent [EXP]": 4,
};

/** The milestones after which the next step is billing: released by hand on the job, with its own checks. */
const BILLING_NEXT = new Set(["delivered"]);

const isBilled = (status: string | null | undefined) => /^Billed \[/.test((status ?? "").trim());

/**
 * The statuses the dialog may offer instead: the job's direction's, but not the one it reads.
 * Billing is left out - its release asks what the job still lacks first, on the job page - and so
 * are Billed and Cancelled.
 */
export function offerableStatuses(tradeDirection: string | null | undefined, current: string | null | undefined): string[] {
  const now = (current ?? "").trim();
  return getFilteredStatusOptions(tradeDirection).filter((s) => s !== "---" && s !== CANCELLED_STATUS && s !== now && !isBillingStatus(s) && !isBilled(s));
}

export interface StatusOffer {
  /** The status preselected (the box is still unticked), or "" when it would be no step forward. */
  suggested: string;
  /** What may be picked instead. */
  options: string[];
}

/**
 * What the dialog offers after a milestone of `kind`: its usual next status - unless the job is
 * already that far or further, or is in billing or cancelled - and the statuses to pick from
 * instead. Null for a kind that suggests none, and for a job past it all.
 */
export function statusOfferAfter(kind: string, shipment: { tradeDirection?: string | null; status?: string | null }): StatusOffer | null {
  const next = NEXT_STATUS[shipment.tradeDirection ?? ""]?.[kind];
  const now = (shipment.status ?? "").trim();
  if (!next || isBillingStatus(now) || isBilled(now) || now === CANCELLED_STATUS) return null;
  const options = offerableStatuses(shipment.tradeDirection, now);
  const rankNow = STATUS_RANK[now];
  const ahead = rankNow === undefined || (STATUS_RANK[next] ?? 0) > rankNow;
  return { suggested: ahead && options.includes(next) ? next : "", options };
}

/**
 * What the dialog adds when the status to set says a notice went out: recording the event sends no
 * pre-alert or arrival notice, so the status is set only if it was sent (mock council S7-Q3 / R15).
 */
export function sentOnlyHint(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  if (/^Pre-Alert Sent\b/.test(s)) return "Only if the pre-alert was sent: recording the event sends none.";
  if (/^Arrival Notice Sent\b/.test(s)) return "Only if the arrival notice was sent: recording the event sends none.";
  return "";
}

/** After a delivery: the job is next released for billing, which is done on the job page; "" otherwise. */
export function billingHintAfter(kind: string, status: string | null | undefined): string {
  if (!BILLING_NEXT.has(kind) || isBillingStatus(status) || isBilled(status) || (status ?? "").trim() === CANCELLED_STATUS) return "";
  return "Once its costs and sales are in, release the job for billing: Shipment Status → Billing on the job page.";
}

/** How many days before the ETD an ATD is still read as a normal early sailing. */
export const ATD_DAYS_BEFORE_ETD = 3;

/**
 * Why an ATD of `day` looks wrong, or "" when it doesn't: before the cargo's Closing, or more than
 * ATD_DAYS_BEFORE_ETD days before the ETD. A warning only - it is still saved.
 */
export function atdWarning(day: string, shipment: { closingDate?: string | null; estimatedDeparture?: string | null }): string {
  const closing = (shipment.closingDate ?? "").slice(0, 10);
  const etd = (shipment.estimatedDeparture ?? "").slice(0, 10);
  if (closing && day < closing) return `This ATD is before the cargo's Closing (${formatDate(closing)}). Check the date: the ATD is the job's tax date.`;
  if (etd && day < addDays(etd, -ATD_DAYS_BEFORE_ETD)) return `This ATD is more than ${ATD_DAYS_BEFORE_ETD} days before the ETD (${formatDate(etd)}). Check the date: the ATD is the job's tax date.`;
  return "";
}

/**
 * The same warning for an ATD typed in its column (the Shipments grid, the job page) or written by a
 * document reading, not only one recorded in Record an event (mock council S7-4): `value` is the day
 * saved (YYYY-MM-DD, a time after it allowed). "" for any other field, a cleared ATD, or a day that
 * looks right. A warning only - the ATD is saved as typed.
 */
export function atdEditWarning(fieldKey: string, value: string | null | undefined, shipment: { closingDate?: string | null; estimatedDeparture?: string | null } | undefined): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec((value ?? "").trim())?.[0];
  return fieldKey === "actualDeparture" && day && shipment ? atdWarning(day, shipment) : "";
}
