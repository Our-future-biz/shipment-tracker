import { businessDay, businessInstant, businessTime, isRealYmd } from "../../../lib/businessDate";
import { officeMinutesBetween } from "../../../lib/officeHours";
import { addWorkingDays, isWorkingDay, nextWorkingDay, weekday } from "../../../lib/workingDays";
import {
  DANGEROUS_ATTENTION_DAYS,
  DANGEROUS_URGENT_DAYS,
  DECLINED_NOT_REPLACED_HOURS,
  DELIVERY_ORDER_ATTENTION_WORKING_DAYS,
  DELIVERY_ORDER_RULE_FROM,
  DELIVERY_ORDER_URGENT_WORKING_DAYS,
  ETA_PASSED_KEPT_DAYS,
  IMPORT_INSTRUCTIONS_ANSWER_WORKING_DAYS,
  IMPORT_INSTRUCTIONS_OPEN_DAYS,
  MASTER_JOB_CLOSING_DAYS,
  MASTER_JOB_NO_HOUSE_DAYS,
  ORIGINAL_BL_URGENT_DAYS,
  PAPERWORK_ATTENTION_DAYS,
  PAPERWORK_URGENT_DAYS,
  PASSED_DATE_KEPT_DAYS,
  REMEASURE_ATTENTION_AIR_OFFICE_HOURS,
  REMEASURE_ATTENTION_HOURS,
  REMEASURE_COSTS_WORKING_DAYS,
  REMEASURE_URGENT_AIR_DEPARTURE_DAYS,
  REMEASURE_URGENT_HOURS,
  REMEASURE_WAREHOUSE_CONCEPT_DAYS,
  REQUEST_WAITING_WORKING_DAYS,
  REVIEW_WAITING_URGENT_OFFICE_HOURS,
  REVIEW_WAITING_WORKING_DAYS,
  STATUS_STUCK_WORKING_DAYS,
  T1_OFFICE_DAYS,
  UNDER_CLEARANCE_WORKING_DAYS,
} from "./cockpitThresholds";
import type { OpsSignal } from "./managersCockpit";
import type { RemeasureVerdict } from "./remeasureNotice";
import { CUSTOMS_DOCUMENT_TYPES, SAFETY_PAPERWORK_TYPES, documentTypeLabel, isReviewedDocumentType, missingDocumentTypes } from "./requiredDocuments";
import { workingDaysSince } from "./trackingAttention";
import { CUSTOMS_CLEARED, freightKindOf, isTruckingJob } from "./trackingEvents";

// The operations managers' cockpit (Shipments → Managers, Council Outlay 11, step 2): the signals
// a job's own row cannot give, because the fact lives in another table - its documents and their
// customs review, the requests waiting for a manager, the customer's Import Instructions, the
// warehouse's remeasurement, how long a status has stood, and its Master Job. Pure: each rule
// takes plain facts, the Prague day `today`, the moment `now` and the company's extra holidays;
// services/managersCockpitExtra.service reads the facts. Tested in tests/managersCockpitExtra.test.ts.
//
// A rule that cannot know says nothing: a fact that was not read is passed as null (or left out)
// and gives no signal - the service names it in `notKnown` (D29: not known is not zero).

// Every number these rules read is in lib/cockpitThresholds.ts, with the cockpit's others (D8).

// ─── What is read ───────────────────────────────────────────────

/**
 * An active job as these rules read it: the columns of the cockpit's row they need, under the
 * row's own names, so the row can be handed over as it is.
 */
export interface ExtraJob {
  id: string;
  tradeDirection: string;
  freightMode: string;
  department: string;
  status: string;
  customsPriority: string;
  /** As stored: the steps set by hand. What the shipment shows follows its paperwork (shownCustomsStatus). */
  customsStatus: string;
  /** A Prague wall time, "YYYY-MM-DD HH:mm"; "" for none. */
  customsDeadline: string;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
  actualDeliveryDate: string | null;
  closingDate: string | null;
  shippingInstructions: string | null;
  bolDraft: string | null;
  masterBolType: string | null;
  /**
   * The import's B/L in hand (step 6, D31). Left out (undefined) when the row read does not carry
   * them: then the original B/L counts as not in hand, as before, and the delivery order is not
   * known - no "no delivery order" tag. null: no such day.
   */
  originalsReceivedDate?: string | null;
  telexReleaseReceivedDate?: string | null;
  deliveryOrderDate?: string | null;
  /** "Yes" for dangerous goods. */
  dangerous: string | null;
  masterJobId: string | null;
  customsProcedure: string | null;
  customsOffice: string | null;
  mrn: string | null;
  warehouseReceivedDate: string | null;
  /**
   * Cargo Details' Pcs, Total Weight (tons) and Total Volume, as stored: what the service checks a
   * remeasurement from Warehouse Concept against (RemeasureFact matchesCargoDetails). Left out when
   * the row read does not carry them: then Cargo Details is not known to match.
   */
  pcs?: string | null;
  totalWeightTons?: string | null;
  totalVolumeCbm?: string | null;
  createdAt: Date | string | null;
}

/** A classified file of a job, with customs' review of it. */
export interface DocumentFact {
  documentType: string;
  /** "" (not reviewed yet) | approved | declined. */
  customsStatus: string;
  customsReviewedAt: Date | null;
  createdAt: Date;
}

