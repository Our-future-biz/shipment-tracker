import { addDays, businessDay, businessMinutes, businessTime, isRealYmd } from "../../../lib/businessDate";
import { cockpitCard, rankRow, type CockpitSignal, type RankedRow } from "../../../lib/cockpit";
import { ROAD_DEPARTMENT } from "../../../lib/deliveryDated";
import { addWorkingDays, nextWorkingDay, weekday } from "../../../lib/workingDays";
import type {
  OpsCockpitAudit,
  OpsCockpitDirection,
  OpsCockpitMode,
  OpsCockpitPerson,
  OpsCockpitReports,
  OpsCockpitRow,
  OpsCockpitSignal,
  OpsCockpitTiles,
  ShipmentsManagersCockpit,
  TrackingAttentionFlag,
} from "../interfaces/interfaces";
import {
  ARRIVAL_NOTICE_ETA_WITHIN_DAYS,
  ARRIVED_NOTHING_SINCE_WORKING_DAYS,
  ATTENTION_WORKING_DAYS,
  BL_DRAFT_BEFORE_SI_DAYS,
  BOOKING_PENDING_WITHIN_DAYS,
  COCKPIT_LIST_LIMIT,
  CREDIT_CHECK_ETD_WITHIN_DAYS,
  ETA_PASSED_AFTER_DAYS,
  ETA_PASSED_KEPT_DAYS,
  ETD_PASSED_AFTER_DAYS,
  FREE_TIME_MISSING_ETA_WITHIN_DAYS,
  HAULIER_TOMORROW_FROM,
  HOUSE_BOL_NOT_RELEASED_AFTER_WORKING_DAYS,
  MAWB_MISSING_ETD_WITHIN_DAYS,
  NO_TRACKING_AFTER_DAYS,
  PASSED_DATE_KEPT_DAYS,
  POD_MISSING_AFTER_WORKING_DAYS,
  POD_MISSING_URGENT_WORKING_DAYS,
  WAREHOUSE_IDLE_AFTER_WORKING_DAYS,
} from "./cockpitThresholds";
import { clockApplies } from "./detentionClock";
import { isCreditApproved } from "./fieldDefaults";
import { NO_CLAIM_FACTS, claimSignals, type ClaimFacts } from "./managersCockpitClaims";
import { NO_HANDOVER_FACTS, handoverLine, handoverSignals, stepTwoWarehouseTagStays, truckingSpeaksForRoad, type HandoverFacts } from "./managersCockpitHandover";
import { highLoadAbove, type TeamFacts } from "./managersCockpitTeam";
import { personEmail } from "./shipmentEditRule";
import { attentionFlags, workingDaysSince, type AttentionFacts, type AttentionRules, type AttentionShipment } from "./trackingAttention";
import { freightKindOf, isTruckingJob, type FreightKind } from "./trackingEvents";

// The operations managers' cockpit (Shipments → Managers, Council Outlay 11), worked out from the
// company's active jobs, what Needs Attention knows about them and what their timelines say. Pure:
// no database, tested in tests/managersCockpit.test.ts.
//
//   tiles    counts over the jobs of the chosen mode, direction and Handled By
//   cards    a job appears once: in URGENT when any of its signals is urgent, else in ATTENTION,
//            with all its signals as tags; the most pressing first; only the rows of one signal
//            tile when the page asks for one (SIGNAL_FAMILIES)
//   people   who is named in Handled By on the jobs of the chosen mode and direction - not
//            narrowed by the Handled By filter, which is picked from it - and who only covers
//   audit    the company's last week of what a manager wants to know of, handed through as read
//
// Step 2 (D6-D8): the two windows are working days - URGENT is today and the next working day,
// ATTENTION the two working days after; a cut-off with a time (the Closing, a filing) is missed
// once that time has passed; a missed cut-off stays URGENT until the job has left or "ETD passed,
// no ATD" takes over from it; and what "late" means depends on how the job travels (lib/cockpitThresholds). Everything is judged on one
// `now` and its Prague business day - never the database's. A fact that could not be read gives
// no signal (D29).
//
// Step 3: the signals of the people around a job (lib/managersCockpitTeam: a late to-do, an
// @mention not read, a release request waiting, a job nobody touched), the Team facts on the
// people line, "My reports" (D3: only the jobs handled by the users who report to the caller)
// and a missed cut-off a manager dismissed, which gives no tag while its date stands
// (lib/cutoffDismissals).
//
// Step 5 (D29, D30): what the warehouse and Trucking themselves say of the jobs - the Warehouse
// cockpit's signals of each record, Trucking's issues of each consignment - as tags in their own
// words, with no tag of step 2 that says the same once the module does and no warehouse tag the
// job already says itself (lib/managersCockpitHandover), and the hand-over line: the updates the
// two owe the page's jobs.
//
// Step 6 (D21): the cargo claims' own signals (lib/managersCockpitClaims, family "claim"): the
// carrier's notice and the suit time bar while the company's claim time limits are switched on,
// and "open since" either way.

