import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { businessDay } from "../../../lib/businessDate";
import type { OpsCockpitDirection, OpsCockpitMode, OpsCockpitReports, ShipmentsManagersCockpit } from "../interfaces/interfaces";
import { COCKPIT_JOB_LIMIT, COCKPIT_READS_AT_ONCE } from "../lib/cockpitThresholds";
import { closingDatesDismissed, jobsWithMissedCutoffOrLateCargo, withoutDismissed } from "../lib/cutoffDismissals";
import {
  COCKPIT_EVENT_KINDS,
  boxesWanted,
  buildOpsCockpit,
  opsDay,
  timelineFactsOf,
  type CockpitBox,
  type OpsCockpitJob,
  type OpsMasterJobRow,
  type OpsSignal,
  type TimelineEvent,
  type TimelineFacts,
} from "../lib/managersCockpit";
import { TIME_LIMITS_OFF } from "../lib/claimTimeLimits";
import { CLAIM_PARTS, claimFactsByJob } from "../lib/managersCockpitClaims";
import { NO_TEAM_FACTS } from "../lib/managersCockpitTeam";
import { readLimiter } from "../lib/readLimiter";
import { CLOCK_EVENT_KINDS } from "../lib/detentionClock";
import { containerRepository } from "../repositories/container.repository";
import { shipmentClaimRepository } from "../repositories/shipmentClaim.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";
import { claimTimeLimitsService } from "./claimTimeLimits.service";
import { companyHolidays } from "./companyHolidays";
import { DISMISSALS_NOT_KNOWN, cutoffDismissalsOf } from "./cutoffDismissal.service";
import { AUDIT_PARTS, managersAuditLine } from "./managersCockpitAudit.service";
import { extraSignals } from "./managersCockpitExtra.service";
import { handoverFacts } from "./managersCockpitHandover.service";
import { cockpitUsers, teamFacts, type CockpitUser } from "./managersCockpitTeam.service";
import { attentionFactsOf } from "./trackingAttention.service";

export interface OpsCockpitFilters {
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  /** An e-mail, "nobody", or null for everyone. */
  handledBy: string | null;
  /** "mine": only the jobs handled by the users who report to `userId`. */
  reports: OpsCockpitReports;
  /** Who asks: "My reports" is counted from them. */
  userId: string;
}

/** Why "My reports" is not answered when the users could not be read: who reports to whom is theirs to say, and an empty page would read as "nobody has anything". */
export const REPORTS_NOT_KNOWN = "Who reports to you could not be read just now: try again in a moment";

/** What the page shows after "Not known right now:" for a part of this file's own that could not be read. */
export const NOT_KNOWN = {
  timeline: "tracking events (Closing, holds, rolled, pick-up, POD)",
  boxes: "containers without free time",
  // Everything services/managersCockpitExtra.service reads, when it fails as a whole.
  extra: "documents, customs, requests, Import Instructions, remeasurements and Master Jobs",
  // Everything services/managersCockpitTeam.service reads, when it fails as a whole (each of its parts is named by itself otherwise).
  team: "to-dos, @mentions, release requests, jobs nobody touched, Holiday Covers and who is away",
} as const;

/** The jobs' tracking events both the boxes' free time clocks and the timeline rules go by: one read for the two. */
const EVENT_KINDS: readonly string[] = [...CLOCK_EVENT_KINDS, ...COCKPIT_EVENT_KINDS];
const isOfKinds = (kinds: readonly string[]) => (event: { kind: string }) => kinds.includes(event.kind);

/** A part that may fail without taking the answer with it: null when it did (D29: it then gives no signal and is named). */
async function part<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    log.warn(err, "a part of Shipments → Managers could not be read", { part: name });
    return null;
  }
}

/** Each shipment's rows. */
function byShipment<R extends { shipmentId: string }>(rows: readonly R[]): Map<string, R[]> {
  const map = new Map<string, R[]>();
  for (const row of rows) {
    const list = map.get(row.shipmentId);
    if (list) list.push(row);
    else map.set(row.shipmentId, [row]);
  }
  return map;
}

/** What the jobs' timelines say (lib/managersCockpit timelineFactsOf), by shipment id; a job with no such event has no entry. */
function timelineOf(events: readonly (TimelineEvent & { shipmentId: string })[]): Map<string, TimelineFacts> {
  return new Map([...byShipment(events.filter(isOfKinds(COCKPIT_EVENT_KINDS)))].map(([id, rows]) => [id, timelineFactsOf(rows)]));
}