/** A request waiting for a manager's answer on Shipments → Managers → Approvals. */
export interface RequestFact {
  kind: "document" | "customs_office";
  requestedAt: Date;
}

/** A job's live Import Instructions form: a link not filled in yet, or the customer's answers waiting. */
export interface ImportInstructionFact {
  status: "open" | "submitted";
  submittedAt: Date | null;
  expiresAt: Date;
}

/** What a job's history says of the warehouse's remeasurement. */
export interface RemeasureFact {
  /**
   * The latest Inform Operations and how its figures stood to the shipment's; null when there was
   * none. `source`: which warehouse informed - "warehouse" (Shipments → Warehouse, whose lines
   * "Accept remeasurement" takes) or "warehouseConcept" (Warehouse Concept, whose lines it does not
   * read). Left out, the Warehouse's, as a line written before the source was kept.
   * `matchesCargoDetails`: Cargo Details (Pcs, Total Weight, Total Volume) now say what it informed
   * of, every figure known on both sides alike (lib/remeasureNotice remeasureVerdict); left out or
   * false when that is not known.
   */
  informed: { at: Date; verdict: RemeasureVerdict; source?: "warehouse" | "warehouseConcept"; matchesCargoDetails?: boolean } | null;
  /** The latest "Accept remeasurement". */
  acceptedAt: Date | null;
  /** The latest "Quantities checked" on Costs Breakdown. */
  costsCheckedAt: Date | null;
}

/** A Master Job as these rules read it. */
export interface MasterJobFact {
  id: string;
  mczNumber: string;
  closingDate: string | null;
  estimatedDeparture: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
}

/** The signal families of this file: the `kind` a tag is filtered by on the cockpit's tiles. */
export type ExtraKind = "paperwork" | "bl" | "dangerous" | "request" | "customs" | "status_stuck" | "import_instructions" | "remeasurement" | "master_job";
/** A cockpit signal that names its family. */
export type ExtraSignal = OpsSignal & { kind: ExtraKind };
type Area = OpsSignal["area"];

/** A Master Job nobody has linked a shipment to: it has no job's row to sit on, so it is a row of its own. */
export interface MasterJobRow {
  id: string;
  /** Its MCZ number. */
  number: string;
  /** The consignee of an import, the shipper of an export; "" when it names neither. */
  customer: string;
  signals: OpsSignal[];
  // What the cockpit's filters and its row can use, as the Master Job stores them.
  freightMode: string;
  tradeDirection: string;
  /** Its own Handled By (an e-mail), "" for nobody. */
  handledBy: string;
  holidayCover: string;
}

/** What services/managersCockpitExtra.service answers: the signals by job id, the Master Jobs that are rows of their own, and the parts that could not be read. */
export interface ExtraSignals {
  byJob: Map<string, OpsSignal[]>;
  masterJobRows: MasterJobRow[];
  notKnown: string[];
}

// ─── Ranks ──────────────────────────────────────────────────────
// Lower = higher in its card. URGENT keeps step 1's order (customs 3, filings 4, Closing 5, then
// Needs Attention's flags 6-9): paperwork that stops a clearance sits with customs, an original
// BoL with the filings, dangerous goods with the Closing they are measured against, and what
// waits for a person - a request, a remeasurement - after the cut-offs. ATTENTION starts after
// step 1's last flag (27), the clocks that run against an arrival or a Closing first.
export const EXTRA_RANK = {
  paperworkUrgent: 3,
  originalBl: 4,
  // Step 6: after the original B/L and the filings it sits with, before the Closing (45 on OPS_RANK's scale).
  deliveryOrderUrgent: 4.5,
  dangerousUrgent: 5,
  request: 6,
  remeasureUrgent: 7,
  paperworkAhead: 28,
  // Step 6: a clock that runs from the arrival, with the paperwork of one (285).
  deliveryOrder: 28.5,
  declinedNotReplaced: 29,
  notReviewed: 30,
  dangerousAhead: 31,
  customsNoDeadline: 32,
  t1NoOffice: 33,
  underClearance: 34,
  clearedNoMrn: 35,
  masterJob: 36,
  importInstructions: 37,
  remeasure: 38,
  remeasureCosts: 39,
  statusStuck: 40,
} as const;

const signal = (urgent: boolean, rank: number, kind: ExtraKind, area: Area, text: string): ExtraSignal => ({ rank, text, urgent, area, kind });

// ─── Days, moments, words ───────────────────────────────────────

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const text = (value: string | null | undefined) => (value ?? "").trim();
const lower = (value: string | null | undefined) => text(value).toLowerCase();
/** A stored day as YYYY-MM-DD; null for none or one that is no day (a date typed as text somewhere upstream). */
const dayOf = (value: string | null | undefined): string | null => {
  const day = text(value).slice(0, 10);
  return isRealYmd(day) ? day : null;
};
/** Calendar days from `from` to `to`, negative when `to` is earlier. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
/** "19.11." of a YYYY-MM-DD day. */
const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
/** "19.11." (Prague) of a moment. */
const dayText = (at: Date) => dm(businessDay(at));
/** "19.11. 14:05" (Prague) of a moment. */
const stamp = (at: Date) => `${dayText(at)} ${businessTime(at)}`;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/**
 * "today", "tomorrow", or "on Fri 20.11.": a day ahead in the words the cockpit's cut-offs use
 * (lib/managersCockpit dueWords, which is not exported - the same wording, written again).
 */
