import { addDays, businessDay, businessTime, isRealYmd } from "../../../lib/businessDate";
import { attentionSignal, cockpitCard, rankRow, urgentSignal, type CockpitSignal, type RankedRow } from "../../../lib/cockpit";
import { ROAD_DEPARTMENT } from "../../../lib/deliveryDated";
import type {
  OpsCockpitDirection,
  OpsCockpitMode,
  OpsCockpitPerson,
  OpsCockpitRow,
  OpsCockpitTiles,
  ShipmentsManagersCockpit,
  TrackingAttentionFlag,
} from "../interfaces/interfaces";
import { COCKPIT_LIST_LIMIT, CUTOFF_ATTENTION_DAYS, CUTOFF_URGENT_DAYS } from "./cockpitThresholds";
import { personEmail } from "./shipmentEditRule";
import { attentionFlags, type AttentionFacts, type AttentionShipment } from "./trackingAttention";
import { freightKindOf, isTruckingJob } from "./trackingEvents";

// The operations managers' cockpit (Shipments → Managers, Council Outlay 11, step 1), worked out
// from the company's active jobs and what Needs Attention already knows about them. Pure: no
// database, tested in tests/managersCockpit.test.ts.
//
//   tiles    counts over the jobs of the chosen mode, direction and Handled By
//   cards    a job appears once: in URGENT when any of its signals is urgent, else in ATTENTION,
//            with all its signals as tags; the most pressing first
//   people   who is named in Handled By on the jobs of the chosen mode and direction - not
//            narrowed by the Handled By filter, which is picked from it
// Every rule is one the app already has (the list's deadlines, the Customs page's urgent filter,
// Needs Attention's flags), judged on one `now` and its Prague business day - never the database's.

/** An active job (not invoiced, not cancelled) as the cockpit reads it. */
export interface OpsCockpitJob extends AttentionShipment {
  id: string;
  jobNumber: string;
  customer: string;
  /** Handled By. */
  personInCharge: string;
  holidayCover: string;
  closingDate: string | null;
  vgmClosing: string | null;
  vgm: string;
  siClosing: string | null;
  shippingInstructions: string;
  ams: string;
  amsDeadline: string | null;
  isf: string;
  isfDeadline: string | null;
  customsPriority: string;
  customsStatus: string;
  /** A Prague wall time, "YYYY-MM-DD HH:mm"; "" for none. */
  customsDeadline: string;
  bookingConfirmation: string;
  /** "Yes" while the job has an open claim. */
  claim: string;
}

export interface OpsCockpitInput {
  /** The company's active jobs, as many as were read. */
  jobs: OpsCockpitJob[];
  /** What Needs Attention knows about a job beyond its own columns, by shipment id. */
  facts: ReadonlyMap<string, AttentionFacts>;
  /** The jobs whose ETD or ETA moved lately. */
  movedIds: ReadonlySet<string>;
  /** The e-mails of the company's active users, trimmed and lower-cased; null when they could not be read. */
  userEmails: ReadonlySet<string> | null;
  /** The company has more active jobs than `jobs` holds. */
  capped: boolean;
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  /** An e-mail, "nobody", or null for everyone. */
  handledBy: string | null;
  now: Date;
}

/** The value of the Handled By filter that asks for the jobs nobody handles. */
// A legacy Handled By typed as "nobody" collides with this word and cannot be picked by the filter: accepted, new values are user e-mails.
export const NOBODY = "nobody";

const DAY = 86_400_000;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Calendar days from `from` to `to` (YYYY-MM-DD), negative when `to` is earlier. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

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

/** How the job travels, as its row shows it: "" when it has no Freight Mode and is no Trucking job. */
const modeOf = (job: OpsCockpitJob): string => (job.freightMode.trim() || isTruckingJob(job) ? freightKindOf(job) : "");

// ─── Cut-offs: the TS copy of the list's DEADLINE_DEFS ───────────────

// The five cut-offs of repositories/shipment.repository DEADLINE_DEFS, rule for rule. A status is
// free text with decoration ("Confirmed (Green)"), so it is matched by a fragment, in any case:
//   VGM / SI   by their closing date, unless Confirmed (VGM also: Not Applicable);
//   AMS / ISF  when Pending, by their deadline; without one, 4 days before the ETD;
//   Closing    the cargo closing date as it is.
// The four filings stay due after their date has passed until the vessel sails (isDueWithin's
// keepsOverdue and NOT_DEPARTED); the closing date counts only while it is still ahead.
const statusHas = (status: string, fragment: string) => status.toLowerCase().includes(fragment);
const filedBeforeDeparture = (job: OpsCockpitJob) => (job.estimatedDeparture ? addDays(job.estimatedDeparture, -4) : null);

