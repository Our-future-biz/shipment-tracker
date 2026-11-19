import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { businessInstant } from "../../../lib/businessDate";
import { companyUsersWithReportsTo } from "../../../lib/companyUsers";
import { ABSENCE_COVER_FIELD } from "../lib/absenceCover";
import { CUTOFF_DISMISSED_FIELD } from "../lib/cutoffDismissals";
import { teamFactsOf, touchCandidates, touchReadFrom, type AbsenceFact, type MentionFact, type ReleaseRequestFact, type TeamFacts, type TeamJob, type TodoFact } from "../lib/managersCockpitTeam";
import { NUDGE_FIELD } from "../lib/nudge";
import { unlimited, type Limit } from "../lib/readLimiter";
import { ANSWERED_LINE_STARTS, APPROVAL_WITHDRAWN_LINE_STARTS, RELEASE_REQUEST_FIELD } from "../lib/releaseRequest";
import { personEmail } from "../lib/shipmentEditRule";
import { shipmentAuditRepository, type NotATouch } from "../repositories/shipmentAudit.repository";
import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";
import { shipmentNoteRepository } from "../repositories/shipmentNote.repository";
import { shipmentReleaseRequestRepository } from "../repositories/shipmentReleaseRequest.repository";

export type { TeamFacts, TeamJob } from "../lib/managersCockpitTeam";

// Shipments → Managers, step 3: what the cockpit's jobs are told by the people around them - the
// to-dos past their day, the @mentions their Handled By or Holiday Cover has not read, the
// requests to release them that wait for a manager, when each was last touched, and since when a
// Holiday Cover stands. Each read for all the jobs together and judged by the pure rules of
// lib/managersCockpitTeam. It only reads.
//
// Five parts, each read on its own - five statements at most, each through the limiter of the
// answer they are part of (lib/readLimiter); one is not sent when it has
// nothing to ask about (no job with a cover, no job old enough to be untouched, no users). A part
// that fails gives no signal and no figure, and is named in `notKnown` in the words the page
// shows after "Not known right now:" (D29: not known is not zero).
//
// Step 6 adds a sixth part: who is away (auth's absences ending today or later, one call per
// answer, beside the users; it holds no connection of this pool, so it does not go through the
// limiter). Not read: no `away` tag, nobody's `awayUntil` known, and "who is away" named.

/**
 * What a manager does to a job from Shipments → Managers is no touch of it (A15, "Not touched"):
 * the job's own people did nothing. Their nudge - its history line, and the to-do and chat line
 * written with it in one write turn (repositories/shipmentNudge) - a missed cut-off dismissed or
 * taken back, their answer to a release request and their withdrawal of an approval they gave. The
 * request asked is the job's people at work, and so is its asker withdrawing it while it waits; a
 * request closed by a release comes with the release's own line: all of these still count.
 * Nor is what the absence-cover job writes (m16): it sets a Holiday Cover while somebody is away
 * and clears it when they are back - its own line and the Holiday Cover change of the same save
 * (services/absenceCover.service), or a job nobody touched would read as touched on both days.
 */
export const NOT_A_TOUCH: NotATouch = {
  fields: [NUDGE_FIELD, CUTOFF_DISMISSED_FIELD, ABSENCE_COVER_FIELD],
  lines: { field: RELEASE_REQUEST_FIELD, startsWith: [...ANSWERED_LINE_STARTS, ...APPROVAL_WITHDRAWN_LINE_STARTS] },
  writtenWith: NUDGE_FIELD,
  savedWith: [ABSENCE_COVER_FIELD],
};

/** A user of the company as the cockpit reads one: who they are and whom they report to. */
export interface CockpitUser {
  id: string;
  /** Trimmed, lower case. */
  email: string;
  /** The manager they report to (Settings → Users); null for nobody. */
  reportsToUserId: string | null;
}

/**
 * The company's users, read once per cockpit answer: who is a user, whom a chat line tagged, who
 * did what on the audit line, and who reports to the caller. Null when they could not be read -
 * and when the answer is empty: a company always has the user asking, so "no users" is "not known".
 */
export async function cockpitUsers(): Promise<CockpitUser[] | null> {
  try {
    const users = await companyUsersWithReportsTo();
    return users.length > 0 ? users.map((u) => ({ id: u.id, email: u.email.trim().toLowerCase(), reportsToUserId: u.reportsToUserId })) : null;
  } catch (err) {
    log.warn(err, "the users of Shipments → Managers could not be read");
    return null;
  }
}