const dueWords = (day: string, today: string) => {
  const days = daysBetween(today, day);
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `on ${WEEKDAYS[weekday(day)]} ${dm(day)}`;
};
/** A moment a row carries, whichever way it came (a Date from the database, an ISO text); null for none. */
const momentOf = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const at = value instanceof Date ? value : new Date(value);
  return Number.isFinite(at.getTime()) ? at : null;
};

/**
 * The moment a wait that began at `since` has lasted `n` working days: the same Prague time `n`
 * working days on. A wait that began on a weekend or a holiday counts from the start of the next
 * working day - nobody could have answered before.
 */
export function afterWorkingDays(since: Date, n: number, holidays: readonly string[]): Date {
  const day = businessDay(since);
  return businessInstant(addWorkingDays(day, n, holidays), isWorkingDay(day, holidays) ? businessTime(since) : "00:00");
}

/** Whether a wait that began at `since` has lasted longer than `n` working days. */
export const waitedWorkingDays = (since: Date, n: number, now: Date, holidays: readonly string[]): boolean =>
  now.getTime() > afterWorkingDays(since, n, holidays).getTime();

const isImport = (job: Pick<ExtraJob, "tradeDirection">) => lower(job.tradeDirection) === "import";

/**
 * Whether the job is past its departure: it has an ATD - or an ATA or a delivery date, which say
 * the same of a job whose ATD nobody typed (an import often has none). What is asked for before a
 * departure (the Closing, the ETD) is no longer asked of it.
 */
export const hasLeft = (job: { actualDeparture: string | null; actualArrival?: string | null; actualDeliveryDate?: string | null }): boolean =>
  !!dayOf(job.actualDeparture) || !!dayOf(job.actualArrival) || !!dayOf(job.actualDeliveryDate);

/**
 * How many working days `day`, later than `today`, is away (D6): the fewest n for which
 * addWorkingDays(today, n) reaches it. On a Friday the Monday after is 1 away, and so are Saturday
 * and Sunday; on 23 Dec 28 Dec is 1 away, over the Christmas holidays. Past `cap` it stops
 * counting and answers cap + 1: no window here is that wide.
 */
export function workingDaysAhead(today: string, day: string, holidays: readonly string[], cap = 31): number {
  let n = 0;
  for (let reached = addWorkingDays(today, 0, holidays); reached < day; reached = nextWorkingDay(reached, holidays)) {
    n += 1;
    if (n > cap) return n;
  }
  return n;
}

/**
 * How far the ETA of a job that has not arrived is: in WORKING days while it is ahead
 * (workingDaysAhead - "within 1" on a Friday is Monday's arrival too), in calendar days once it has
 * passed (negative). 0 today. Null when it has arrived (an ATA, or a delivery date with no ATA
 * typed), has no ETA, or its ETA passed more than ETA_PASSED_KEPT_DAYS ago - that job is not
 * "arriving", it lacks its ATA.
 */
export function arrivingIn(job: Pick<ExtraJob, "estimatedArrival" | "actualArrival" | "actualDeliveryDate">, today: string, holidays: readonly string[] = []): number | null {
  const eta = dayOf(job.estimatedArrival);
  if (!eta || dayOf(job.actualArrival) || dayOf(job.actualDeliveryDate)) return null;
  const days = daysBetween(today, eta);
  if (days < -ETA_PASSED_KEPT_DAYS) return null;
  return days > 0 ? workingDaysAhead(today, eta, holidays) : days;
}

/** "arriving tomorrow", "arriving on Fri 20.11.", "ETA 17.11. passed": the ETA of a job arrivingIn counts. */
const arrivingWords = (job: Pick<ExtraJob, "estimatedArrival">, today: string) => {
  const eta = dayOf(job.estimatedArrival)!;
  return eta < today ? `ETA ${dm(eta)} passed` : `arriving ${dueWords(eta, today)}`;
};

type DepartureJob = Pick<ExtraJob, "closingDate" | "estimatedDeparture" | "actualDeparture" | "actualArrival" | "actualDeliveryDate">;

/**
 * What a job that has not left is measured against: its Closing, or its ETD when it has no
 * Closing, and the days to it (negative once passed). Null when it has left (hasLeft) or has
 * neither date.
 */
export function departureAhead(job: DepartureJob, today: string): { what: "Closing" | "ETD"; day: string; days: number } | null {
  if (hasLeft(job)) return null;
  const closing = dayOf(job.closingDate);
  const day = closing ?? dayOf(job.estimatedDeparture);
  return day ? { what: closing ? "Closing" : "ETD", day, days: daysBetween(today, day) } : null;
}

const departureWords = (d: { what: string; day: string; days: number }, today: string) => (d.days < 0 ? `${d.what} ${dm(d.day)} passed` : `${d.what} ${dueWords(d.day, today)}`);

// ─── Customs status: the TS copy of the shipment's own rule ─────────────

export const PAPERWORK_WAITING = "Waiting For Commercial Paperwork";
export const PAPERWORK_PENDING = "Paperwork Verification Pending";
export const PAPERWORK_VERIFIED = "Paperwork Verified";
export const UNDER_CLEARANCE = "Under Customs Clearance";
/** The steps after the paperwork, set by hand. */
const AFTER_VERIFIED: readonly string[] = [UNDER_CLEARANCE, CUSTOMS_CLEARED];