export type CutoffKey = "vgmClosing" | "siClosing" | "amsDeadline" | "isfDeadline" | "closingDate";

interface CutoffDef {
  key: CutoffKey;
  /** "VGM closing": what is due, before "today", "tomorrow", "in 2 days". */
  due: string;
  /** "VGM": what is overdue. */
  name: string;
  /** The date it is due by; null when it has none or its work is done. */
  date: (job: OpsCockpitJob) => string | null;
  keepsOverdue: boolean;
}

const CUTOFFS: readonly CutoffDef[] = [
  { key: "vgmClosing", due: "VGM closing", name: "VGM", date: (j) => (statusHas(j.vgm, "confirmed") || statusHas(j.vgm, "not applicable") ? null : j.vgmClosing), keepsOverdue: true },
  { key: "siClosing", due: "SI closing", name: "SI", date: (j) => (statusHas(j.shippingInstructions, "confirmed") ? null : j.siClosing), keepsOverdue: true },
  { key: "amsDeadline", due: "AMS deadline", name: "AMS", date: (j) => (statusHas(j.ams, "pending") ? (j.amsDeadline ?? filedBeforeDeparture(j)) : null), keepsOverdue: true },
  { key: "isfDeadline", due: "ISF deadline", name: "ISF", date: (j) => (statusHas(j.isf, "pending") ? (j.isfDeadline ?? filedBeforeDeparture(j)) : null), keepsOverdue: true },
  { key: "closingDate", due: "Closing", name: "Closing", date: (j) => j.closingDate, keepsOverdue: false },
];

export interface CutoffDue {
  key: CutoffKey;
  date: string;
  /** Days from today to the date: 0 today, 1 tomorrow, negative for an overdue filing. */
  days: number;
}

/**
 * The job's cut-offs that count on `today`, whatever their distance: those still ahead, and the
 * filings overdue on a job that has not sailed (no ETD, or an ETD of today or later).
 */
export function cutoffsOf(job: OpsCockpitJob, today: string): CutoffDue[] {
  const notDeparted = !job.estimatedDeparture || job.estimatedDeparture >= today;
  return CUTOFFS.flatMap((def): CutoffDue[] => {
    const date = def.date(job);
    if (!date) return [];
    const days = daysBetween(today, date);
    if (days < 0 && !(def.keepsOverdue && notDeparted)) return [];
    return [{ key: def.key, date, days }];
  });
}

/** Whether a cut-off is the cockpit's "due": today, within CUTOFF_URGENT_DAYS, or an overdue filing (the list's tile=cutoffs). */
const isCutoffDue = (c: CutoffDue) => c.days <= CUTOFF_URGENT_DAYS;

