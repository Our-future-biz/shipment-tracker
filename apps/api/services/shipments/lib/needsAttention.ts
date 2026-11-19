import { addDays } from "../../../lib/businessDate";
import type { ShipmentDeadline, ShipmentDueItem } from "../interfaces/interfaces";
import { ETD_PASSED_AFTER_DAYS, PASSED_DATE_KEPT_DAYS } from "./cockpitThresholds";
import { withoutDismissed, type CutoffDismissed } from "./cutoffDismissals";
import { cargoIn, cutoffsOf, timelineFactsOf, type CutoffJob, type OpsDay, type TimelineFacts } from "./managersCockpit";

// The Shipments list's Needs Attention - the two cards above the grid, the Overview tile
// "Needs Attention" and the list that tile opens - on the deadline rules of Shipments → Managers
// (Council Outlay 11, D9), so the two pages never disagree about what is due or missed. Pure: no
// database, tested in tests/needsAttention.test.ts.
//
//   windows   the cockpit's own (lib/managersCockpit opsDay): URGENT is today and the next working
//             day, ATTENTION the two working days after
//   cut-offs  Closing, VGM, SI, AMS, ISF, each with its time: the cockpit's cutoffsOf itself, not
//             a copy. A job that has left (ATD, ATA or actual delivery) has none. A missed one
//             stays URGENT (D7) until the cockpit's "ETD passed, no ATD" takes over (the day after
//             the ETD by air, two days after it otherwise) - with no ETD, for 7 days after its own
//             date - and a Closing only until the cargo is in. A missed one a manager
//             dismissed is left out while it keeps its date (lib/cutoffDismissals), as on the cockpit
//   dates     what this list has always shown as coming up - cargo ready, pick-up, ETD, ETA, ETA
//             warehouse, planned delivery. They count while still ahead: the day after, they are gone
//
// Nothing here asks how a job travels or which way: every Trade Direction, Domestic too, every mode.

/** Jobs Needs Attention reads at most, the newest first; the answer says when there were more (`capped`). */
export const NEEDS_ATTENTION_JOB_LIMIT = 2000;

/** The plain dates a job has to be ready for, in the order they are shown when they fall on one day. */
export const PLAIN_DATE_FIELDS = ["cargoReadinessDate", "pickupDate", "estimatedDeparture", "estimatedArrival", "etaWarehouse", "plannedDeliveryDate"] as const;
type PlainDateField = (typeof PLAIN_DATE_FIELDS)[number];

/** An active job as Needs Attention reads it: who it is, its cut-offs with their times and statuses, and its plain dates. */
export interface DueJob extends CutoffJob, Record<PlainDateField, string | null> {
  id: string;
  jobNumber: string;
  customerId: string | null;
  customer: string;
  tradeDirection: string;
  status: string;
  /** Received at our warehouse: the cargo then made its Closing, whatever the timeline says. */
  warehouseReceivedDate: string | null;
}

/** What is due on one job, by window; each soonest first. */
export interface JobDue {
  /** Today or by the next working day, and every cut-off that is missed or overdue. */
  urgent: ShipmentDeadline[];
  /** In the two working days after. */
  attention: ShipmentDeadline[];
}

/** Calendar days from `from` to `to` (YYYY-MM-DD), negative when `to` is earlier. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// Dates of one day are shown in this order: the plain dates as the job is worked, the Closing
// among them, then the filings.
const FIELD_ORDER: readonly string[] = ["cargoReadinessDate", "pickupDate", "closingDate", "estimatedDeparture", "estimatedArrival", "etaWarehouse", "plannedDeliveryDate", "vgmClosing", "siClosing", "amsDeadline", "isfDeadline"];
const soonest = (a: ShipmentDeadline, b: ShipmentDeadline) => a.daysLeft - b.daysLeft || FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field);

/**
 * What is due on a job on `day`, by window.
 *
 *   The cut-offs are the cockpit's (cutoffsOf): `cargoIsIn` is what it asks about the Closing
 *   (lib/managersCockpit cargoIn) - true drops it; null, when nobody can tell, leaves a Closing
 *   still ahead (its date alone says that) and withholds only "Closing missed".
 *   A plain date counts from today to the end of the ATTENTION window; one that passed is not kept.
 *   `dismissed`: the job's missed cut-offs a manager dismissed (lib/cutoffDismissals) - left out.
 */
export function dueOf(job: DueJob, day: OpsDay, cargoIsIn: boolean | null, dismissed: readonly CutoffDismissed[] = []): JobDue {
  const urgent: ShipmentDeadline[] = [];
  const attention: ShipmentDeadline[] = [];
  for (const cutoff of withoutDismissed(cutoffsOf(job, day, cargoIsIn), dismissed)) {
    (cutoff.state === "attention" ? attention : urgent).push({ field: cutoff.key, date: cutoff.date, daysLeft: cutoff.days, missed: cutoff.state === "missed", time: cutoff.time });
  }
  for (const field of PLAIN_DATE_FIELDS) {
    const date = job[field];
    if (!date || date < day.today || date > day.attentionUntil) continue;
    (date <= day.urgentUntil ? urgent : attention).push({ field, date, daysLeft: daysBetween(day.today, date), missed: false, time: "" });
  }
  return { urgent: urgent.sort(soonest), attention: attention.sort(soonest) };
}