/**
 * The customs status a shipment shows, as services/shipment.service customsStatusFor decides it
 * (rule for rule; that function is private to the service). It follows the paperwork: waiting
 * until an invoice and a packing list are uploaded; verified once each has an approved document
 * and none of them waits for review; pending in between. A step set by hand (Under Customs
 * Clearance, Customs Cleared/Released) shows only while the paperwork stays verified - so the
 * stored column alone does not say what the shipment shows.
 */
export function shownCustomsStatus(stored: string, documents: readonly Pick<DocumentFact, "documentType" | "customsStatus">[]): string {
  const ofType = (type: string) => documents.filter((d) => d.documentType === type);
  if (!CUSTOMS_DOCUMENT_TYPES.every((type) => ofType(type).length > 0)) return PAPERWORK_WAITING;
  const verified = CUSTOMS_DOCUMENT_TYPES.every((type) => {
    const docs = ofType(type);
    return docs.some((d) => d.customsStatus === "approved") && !docs.some((d) => !d.customsStatus);
  });
  if (!verified) return PAPERWORK_PENDING;
  return AFTER_VERIFIED.includes(stored) ? stored : PAPERWORK_VERIFIED;
}

/** Urgent for customs and not cleared yet, as the Customs page's urgent filter reads the stored columns. */
export const isUrgentForCustoms = (job: Pick<ExtraJob, "customsPriority" | "customsStatus">): boolean =>
  job.customsPriority === "Urgent" && job.customsStatus !== CUSTOMS_CLEARED;

/**
 * Whether the job goes through customs as far as anyone can tell. A Trucking job (Domestic, or of
 * the Road Department) usually does not, yet reads "Waiting For Commercial Paperwork" all its
 * life: it counts only once it has an MRN or a customs deadline - the rule its Tracking tab hides
 * the Customs row by (lib/trackingTimeline).
 */
const goesThroughCustoms = (job: Pick<ExtraJob, "tradeDirection" | "department" | "mrn" | "customsDeadline">) =>
  !isTruckingJob(job) || !!text(job.mrn) || !!text(job.customsDeadline);

// ─── U10, A6: the paperwork of an import that is arriving ──────────────

/** Customs Procedure "C-Goods", as the web lists it: Community goods, which customs does not clear. */
const isCommunityGoods = (procedure: string | null | undefined) => lower(procedure) === "c-goods";

/**
 * An import that has arrived, or is about to, while its customs status still reads "Waiting For
 * Commercial Paperwork" (no Commercial Invoice or no packing list uploaded): URGENT from
 * PAPERWORK_URGENT_DAYS working days before the ETA; ATTENTION from 5 working days out (air and road 2). Once it has
 * arrived it stays URGENT until it is delivered - a delivered job got through customs, whatever
 * was uploaded. C-Goods need no clearance, so they are never tagged, before or after arrival:
 * without those two ends the tag would sit on such a job for as long as it is active. `shown`: the customs status the
 * shipment shows.
 */
export function paperworkSignals(
  job: Pick<ExtraJob, "tradeDirection" | "freightMode" | "department" | "mrn" | "customsDeadline" | "customsProcedure" | "estimatedArrival" | "actualArrival" | "actualDeliveryDate">,
  shown: string,
  today: string,
  holidays: readonly string[] = [],
): ExtraSignal[] {
  if (!isImport(job) || shown !== PAPERWORK_WAITING || !goesThroughCustoms(job) || dayOf(job.actualDeliveryDate) || isCommunityGoods(job.customsProcedure)) return [];
  const arrived = dayOf(job.actualArrival);
  if (arrived) return [signal(true, EXTRA_RANK.paperworkUrgent, "paperwork", "customs", `${PAPERWORK_WAITING} · arrived ${dm(arrived)}`)];
  const days = arrivingIn(job, today, holidays);
  if (days === null || days > PAPERWORK_ATTENTION_DAYS[freightKindOf(job)]) return [];
  const words = `${PAPERWORK_WAITING} · ${arrivingWords(job, today)}`;
  return days <= PAPERWORK_URGENT_DAYS ? [signal(true, EXTRA_RANK.paperworkUrgent, "paperwork", "customs", words)] : [signal(false, EXTRA_RANK.paperworkAhead, "paperwork", "customs", words)];
}

/**
 * An import ORIGINAL_BL_URGENT_DAYS working days from its ETA whose Master BoL Type is still "OBL": an original
 * that is not in hand ("OMBL ok" is one that is; a Telex release or a Sea Waybill needs none).
 * Without it the cargo is not released. A day typed in Originals Received or Telex Release
 * Received says it is in hand (step 6, D31), whatever the type still reads.
 */
export function originalBlSignals(
  job: Pick<ExtraJob, "tradeDirection" | "masterBolType" | "estimatedArrival" | "actualArrival" | "actualDeliveryDate" | "originalsReceivedDate" | "telexReleaseReceivedDate">,
  today: string,
  holidays: readonly string[] = [],
): ExtraSignal[] {
  if (!isImport(job) || text(job.masterBolType).toUpperCase() !== "OBL") return [];
  if (dayOf(job.originalsReceivedDate) || dayOf(job.telexReleaseReceivedDate)) return [];
  const days = arrivingIn(job, today, holidays);
  if (days === null || days > ORIGINAL_BL_URGENT_DAYS) return [];
  return [signal(true, EXTRA_RANK.originalBl, "bl", "details", `Master BoL is an OBL, not in hand · ${arrivingWords(job, today)}`)];
}