/** An active job (not invoiced, not cancelled) as the cockpit reads it. */
export interface OpsCockpitJob extends AttentionShipment {
  id: string;
  jobNumber: string;
  customer: string;
  /** Handled By. */
  personInCharge: string;
  holidayCover: string;
  closingDate: string | null;
  /** The time of the Closing, "HH:mm" on Prague's clock; "" for the date only. The four filings' times are the same. */
  closingTime: string;
  vgmClosing: string | null;
  vgmClosingTime: string;
  vgm: string;
  siClosing: string | null;
  siClosingTime: string;
  shippingInstructions: string;
  ams: string;
  amsDeadline: string | null;
  amsDeadlineTime: string;
  isf: string;
  isfDeadline: string | null;
  isfDeadlineTime: string;
  customsPriority: string;
  customsStatus: string;
  /** A Prague wall time, "YYYY-MM-DD HH:mm"; "" for none. */
  customsDeadline: string;
  bookingConfirmation: string;
  /** "Yes" while the job has an open claim. */
  claim: string;
  cargoReadinessDate: string | null;
  pickupDate: string | null;
  /** The MAWB number of an air job. */
  masterBolNumber: string;
  masterBolType: string;
  houseBolType: string;
  /** Who released the House BoL and when; "" until it is released. */
  houseBolRelease: string;
  bolDraft: string;
  plateNumber: string;
  creditCheck: string;
  /** "Yes" for dangerous goods. */
  dangerous: string;
  loadType: string;
  masterJobId: string | null;
  /** SCP, JSD, T1, C-Goods. */
  customsProcedure: string;
  /** The office of a T1 procedure; "" under any other. */
  customsOffice: string;
  mrn: string;
  warehouseReleasedDate: string | null;
  /** Step 6 (D31): the day the original B/Ls arrived, the telex release came, the delivery order was issued; null until then. */
  originalsReceivedDate: string | null;
  telexReleaseReceivedDate: string | null;
  deliveryOrderDate: string | null;
  /** The customer was sent an arrival notice (a customer notice of that kind stands on the job). */
  arrivalNoticeSent: boolean;
  /**
   * The job's Incoterms (EXW, FOB…), as typed. Left out (undefined) when the row read does not carry
   * them: then an import's terms are not known, and the booking rule asks nothing of it (bookingSignals).
   */
  incotermOrigin?: string;
  incotermDestination?: string;
  /**
   * Cargo Details' Pcs, Total Weight (tons) and Total Volume, as stored: the warehouse's remeasurement
   * is compared with them (lib/managersCockpitExtra remeasurementSignals). Left out when not read.
   */
  pcs?: string;
  totalWeightTons?: string | null;
  totalVolumeCbm?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What the job's timeline says beyond its columns: its standing events of COCKPIT_EVENT_KINDS. */
export interface TimelineFacts {
  pickedUp: boolean;
  loaded: boolean;
  gateIn: boolean;
  haulierConfirmed: boolean;
  podReceived: boolean;
  /** The day of the latest Rolled exception nobody closed; null for none. */
  rolledOn: string | null;
  /** The day of the oldest Customs hold that is still open; null for none. */
  holdSince: string | null;
}

/** A container of a job, as far as its free time goes. */
export interface CockpitBox {
  containerNumber: string;
  freeTimeDays: number | null;
  lastFreeDay: string | null;
}

/** A Master Job that asks for a look by itself (it has no house yet), from the other tables' rules. */
export interface OpsMasterJobRow {
  id: string;
  /** Its MCZ number. */
  number: string;
  customer: string;
  signals: readonly OpsSignal[];
  // What the Master Job itself stores: its row shows them and the page's filters go by them.
  freightMode: string;
  tradeDirection: string;
  /** Its own Handled By, "" for nobody. */
  handledBy: string;
  holidayCover: string;
}

export interface OpsCockpitInput {
  /** The company's active jobs, as many as were read. */
  jobs: OpsCockpitJob[];
  /** What Needs Attention knows about a job beyond its own columns, by shipment id. */
  facts: ReadonlyMap<string, AttentionFacts>;
  /** What the jobs' timelines say, by shipment id (a job with no such event has no entry); null when they could not be read. */
  timeline: ReadonlyMap<string, TimelineFacts> | null;
  /** The containers of the jobs boxesWanted names, by shipment id; null when they could not be read. */
  boxes: ReadonlyMap<string, readonly CockpitBox[]> | null;
  /** The jobs whose ETD or ETA moved lately. */
  movedIds: ReadonlySet<string>;
  /** The e-mails of the company's active users, trimmed and lower-cased; null when they could not be read. */
  userEmails: ReadonlySet<string> | null;
  /** The company's own days off, on top of the weekends and the statutory holidays; [] when they could not be read. */
  holidays: readonly string[];
  /** False when the company's own holidays could not be read: working days then skip only weekends and the statutory holidays. */
  holidaysKnown: boolean;
  /** The signals the other tables give (documents, customs, requests, Master Jobs…), by shipment id. */
  extraByJob: ReadonlyMap<string, readonly OpsSignal[]>;
  /** The Master Jobs that are a row of their own. */
  masterJobRows: readonly OpsMasterJobRow[];
  /** What the people around the jobs left: late to-dos, unread @mentions, release requests waiting, silence, and since when a cover stands (lib/managersCockpitTeam). */
  team: TeamFacts;
  /**
   * A job's cut-offs without those a manager dismissed (lib/cutoffDismissals withoutDismissed, with
   * the job's dismissals): handed in by the service, because that file reads this one's cutoffsOf.
   * When the dismissals could not be read it keeps them all: nothing is treated as dismissed.
   */
  cutoffsKept: (jobId: string, cutoffs: CutoffDue[]) => CutoffDue[];
  /**
   * The dates of the job's Closing a manager dismissed (lib/cutoffDismissals), [] for none - and when
   * the dismissals could not be read. The cargo-ready rule reads them: a Closing dismissed as settled
   * ("went on the next vessel") is not one the cargo is still reported late for.
   */
  closingsDismissed: (jobId: string) => readonly string[];
  /** The audit line, as read; null when none of it could be. Not narrowed by any filter: it is the company's. */
  audit: OpsCockpitAudit | null;
  /**
   * What the warehouse and Trucking said of the jobs (lib/managersCockpitHandover), a module that
   * could not be read null. Left out, neither was asked: no tag or figure of theirs, and step 2's
   * own road and warehouse tags as they are.
   */
  handover?: HandoverFacts;
  /**
   * The jobs' open cargo claims and the company's claim time limits (lib/managersCockpitClaims), a
   * part that could not be read null. Left out, none were asked: no claim tag.
   */
  claims?: ClaimFacts;
  /**
   * The company's jobs that are no longer active - Invoiced or cancelled, not deleted - whose Claim
   * field says Yes for an open cargo claim (X8; one on costs alone does not count). An open cargo
   * claim does not end with the job's billing: such a job is counted by
   * "Open claims" and is a row for its cargo claims' tags only (judgeClaimOnly) - no other rule, no
   * active job, nobody's load on the people line. Left out, none.
   */
  claimOnlyJobs?: readonly OpsCockpitJob[];
  /** What could not be read, in the words the page shows; the cockpit adds nothing to it. */
  notKnown: readonly string[];
  /** The company has more active jobs than `jobs` holds. */
  capped: boolean;
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  /** An e-mail, "nobody", or null for everyone. */
  handledBy: string | null;
  /** "mine": only the jobs handled by one of `reportEmails` - and those handled by somebody who is no user (isReportOrNoUser). */
  reports: OpsCockpitReports;
  /** The e-mails (trimmed, lower case) of the users who report to the caller; read only for "mine". Null - not known - keeps no job: the service refuses to answer instead. */
  reportEmails: ReadonlySet<string> | null;
  /** The signal tile the two cards are narrowed to (SIGNAL_FAMILIES); left out or null, they are not. Nothing else is narrowed by it. */
  signal?: OpsCockpitSignal | null;
  now: Date;
}

/** The value of the Handled By filter that asks for the jobs nobody handles. */
// A legacy Handled By typed as "nobody" collides with this word and cannot be picked by the filter: accepted, new values are user e-mails.
export const NOBODY = "nobody";

const DAY = 86_400_000;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Calendar days from `from` to `to` (YYYY-MM-DD), negative when `to` is earlier. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
/** "19.11." of a YYYY-MM-DD day. */
const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Minutes since midnight of an "HH:mm" time; null for "" or anything that is no time of day. */
function minutesOf(time: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// ─── The day everything is judged on ───────────────────────────────────

/** One `now`, as every rule reads it: the Prague day and time of day, and the two windows in working days (D6). */
export interface OpsDay {
  today: string;
  /** Minutes since midnight on Prague's clock. */
  minutes: number;
  /** The company's own days off, on top of the weekends and the statutory holidays. */
  holidays: readonly string[];
  /** The last day of the URGENT window: the next working day after today. */
  urgentUntil: string;
  /** The last day of the ATTENTION window: ATTENTION_WORKING_DAYS working days after that. */
  attentionUntil: string;
}

/**
 * The day and its windows. URGENT is today and the next working day - on a Friday that is up to
 * Monday, so a cut-off dated on the weekend in between is urgent too; ATTENTION is the two
 * working days after.
 */
export function opsDay(now: Date, holidays: readonly string[] = []): OpsDay {
  const today = businessDay(now);
  const urgentUntil = nextWorkingDay(today, holidays);
  return { today, minutes: businessMinutes(now), holidays, urgentUntil, attentionUntil: addWorkingDays(urgentUntil, ATTENTION_WORKING_DAYS, holidays) };
}

/** "today", "tomorrow", or "on Mon 23.11." - the next working day after a Friday is no "tomorrow". */
const dueWords = (day: string, today: string) => {
  const days = daysBetween(today, day);
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `on ${WEEKDAYS[weekday(day)]} ${dm(day)}`;
};

/**
 * Whether a planned date is coming within `workingDays` working days (D6): up to the day that many
 * working days after today (lib/workingDays addWorkingDays, the company's holidays skipped too), so
 * on a Friday "within 1" reaches Monday - and the weekend between - and on 23 Dec it reaches
 * 28 Dec over the Christmas holidays. A date that passed is counted in calendar days: it still
 * counts while no longer ago than `keptDays` (PASSED_DATE_KEPT_DAYS) - a date that passed with
 * nothing recorded is still to come, until it is so old that the job plainly went on without it
 * being typed.
 */
const comingWithin = (date: string | null, today: string, workingDays: number, holidays: readonly string[] = [], keptDays = PASSED_DATE_KEPT_DAYS): date is string =>
  !!date && date <= addWorkingDays(today, workingDays, holidays) && date >= addDays(today, -keptDays);

// ─── Filters ───────────────────────────────────────────────────

/** Whether a job travels by `mode`. A job with no Freight Mode is a sea job, as everywhere in the app. */
export const inMode = (job: Pick<OpsCockpitJob, "tradeDirection" | "freightMode" | "department">, mode: OpsCockpitMode): boolean =>
  mode === "all" || freightKindOf(job) === mode;

/** Whether a job's Trade Direction is `direction`, however it was written ("Import", "IMPORT"). */
export const inDirection = (job: Pick<OpsCockpitJob, "tradeDirection">, direction: OpsCockpitDirection): boolean =>
  direction === "all" || job.tradeDirection.trim().toLowerCase() === direction;

/** The Handled By filter as it is compared: null for everyone, "nobody", or the e-mail trimmed and lower-cased. */
export function handledByFilter(handledBy: string | null | undefined): string | null {
  const value = (handledBy ?? "").trim().toLowerCase();
  return value || null;
}

/** Whether a job is handled by the person of the filter (see handledByFilter); "nobody" keeps the jobs with nobody. */
export function isHandledBy(job: Pick<OpsCockpitJob, "personInCharge">, handledBy: string | null): boolean {
  if (handledBy === null) return true;
  const email = personEmail(job.personInCharge);
  return handledBy === NOBODY ? email === "" : email === handledBy;
}

/**
 * Whether somebody is among the people "My reports" keeps: a user who reports to the caller - or
 * somebody who is no user of the company at all. A report who was deactivated no longer reports
 * to anybody, and their jobs would drop out of every manager's "My reports" on the day they need
 * a manager most: so a job whose Handled By is not a user is every manager's ("Handled By is not
 * a user" stands on it already). Nobody ("") is nobody's report. With "all", everyone.
 */
export function isReportOrNoUser(email: string, reports: OpsCockpitReports, reportEmails: ReadonlySet<string> | null, userEmails: ReadonlySet<string> | null): boolean {
  if (reports === "all") return true;
  if (!email) return false;
  return !!reportEmails?.has(email) || (!!userEmails && !userEmails.has(email));
}

/** Whether a job is among those "My reports" keeps: by its Handled By (isReportOrNoUser). With "all", every job. */
export const isOfReports = (job: Pick<OpsCockpitJob, "personInCharge">, reports: OpsCockpitReports, reportEmails: ReadonlySet<string> | null, userEmails: ReadonlySet<string> | null): boolean =>
  reports === "all" || isReportOrNoUser(personEmail(job.personInCharge), reports, reportEmails, userEmails);

/** How the job travels, as its row shows it: "" when it has no Freight Mode and is no Trucking job. */
export const modeOf = (job: Pick<OpsCockpitJob, "tradeDirection" | "freightMode" | "department">): string => (job.freightMode.trim() || isTruckingJob(job) ? freightKindOf(job) : "");

const directionOf = (job: Pick<OpsCockpitJob, "tradeDirection">) => job.tradeDirection.trim().toLowerCase();

// ─── Signals ───────────────────────────────────────────────────

/** The families a signal belongs to: the stable keys the page's tiles filter the cards by. */
export const SIGNAL_KINDS = [
  "owner",
  "not_user",
  "cutoff",
  "booking",
  "cargo_ready",
  "departure",
  "arrival",
  "free_time",
  "customs",
  "paperwork",
  "dangerous",
  "bl",
  "arrival_notice",
  "delivery",
  "warehouse",
  "road",
  "air",
  "request",
  "import_instructions",
  "remeasurement",
  "status_stuck",
  "credit",
  "master_job",
  "tracking",
  "billing",
  "customer_told",
  // The people around the job (lib/managersCockpitTeam).
  "todo",
  "mention",
  "not_touched",
  // Step 6: Handled By away with no Holiday Cover (lib/managersCockpitTeam), and the cargo claims (lib/managersCockpitClaims).
  "away",
  "claim",
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * The page's signal tiles (apps/web …/shipments/managers/_lib/cockpitSignals SIGNAL_FAMILIES, held
 * the same by tests/managersCockpit.test.ts): the kinds of tag each holds - some hold a few that
 * are worked on together. The cards are narrowed to one on the server, before they are cut at
 * COCKPIT_LIST_LIMIT, so a family far down the ranking still lists its rows; and each is counted
 * over every row (tiles.families), whatever the cards are narrowed to. The other kinds have no tile.
 */
export const SIGNAL_FAMILIES: Readonly<Record<OpsCockpitSignal, readonly SignalKind[]>> = {
  cutoff: ["cutoff"],
  booking: ["booking"],
  customs: ["customs"],
  paperwork: ["paperwork"],
  free_time: ["free_time"],
  delivery: ["delivery", "road", "warehouse"],
  departure: ["departure", "arrival"],
  claim: ["claim"],
  request: ["request"],
  not_user: ["not_user"],
  away: ["away"],
  todo: ["todo", "mention"],
  not_touched: ["not_touched"],
};

/**
 * The signal tile a request names (?signal=), null when it names none; or the plain sentence
 * saying it is none of them. Only a tile's own key is one: the controller turns a problem into an
 * invalid-argument error.
 */
export function signalAsked(asked: string | undefined): { signal: OpsCockpitSignal | null } | { problem: string } {
  if (asked === undefined) return { signal: null };
  const signal = (Object.keys(SIGNAL_FAMILIES) as OpsCockpitSignal[]).find((key) => key === asked);
  return signal ? { signal } : { problem: `signal must be one of ${Object.keys(SIGNAL_FAMILIES).join(", ")}` };
}

type Area = OpsCockpitRow["area"];
/** A signal, its family and the shipment tab it is best worked on. */
export interface OpsSignal extends CockpitSignal {
  area: Area;
  /** One of SIGNAL_KINDS. */
  kind: string;
}
const urgent = (rank: number, kind: SignalKind, area: Area, text: string): OpsSignal => ({ rank, text, urgent: true, kind, area });
const attention = (rank: number, kind: SignalKind, area: Area, text: string): OpsSignal => ({ rank, text, urgent: false, kind, area });

// Lower rank = higher in its card. Within URGENT: customs and holds (a clock by the hour), the
// cut-offs missed and due, a booking or cargo that will miss the vessel, a departure or arrival
// that passed, a delivery or truck that did, then the rest - and last a job that only lacks
// somebody to handle it: a company with many such jobs would otherwise see nothing else on the
// card's first rows; they have their own tile, and a job with a deadline too still comes first.
//
// The numbers are step 1's times ten (customs 3 → 30, filings 4 → 40, Closing 5 → 50, Needs
// Attention's flags 6-9 → 55-90, nobody 10 → 100; ATTENTION 20-27 → 200-270), with the step 2
// signals in between. The signals of the other tables are ranked on step 1's scale
// (lib/managersCockpitExtra EXTRA_RANK): times EXTRA_RANK_SCALE they fall in place here. The
// signals of the people around a job are ranked on this scale itself (lib/managersCockpitTeam
// TEAM_RANK): a release request with the other requests (60); URGENT 96-97, before "nobody";
// ATTENTION 410-430, after everything else. So are the warehouse's and Trucking's own
// (lib/managersCockpitHandover HANDOVER_RANK): URGENT 61-62, after the delivery and road ones and
// before free time; ATTENTION 251-252, after the delivery, warehouse and road warnings.
// Step 6: Handled By away with no Holiday Cover (lib/managersCockpitTeam, kind "away") URGENT 101,
// right after "Nobody in Handled By", and "away from dd.mm." ATTENTION 405; the cargo claims
// (lib/managersCockpitClaims CLAIM_RANK, kind "claim") URGENT 63-64, ATTENTION 253-256.
export const OPS_RANK = {
  customsUrgent: 30,
  customsHold: 32,
  closingMissed: 40,
  filingOverdue: 41,
  filingDue: 44,
  closingDue: 50,
  booking: 52,
  cargoReady: 53,
  mawbMissing: 54,
  rolled: 56,
  deliveryPassed: 58,
  warehousePassed: 58,
  haulierToday: 59,
  pickupPassed: 59,
  podUrgent: 59,
  nobody: 100,
  notUser: 110,
  // ATTENTION
  cutoffAhead: 200,
  bolDraft: 202,
  credit: 204,
  arrivalNotice: 206,
  freeTimeMissing: 208,
  deliveryNoPlate: 242,
  haulierTomorrow: 244,
  warehouseIdle: 246,
  pod: 248,
  houseBol: 249,
  // A Holiday Cover who is no user covers nobody: after everything the job itself says, right
  // before what the people around it left undone (lib/managersCockpitTeam TEAM_RANK, 405 on).
  coverNotUser: 404,
} as const;
/** What a rank of lib/managersCockpitExtra is multiplied by to sit on OPS_RANK's scale. */
export const EXTRA_RANK_SCALE = 10;
/** Needs Attention's flags: the urgent ones among the departures and arrivals, free time and the tax date with "the rest". */
const URGENT_FLAG_RANK: Record<TrackingAttentionFlag["kind"], number> = {
  to_confirm: 55,
  etd_passed: 56,
  eta_passed: 57,
  free_time: 80,
  tax_date: 90,
  // Never urgent today; should one become so, it comes last among the urgent ones before "nobody".
  not_told: 95,
  no_onward: 95,
  no_event: 95,
  not_released: 95,
  delivered_not_billed: 95,
};
const ATTENTION_FLAG_RANK: Record<TrackingAttentionFlag["kind"], number> = {
  not_told: 210,
  no_onward: 220,
  no_event: 230,
  free_time: 240,
  tax_date: 250,
  not_released: 260,
  delivered_not_billed: 270,
  // Always urgent today; should one be only a warning, it comes last of these.
  to_confirm: 275,
  eta_passed: 275,
  etd_passed: 275,
};
const FLAG_KIND: Record<TrackingAttentionFlag["kind"], SignalKind> = {
  to_confirm: "tracking",
  eta_passed: "arrival",
  etd_passed: "departure",
  no_onward: "tracking",
  no_event: "tracking",
  not_told: "customer_told",
  free_time: "free_time",
  tax_date: "billing",
  not_released: "billing",
  delivered_not_billed: "billing",
};

// ─── Who handles it ────────────────────────────────────────────────

/**
 * The signals of the job's Handled By: nobody ("owner"), or somebody who is not a user ("not_user",
 * only when the users are known) - two families, each with its own tile. And of its Holiday Cover:
 * a cover who is not a user (deactivated while still named on the job, say) covers nobody - a
 * warning of the "not_user" family, as nobody would answer for the job while its Handled By is away.
 */
export function handledBySignals(job: Pick<OpsCockpitJob, "personInCharge" | "holidayCover">, userEmails: ReadonlySet<string> | null): OpsSignal[] {
  const email = personEmail(job.personInCharge);
  const cover = personEmail(job.holidayCover);
  const out: OpsSignal[] = [];
  if (!email) out.push(urgent(OPS_RANK.nobody, "owner", "details", "Nobody in Handled By"));
  else if (userEmails && !userEmails.has(email)) out.push(urgent(OPS_RANK.notUser, "not_user", "details", `Handled By is not a user: ${email}`));
  if (cover && userEmails && !userEmails.has(cover)) out.push(attention(OPS_RANK.coverNotUser, "not_user", "details", `Holiday Cover is not a user: ${cover}`));
  return out;
}

/** Whether the job names somebody in Handled By or Holiday Cover who is not a user: the jobs the "not_user" tile counts. Never when the users are not known. */
export const namesNoUser = (job: Pick<OpsCockpitJob, "personInCharge" | "holidayCover">, userEmails: ReadonlySet<string> | null): boolean =>
  !!userEmails && [personEmail(job.personInCharge), personEmail(job.holidayCover)].some((email) => !!email && !userEmails.has(email));

// ─── The timeline's facts ─────────────────────────────────────────────

/** The event kinds the cockpit reads off a job's timeline. */
export const COCKPIT_EVENT_KINDS = ["picked_up", "loaded", "gate_in", "haulier_confirmed", "pod_received", "rolled", "hold"] as const;

/** A stored tracking event, as far as these rules go by it. */
export interface TimelineEvent {
  kind: string;
  occurredOn: string;
  /** "proposed" waits for somebody, "dismissed" was set aside: neither is a fact. */
  effect: string;
  /** When an exception was closed; null while it is open. */
  resolvedAt: Date | null;
}

/**
 * What one job's events of COCKPIT_EVENT_KINDS say. An exception (Rolled, Customs hold) is open
 * while its `resolvedAt` is empty: a person closes it, or the event that ends it does (a departure
 * or arrival the Rolled, a customs release the hold - lib/trackingEvents EXCEPTIONS_CLOSED_BY).
 */
export function timelineFactsOf(events: readonly TimelineEvent[]): TimelineFacts {
  const standing = events.filter((e) => e.effect !== "proposed" && e.effect !== "dismissed");
  const has = (kind: string) => standing.some((e) => e.kind === kind);
  const open = (kind: string) => standing.filter((e) => e.kind === kind && !e.resolvedAt);
  const days = (list: readonly TimelineEvent[]) => list.map((e) => e.occurredOn).sort();
  return {
    pickedUp: has("picked_up"),
    loaded: has("loaded"),
    gateIn: has("gate_in"),
    haulierConfirmed: has("haulier_confirmed"),
    podReceived: has("pod_received"),
    rolledOn: days(open("rolled")).at(-1) ?? null,
    holdSince: days(open("hold"))[0] ?? null,
  };
}

const NO_TIMELINE: TimelineFacts = { pickedUp: false, loaded: false, gateIn: false, haulierConfirmed: false, podReceived: false, rolledOn: null, holdSince: null };

/**
 * Whether the cargo made its Closing: received at our warehouse, or a picked-up, loaded or gate-in
 * fact on the timeline. Null when the timeline could not be read and the job's own column does
 * not say so: then nobody can tell - a Closing still ahead shows by its date, a missed one cannot
 * be said (cutoffsOf).
 */
export function cargoIn(job: Pick<OpsCockpitJob, "warehouseReceivedDate">, timeline: TimelineFacts | null): boolean | null {
  if (job.warehouseReceivedDate) return true;
  return timeline ? timeline.pickedUp || timeline.loaded || timeline.gateIn : null;
}

// ─── Cut-offs ──────────────────────────────────────────────────

// The five cut-offs and what is still open - the one rule, read by this page and by the Shipments
// list's Needs Attention (lib/needsAttention). A status is free text with decoration ("Confirmed
// (Green)"), so it is matched by a fragment, in any case:
//   VGM / SI   by their closing date, unless Confirmed (VGM also: Not Applicable, and Customer -
//              the shipper files it with the carrier: no duty of ours);
//   AMS / ISF  when Pending, by their deadline; without one, 4 days before the ETD;
//   Closing    the cargo closing date, until the cargo is in.
// Each has a time of day beside its date ("HH:mm" on Prague's clock, "" for the date only): due
// today, it is missed or overdue once that time has passed. The 4 days before the ETD have none.
const statusHas = (status: string, fragment: string) => status.toLowerCase().includes(fragment);
/** A VGM that is not ours to file: done (Confirmed), not needed (Not Applicable) or the shipper's own (Customer). */
const vgmNotOurs = (vgm: string) => statusHas(vgm, "confirmed") || statusHas(vgm, "not applicable") || vgm.trim().toLowerCase() === "customer";

/** The columns a job's cut-offs are read from; how it travels says how long a missed one stays (stillBeforeDeparture). */
export type CutoffJob = Pick<
  OpsCockpitJob,
  | "tradeDirection"
  | "freightMode"
  | "department"
  | "closingDate"
  | "closingTime"
  | "vgmClosing"
  | "vgmClosingTime"
  | "vgm"
  | "siClosing"
  | "siClosingTime"
  | "shippingInstructions"
  | "ams"
  | "amsDeadline"
  | "amsDeadlineTime"
  | "isf"
  | "isfDeadline"
  | "isfDeadlineTime"
  | "estimatedDeparture"
  | "actualDeparture"
  | "actualArrival"
  | "actualDeliveryDate"
>;
const filedBeforeDeparture = (job: CutoffJob) => (job.estimatedDeparture ? addDays(job.estimatedDeparture, -4) : null);

export type CutoffKey = "vgmClosing" | "siClosing" | "amsDeadline" | "isfDeadline" | "closingDate";

interface CutoffDef {
  key: CutoffKey;
  /** "VGM closing": what is due, before "today", "tomorrow", "on Mon 23.11.". */
  due: string;
  /** "VGM": what is overdue. */
  name: string;
  /** The date it is due by, with the time typed beside it ("" for none); null when it has no date or its work is done. */
  at: (job: CutoffJob) => { date: string; time: string } | null;
}
/** A date with its time, or null for no date: a time typed with no date is nothing. */
const dueAt = (date: string | null, time: string) => (date ? { date, time } : null);

const CUTOFFS: readonly CutoffDef[] = [
  { key: "vgmClosing", due: "VGM closing", name: "VGM", at: (j) => (vgmNotOurs(j.vgm) ? null : dueAt(j.vgmClosing, j.vgmClosingTime)) },
  { key: "siClosing", due: "SI closing", name: "SI", at: (j) => (statusHas(j.shippingInstructions, "confirmed") ? null : dueAt(j.siClosing, j.siClosingTime)) },
  // A deadline typed carries its own time; the 4 days before the ETD are a day, with none.
  { key: "amsDeadline", due: "AMS deadline", name: "AMS", at: (j) => (statusHas(j.ams, "pending") ? (dueAt(j.amsDeadline, j.amsDeadlineTime) ?? dueAt(filedBeforeDeparture(j), "")) : null) },
  { key: "isfDeadline", due: "ISF deadline", name: "ISF", at: (j) => (statusHas(j.isf, "pending") ? (dueAt(j.isfDeadline, j.isfDeadlineTime) ?? dueAt(filedBeforeDeparture(j), "")) : null) },
  { key: "closingDate", due: "Closing", name: "Closing", at: (j) => dueAt(j.closingDate, j.closingTime) },
];

export interface CutoffDue {
  key: CutoffKey;
  date: string;
  /** Its time of day, "HH:mm"; "" for the date only, and for anything typed that is no time of day. */
  time: string;
  /** Calendar days from today to the date: 0 today, negative once it passed. */
  days: number;
  /**
   * missed     its day passed, or its time today did: URGENT while the job has not left (D7, see cutoffsOf)
   * urgent     today or by the next working day
   * attention  in the two working days after
   */
  state: "missed" | "urgent" | "attention";
}

/**
 * Whether the job is on its way or further, by its own dates: an ATD, an ATA or an actual
 * delivery. An import that arrived is gone though nobody typed its ATD.
 */
const hasLeft = (job: Pick<OpsCockpitJob, "actualDeparture" | "actualArrival" | "actualDeliveryDate">) => !!(job.actualDeparture || job.actualArrival || job.actualDeliveryDate);

/**
 * The first day "ETD passed, no ATD" speaks for a job with this ETD: ETD_PASSED_AFTER_DAYS of
 * its mode after it, as attentionRulesFor hands that number to lib/trackingAttention.
 */
const etdPassedFrom = (job: Pick<OpsCockpitJob, "tradeDirection" | "freightMode" | "department">, etd: string) => addDays(etd, ETD_PASSED_AFTER_DAYS[freightKindOf(job)]);

/**
 * Whether something due before departure on `date`, which has passed, still counts today: until
 * the day "ETD passed, no ATD" speaks instead (etdPassedFrom), so the job is never without an
 * URGENT tag in between - a sea, rail or road job keeps it on its ETD and the day after, an air
 * job on its ETD. A job with no ETD keeps it PASSED_DATE_KEPT_DAYS after `date` itself, not for
 * ever. (That the job has not left is asked apart: hasLeft.)
 */
const stillBeforeDeparture = (job: Pick<OpsCockpitJob, "estimatedDeparture" | "tradeDirection" | "freightMode" | "department">, date: string, today: string) =>
  job.estimatedDeparture ? today < etdPassedFrom(job, job.estimatedDeparture) : date >= addDays(today, -PASSED_DATE_KEPT_DAYS);

/**
 * The job's cut-offs that count on `day`: those in the two windows, and the missed ones.
 *
 *   A job that has left (hasLeft) has none: nothing can be filed or missed any more.
 *   A missed cut-off stays URGENT (D7) until "ETD passed, no ATD" takes over; with no ETD, for
 *   PASSED_DATE_KEPT_DAYS after its own date (stillBeforeDeparture).
 *   Closing counts until the cargo is in (`cargoIsIn`, see cargoIn): true drops it. Null - the
 *   timeline could not be read - leaves a Closing still ahead, which its date alone says, and
 *   withholds a missed one: nobody can tell that the cargo did not make it.
 */
export function cutoffsOf(job: CutoffJob, day: OpsDay, cargoIsIn: boolean | null): CutoffDue[] {
  if (hasLeft(job)) return [];
  return CUTOFFS.flatMap((def): CutoffDue[] => {
    const due = def.at(job);
    if (!due) return [];
    const { date } = due;
    const isClosing = def.key === "closingDate";
    if (isClosing && cargoIsIn === true) return [];
    const minutes = minutesOf(due.time);
    const time = minutes === null ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const days = daysBetween(day.today, date);
    const missed = days < 0 || (days === 0 && minutes !== null && day.minutes > minutes);
    if (missed) {
      if (isClosing && cargoIsIn === null) return [];
      return stillBeforeDeparture(job, date, day.today) ? [{ key: def.key, date, time, days, state: "missed" }] : [];
    }
    if (date <= day.urgentUntil) return [{ key: def.key, date, time, days, state: "urgent" }];
    return date <= day.attentionUntil ? [{ key: def.key, date, time, days, state: "attention" }] : [];
  });
}

/** The signals of the job's cut-offs: missed or due by the next working day is urgent, the two working days after a warning. */
export function cutoffSignals(cutoffs: readonly CutoffDue[], today: string): OpsSignal[] {
  return cutoffs.map((c): OpsSignal => {
    const def = CUTOFFS.find((d) => d.key === c.key)!;
    const isClosing = c.key === "closingDate";
    const at = c.time ? ` ${c.time}` : "";
    if (c.state === "missed") {
      return isClosing
        ? urgent(OPS_RANK.closingMissed, "cutoff", "details", `Closing missed · ${c.days === 0 ? "today" : dm(c.date)}${at}`)
        : // Overdue since its time today: no day has passed yet, so the time says since when.
          urgent(OPS_RANK.filingOverdue, "cutoff", "details", c.days === 0 ? `${def.name} overdue · today${at}` : `${def.name} overdue ${plural(-c.days, "day")}`);
    }
    const text = `${def.due} ${dueWords(c.date, today)}${at}`;
    return c.state === "urgent" ? urgent(isClosing ? OPS_RANK.closingDue : OPS_RANK.filingDue, "cutoff", "details", text) : attention(OPS_RANK.cutoffAhead, "cutoff", "details", text);
  });
}

// ─── Customs: the TS copy of the Customs page's urgent filter ────────────

const CUSTOMS_RELEASED = "Customs Cleared/Released";
const CUSTOMS_DEADLINE = /^(\d{4}-\d{2}-\d{2}) ([01]\d|2[0-3]):([0-5]\d)$/;
/** An instant as the clock on a Prague wall shows it, counted as if it were UTC: wall times compare and add up without a time zone. */
const pragueWall = (at: Date) => Date.parse(`${businessDay(at)}T${businessTime(at)}:00Z`) + (at.getTime() % 60_000);

/**
 * The customs deadline of a job that is urgent for customs, as repositories/shipment.repository
 * CUSTOMS_PREDICATES.urgent decides it: priority Urgent, not Customs Cleared/Released, and a
 * deadline (a Prague wall time) within the next 24 hours or passed. A deadline that is no date is
 * skipped, as there - one of the right shape that names no real day or time too (30 February,
 * 24:00), which JavaScript would roll over into the next day. Null when the job is not urgent.
 */
export function customsUrgency(job: Pick<OpsCockpitJob, "customsPriority" | "customsStatus" | "customsDeadline">, now: Date): { day: string; time: string; passed: boolean } | null {
  if (job.customsPriority !== "Urgent" || job.customsStatus === CUSTOMS_RELEASED) return null;
  const [, day, hour, minute] = CUSTOMS_DEADLINE.exec(job.customsDeadline) ?? [];
  if (!day || !hour || !minute || !isRealYmd(day)) return null;
  const time = `${hour}:${minute}`;
  const deadline = Date.parse(`${day}T${time}:00Z`);
  const wallNow = pragueWall(now);
  if (!Number.isFinite(deadline) || deadline >= wallNow + 24 * 3_600_000) return null;
  return { day, time, passed: deadline < wallNow };
}

/** U9: an Urgent job's deadline within 24 hours or passed; an open Customs hold, from its first day, with its age. */
export function customsSignals(job: Pick<OpsCockpitJob, "customsPriority" | "customsStatus" | "customsDeadline">, timeline: TimelineFacts | null, now: Date, today: string): OpsSignal[] {
  const out: OpsSignal[] = [];
  const customs = customsUrgency(job, now);
  if (customs) out.push(urgent(OPS_RANK.customsUrgent, "customs", "customs", `Customs urgent · deadline ${dm(customs.day)} ${customs.time}${customs.passed ? " passed" : ""}`));
  if (timeline?.holdSince) {
    const age = daysBetween(timeline.holdSince, today);
    out.push(urgent(OPS_RANK.customsHold, "customs", "customs", `Customs hold · ${age > 0 ? `${plural(age, "day")}, since ${dm(timeline.holdSince)}` : "since today"}`));
  }
  return out;
}

// ─── Billing: the TS copy of the Invoicing page's "arrived, not released" ────────

/**
 * Whether the date the job is taxed by has been reached and operations have not released it for
 * billing: repositories/shipment.repository INVOICING_PREDICATES "unbilled-arrivals" (TAX_DATE_REACHED
 * and a status that does not start with "bill"), on an active job. A Domestic job or one of the
 * Road Department by its delivery, an export by its ATD, any other by its ATA. Compared as the
 * list compares - in any case, nothing trimmed - so the tile counts the rows the list opens.
 */
export function isUnbilledArrival(job: Pick<OpsCockpitJob, "tradeDirection" | "department" | "status" | "actualDeliveryDate" | "actualDeparture" | "actualArrival">): boolean {
  return !!unbilledTaxDate(job) && !job.status.toLowerCase().startsWith("bill");
}

/**
 * The actual date isUnbilledArrival reads as the job's tax date, null (or "") until there is one:
 * the delivery of a Domestic job or one of the Road Department, an export's ATD, any other job's
 * ATA. The Money tab (lib/managersMoney) counts its days from it.
 */
export function unbilledTaxDate(job: Pick<OpsCockpitJob, "tradeDirection" | "department" | "actualDeliveryDate" | "actualDeparture" | "actualArrival">): string | null {
  const direction = job.tradeDirection.toLowerCase();
  const deliveryDated = direction === "domestic" || job.department.toLowerCase() === ROAD_DEPARTMENT.toLowerCase();
  return deliveryDated ? job.actualDeliveryDate : direction === "export" ? job.actualDeparture : job.actualArrival;
}

// ─── Before departure: booking, cargo, MAWB, B/L, credit ───────────────────

/**
 * The Incoterms under which the buyer books the main carriage: the E and F groups. On an import
 * under one of them the main carriage is ours to book (we act for the consignee); under a C or D
 * term the seller's side books it and our Booking Confirmation stays at its first value.
 */
export const BUYER_BOOKS_INCOTERMS: readonly string[] = ["EXW", "FCA", "FAS", "FOB"];

/** The code a typed Incoterm starts with ("FOB Hamburg" is FOB), upper case; "" for none. */
const incotermCode = (typed: string | undefined) => (typed ?? "").trim().slice(0, 3).toUpperCase();

/**
 * Whether the job's main carriage is ours to book, so its Booking Confirmation is watched: every
 * export, and an import whose Incoterms - Origin or Destination, whichever is typed - are one of
 * BUYER_BOOKS_INCOTERMS. An import with no such term (none typed, or not read) is not: Booking
 * Confirmation is Pending on every new job, and an import booked by the seller's side would be
 * "at risk" all its life. Nor is a Domestic job or one with no Trade Direction.
 */
export function weBookMainCarriage(job: Pick<OpsCockpitJob, "tradeDirection" | "incotermOrigin" | "incotermDestination">): boolean {
  const direction = directionOf(job);
  if (direction === "export") return true;
  if (direction !== "import") return false;
  return [job.incotermOrigin, job.incotermDestination].some((term) => BUYER_BOOKS_INCOTERMS.includes(incotermCode(term)));
}

/**
 * U4: Booking Confirmation still Pending with the cargo ready or the ETD close - a flight closer
 * than a vessel, in working days (comingWithin). Only where the main carriage is ours to book
 * (weBookMainCarriage). Not once the job has left, and not on a Trucking job (Domestic, Road
 * Department): it is born "Pending" like every job and has no carrier's booking to confirm.
 */
export function bookingSignals(
  job: Pick<
    OpsCockpitJob,
    | "bookingConfirmation"
    | "cargoReadinessDate"
    | "estimatedDeparture"
    | "actualDeparture"
    | "actualArrival"
    | "actualDeliveryDate"
    | "tradeDirection"
    | "freightMode"
    | "department"
    | "incotermOrigin"
    | "incotermDestination"
  >,
  today: string,
  holidays: readonly string[] = [],
): OpsSignal[] {
  if (!statusHas(job.bookingConfirmation, "pending") || hasLeft(job) || isTruckingJob(job) || !weBookMainCarriage(job)) return [];
  const within = BOOKING_PENDING_WITHIN_DAYS[freightKindOf(job)];
  const why = [
    comingWithin(job.cargoReadinessDate, today, within.cargoReady, holidays) ? `cargo ready ${dm(job.cargoReadinessDate)}` : "",
    comingWithin(job.estimatedDeparture, today, within.etd, holidays) ? `ETD ${dm(job.estimatedDeparture)}` : "",
  ].filter(Boolean);
  return why.length ? [urgent(OPS_RANK.booking, "booking", "details", `Booking Confirmation Pending · ${why.join(" · ")}`)] : [];
}

/**
 * U5: the cargo is ready only after the Closing: it will miss the vessel or flight. Not once the
 * job has left or the cargo is known to be in, nor for a Closing longer ago than PASSED_DATE_KEPT_DAYS.
 * Nor for a Closing a manager dismissed (`closingsDismissed`, its dates): missing it is what the
 * dismissal settled, so the row does not stay URGENT for it.
 */
export function cargoReadySignals(
  job: Pick<OpsCockpitJob, "cargoReadinessDate" | "closingDate" | "actualDeparture" | "actualArrival" | "actualDeliveryDate">,
  cargoIsIn: boolean | null,
  today: string,
  closingsDismissed: readonly string[] = [],
): OpsSignal[] {
  if (!job.cargoReadinessDate || !job.closingDate || job.cargoReadinessDate <= job.closingDate) return [];
  if (closingsDismissed.includes(job.closingDate)) return [];
  if (hasLeft(job) || cargoIsIn === true || job.closingDate < addDays(today, -PASSED_DATE_KEPT_DAYS)) return [];
  return [urgent(OPS_RANK.cargoReady, "cargo_ready", "details", `Cargo ready ${dm(job.cargoReadinessDate)}, after Closing ${dm(job.closingDate)}`)];
}

/** U15: an air export with no MAWB number and the ETD within a working day (on a Friday: Monday's flight too), while it has not left. */
export function mawbSignals(
  job: Pick<OpsCockpitJob, "masterBolNumber" | "estimatedDeparture" | "actualDeparture" | "actualArrival" | "actualDeliveryDate" | "tradeDirection" | "freightMode" | "department">,
  today: string,
  holidays: readonly string[] = [],
): OpsSignal[] {
  if (freightKindOf(job) !== "air" || directionOf(job) !== "export" || job.masterBolNumber.trim() || hasLeft(job)) return [];
  return comingWithin(job.estimatedDeparture, today, MAWB_MISSING_ETD_WITHIN_DAYS, holidays) ? [urgent(OPS_RANK.mawbMissing, "air", "details", `No MAWB number · ETD ${dm(job.estimatedDeparture)}`)] : [];
}

/**
 * A2: an export's BoL draft not Approved 3 days before the SI closing - and after it while the job
 * has not left and "ETD passed, no ATD" has not taken over (stillBeforeDeparture). An import's
 * draft is the agent's.
 * A3: a sea export departed and the House BoL not released 5 working days after the ATD - a job
 * on a Direct MBL has no House BoL to release.
 */
export function bolSignals(
  job: Pick<
    OpsCockpitJob,
    "bolDraft" | "siClosing" | "estimatedDeparture" | "actualDeparture" | "actualArrival" | "actualDeliveryDate" | "houseBolRelease" | "houseBolType" | "tradeDirection" | "freightMode" | "department"
  >,
  day: OpsDay,
): OpsSignal[] {
  const out: OpsSignal[] = [];
  const isExport = directionOf(job) === "export";
  const si = job.siClosing;
  if (isExport && si && !/^approved/i.test(job.bolDraft.trim()) && !hasLeft(job) && addDays(si, -BL_DRAFT_BEFORE_SI_DAYS) <= day.today && (si >= day.today || stillBeforeDeparture(job, si, day.today))) {
    out.push(attention(OPS_RANK.bolDraft, "bl", "details", `BoL draft not Approved · SI closing ${dm(si)}`));
  }
  const noHouseBol = job.houseBolType.trim().toLowerCase() === "direct mbl";
  if (freightKindOf(job) === "sea" && isExport && job.actualDeparture && !job.houseBolRelease.trim() && !noHouseBol) {
    if (workingDaysSince(job.actualDeparture, day.today, day.holidays) >= HOUSE_BOL_NOT_RELEASED_AFTER_WORKING_DAYS) {
      out.push(attention(OPS_RANK.houseBol, "bl", "details", `House BoL not released · ATD ${dm(job.actualDeparture)}`));
    }
  }
  return out;
}

/** A24: Credit Check not Green with the ETD within 3 working days, on a job that has not left. */
export function creditSignals(
  job: Pick<OpsCockpitJob, "creditCheck" | "estimatedDeparture" | "actualDeparture" | "actualArrival" | "actualDeliveryDate">,
  today: string,
  holidays: readonly string[] = [],
): OpsSignal[] {
  if (isCreditApproved(job.creditCheck) || hasLeft(job) || !comingWithin(job.estimatedDeparture, today, CREDIT_CHECK_ETD_WITHIN_DAYS, holidays)) return [];
  return [attention(OPS_RANK.credit, "credit", "details", `Credit Check ${job.creditCheck.trim() || "not set"} · ETD ${dm(job.estimatedDeparture)}`)];
}

// ─── On the way: rolled, arrival notice, free time ─────────────────────────

/** U6: a Rolled exception nobody closed (a departure or an arrival closes it). */
export function rolledSignals(timeline: TimelineFacts | null): OpsSignal[] {
  return timeline?.rolledOn ? [urgent(OPS_RANK.rolled, "departure", "tracking", `Rolled · ${dm(timeline.rolledOn)}`)] : [];
}

/** Whether an import is arriving within `workingDays` working days: no ATA yet, and an ETA up to that far ahead or passed no longer ago than ETA_PASSED_KEPT_DAYS calendar days. */
const importArrivingWithin = (job: Pick<OpsCockpitJob, "tradeDirection" | "estimatedArrival" | "actualArrival">, today: string, workingDays: number, holidays: readonly string[]): boolean =>
  directionOf(job) === "import" && !job.actualArrival && comingWithin(job.estimatedArrival, today, workingDays, holidays, ETA_PASSED_KEPT_DAYS);

/**
 * A4: an import by sea, air or rail arriving within 5 working days and no arrival notice sent to the
 * customer. Sent is a customer notice of that kind on the job - or the job's status saying so
 * ("Arrival Notice Sent - Waiting For Instructions"): a status set by hand is somebody's word too.
 */
export function arrivalNoticeSignals(
  job: Pick<OpsCockpitJob, "tradeDirection" | "freightMode" | "department" | "status" | "estimatedArrival" | "actualArrival" | "arrivalNoticeSent">,
  today: string,
  holidays: readonly string[] = [],
): OpsSignal[] {
  const sent = job.arrivalNoticeSent || statusHas(job.status, "arrival notice sent");
  if (sent || freightKindOf(job) === "road" || !importArrivingWithin(job, today, ARRIVAL_NOTICE_ETA_WITHIN_DAYS, holidays)) return [];
  return [attention(OPS_RANK.arrivalNotice, "arrival_notice", "tracking", `No arrival notice sent · ETA ${dm(job.estimatedArrival!)}`)];
}

/** Whether the job is a Full Load (FCL): the boxes are its own, with their own free time. */
const isFullLoad = (job: Pick<OpsCockpitJob, "loadType">) => job.loadType.trim().toLowerCase() === "full load";

/** Whether A5 looks at this job's containers: a Full Load import by sea or rail arriving within 7 working days. The read asks for these jobs' boxes only. */
export const boxesWanted = (job: Pick<OpsCockpitJob, "tradeDirection" | "freightMode" | "loadType" | "estimatedArrival" | "actualArrival">, today: string, holidays: readonly string[] = []): boolean =>
  isFullLoad(job) && clockApplies(job) && importArrivingWithin(job, today, FREE_TIME_MISSING_ETA_WITHIN_DAYS, holidays);

/**
 * A5: a Full Load import arriving within 7 working days with a container that has no free time typed, or -
 * after departure - with no container number. `boxes` are the job's containers; null when they
 * could not be read, and then nothing is said.
 */
export function boxSignals(
  job: Pick<OpsCockpitJob, "tradeDirection" | "freightMode" | "loadType" | "estimatedArrival" | "actualArrival" | "actualDeparture">,
  boxes: readonly CockpitBox[] | null,
  today: string,
  holidays: readonly string[] = [],
): OpsSignal[] {
  if (!boxes || !boxesWanted(job, today, holidays)) return [];
  const out: OpsSignal[] = [];
  const untimed = boxes.filter((b) => b.freeTimeDays === null && b.lastFreeDay === null);
  if (untimed.length > 0) {
    const numbered = untimed.map((b) => b.containerNumber.trim()).filter(Boolean);
    const which = numbered.length === 0 ? plural(untimed.length, "container") : `${numbered[0]}${untimed.length > 1 ? ` and ${untimed.length - 1} more` : ""}`;
    out.push(attention(OPS_RANK.freeTimeMissing, "free_time", "tracking", `No free time typed · ${which} · ETA ${dm(job.estimatedArrival!)}`));
  }
  if (job.actualDeparture && (boxes.length === 0 || boxes.some((b) => !b.containerNumber.trim()))) {
    out.push(attention(OPS_RANK.freeTimeMissing, "free_time", "details", `No container number · departed ${dm(job.actualDeparture)}`));
  }
  return out;
}

// ─── The last mile: delivery, our warehouse, the truck, the POD ─────────────────

/**
 * U13: the planned delivery passed with no actual delivery (from the next morning).
 * A21: a delivery planned for the next working day with no plate number.
 */
export function deliverySignals(job: Pick<OpsCockpitJob, "plannedDeliveryDate" | "actualDeliveryDate" | "plateNumber">, day: OpsDay): OpsSignal[] {
  const planned = job.plannedDeliveryDate;
  if (!planned || job.actualDeliveryDate) return [];
  if (planned < day.today) return [urgent(OPS_RANK.deliveryPassed, "delivery", "tracking", `Planned delivery ${dm(planned)} passed, not delivered`)];
  if (planned > day.today && planned <= day.urgentUntil && !job.plateNumber.trim()) {
    return [attention(OPS_RANK.deliveryNoPlate, "delivery", "details", `Delivery ${dueWords(planned, day.today)}, no plate number`)];
  }
  return [];
}

/**
 * U13: the ETA at our warehouse passed and nothing was received - not on an export that has
 * left: its cargo is on the vessel, whatever the warehouse did not stamp.
 * A20: received at our warehouse, with no planned delivery and no release after 2 working days -
 * an import or a Domestic job; an export waits there for its vessel.
 */
export function warehouseSignals(
  job: Pick<OpsCockpitJob, "tradeDirection" | "etaWarehouse" | "warehouseReceivedDate" | "warehouseReleasedDate" | "plannedDeliveryDate" | "actualDeliveryDate" | "actualDeparture" | "actualArrival">,
  day: OpsDay,
): OpsSignal[] {
  if (job.actualDeliveryDate) return [];
  const isExport = directionOf(job) === "export";
  if (!job.warehouseReceivedDate) {
    if (isExport && hasLeft(job)) return [];
    return job.etaWarehouse && job.etaWarehouse < day.today ? [urgent(OPS_RANK.warehousePassed, "warehouse", "tracking", `ETA warehouse ${dm(job.etaWarehouse)} passed, not received`)] : [];
  }
  if (isExport || job.plannedDeliveryDate || job.warehouseReleasedDate) return [];
  return workingDaysSince(job.warehouseReceivedDate, day.today, day.holidays) >= WAREHOUSE_IDLE_AFTER_WORKING_DAYS
    ? [attention(OPS_RANK.warehouseIdle, "warehouse", "tracking", `In our warehouse since ${dm(job.warehouseReceivedDate)}, no planned delivery`)]
    : [];
}

/**
 * The road rules, from the job's timeline (Trucking's stamps land there; null when it could not be
 * read, and then nothing is said). The haulier's confirmation is stamped only on a Trucking job
 * (lib/trackingEvents TRUCKING_STAMP_KINDS) and the POD is written only by Trucking, so only such
 * a job is asked for either: an international road job not run through Trucking can never get one.
 *
 *   U14  a Trucking job's pick-up is today and no haulier confirmed;
 *        a road job's pick-up day passed and it was not picked up
 *   A21  a Trucking job's pick-up is on the next working day and no haulier confirmed, from 14:00
 *   A22  a Trucking job delivered, no POD after 2 working days - URGENT at 5: it holds Billing
 */
export function roadSignals(
  job: Pick<OpsCockpitJob, "tradeDirection" | "freightMode" | "department" | "pickupDate" | "actualDeparture" | "actualArrival" | "actualDeliveryDate">,
  timeline: TimelineFacts | null,
  day: OpsDay,
): OpsSignal[] {
  if (!timeline || freightKindOf(job) !== "road") return [];
  const out: OpsSignal[] = [];
  const pickup = job.pickupDate;
  if (pickup && !timeline.pickedUp && !hasLeft(job)) {
    const waitsForHaulier = isTruckingJob(job) && !timeline.haulierConfirmed;
    if (pickup < day.today) out.push(urgent(OPS_RANK.pickupPassed, "road", "tracking", `Pick-up ${dm(pickup)} passed, not picked up`));
    else if (pickup === day.today && waitsForHaulier) out.push(urgent(OPS_RANK.haulierToday, "road", "tracking", "Pick-up today, haulier not confirmed"));
    else if (pickup > day.today && pickup <= day.urgentUntil && waitsForHaulier && day.minutes >= minutesOf(HAULIER_TOMORROW_FROM)!) {
      out.push(attention(OPS_RANK.haulierTomorrow, "road", "tracking", `Pick-up ${dueWords(pickup, day.today)}, haulier not confirmed`));
    }
  }
  if (isTruckingJob(job) && job.actualDeliveryDate && !timeline.podReceived) {
    const waited = workingDaysSince(job.actualDeliveryDate, day.today, day.holidays);
    const text = `Delivered ${dm(job.actualDeliveryDate)}, no POD · ${plural(waited, "working day")}`;
    if (waited >= POD_MISSING_URGENT_WORKING_DAYS) out.push(urgent(OPS_RANK.podUrgent, "road", "tracking", text));
    else if (waited >= POD_MISSING_AFTER_WORKING_DAYS) out.push(attention(OPS_RANK.pod, "road", "tracking", text));
  }
  return out;
}

// ─── Needs Attention's flags ───────────────────────────────────────────

/**
 * The thresholds Needs Attention's date rules run on in the cockpit: per mode (D8), and an import
 * is asked for its ATD too (U6). The Tracking tab and the bell keep their own single numbers.
 */
export function attentionRulesFor(kind: FreightKind, holidays: readonly string[]): AttentionRules {
  return {
    arrivalLateAfterDays: ETA_PASSED_AFTER_DAYS[kind],
    departureLateAfterDays: ETD_PASSED_AFTER_DAYS[kind],
    departureLateForImports: true,
    noOnwardAfterWorkingDays: ARRIVED_NOTHING_SINCE_WORKING_DAYS[kind],
    noEventAfterDays: NO_TRACKING_AFTER_DAYS[kind],
    extraHolidays: holidays,
  };
}

/** Needs Attention's flags as cockpit signals, worded as that list words them. */
export function flagSignals(flags: readonly TrackingAttentionFlag[]): OpsSignal[] {
  return flags.map((f) => {
    const text = `${f.label}${f.detail ? ` · ${f.detail}` : ""}`;
    return f.severity === "urgent" ? urgent(URGENT_FLAG_RANK[f.kind], FLAG_KIND[f.kind], f.area, text) : attention(ATTENTION_FLAG_RANK[f.kind], FLAG_KIND[f.kind], f.area, text);
  });
}

// ─── The cockpit ───────────────────────────────────────────────

const NO_FACTS: AttentionFacts = { proposed: [], lastEventDay: null, arrivedAtHub: false, lastNotice: null, clocks: [] };

/** The shipment tab a row opens on: where its first tag is worked on - the first urgent signal, else the first of all, by rank (the order rankRow lists the tags in). */
const firstArea = (signals: readonly OpsSignal[]): Area =>
  signals.reduce<OpsSignal | null>((best, s) => (!best || Number(s.urgent) > Number(best.urgent) || (s.urgent === best.urgent && s.rank < best.rank) ? s : best), null)?.area ?? "details";

/** A signal of the other tables, its rank moved onto OPS_RANK's scale. */
const onScale = (s: OpsSignal): OpsSignal => ({ ...s, rank: s.rank * EXTRA_RANK_SCALE });

/** One job judged: what the tiles count and what its row carries. */
interface Judged {
  job: OpsCockpitJob;
  /** Who handles it, "" for nobody. */
  email: string;
  customsUrgent: boolean;
  flags: TrackingAttentionFlag[];
  /** Its row on a card; null when nothing asks for a look. */
  ranked: RankedRow<OpsCockpitRow> | null;
}

/** Every signal of one job: its own columns, the timeline, Needs Attention's flags and what the other tables say. */
export function jobSignals(
  job: OpsCockpitJob,
  input: Pick<OpsCockpitInput, "facts" | "timeline" | "boxes" | "userEmails" | "extraByJob" | "team" | "cutoffsKept" | "closingsDismissed" | "now" | "handover" | "claims">,
  day: OpsDay,
): { signals: OpsSignal[]; flags: TrackingAttentionFlag[] } {
  // A job with no event of these kinds has no entry: its timeline is known, and empty.
  const timeline = input.timeline ? (input.timeline.get(job.id) ?? NO_TIMELINE) : null;
  const cargoIsIn = cargoIn(job, timeline);
  const flags = attentionFlags(job, input.facts.get(job.id) ?? NO_FACTS, day.today, attentionRulesFor(freightKindOf(job), day.holidays));
  const handover = input.handover ?? NO_HANDOVER_FACTS;
  const due = cutoffsOf(job, day, cargoIsIn);
  const cutoffs = input.cutoffsKept(job.id, due);
  // What the job says itself that a warehouse signal would say again (lib/managersCockpitHandover WAREHOUSE_SAID_BY_THE_JOB).
  // The Closing before any dismissal: a dismissed one is settled, and the warehouse's "… past the closing" is no news either.
  const says = { freeTimeClock: flags.some((f) => f.kind === "free_time"), closing: due.some((c) => c.key === "closingDate") };
  const signals: OpsSignal[] = [
    ...handledBySignals(job, input.userEmails),
    ...customsSignals(job, timeline, input.now, day.today),
    ...cutoffSignals(cutoffs, day.today),
    ...bookingSignals(job, day.today, day.holidays),
    ...cargoReadySignals(job, cargoIsIn, day.today, input.closingsDismissed(job.id)),
    ...mawbSignals(job, day.today, day.holidays),
    ...rolledSignals(timeline),
    ...deliverySignals(job, day),
    // Step 2's own, but not where the warehouse or Trucking says the same itself (lib/managersCockpitHandover).
    ...warehouseSignals(job, day).filter((s) => stepTwoWarehouseTagStays(s, job.id, handover)),
    ...(truckingSpeaksForRoad(job.id, handover) ? [] : roadSignals(job, timeline, day)),
    ...handoverSignals(job.id, handover, says),
    ...bolSignals(job, day),
    ...arrivalNoticeSignals(job, day.today, day.holidays),
    ...boxSignals(job, input.boxes ? (input.boxes.get(job.id) ?? []) : null, day.today, day.holidays),
    ...creditSignals(job, day.today, day.holidays),
    ...flagSignals(flags),
    ...claimSignals(job, input.claims ?? NO_CLAIM_FACTS, day.today),
    ...(input.extraByJob.get(job.id) ?? []).map(onScale),
  ];
  const team = input.team.byJob.get(job.id);
  if (team) {
    signals.push(...team.signals);
    // Kept for the quiet jobs: one with something URGENT on it is being looked at for a reason.
    if (team.notTouched && !signals.some((s) => s.urgent)) signals.push(team.notTouched);
  }
  return { signals, flags };
}

function judge(job: OpsCockpitJob, input: OpsCockpitInput, day: OpsDay): Judged {
  const { signals, flags } = jobSignals(job, input, day);
  return judged(job, signals, flags, input.now);
}

/**
 * A job that is no longer active (Invoiced, or cancelled) with an open claim: judged by its cargo
 * claims alone (X8). The claim outlives the job's billing - a notice deadline or a suit time bar
 * runs on - but nothing else of the job asks anybody for anything any more.
 */
function judgeClaimOnly(job: OpsCockpitJob, input: OpsCockpitInput, day: OpsDay): Judged {
  return judged(job, claimSignals(job, input.claims ?? NO_CLAIM_FACTS, day.today), [], input.now);
}

function judged(job: OpsCockpitJob, signals: OpsSignal[], flags: TrackingAttentionFlag[], now: Date): Judged {
  const row: Omit<OpsCockpitRow, "tags"> = {
    kind: "job",
    id: job.id,
    jobNumber: job.jobNumber,
    customer: job.customer,
    mode: modeOf(job),
    tradeDirection: job.tradeDirection,
    status: job.status,
    handledBy: job.personInCharge.trim(),
    holidayCover: job.holidayCover.trim(),
    area: firstArea(signals),
  };
  return { job, email: personEmail(job.personInCharge), customsUrgent: customsUrgency(job, now) !== null, flags, ranked: rankRow<OpsCockpitRow>(row, signals) };
}

/** A Master Job as the filters read a job: by its own Freight Mode, Trade Direction and Handled By. */
const masterJobAsJob = (m: OpsMasterJobRow) => ({ tradeDirection: m.tradeDirection, freightMode: m.freightMode, department: "", personInCharge: m.handledBy });

/** A Master Job with no house as a row, with its own mode, direction and Handled By; it has no shipment status. */
function masterJobRow(m: OpsMasterJobRow): RankedRow<OpsCockpitRow> | null {
  const signals = m.signals.map(onScale);
  const asJob = masterJobAsJob(m);
  const row: Omit<OpsCockpitRow, "tags"> = {
    kind: "masterJob",
    id: m.id,
    jobNumber: m.number,
    customer: m.customer,
    // As a job's row: none shown without a Freight Mode (the Sea filter still counts it).
    mode: m.freightMode.trim() || isTruckingJob(asJob) ? freightKindOf(asJob) : "",
    tradeDirection: m.tradeDirection.trim(),
    status: "",
    handledBy: m.handledBy.trim(),
    holidayCover: m.holidayCover.trim(),
    area: firstArea(signals),
  };
  return rankRow<OpsCockpitRow>(row, signals);
}

const MODES_COUNTED = { sea: 0, air: 0, rail: 0, road: 0 } as const;
const least = (days: readonly string[]): string | null => days.reduce<string | null>((first, day) => (first === null || day < first ? day : first), null);

/**
 * The people line. `team`: the jobs the line is about - of the chosen mode and direction, and with
 * "My reports" only those the caller's reports handle; whoever is named in Handled By on one has
 * an entry, the most active first, nobody after anyone as active. `pool`: every job of the mode
 * and direction, whoever handles it - what a person COVERS is counted there, for a cover's load is
 * theirs whoever's job it is. Somebody who only covers has an entry too, with no active job
 * (`listed` says who may: with "My reports", the caller's reports and whoever is no user).
 *
 * A figure whose part was not read is null, never 0 (D29).
 */
function peopleOf(team: readonly Judged[], pool: readonly Judged[], input: Pick<OpsCockpitInput, "userEmails" | "team">, listed: (email: string) => boolean): OpsCockpitPerson[] {
  const { known, byJob } = input.team;
  const users = input.userEmails;
  // What a person covers, and what waits for them unread - as Handled By or as cover - over the pool.
  const covers = new Map<string, { jobs: number; since: string[] }>();
  const unread = new Map<string, number>();
  for (const j of pool) {
    const facts = byJob.get(j.job.id);
    for (const [email, waiting] of facts?.mentionsUnread ?? []) unread.set(email, (unread.get(email) ?? 0) + waiting);
    const cover = personEmail(j.job.holidayCover);
    if (!cover) continue;
    const mine = covers.get(cover) ?? { jobs: 0, since: [] };
    mine.jobs += 1;
    if (facts?.coverSince) mine.since.push(facts.coverSince);
    covers.set(cover, mine);
  }
  const entry = (email: string): OpsCockpitPerson => ({
    handledBy: email,
    isUser: users ? users.has(email) : null,
    active: 0,
    urgent: 0,
    attention: 0,
    covers: covers.get(email)?.jobs ?? 0,
    byMode: { ...MODES_COUNTED },
    todosLate: known.todos ? 0 : null,
    mentionsUnread: known.mentions ? (unread.get(email) ?? 0) : null,
    notTouched: known.touched ? 0 : null,
    // The oldest of their covers; a cover whose day is not known leaves the others' to say it.
    coversSince: known.coverSince ? least(covers.get(email)?.since ?? []) : null,
    highLoad: false,
    // Step 6 (D12): the last day of today's absence; not known (the absences unread) is null, as not away.
    awayUntil: input.team.awayUntil ? (input.team.awayUntil.get(email) ?? null) : null,
  });
  const people = new Map<string, OpsCockpitPerson>();
  for (const j of team) {
    const person = people.get(j.email) ?? entry(j.email);
    person.active += 1;
    person.byMode[freightKindOf(j.job)] += 1;
    if (j.ranked?.urgent) person.urgent += 1;
    else if (j.ranked) person.attention += 1;
    if (person.todosLate !== null) person.todosLate += byJob.get(j.job.id)?.todosLate ?? 0;
    if (person.notTouched !== null && j.ranked?.row.tags.some((t) => t.kind === "not_touched")) person.notTouched += 1;
    people.set(j.email, person);
  }
  for (const email of covers.keys()) if (!people.has(email) && listed(email)) people.set(email, entry(email));
  // A load that stands out among the people with jobs of their own - never "nobody", who is no person.
  const above = highLoadAbove([...people.values()].filter((p) => p.handledBy !== "").map((p) => p.active));
  for (const person of people.values()) person.highLoad = above !== null && person.handledBy !== "" && person.active > above;
  return [...people.values()].sort(byActiveThenEmail);
}

/** The people line's order: the most active first, nobody ("") after anyone as active, then by e-mail. The Money tab's people stand in the same order. */
export function byActiveThenEmail(a: { handledBy: string; active: number }, b: { handledBy: string; active: number }): number {
  return b.active - a.active || Number(a.handledBy === "") - Number(b.handledBy === "") || a.handledBy.localeCompare(b.handledBy);
}

/** A cut-off due today or by the next working day, or missed: what "Cut-offs due or missed" counts. */
const isUrgentCutoff = (tag: OpsCockpitRow["tags"][number]) => tag.kind === "cutoff" && tag.urgent;

export function buildOpsCockpit(input: OpsCockpitInput): ShipmentsManagersCockpit {
  const { now, mode, direction, reports } = input;
  const day = opsDay(now, input.holidays);
  const handledBy = handledByFilter(input.handledBy);
  const ofReports = (job: Pick<OpsCockpitJob, "personInCharge">) => isOfReports(job, reports, input.reportEmails, input.userEmails);

  // The people line is counted before the Handled By filter: it is what the filter is picked from.
  // "My reports" narrows it too - and everything after it - to the jobs the caller's reports
  // handle, with those of anybody who is no user (isReportOrNoUser).
  const pool = input.jobs.filter((job) => inMode(job, mode) && inDirection(job, direction)).map((job) => judge(job, input, day));
  const scoped = pool.filter((j) => ofReports(j.job));
  const shown = scoped.filter((j) => isHandledBy(j.job, handledBy));
  const flagged = (...kinds: TrackingAttentionFlag["kind"][]) => shown.filter((j) => j.flags.some((f) => kinds.includes(f.kind))).length;

  // A Master Job with no house obeys the filters by what it stores itself. It is a row and a
  // count of its signal families only: no active job, and nobody's on the people line.
  const masterJobs = input.masterJobRows
    .filter((m) => {
      const asJob = masterJobAsJob(m);
      return inMode(asJob, mode) && inDirection(asJob, direction) && ofReports(asJob) && isHandledBy(asJob, handledBy);
    })
    .flatMap((m) => masterJobRow(m) ?? []);
  // A job no longer active with an open claim (X8) obeys every filter as an active job does, and
  // is a row of its claim's tags only: "Open claims" counts it, nothing else of the page does.
  const claimOnly = (input.claimOnlyJobs ?? [])
    .filter((job) => inMode(job, mode) && inDirection(job, direction) && ofReports(job) && isHandledBy(job, handledBy))
    .map((job) => judgeClaimOnly(job, input, day));
  const rows = [...shown.flatMap((j) => (j.ranked ? [j.ranked] : [])), ...masterJobs, ...claimOnly.flatMap((j) => (j.ranked ? [j.ranked] : []))];
  const withTag = (test: (tag: OpsCockpitRow["tags"][number]) => boolean) => rows.filter((r) => r.row.tags.some(test)).length;
  // Every family is in the answer, 0 for none: the page reads a tile's count without asking whether it is there.
  const signals: Record<string, number> = Object.fromEntries(SIGNAL_KINDS.map((kind) => [kind, 0]));
  for (const r of rows) for (const kind of new Set(r.row.tags.flatMap((t) => (t.kind ? [t.kind] : [])))) signals[kind] = (signals[kind] ?? 0) + 1;
  const ofFamily = (kinds: readonly string[]) => (tag: OpsCockpitRow["tags"][number]) => !!tag.kind && kinds.includes(tag.kind);
  // Each tile over every row, a row with two of its kinds once: the cards may be narrowed to another tile below.
  const families: Record<string, number> = Object.fromEntries(Object.entries(SIGNAL_FAMILIES).map(([key, kinds]) => [key, withTag(ofFamily(kinds))]));
  // The tile chosen narrows the cards before they are cut at their limit, so a low-ranked family
  // still lists its rows and each card's total is that family's; nothing else is narrowed by it.
  const signal = input.signal ?? null;
  const carded = signal ? rows.filter((r) => r.row.tags.some(ofFamily(SIGNAL_FAMILIES[signal]))) : rows;
  // Narrowed to the cut-offs, a row is URGENT by its cut-off tags alone (m17): the tile counts the
  // cut-offs due or missed (cutoffsDue), and the URGENT card it opens lists exactly those - a job
  // URGENT for something else whose cut-off is only in the two working days after is listed in
  // ATTENTION, with the cut-off ahead it was found by (its other tags still say the rest).
  const urgentOnCard = signal === "cutoff" ? (r: RankedRow<OpsCockpitRow>) => r.row.tags.some(isUrgentCutoff) : (r: RankedRow<OpsCockpitRow>) => r.urgent;

  const users = input.userEmails;
  const tiles: OpsCockpitTiles = {
    active: shown.length,
    cutoffsDue: withTag(isUrgentCutoff),
    noHandledBy: shown.filter((j) => !j.email).length,
    // Not known is not zero: without the users nobody can be said to be none of them. The jobs whose
    // Handled By or Holiday Cover is no user (S16): the rows the tile's family narrows the cards to.
    handledByNotUser: users ? shown.filter((j) => namesNoUser(j.job, users)).length : null,
    bookingPending: withTag((t) => t.kind === "booking"),
    etdEtaMoved: shown.filter((j) => input.movedIds.has(j.job.id)).length,
    freeTime: flagged("free_time"),
    customsUrgent: shown.filter((j) => j.customsUrgent).length,
    // By the list's rule, not by the cards' flags (which wait some working days): the tile opens the list.
    notReleased: shown.filter((j) => isUnbilledArrival(j.job)).length,
    // The active jobs with a claim and those no longer active with an open cargo claim (a claim on costs alone keeps none of them): the rows the list's tile=claims opens.
    openClaims: shown.filter((j) => j.job.claim === "Yes").length + claimOnly.filter((j) => j.job.claim === "Yes").length,
    signals,
    families,
  };

  const byJobNumber = (a: OpsCockpitRow, b: OpsCockpitRow) => a.jobNumber.localeCompare(b.jobNumber);
  return {
    asOf: now.toISOString(),
    today: day.today,
    mode,
    direction,
    handledBy,
    reports,
    signal,
    tiles,
    urgent: cockpitCard(carded.filter(urgentOnCard), COCKPIT_LIST_LIMIT, byJobNumber),
    attention: cockpitCard(carded.filter((r) => !urgentOnCard(r)), COCKPIT_LIST_LIMIT, byJobNumber),
    people: peopleOf(scoped, pool, input, (email) => isReportOrNoUser(email, reports, input.reportEmails, input.userEmails)),
    audit: input.audit,
    // Over the jobs of the page, as the tiles: its mode, direction, "My reports" and Handled By.
    handover: handoverLine(input.handover ?? NO_HANDOVER_FACTS, shown.map((j) => j.job.id)),
    capped: input.capped,
    holidaysKnown: input.holidaysKnown,
    notKnown: [...new Set(input.notKnown)],
  };
}