/** The containers of the jobs whose free time the cockpit looks at (boxesWanted): few, so their boxes are read whole. */
async function boxesOf(jobs: readonly OpsCockpitJob[], companyId: string, today: string): Promise<Map<string, CockpitBox[]>> {
  const ids = jobs.filter((job) => boxesWanted(job, today)).map((job) => job.id);
  return byShipment<CockpitBox & { shipmentId: string }>(await containerRepository.listByShipmentIds(ids, companyId));
}

/** The e-mails of the users who name `userId` in "Reports to"; null when the users could not be read. */
export const reportEmailsOf = (users: readonly CockpitUser[] | null, userId: string): Set<string> | null =>
  users && new Set(users.filter((u) => u.reportsToUserId === userId).map((u) => u.email));

// Shipments → Managers: the company's active jobs, what Needs Attention knows about them, what
// their timelines and the tables beside them say, the company's users and its holidays, judged
// by the pure rules of lib/managersCockpit on one `now`. It only reads. The jobs and Needs
// Attention's facts are the answer itself: it fails without them. Every part added in step 2 may
// fail on its own - it then gives no signal and the answer names it (`notKnown`, `holidaysKnown`).
//
// Step 3 adds, beside them and each failing on its own in the same way: what the people around
// the jobs left (services/managersCockpitTeam.service, at most five statements), the missed
// cut-offs a manager dismissed (services/cutoffDismissal.service, one statement, and none when no
// job has a missed cut-off or cargo ready only after its Closing), and the audit line
// (services/managersCockpitAudit.service: six statements when it is read, none while a line read
// within the last minutes is kept). The users are read once and with whom each reports to - "My
// reports" is the one thing here that cannot be answered without them, and is refused then.
//
// Step 5 adds the warehouse's and Trucking's own word on the jobs (services/managersCockpitHandover.service):
// one call to each, for every job read whatever the page's filters, each failing on its own, none
// while a company's answer of the last two minutes is kept. They are started first, and not
// through the limiter: they hold no connection of this pool, and the statements run meanwhile;
// each is waited for six seconds at most (HANDOVER_CALL_TIMEOUT_MS).
//
// Step 6 adds the cargo claims (lib/managersCockpitClaims): the open ones of the jobs whose Claim
// field says Yes (one statement, none when no job has a claim), and - only when there is one - the
// company's claim time limits (one more). Each fails on its own and is named.
//
// The page asks every minute and the pool has ten connections (lib/db/pool), so every statement
// of every answer - this file's own and those of the readers it calls, which are handed the
// limiter - goes through one limiter (lib/readLimiter): COCKPIT_READS_AT_ONCE at a time, not all
// thirty. It is this module's, shared by all the answers being built: two managers' pages asking
// at once wait for each other rather than take the whole pool between them.
const cockpitReads = readLimiter(COCKPIT_READS_AT_ONCE);