/**
 * A sea or rail import that arrived (its ATA) and is not delivered, with no Delivery Order date
 * (step 6): the cargo can't be collected. ATTENTION once DELIVERY_ORDER_ATTENTION_WORKING_DAYS
 * working days have passed since the ATA, URGENT at DELIVERY_ORDER_URGENT_WORKING_DAYS. Only an
 * arrival within the last ETA_PASSED_KEPT_DAYS calendar days is judged, and none before the day the
 * rule went live (DELIVERY_ORDER_RULE_FROM, L9): an older one gives no tag - the Delivery Order date
 * is new (step 6), no job had it before, and a job that arrived weeks ago has been collected or is
 * stuck for reasons this tag does not say. Nor once the cargo is in our warehouse (a Warehouse
 * Received date, m25): an LCL import is collected and devanned by us, its delivery order was
 * handled. Nothing either when the row did not carry the date (undefined): not known is no tag.
 */
export function deliveryOrderSignals(
  job: Pick<ExtraJob, "tradeDirection" | "freightMode" | "department" | "actualArrival" | "actualDeliveryDate" | "deliveryOrderDate" | "warehouseReceivedDate">,
  today: string,
  holidays: readonly string[],
): ExtraSignal[] {
  if (job.deliveryOrderDate === undefined || dayOf(job.deliveryOrderDate) || !isImport(job) || dayOf(job.actualDeliveryDate) || dayOf(job.warehouseReceivedDate)) return [];
  const kind = freightKindOf(job);
  if (kind !== "sea" && kind !== "rail") return [];
  const arrived = dayOf(job.actualArrival);
  if (!arrived || arrived > today || arrived < DELIVERY_ORDER_RULE_FROM || daysBetween(arrived, today) > ETA_PASSED_KEPT_DAYS) return [];
  const waited = workingDaysSince(arrived, today, holidays);
  if (waited < DELIVERY_ORDER_ATTENTION_WORKING_DAYS) return [];
  const words = `Arrived ${dm(arrived)}, no delivery order`;
  return waited >= DELIVERY_ORDER_URGENT_WORKING_DAYS ? [signal(true, EXTRA_RANK.deliveryOrderUrgent, "bl", "details", words)] : [signal(false, EXTRA_RANK.deliveryOrder, "bl", "details", words)];
}

// ─── A6: documents waiting for customs, declined and not replaced ─────────

/** "Commercial Invoice" for one, "3 documents" for more. */
const documentsWord = (types: readonly string[]) => (types.length === 1 ? documentTypeLabel(types[0]!) : `${types.length} documents`);
const oldest = (moments: readonly Date[]) => moments.reduce((a, b) => (b.getTime() < a.getTime() ? b : a));
const newest = (moments: readonly Date[]) => moments.reduce((a, b) => (b.getTime() > a.getTime() ? b : a));

/**
 * What customs owes the job's documents, and the job owes customs:
 *  - a document of a type customs reviews, uploaded and not reviewed for a working day (on a job
 *    Urgent for customs: for 4 office hours);
 *  - a document customs declined that nothing has replaced for 24 hours - its type has no file
 *    that was not declined (the Documents tab's "missing").
 * Not on a shipment that shows Customs Cleared/Released: nothing waits for a review there.
 */
export function documentReviewSignals(
  job: Pick<ExtraJob, "customsPriority" | "customsStatus">,
  shown: string,
  documents: readonly DocumentFact[],
  now: Date,
  holidays: readonly string[],
): ExtraSignal[] {
  if (shown === CUSTOMS_CLEARED) return [];
  const out: ExtraSignal[] = [];

  const quick = isUrgentForCustoms(job);
  const late = documents.filter(
    (d) =>
      isReviewedDocumentType(d.documentType) &&
      !d.customsStatus &&
      (waitedWorkingDays(d.createdAt, REVIEW_WAITING_WORKING_DAYS, now, holidays) || (quick && officeMinutesBetween(d.createdAt, now, holidays) >= REVIEW_WAITING_URGENT_OFFICE_HOURS * 60)),
  );
  if (late.length) {
    const since = stamp(oldest(late.map((d) => d.createdAt)));
    const words = late.length === 1 ? `not reviewed by customs since ${since}` : `not reviewed by customs, the oldest since ${since}`;
    out.push(signal(false, EXTRA_RANK.notReviewed, "paperwork", "customs", `${documentsWord(late.map((d) => d.documentType))} ${words}`));
  }

  // A type with a declined file and none that was not declined; its clock starts at the last decline.
  const missing = new Map<string, Date>();
  for (const type of new Set(documents.filter((d) => d.documentType && d.customsStatus === "declined").map((d) => d.documentType))) {
    const ofType = documents.filter((d) => d.documentType === type);
    if (ofType.some((d) => d.customsStatus !== "declined")) continue;
    const declinedAt = newest(ofType.map((d) => d.customsReviewedAt ?? d.createdAt));
    if (now.getTime() - declinedAt.getTime() >= DECLINED_NOT_REPLACED_HOURS * HOUR) missing.set(type, declinedAt);
  }
  if (missing.size) {
    const types = [...missing.keys()].map(documentTypeLabel).join(", ");
    out.push(signal(false, EXTRA_RANK.declinedNotReplaced, "paperwork", "customs", `Declined ${types} not replaced since ${stamp(oldest([...missing.values()]))}`));
  }
  return out;
}