const dueWords = (days: number) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${plural(days, "day")}`);

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

// ─── Billing: the TS copy of the Invoicing page's "arrived, not released" ────────

/**
 * Whether the date the job is taxed by has been reached and operations have not released it for
 * billing: repositories/shipment.repository INVOICING_PREDICATES "unbilled-arrivals" (TAX_DATE_REACHED
 * and a status that does not start with "bill"), on an active job. A Domestic job or one of the
 * Road Department by its delivery, an export by its ATD, any other by its ATA. Compared as the
 * list compares - in any case, nothing trimmed - so the tile counts the rows the list opens.
 */
export function isUnbilledArrival(job: Pick<OpsCockpitJob, "tradeDirection" | "department" | "status" | "actualDeliveryDate" | "actualDeparture" | "actualArrival">): boolean {
  const direction = job.tradeDirection.toLowerCase();
  const deliveryDated = direction === "domestic" || job.department.toLowerCase() === ROAD_DEPARTMENT.toLowerCase();
  const taxDateReached = deliveryDated ? !!job.actualDeliveryDate : direction === "export" ? !!job.actualDeparture : !!job.actualArrival;
  return taxDateReached && !job.status.toLowerCase().startsWith("bill");
}

// ─── Signals ───────────────────────────────────────────────────

type Area = OpsCockpitRow["area"];
/** A signal and the shipment tab it is best worked on. */
export interface OpsSignal extends CockpitSignal {
  area: Area;
}
const urgent = (rank: number, area: Area, text: string): OpsSignal => ({ ...urgentSignal(rank, text), area });
const attention = (rank: number, area: Area, text: string): OpsSignal => ({ ...attentionSignal(rank, text), area });

// Lower rank = higher in its card: the clocks that run out soonest first (customs by the hour,
// cut-offs by the day), then what Needs Attention already lists, and last a job that only lacks
// somebody to handle it. A company with many such jobs would otherwise see nothing else on the
// card's first rows; they have their own tile, and a job with a deadline too still comes first.
const RANK = {
  nobody: 10,
  notUser: 11,
  customs: 3,
  filing: 4,
  closing: 5,
  cutoffAhead: 20,
} as const;
/** Needs Attention's flags, in its own order: the urgent ones after the cut-offs, the rest after the cut-offs still ahead. */
const URGENT_FLAG_RANK: Record<TrackingAttentionFlag["kind"], number> = {
  to_confirm: 6,
  eta_passed: 7,
  etd_passed: 7,
  free_time: 8,
  tax_date: 9,
  // Never urgent today; should one become so, it comes last among the urgent ones.
  not_told: 9,
  no_onward: 9,
  no_event: 9,
  not_released: 9,
  delivered_not_billed: 9,
};
const ATTENTION_FLAG_RANK: Record<TrackingAttentionFlag["kind"], number> = {
  not_told: 21,
  no_onward: 22,
  no_event: 23,
  free_time: 24,
  tax_date: 25,
  not_released: 26,
  delivered_not_billed: 27,
  // Always urgent today; should one be only a warning, it comes last.
  to_confirm: 28,
  eta_passed: 28,
  etd_passed: 28,
};

/** "19.11." of a YYYY-MM-DD day. */
const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;

/** The signals of the job's Handled By: nobody, or somebody who is not a user (only when the users are known). */
export function handledBySignals(job: Pick<OpsCockpitJob, "personInCharge">, userEmails: ReadonlySet<string> | null): OpsSignal[] {
  const email = personEmail(job.personInCharge);
  if (!email) return [urgent(RANK.nobody, "details", "Nobody in Handled By")];
  return userEmails && !userEmails.has(email) ? [urgent(RANK.notUser, "details", `Handled By is not a user: ${email}`)] : [];
}

/** The signals of the job's cut-offs: due (or a filing overdue) is urgent, CUTOFF_ATTENTION_DAYS ahead a warning. */
export function cutoffSignals(cutoffs: readonly CutoffDue[]): OpsSignal[] {
  return cutoffs.flatMap((c): OpsSignal[] => {
    const def = CUTOFFS.find((d) => d.key === c.key)!;
    if (c.days < 0) return [urgent(RANK.filing, "details", `${def.name} overdue ${plural(-c.days, "day")}`)];
    if (isCutoffDue(c)) return [urgent(def.keepsOverdue ? RANK.filing : RANK.closing, "details", `${def.due} ${dueWords(c.days)}`)];
    return c.days <= CUTOFF_ATTENTION_DAYS ? [attention(RANK.cutoffAhead, "details", `${def.due} ${dueWords(c.days)}`)] : [];
  });
}

/** Needs Attention's flags as cockpit signals, worded as that list words them. */
export function flagSignals(flags: readonly TrackingAttentionFlag[]): OpsSignal[] {
  return flags.map((f) => {
    const text = `${f.label}${f.detail ? ` · ${f.detail}` : ""}`;
    return f.severity === "urgent" ? urgent(URGENT_FLAG_RANK[f.kind], f.area, text) : attention(ATTENTION_FLAG_RANK[f.kind], f.area, text);
  });
}

// ─── The cockpit ───────────────────────────────────────────────

const NO_FACTS: AttentionFacts = { proposed: [], lastEventDay: null, arrivedAtHub: false, lastNotice: null, clocks: [] };

/** One job judged: what the tiles count and what its row carries. */
interface Judged {
  job: OpsCockpitJob;
  /** Who handles it, "" for nobody. */
  email: string;
  cutoffDue: boolean;
  customsUrgent: boolean;
  flags: TrackingAttentionFlag[];
  /** Its row on a card; null when nothing asks for a look. */
  ranked: RankedRow<OpsCockpitRow> | null;
}

function judge(job: OpsCockpitJob, input: OpsCockpitInput, today: string): Judged {
  const cutoffs = cutoffsOf(job, today);
  const customs = customsUrgency(job, input.now);
  const flags = attentionFlags(job, input.facts.get(job.id) ?? NO_FACTS, today);
  const signals: OpsSignal[] = [
    ...handledBySignals(job, input.userEmails),
    ...(customs ? [urgent(RANK.customs, "customs", `Customs urgent · deadline ${dm(customs.day)} ${customs.time}${customs.passed ? " passed" : ""}`)] : []),
    ...cutoffSignals(cutoffs),
    ...flagSignals(flags),
  ];
  // The row opens where its first tag is worked on: the first urgent signal, else the first of all,
  // by rank - the order rankRow lists the tags in.
  const first = signals.reduce<OpsSignal | null>((best, s) => (!best || Number(s.urgent) > Number(best.urgent) || (s.urgent === best.urgent && s.rank < best.rank) ? s : best), null);
  const row: Omit<OpsCockpitRow, "tags"> = {
    id: job.id,
    jobNumber: job.jobNumber,
    customer: job.customer,
    mode: modeOf(job),
    tradeDirection: job.tradeDirection,
    status: job.status,
    handledBy: job.personInCharge.trim(),
    holidayCover: job.holidayCover.trim(),
    area: first?.area ?? "details",
  };
  return {
    job,
    email: personEmail(job.personInCharge),
    cutoffDue: cutoffs.some(isCutoffDue),
    customsUrgent: customs !== null,
    flags,
    ranked: rankRow<OpsCockpitRow>(row, signals),
  };
}

/** Who is named in Handled By on these jobs, the most active first; nobody after anyone as active. */
function peopleOf(judged: readonly Judged[], userEmails: ReadonlySet<string> | null): OpsCockpitPerson[] {
  const covers = new Map<string, number>();
  for (const j of judged) {
    const cover = personEmail(j.job.holidayCover);
    if (cover) covers.set(cover, (covers.get(cover) ?? 0) + 1);
  }
  const people = new Map<string, OpsCockpitPerson>();
  for (const j of judged) {
    const person = people.get(j.email) ?? { handledBy: j.email, isUser: userEmails ? userEmails.has(j.email) : null, active: 0, urgent: 0, attention: 0, covers: covers.get(j.email) ?? 0 };
    person.active += 1;
    if (j.ranked?.urgent) person.urgent += 1;
    else if (j.ranked) person.attention += 1;
    people.set(j.email, person);
  }
  return [...people.values()].sort((a, b) => b.active - a.active || Number(a.handledBy === "") - Number(b.handledBy === "") || a.handledBy.localeCompare(b.handledBy));
}

export function buildOpsCockpit(input: OpsCockpitInput): ShipmentsManagersCockpit {
  const { now, mode, direction } = input;
  const today = businessDay(now);
  const handledBy = handledByFilter(input.handledBy);

  // The people line is counted before the Handled By filter: it is what the filter is picked from.
  const scoped = input.jobs.filter((job) => inMode(job, mode) && inDirection(job, direction)).map((job) => judge(job, input, today));
  const shown = scoped.filter((j) => isHandledBy(j.job, handledBy));
  const flagged = (...kinds: TrackingAttentionFlag["kind"][]) => shown.filter((j) => j.flags.some((f) => kinds.includes(f.kind))).length;

  const users = input.userEmails;
  const tiles: OpsCockpitTiles = {
    active: shown.length,
    cutoffsDue: shown.filter((j) => j.cutoffDue).length,
    noHandledBy: shown.filter((j) => !j.email).length,
    // Not known is not zero: without the users nobody can be said to be none of them.
    handledByNotUser: users ? shown.filter((j) => !!j.email && !users.has(j.email)).length : null,
    bookingPending: shown.filter((j) => statusHas(j.job.bookingConfirmation, "pending")).length,
    etdEtaMoved: shown.filter((j) => input.movedIds.has(j.job.id)).length,
    freeTime: flagged("free_time"),
    customsUrgent: shown.filter((j) => j.customsUrgent).length,
    // By the list's rule, not by the cards' flags (which wait some working days): the tile opens the list.
    notReleased: shown.filter((j) => isUnbilledArrival(j.job)).length,
    openClaims: shown.filter((j) => j.job.claim === "Yes").length,
  };

  const rows = shown.flatMap((j) => (j.ranked ? [j.ranked] : []));
  const byJobNumber = (a: OpsCockpitRow, b: OpsCockpitRow) => a.jobNumber.localeCompare(b.jobNumber);
  return {
    asOf: now.toISOString(),
    today,
    mode,
    direction,
    handledBy,
    tiles,
    urgent: cockpitCard(rows.filter((r) => r.urgent), COCKPIT_LIST_LIMIT, byJobNumber),
    attention: cockpitCard(rows.filter((r) => !r.urgent), COCKPIT_LIST_LIMIT, byJobNumber),
    people: peopleOf(scoped, users),
    capped: input.capped,
  };
}