export interface TeamContext {
  companyId: string;
  /** The one moment the whole cockpit is judged on… */
  now: Date;
  /** …and its Prague business day, YYYY-MM-DD. */
  today: string;
  /** The company's non-working days beyond the statutory ones (lib/workingDays' extraHolidays). */
  holidays: readonly string[];
  /** The company's users; null when they could not be read - then nobody can say whom a chat line tagged. */
  users: readonly CockpitUser[] | null;
  /** The limiter of the answer these reads are part of (lib/readLimiter): each statement goes through it. Left out, they all run at once. */
  run?: Limit;
}

/** The read of one part: null when it failed, which lib/managersCockpitTeam names in `notKnown`. */
async function part<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    log.warn(err, "a part of Shipments → Managers could not be read", { part: name });
    return null;
  }
}

/** Each shipment's rows, in the order they were read. */
function byShipment<R extends { shipmentId: string }, V>(rows: readonly R[], value: (row: R) => V): Map<string, V[]> {
  const map = new Map<string, V[]>();
  for (const row of rows) {
    const list = map.get(row.shipmentId);
    if (list) list.push(value(row));
    else map.set(row.shipmentId, [value(row)]);
  }
  return map;
}

/** The company's absences ending `today` or later, as the Team rules read them (auth: every user of the company may read them). */
export async function companyAbsences(today: string): Promise<AbsenceFact[]> {
  const { absences } = await auth.absencesList({ since: today });
  return absences.map((a) => ({ email: a.userEmail.trim().toLowerCase(), fromDate: a.fromDate, toDate: a.toDate, hasCover: !!a.coverEmail }));
}

export async function teamFacts(jobs: readonly TeamJob[], ctx: TeamContext): Promise<TeamFacts> {
  const { companyId, now, today, holidays, users, run = unlimited } = ctx;
  const ids = jobs.map((j) => j.id);
  const emailOf = users && new Map(users.map((u) => [u.id, u.email]));

  // Only the two who answer for a job are asked about its @mentions: the users behind the e-mails
  // in Handled By and Holiday Cover. Without the users nobody knows who they are: not read at all.
  const named = new Set(jobs.flatMap((j) => [personEmail(j.personInCharge), personEmail(j.holidayCover)]));
  const answering = users?.filter((u) => named.has(u.email)).map((u) => u.id) ?? null;
  // A touch older than the longest window says the same as none: the read starts at that day's first minute.
  const touchedSince = businessInstant(touchReadFrom(today, holidays), "00:00");
  const covered = jobs.filter((j) => personEmail(j.holidayCover)).map((j) => j.id);

  const [absences, todos, mentions, touched, coverChanged, releaseRequests] = await Promise.all([
    part("who is away", () => companyAbsences(today)),
    part("to-dos", async () => byShipment(await run(() => shipmentNoteRepository.lateByShipmentIds(ids, companyId, today)), (r): TodoFact => ({ text: r.text, dueDate: r.dueDate }))),
    answering === null
      ? null
      : part("@mentions", async () => byShipment(await run(() => shipmentCommentRepository.unreadMentionsByShipmentIds(ids, companyId, answering)), (r): MentionFact => ({ userId: r.userId, at: r.createdAt }))),
    part("last touches", () => run(() => shipmentAuditRepository.lastTouchedSince(companyId, touchCandidates(jobs, today, holidays), touchedSince, NOT_A_TOUCH))),
    // The newest change of Holiday Cover on the jobs that have one: it is what set the cover that stands.
    part("covers", async () => new Map((await run(() => shipmentAuditRepository.latestByShipmentIds(companyId, [{ fields: ["holidayCover"], shipmentIds: covered }]))).map((r) => [r.shipmentId, r.changedAt]))),
    part("release requests", async () => byShipment(await run(() => shipmentReleaseRequestRepository.waitingByShipmentIds(ids, companyId)), (r): ReleaseRequestFact => ({ requestedAt: r.requestedAt }))),
  ]);

  return teamFactsOf(jobs, { todos, mentions, touched, coverChanged, releaseRequests, emailOf, absences }, { now, today, holidays });
}