// ─── U11, A23: dangerous goods without their safety paperwork ───────────

/**
 * Dangerous = Yes on a job that has not left (hasLeft), with no MSDS or no Dangerous Goods Declaration
 * among its documents (lib/requiredDocuments: both are expected), measured against its Closing -
 * the ETD when it has no Closing: URGENT within DANGEROUS_URGENT_DAYS, and while a Closing that
 * passed is no older than PASSED_DATE_KEPT_DAYS; ATTENTION within DANGEROUS_ATTENTION_DAYS.
 */
export function dangerousSignals(
  job: Pick<ExtraJob, "dangerous"> & DepartureJob,
  documents: readonly Pick<DocumentFact, "documentType" | "customsStatus">[],
  today: string,
): ExtraSignal[] {
  if (lower(job.dangerous) !== "yes") return [];
  const ahead = departureAhead(job, today);
  if (!ahead || ahead.days > DANGEROUS_ATTENTION_DAYS || ahead.days < -PASSED_DATE_KEPT_DAYS) return [];
  const missing = missingDocumentTypes(SAFETY_PAPERWORK_TYPES, documents);
  if (!missing.length) return [];
  const words = `Dangerous goods: ${missing.map((type) => `no ${type}`).join(", ")} · ${departureWords(ahead, today)}`;
  return ahead.days <= DANGEROUS_URGENT_DAYS ? [signal(true, EXTRA_RANK.dangerousUrgent, "dangerous", "details", words)] : [signal(false, EXTRA_RANK.dangerousAhead, "dangerous", "details", words)];
}

// ─── U17: requests waiting for a manager ────────────────────────────

const REQUEST_WORDS: Record<RequestFact["kind"], { one: string; many: string }> = {
  document: { one: "Document change", many: "document changes" },
  customs_office: { one: "Customs Office change", many: "Customs Office changes" },
};

/**
 * A document change or a Customs Office change waiting for a manager's approval: URGENT once it
 * has waited longer than a working day, and from the first minute on a job that is Urgent for
 * customs. One tag per kind of request, aged by its oldest. A request younger than that on a
 * Standard job gives no tag: it is on the Approvals tab, where it is answered.
 */
export function requestSignals(job: Pick<ExtraJob, "customsPriority" | "customsStatus">, requests: readonly RequestFact[], now: Date, holidays: readonly string[]): ExtraSignal[] {
  const quick = isUrgentForCustoms(job);
  return (["document", "customs_office"] as const).flatMap((kind): ExtraSignal[] => {
    const ofKind = requests.filter((r) => r.kind === kind);
    if (!ofKind.length) return [];
    const first = oldest(ofKind.map((r) => r.requestedAt));
    if (!quick && !waitedWorkingDays(first, REQUEST_WAITING_WORKING_DAYS, now, holidays)) return [];
    const words = ofKind.length === 1 ? `${REQUEST_WORDS[kind].one} waiting for approval since ${stamp(first)}` : `${ofKind.length} ${REQUEST_WORDS[kind].many} waiting for approval, the oldest since ${stamp(first)}`;
    return [signal(true, EXTRA_RANK.request, "request", "customs", words)];
  });
}

// ─── A7, A8: the customs fields ──────────────────────────────────

const isT1 = (procedure: string | null | undefined) => text(procedure).toUpperCase() === "T1";

/**
 * What the job's customs fields lack:
 *  - Urgent for customs with no deadline typed (with one it is step 1's "Customs urgent" tag);
 *  - a T1 with no Customs Office chosen, T1_OFFICE_DAYS working days from its ETA;
 *  - Customs Cleared/Released with no MRN. `shown`: the customs status the shipment shows, null
 *    when its documents could not be read - then this last one is not known and says nothing.
 */
export function customsFieldSignals(
  job: Pick<ExtraJob, "customsPriority" | "customsStatus" | "customsDeadline" | "customsProcedure" | "customsOffice" | "mrn" | "estimatedArrival" | "actualArrival" | "actualDeliveryDate">,
  shown: string | null,
  today: string,
  holidays: readonly string[] = [],
): ExtraSignal[] {
  const out: ExtraSignal[] = [];
  if (isUrgentForCustoms(job) && !text(job.customsDeadline)) out.push(signal(false, EXTRA_RANK.customsNoDeadline, "customs", "customs", "Customs Urgent with no deadline typed"));
  if (isT1(job.customsProcedure) && !text(job.customsOffice)) {
    const days = arrivingIn(job, today, holidays);
    if (days !== null && days <= T1_OFFICE_DAYS) out.push(signal(false, EXTRA_RANK.t1NoOffice, "customs", "customs", `T1 with no Customs Office · ${arrivingWords(job, today)}`));
  }
  if (shown === CUSTOMS_CLEARED && !text(job.mrn)) out.push(signal(false, EXTRA_RANK.clearedNoMrn, "customs", "customs", `${CUSTOMS_CLEARED} with no MRN`));
  return out;
}

/**
 * A shipment that has shown "Under Customs Clearance" for longer than UNDER_CLEARANCE_WORKING_DAYS.
 * `since`: when the status was set to it, from the job's history; null when the history does not
 * say - then its age is not known and there is no tag.
 */