/** A timeline that is known and says nothing: a job with no event has no entry in the map. */
const NO_EVENTS = timelineFactsOf([]);

/** Whether the job's cargo made its Closing, as the cockpit asks it; `timeline` is null when the events could not be read. */
const cargoIsIn = (job: DueJob, timeline: ReadonlyMap<string, TimelineFacts> | null) => cargoIn(job, timeline ? (timeline.get(job.id) ?? NO_EVENTS) : null);

/** The tracking events that show the cargo made its Closing (lib/managersCockpit cargoIn reads these three off the timeline). */
export const CARGO_IN_EVENT_KINDS = ["picked_up", "loaded", "gate_in"] as const;

/**
 * The jobs whose Closing counts unless the timeline shows the cargo is in: only their events need
 * reading. Asked of the rule itself - "would the Closing count if the cargo were not in?" - so
 * this cannot drift from it. A job received at our warehouse needs no read: its cargo is in.
 */
export function closingToCheck(jobs: readonly DueJob[], day: OpsDay): string[] {
  return jobs.filter((job) => cargoIn(job, null) === null && cutoffsOf(job, day, false).some((c) => c.key === "closingDate")).map((job) => job.id);
}

/** The two lists of the Shipments page. A job with dates in both windows is in both, each time with that window's dates. */
export interface NeedsAttentionLists {
  /** URGENT: due today or by the next working day, or a cut-off missed or overdue. */
  within24h: ShipmentDueItem[];
  /** ATTENTION: due in the two working days after. */
  within48h: ShipmentDueItem[];
}

// The most pressing first: the earliest date (a missed one is the earliest), then the reference.
const mostPressing = (a: ShipmentDueItem, b: ShipmentDueItem) => {
  const [x, y] = [a.deadlines[0]!, b.deadlines[0]!];
  return x.date < y.date ? -1 : x.date > y.date ? 1 : a.jobNumber < b.jobNumber ? -1 : a.jobNumber > b.jobNumber ? 1 : 0;
};

/**
 * The two lists, from the jobs read and what their timelines say (lib/managersCockpit
 * timelineFactsOf, by shipment id; null when the events could not be read - then, as on the
 * cockpit, a Closing still ahead is listed by its date and no "Closing missed" is said on a job
 * that was not received at our warehouse). `dismissals`: the jobs' dismissed cut-offs by shipment
 * id (services/cutoffDismissal.service cutoffDismissalsOf); left out, nothing is dismissed.
 */
export function needsAttentionOf(
  jobs: readonly DueJob[],
  timeline: ReadonlyMap<string, TimelineFacts> | null,
  day: OpsDay,
  dismissals?: ReadonlyMap<string, readonly CutoffDismissed[]>,
): NeedsAttentionLists {
  const within24h: ShipmentDueItem[] = [];
  const within48h: ShipmentDueItem[] = [];
  for (const job of jobs) {
    const due = dueOf(job, day, cargoIsIn(job, timeline), dismissals?.get(job.id));
    const item = (deadlines: ShipmentDeadline[]): ShipmentDueItem => ({ id: job.id, jobNumber: job.jobNumber, customerId: job.customerId, customer: job.customer, tradeDirection: job.tradeDirection, status: job.status, deadlines });
    if (due.urgent.length) within24h.push(item(due.urgent));
    if (due.attention.length) within48h.push(item(due.attention));
  }
  return { within24h: within24h.sort(mostPressing), within48h: within48h.sort(mostPressing) };
}

/** The jobs the Overview tile "Needs Attention" counts and its list shows: those on the URGENT card. */
export const urgentIds = (lists: Pick<NeedsAttentionLists, "within24h">): string[] => lists.within24h.map((item) => item.id);

/** The days the read of the jobs is bounded by: it must find every job the rules above could list. */
export interface CandidateRange {
  /** Today. */
  from: string;
  /** The last day of the ATTENTION window. */
  until: string;
  /**
   * A job with no ETD keeps a missed or overdue cut-off while the cut-off's own date is not before
   * this day (cutoffsOf: PASSED_DATE_KEPT_DAYS).
   */
  passedSince: string;
  /**
   * A job with an ETD keeps it, however old the cut-off, until "ETD passed, no ATD" takes over:
   * ETD_PASSED_AFTER_DAYS of its mode after the ETD (cutoffsOf). This is the earliest ETD that can
   * still hold one - the longest of those waits back - whatever the mode: the rule says which.
   */
  etdSince: string;
}

/** The longest wait of any mode before "ETD passed, no ATD": a missed cut-off stays up to the day before it. */
const LONGEST_ETD_PASSED_AFTER_DAYS = Math.max(...Object.values(ETD_PASSED_AFTER_DAYS));

/** The read's bounds on `day`: the two windows, and how far back a cut-off that passed still counts - on a job with no ETD, and by the ETD of one with it. */
export const candidateRange = (day: OpsDay): CandidateRange => ({
  from: day.today,
  until: day.attentionUntil,
  passedSince: addDays(day.today, -PASSED_DATE_KEPT_DAYS),
  etdSince: addDays(day.today, -(LONGEST_ETD_PASSED_AFTER_DAYS - 1)),
});