class ManagersCockpitService {
  async cockpit(companyId: string, filters: OpsCockpitFilters, now = new Date()): Promise<ShipmentsManagersCockpit> {
    const today = businessDay(now);
    const [rows, users, uploaded] = await Promise.all([
      // One more than counted, so "capped" means some were left out. Through the limiter too: it is
      // shared, and another answer's statements may be running.
      cockpitReads(() => shipmentRepository.managersCockpitRows(companyId, COCKPIT_JOB_LIMIT + 1)),
      cockpitUsers(),
      companyHolidays(companyId, today),
    ]);
    if (filters.reports === "mine" && !users) throw APIError.unavailable(REPORTS_NOT_KNOWN);
    const jobs: OpsCockpitJob[] = rows.slice(0, COCKPIT_JOB_LIMIT);
    const ids = jobs.map((j) => j.id);
    const extraHolidays = uploaded ?? [];
    const emailOf = users && new Map(users.map((u) => [u.id, u.email]));
    // The warehouse and Trucking first: their calls hold none of this pool's connections, so they
    // are no statement of the limiter's, and they run while the statements do. Every job read, not
    // only the page's: the answers are kept per company, and the filters applied to them afterwards.
    const handoverRead = handoverFacts(ids, { companyId, now });
    // Every statement goes through the one limiter (the jobs read above too), in the order it is asked for.
    const run = cockpitReads;
    // The events are read once, for the timeline rules and for Needs Attention's free time clocks.
    // The timeline may fail on its own; the clocks are part of the answer itself: when the one read
    // failed they are asked for again, by themselves, and the answer fails only if that fails too.
    const events = part(NOT_KNOWN.timeline, () => run(() => shipmentTrackingEventRepository.ofKinds(ids, companyId, EVENT_KINDS)));
    const clockEvents = events.then((rows) => (rows ? rows.filter(isOfKinds(CLOCK_EVENT_KINDS)) : run(() => shipmentTrackingEventRepository.ofKinds(ids, companyId, CLOCK_EVENT_KINDS))));
    // The job's Claim field is Yes while an open claim stands (repositories/shipmentClaim syncShipmentFlag): only those jobs are asked about.
    const claimed = jobs.filter((j) => j.claim === "Yes").map((j) => j.id);
    const claimRows = part(CLAIM_PARTS.claims, () => (claimed.length ? run(() => shipmentClaimRepository.openCargoClaimsByShipmentIds(companyId, claimed)) : Promise.resolve([])));
    // The limits only matter for a job with an open cargo claim.
    const claimLimits = claimRows.then((rows) => (rows?.length ? part(CLAIM_PARTS.limits, () => run(() => claimTimeLimitsService.of(companyId))) : TIME_LIMITS_OFF));
    const [facts, moved, timeline, boxes, extra, team, dismissed, audit, handover, cargoClaims, limits] = await Promise.all([
      attentionFactsOf(jobs, companyId, today, clockEvents, run),
      run(() => shipmentRepository.dateMovedLately(companyId, ids)),
      events.then((rows) => rows && timelineOf(rows)),
      part(NOT_KNOWN.boxes, () => run(() => boxesOf(jobs, companyId, today))),
      // It answers for its own parts; this catches what it could not: then none of it is known.
      part(NOT_KNOWN.extra, () => extraSignals(jobs, { companyId, now, today, holidays: extraHolidays, run })),
      // The same: each of its parts fails by itself, this catches the rest.
      part(NOT_KNOWN.team, () => teamFacts(jobs, { companyId, now, today, holidays: extraHolidays, users, run })),
      // Only a missed cut-off can have been dismissed: the jobs with one are asked about - and those whose cargo is
      // ready only after their Closing, which a dismissed Closing silences too - and with none nothing is read.
      part(DISMISSALS_NOT_KNOWN, () => run(() => cutoffDismissalsOf(companyId, jobsWithMissedCutoffOrLateCargo(jobs, opsDay(now, extraHolidays))))),
      // The company's, whatever the page is narrowed to. It names what it could not read itself.
      managersAuditLine(companyId, now, emailOf, run).catch((err) => {
        log.warn(err, "a part of Shipments → Managers could not be read", { part: AUDIT_PARTS.all });
        return { audit: null, notKnown: [AUDIT_PARTS.all] };
      }),
      handoverRead,
      claimRows,
      claimLimits,
    ]);
    const extraByJob: ReadonlyMap<string, readonly OpsSignal[]> = extra?.byJob ?? new Map();
    const masterJobRows: readonly OpsMasterJobRow[] = extra?.masterJobRows ?? [];
    return buildOpsCockpit({
      jobs,
      facts,
      timeline,
      boxes,
      movedIds: new Set(moved),
      userEmails: users && new Set(users.map((u) => u.email)),
      holidays: extraHolidays,
      holidaysKnown: uploaded !== null,
      extraByJob,
      masterJobRows,
      team: team ?? NO_TEAM_FACTS,
      // A dismissed cut-off gives no tag while its date stands (lib/cutoffDismissals). When the
      // dismissals could not be read nothing is treated as dismissed: a tag too many, never one too few.
      cutoffsKept: (jobId, cutoffs) => withoutDismissed(cutoffs, dismissed?.get(jobId)),
      closingsDismissed: (jobId) => closingDatesDismissed(dismissed?.get(jobId)),
      audit: audit.audit,
      handover,
      claims: { byJob: cargoClaims && claimFactsByJob(cargoClaims), limits },
      notKnown: [
        ...(timeline ? [] : [NOT_KNOWN.timeline]),
        ...(boxes ? [] : [NOT_KNOWN.boxes]),
        ...(extra ? extra.notKnown : [NOT_KNOWN.extra]),
        ...(team ? team.notKnown : [NOT_KNOWN.team]),
        ...(dismissed ? [] : [DISMISSALS_NOT_KNOWN]),
        ...audit.notKnown,
        ...handover.notKnown,
        ...(cargoClaims ? [] : [CLAIM_PARTS.claims]),
        ...(limits ? [] : [CLAIM_PARTS.limits]),
      ],
      capped: rows.length > COCKPIT_JOB_LIMIT,
      mode: filters.mode,
      direction: filters.direction,
      handledBy: filters.handledBy,
      reports: filters.reports,
      // Whoever names the caller in "Reports to". Read only for "mine", which is refused above without the users.
      reportEmails: reportEmailsOf(users, filters.userId),
      now,
    });
  }
}

export const managersCockpitService = new ManagersCockpitService();