export function underClearanceSignals(shown: string, since: Date | null, now: Date, holidays: readonly string[]): ExtraSignal[] {
  if (shown !== UNDER_CLEARANCE || !since || !waitedWorkingDays(since, UNDER_CLEARANCE_WORKING_DAYS, now, holidays)) return [];
  return [signal(false, EXTRA_RANK.underClearance, "customs", "customs", `${UNDER_CLEARANCE} since ${dayText(since)}`)];
}

// ─── A14: a status that waits for somebody and has not moved ────────────

/**
 * The statuses that wait for somebody else's word, as apps/web/src/lib/enums.ts writes them
 * before their " [IMP]" / " [EXP]" / " [DOM]": the booking, the customer's pick-up date, the
 * customer's instructions after the arrival notice, the customer's delivery date.
 */
export const WAITING_STATUSES: readonly string[] = [
  "Booking Confirmation Pending",
  "Pick Up Date Pending From Customer",
  "Arrival Notice Sent - Waiting For Instructions",
  "Delivery Date Pending From Customer",
];

/** Whether a status is one of WAITING_STATUSES, whatever direction it is written for and in any case. */
export function isWaitingStatus(status: string): boolean {
  const plain = lower(status).replace(/\s*\[[a-z]+\]$/, "");
  return WAITING_STATUSES.some((s) => s.toLowerCase() === plain);
}

/**
 * Whether a job's status is watched for standing still: a waiting status, on a job that is not
 * Trucking's. Trucking creates every job (Domestic, Road Department) as "Booking Confirmation
 * Pending [DOM]" and never moves it - its stamps are set in Trucking - so there it says nothing.
 */
export const watchesStatus = (job: Pick<ExtraJob, "status" | "tradeDirection" | "department">): boolean => isWaitingStatus(job.status) && !isTruckingJob(job);

/**
 * A waiting status that has stood for longer than STATUS_STUCK_WORKING_DAYS (watchesStatus: never
 * on a Trucking job). `changedAt`: when the status last changed, from the job's history; null
 * when it never did - then it has stood since the job was created.
 */
export function statusStuckSignals(job: Pick<ExtraJob, "status" | "tradeDirection" | "department" | "createdAt">, changedAt: Date | null, now: Date, holidays: readonly string[]): ExtraSignal[] {
  if (!watchesStatus(job)) return [];
  const since = changedAt ?? momentOf(job.createdAt);
  if (!since || !waitedWorkingDays(since, STATUS_STUCK_WORKING_DAYS, now, holidays)) return [];
  return [signal(false, EXTRA_RANK.statusStuck, "status_stuck", "details", `Status unchanged since ${dayText(since)}`)];
}

// ─── A18: the customer's Import Instructions ─────────────────────────

/**
 * The job's live Import Instructions form:
 *  - the customer's answers waiting for approval for longer than a working day;
 *  - a link the customer has not filled in, IMPORT_INSTRUCTIONS_OPEN_DAYS working days from the ETA - said
 *    apart when the link has run out meanwhile, as the customer can no longer use it.
 */
export function importInstructionSignals(job: Pick<ExtraJob, "estimatedArrival" | "actualArrival" | "actualDeliveryDate">, form: ImportInstructionFact | null, today: string, now: Date, holidays: readonly string[]): ExtraSignal[] {
  if (!form) return [];
  if (form.status === "submitted") {
    if (!form.submittedAt || !waitedWorkingDays(form.submittedAt, IMPORT_INSTRUCTIONS_ANSWER_WORKING_DAYS, now, holidays)) return [];
    return [signal(false, EXTRA_RANK.importInstructions, "import_instructions", "details", `Import Instructions from the customer not answered since ${stamp(form.submittedAt)}`)];
  }
  const days = arrivingIn(job, today, holidays);
  if (days === null || days > IMPORT_INSTRUCTIONS_OPEN_DAYS) return [];
  const state = form.expiresAt.getTime() <= now.getTime() ? "Import Instructions link ran out, not filled in" : "Import Instructions not filled in by the customer";
  return [signal(false, EXTRA_RANK.importInstructions, "import_instructions", "details", `${state} · ${arrivingWords(job, today)}`)];
}

// ─── A19: the warehouse's remeasurement ────────────────────────────

/** The text of a remeasurement from Warehouse Concept: its "Accept" is not on Cargo Details, so the figures are typed by hand. */
export const REMEASURED_IN_WAREHOUSE_CONCEPT = "Remeasured in Warehouse Concept: check Cargo Details by hand";

/**
 * The warehouse remeasured the cargo (lib/remeasureNotice, lib/remeasureAccept):
 *  - its last Inform Operations differs from the shipment and nobody has accepted it since:
 *    ATTENTION after 24 hours (by air after 4 office hours), URGENT after 48 hours - and by air
 *    as soon as the Closing (the ETD when no Closing) is a day away, whatever the wait - while
 *    the job has not left (hasLeft): a flight that landed is hurried by no Closing;
 *  - the same from Warehouse Concept (X4): "Accept remeasurement" reads only the Warehouse's own
 *    lines, so it cannot be cleared there - ATTENTION "Remeasured in Warehouse Concept: check Cargo
 *    Details by hand" after the same wait, never URGENT, until Cargo Details match the informed
 *    figures or REMEASURE_WAREHOUSE_CONCEPT_DAYS days have passed since it was informed;
 *  - it was accepted and Costs Breakdown's quantities were not marked checked for longer than a
 *    working day.
 */
export function remeasurementSignals(
  job: Pick<ExtraJob, "tradeDirection" | "freightMode" | "department"> & DepartureJob,
  fact: RemeasureFact | null,
  today: string,
  now: Date,
  holidays: readonly string[],
): ExtraSignal[] {
  if (!fact) return [];
  const { informed, acceptedAt, costsCheckedAt } = fact;
  const differs = !!informed && informed.verdict === "differs" && !(acceptedAt && acceptedAt.getTime() >= informed.at.getTime());
  if (informed && differs) {
    const waited = now.getTime() - informed.at.getTime();
    const air = freightKindOf(job) === "air";
    const due = waited >= REMEASURE_ATTENTION_HOURS * HOUR || (air && officeMinutesBetween(informed.at, now, holidays) >= REMEASURE_ATTENTION_AIR_OFFICE_HOURS * 60);
    if (informed.source === "warehouseConcept") {
      // Done once Cargo Details say the same, or a week on: past that the figures were plainly looked at, or never will be.
      const done = waited >= REMEASURE_WAREHOUSE_CONCEPT_DAYS * DAY || informed.matchesCargoDetails === true;
      if (!done) return due ? [signal(false, EXTRA_RANK.remeasure, "remeasurement", "details", `${REMEASURED_IN_WAREHOUSE_CONCEPT} · informed ${stamp(informed.at)}`)] : [];
    } else {
      const ahead = air ? departureAhead(job, today) : null;
      const leaving = !!ahead && ahead.days >= 0 && ahead.days <= REMEASURE_URGENT_AIR_DEPARTURE_DAYS;
      const words = `Remeasurement differs, not accepted since ${stamp(informed.at)}`;
      if (ahead && leaving) return [signal(true, EXTRA_RANK.remeasureUrgent, "remeasurement", "details", `${words} · ${departureWords(ahead, today)}`)];
      if (waited >= REMEASURE_URGENT_HOURS * HOUR) return [signal(true, EXTRA_RANK.remeasureUrgent, "remeasurement", "details", words)];
      return due ? [signal(false, EXTRA_RANK.remeasure, "remeasurement", "details", words)] : [];
    }
  }
  // Checked counts only after the acceptance it checks (services/shipment.service remeasureAcceptance).
  if (acceptedAt && !(costsCheckedAt && costsCheckedAt.getTime() >= acceptedAt.getTime()) && waitedWorkingDays(acceptedAt, REMEASURE_COSTS_WORKING_DAYS, now, holidays)) {
    return [signal(false, EXTRA_RANK.remeasureCosts, "remeasurement", "finance", `Remeasurement accepted ${dayText(acceptedAt)}, costs not checked`)];
  }
  return [];
}

// ─── A25: Master Jobs ──────────────────────────────────────────

const has = (value: string | null | undefined, fragment: string) => lower(value).includes(fragment);

/**
 * An export house of a Master Job that closes within MASTER_JOB_CLOSING_DAYS, while the house is
 * out of step: its Shipping Instructions not Confirmed, its BoL draft not Approved, or its cargo
 * not received (no Warehouse Received date). Those are an export's duties before the vessel: an
 * import house owes none of them. Neither the Master Job nor the house may have left (hasLeft).
 * The Closing is the Master Job's own - the house's copy follows it, but it is the Master Job
 * that sails.
 */
export function masterJobHouseSignals(
  job: Pick<ExtraJob, "tradeDirection" | "shippingInstructions" | "bolDraft" | "warehouseReceivedDate" | "actualDeparture" | "actualArrival" | "actualDeliveryDate">,
  master: MasterJobFact | null,
  today: string,
): ExtraSignal[] {
  const closing = master ? dayOf(master.closingDate) : null;
  if (!master || !closing || lower(job.tradeDirection) !== "export" || hasLeft(master) || hasLeft(job)) return [];
  const days = daysBetween(today, closing);
  if (days < 0 || days > MASTER_JOB_CLOSING_DAYS) return [];
  const behind = [
    ...(has(job.shippingInstructions, "confirmed") ? [] : ["SI not confirmed"]),
    ...(has(job.bolDraft, "approved") ? [] : ["BoL draft not approved"]),
    ...(dayOf(job.warehouseReceivedDate) ? [] : ["cargo not received"]),
  ];
  if (!behind.length) return [];
  return [signal(false, EXTRA_RANK.masterJob, "master_job", "details", `Master Job ${master.mczNumber}: Closing ${dueWords(closing, today)} · ${behind.join(", ")}`)];
}

/**
 * A Master Job with no shipment linked, MASTER_JOB_NO_HOUSE_DAYS from its ETD and not departed:
 * it becomes a row of its own. `houses`: how many live shipments it has.
 */
export function masterJobRowSignals(master: MasterJobFact, houses: number, today: string): ExtraSignal[] {
  const etd = dayOf(master.estimatedDeparture);
  if (houses > 0 || !etd || dayOf(master.actualDeparture)) return [];
  const days = daysBetween(today, etd);
  if (days < 0 || days > MASTER_JOB_NO_HOUSE_DAYS) return [];
  return [signal(false, EXTRA_RANK.masterJob, "master_job", "details", `No shipment linked · ETD ${dueWords(etd, today)}`)];
}
