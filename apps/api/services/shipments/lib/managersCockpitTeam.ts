import { addDays, businessDay, businessTime } from "../../../lib/businessDate";
import { officeMinutesBetween } from "../../../lib/officeHours";
import {
  HIGH_LOAD_FACTOR,
  HIGH_LOAD_MIN_PEOPLE,
  MENTION_UNREAD_OFFICE_HOURS,
  MENTION_UNREAD_URGENT_OFFICE_HOURS,
  NOT_TOUCHED_WORKING_DAYS,
  REQUEST_WAITING_WORKING_DAYS,
  TODO_LATE_URGENT_WORKING_DAYS,
  TODO_TAG_CHARS,
} from "./cockpitThresholds";
import type { OpsCockpitJob, OpsSignal } from "./managersCockpit";
import { waitedWorkingDays } from "./managersCockpitExtra";
import { personEmail } from "./shipmentEditRule";
import { workingDaysSince } from "./trackingAttention";
import { freightKindOf } from "./trackingEvents";

// The operations managers' cockpit (Shipments → Managers, Council Outlay 11, step 3): what a job
// is told by the people around it - a to-do past its day, an @mention its Handled By has not
// read, a request to release it waiting for a manager, and nothing at all for days - and the
// facts the Team tab reads of a person. Pure: each rule takes plain facts, the Prague day
// `today`, the moment `now` and the company's extra holidays;
// services/managersCockpitTeam.service reads the facts. Tested in tests/managersCockpitTeam.test.ts.
//
// A rule that cannot know says nothing: a part that was not read is passed as null and gives no
// signal and no figure - the answer names it in `notKnown` (D29: not known is not zero).

// Every number these rules read is in lib/cockpitThresholds.ts, with the cockpit's others (D8).

// ─── What is read ───────────────────────────────────────────────

/** An active job as these rules read it: columns of the cockpit's row, under the row's own names. */
export type TeamJob = Pick<OpsCockpitJob, "id" | "tradeDirection" | "freightMode" | "department" | "personInCharge" | "holidayCover" | "createdAt" | "updatedAt">;

/** An open to-do of a job (Notes To-Do) with a day it has to be done by. */
export interface TodoFact {
  /** Its title. */
  text: string;
  /** YYYY-MM-DD. */
  dueDate: string;
}

/** A chat line that tags a user who has not opened the job's chat since. */
export interface MentionFact {
  /** Who was tagged. */
  userId: string;
  /** When the line was written. */
  at: Date;
}

/** A request to release a job the prepayment stop holds (D16), still waiting for a manager's answer. */
export interface ReleaseRequestFact {
  requestedAt: Date;
}

/** The signal families of this file: the `kind` a tag is filtered by on the cockpit's tiles. "request" is the family of the other requests waiting for a manager (lib/managersCockpitExtra). */
export type TeamKind = "todo" | "mention" | "not_touched" | "request";
/** A cockpit signal that names its family. */
export type TeamSignal = OpsSignal & { kind: TeamKind };

// ─── Ranks ──────────────────────────────────────────────────────
// On lib/managersCockpit OPS_RANK's own scale (lower = higher in its card). URGENT: after every
// clock and state of the job itself (Needs Attention's last urgent flag is 95) and before a job
// that only lacks somebody to handle it (100) - a colleague waiting for an answer first, a to-do
// after it. ATTENTION: after the other tables' last signal (a status that stands still, 400): what
// people left undone, and last a job nobody touched - it says the least. A release request
// waiting for a manager sits with the other requests that do (lib/managersCockpitExtra
// EXTRA_RANK.request, on this scale 60).
export const TEAM_RANK = {
  releaseRequest: 60,
  mentionUrgent: 96,
  todoUrgent: 97,
  todoLate: 410,
  mentionUnread: 420,
  notTouched: 430,
} as const;

const signal = (urgent: boolean, rank: number, kind: TeamKind, area: OpsSignal["area"], text: string): TeamSignal => ({ rank, text, urgent, area, kind });

// ─── Days and words ─────────────────────────────────────────────

const DAY = 86_400_000;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Calendar days from `from` to `to` (YYYY-MM-DD), negative when `to` is earlier. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
/** "19.11." of a YYYY-MM-DD day. */
const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
/** "19.11. 14:05" (Prague) of a moment. */
const stamp = (at: Date) => `${dm(businessDay(at))} ${businessTime(at)}`;

// ─── A16: a to-do past its day ──────────────────────────────────────

/** A to-do's title as its tag quotes it: one line, cut at TODO_TAG_CHARS. */
const quoted = (text: string) => {
  const line = text.trim().replace(/\s+/g, " ");
  return line.length > TODO_TAG_CHARS ? `${line.slice(0, TODO_TAG_CHARS).trimEnd()}…` : line;
};

/** The to-dos whose day has passed, the longest overdue first. */
export const lateTodos = (todos: readonly TodoFact[], today: string): TodoFact[] =>
  todos.filter((t) => t.dueDate < today).sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.text.localeCompare(b.text)));

/**
 * A job's open to-dos past their day: ATTENTION from the day after, URGENT once the longest
 * overdue is TODO_LATE_URGENT_WORKING_DAYS working days late. One tag for the job - it quotes the
 * to-do that is late the longest and counts the others - so a job with ten forgotten to-dos is
 * one row with one tag, not ten.
 */
export function todoSignals(todos: readonly TodoFact[], today: string, holidays: readonly string[]): TeamSignal[] {
  const late = lateTodos(todos, today);
  const first = late[0];
  if (!first) return [];
  const more = late.length > 1 ? ` · and ${late.length - 1} more` : "";
  const text = `To-do ${plural(daysBetween(first.dueDate, today), "day")} late: "${quoted(first.text)}"${more}`;
  const urgent = workingDaysSince(first.dueDate, today, holidays) >= TODO_LATE_URGENT_WORKING_DAYS;
  return [signal(urgent, urgent ? TEAM_RANK.todoUrgent : TEAM_RANK.todoLate, "todo", "details", text)];
}

// ─── A17: an @mention not read ──────────────────────────────────────

/** The people of a job an unread @mention is asked of: its Handled By and its Holiday Cover, by e-mail, each once. */
const peopleOfJob = (job: Pick<TeamJob, "personInCharge" | "holidayCover">): string[] => [...new Set([personEmail(job.personInCharge), personEmail(job.holidayCover)].filter(Boolean))];

/** What one person has not read on one job. */
export interface UnreadOf {
  /** Who was tagged: the job's Handled By or Holiday Cover, by e-mail. */
  email: string;
  /** When the oldest of the lines that have waited long enough was written. */
  since: Date;
  /** How many of their unread @mentions on the job have waited MENTION_UNREAD_OFFICE_HOURS or longer. */
  waiting: number;
  /** The oldest has waited MENTION_UNREAD_URGENT_OFFICE_HOURS or longer. */
  urgent: boolean;
}

/**
 * The unread @mentions of a job that count: those tagging its Handled By or its Holiday Cover -
 * the two who answer for it; a colleague tagged in passing is theirs to read, not the manager's
 * worry - that have waited MENTION_UNREAD_OFFICE_HOURS office hours or longer. An evening's
 * mention is not late at 8 the next morning: the wait is counted on the office's clock.
 * `emailOf`: the company's users, id to e-mail (trimmed, lower case).
 */
export function unreadMentionsOf(
  job: Pick<TeamJob, "personInCharge" | "holidayCover">,
  mentions: readonly MentionFact[],
  emailOf: ReadonlyMap<string, string>,
  now: Date,
  holidays: readonly string[],
): UnreadOf[] {
  return peopleOfJob(job).flatMap((email): UnreadOf[] => {
    const waited = mentions
      .filter((m) => emailOf.get(m.userId) === email)
      .map((m) => ({ at: m.at, minutes: officeMinutesBetween(m.at, now, holidays) }))
      .filter((m) => m.minutes >= MENTION_UNREAD_OFFICE_HOURS * 60)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    const oldest = waited[0];
    return oldest ? [{ email, since: oldest.at, waiting: waited.length, urgent: oldest.minutes >= MENTION_UNREAD_URGENT_OFFICE_HOURS * 60 }] : [];
  });
}

/** One tag per person who has not read: ATTENTION after 4 office hours, URGENT after 9 - a whole office day. */
export function mentionSignals(unread: readonly UnreadOf[]): TeamSignal[] {
  return unread.map((u) => signal(u.urgent, u.urgent ? TEAM_RANK.mentionUrgent : TEAM_RANK.mentionUnread, "mention", "details", `@mention unread since ${stamp(u.since)} (${u.email})`));
}

// ─── U17: a release request waiting for a manager ─────────────────────────

/**
 * A request to release a job on prepayment - its House BoL, or its cargo from the warehouse -
 * waiting for a manager: URGENT once it has waited longer than a working day, as the other
 * requests are (lib/managersCockpitExtra requestSignals, whose clock and wording these are). A
 * younger one gives no tag: it is on the Approvals tab, where it is answered. One tag for the
 * job, aged by its oldest.
 */
export function releaseRequestSignals(requests: readonly ReleaseRequestFact[], now: Date, holidays: readonly string[]): TeamSignal[] {
  const first = requests.reduce<Date | null>((oldest, r) => (oldest === null || r.requestedAt.getTime() < oldest.getTime() ? r.requestedAt : oldest), null);
  if (!first || !waitedWorkingDays(first, REQUEST_WAITING_WORKING_DAYS, now, holidays)) return [];
  const words = requests.length === 1 ? `Release request waiting for approval since ${stamp(first)}` : `${requests.length} release requests waiting for approval, the oldest since ${stamp(first)}`;
  return [signal(true, TEAM_RANK.releaseRequest, "request", "finance", words)];
}

// ─── A15: a job nobody touched ──────────────────────────────────────

/**
 * The first day a touch still counts on: the earliest day fewer than `workingDays` working days
 * before `today`. A job last touched before it has gone that many working days with nothing.
 * On Wednesday 18 Nov 2026 (Tuesday a public holiday) and 5 working days it is Wednesday the
 * 11th: a job last touched on Tuesday the 10th has had five working days of silence.
 */
export function touchedFrom(today: string, workingDays: number, holidays: readonly string[]): string {
  let day = today;
  while (workingDaysSince(addDays(day, -1), today, holidays) < workingDays) day = addDays(day, -1);
  return day;
}

/** The first day the read of the jobs' last touches has to reach back to: the longest of the modes' windows. */
export const touchReadFrom = (today: string, holidays: readonly string[]): string => touchedFrom(today, Math.max(...Object.values(NOT_TOUCHED_WORKING_DAYS)), holidays);

/**
 * The jobs old enough to be untouched: created before their mode's window. Only their last
 * touches need reading - a younger job is new, whatever was or was not done on it.
 */
export function touchCandidates(jobs: readonly TeamJob[], today: string, holidays: readonly string[]): string[] {
  const from = new Map<number, string>();
  const fromOf = (workingDays: number) => from.get(workingDays) ?? from.set(workingDays, touchedFrom(today, workingDays, holidays)).get(workingDays)!;
  return jobs.filter((job) => businessDay(job.createdAt) < fromOf(NOT_TOUCHED_WORKING_DAYS[freightKindOf(job)])).map((job) => job.id);
}

/**
 * A job with no change, chat line, to-do, task tick or tracking event for
 * NOT_TOUCHED_WORKING_DAYS working days (a flight's job fewer), and created before that - a job
 * of this week is not forgotten, it is new.
 *
 * `lastTouch`: the newest touch found from touchReadFrom on; null for none. The read does not
 * look further back - whether ANY touch is recent is all the rule asks, and the whole history of
 * every quiet job is too much to read on a page that asks every minute. So the tag's day is the
 * touch found when there is one (a flight's job, touched within the longer window); otherwise the
 * day the job's own row was last written, or the last day before the window when that says
 * nothing older. A chat line or a to-do between those two is not looked for: the job is
 * untouched all the same, its day in the tag may be earlier than the last word on it.
 */
export function notTouchedSignal(job: TeamJob, lastTouch: Date | null, today: string, holidays: readonly string[]): TeamSignal | null {
  const from = touchedFrom(today, NOT_TOUCHED_WORKING_DAYS[freightKindOf(job)], holidays);
  const created = businessDay(job.createdAt);
  const touched = lastTouch ? businessDay(lastTouch) : null;
  if (created >= from || (touched !== null && touched >= from)) return null;
  const rowWritten = businessDay(job.updatedAt);
  const before = addDays(from, -1);
  const since = touched ?? [created > rowWritten ? created : rowWritten, before].sort()[0]!;
  return signal(false, TEAM_RANK.notTouched, "not_touched", "details", `Not touched since ${dm(since)}`);
}

// ─── Team: since when a Holiday Cover stands ─────────────────────────────

/**
 * The day a job's Holiday Cover was set: its newest change in the job's history - or, with none,
 * the day the job was created, for a cover nobody changed was there from the start. Null for a
 * job with no Holiday Cover.
 */
export function coverSinceOf(job: Pick<TeamJob, "holidayCover" | "createdAt">, changedAt: Date | null): string | null {
  if (!personEmail(job.holidayCover)) return null;
  return businessDay(changedAt ?? job.createdAt);
}

// ─── Team: a load that stands out ───────────────────────────────────

/**
 * The number of active jobs above which a person carries a high load: HIGH_LOAD_FACTOR times the
 * median of the people with at least one active job. Null with fewer than HIGH_LOAD_MIN_PEOPLE
 * such people: among two, one is always "above the other". `active`: each person's active jobs.
 */
export function highLoadAbove(active: readonly number[]): number | null {
  const loads = active.filter((n) => n > 0).sort((a, b) => a - b);
  if (loads.length < HIGH_LOAD_MIN_PEOPLE) return null;
  const mid = Math.floor(loads.length / 2);
  const median = loads.length % 2 ? loads[mid]! : (loads[mid - 1]! + loads[mid]!) / 2;
  return median * HIGH_LOAD_FACTOR;
}

// ─── What the cockpit is handed ───────────────────────────────────

/** What these rules say of one job. */
export interface TeamJobFacts {
  /** Its late to-do, its unread @mentions and its release request waiting for a manager. */
  signals: OpsSignal[];
  /** "Not touched since …": the cockpit keeps it for a job with nothing URGENT on it. */
  notTouched: OpsSignal | null;
  /** Its open to-dos past their day. */
  todosLate: number;
  /** The unread @mentions that have waited long enough, by the e-mail of who was tagged (its Handled By, its Holiday Cover). */
  mentionsUnread: ReadonlyMap<string, number>;
  /** The day its Holiday Cover was set; null for none, or when that is not known. */
  coverSince: string | null;
}

/** The parts, as the page names one that could not be read. */
export const TEAM_PARTS = {
  todos: "to-dos past their day",
  mentions: "@mentions not read",
  touched: "jobs nobody touched",
  coverSince: "since when a Holiday Cover stands",
  releaseRequests: "release requests",
} as const;

/** What services/managersCockpitTeam.service answers. */
export interface TeamFacts {
  /** By job id; a job these rules say nothing of has no entry. */
  byJob: Map<string, TeamJobFacts>;
  /** Which of the parts the people line has a figure of were read: a figure of one that was not is null there, never 0. */
  known: { todos: boolean; mentions: boolean; touched: boolean; coverSince: boolean };
  /** The parts that were not, in TEAM_PARTS' words. */
  notKnown: string[];
}

/** Nothing read, nothing said: what the cockpit is handed when the whole of this file's reads failed. */
export const NO_TEAM_FACTS: TeamFacts = { byJob: new Map(), known: { todos: false, mentions: false, touched: false, coverSince: false }, notKnown: Object.values(TEAM_PARTS) };

/** What was read for the jobs; a part that could not be read is null. */
export interface TeamReads {
  /** The open to-dos past their day, by job id. */
  todos: ReadonlyMap<string, readonly TodoFact[]> | null;
  /** The @mentions the tagged user has not read, by job id. */
  mentions: ReadonlyMap<string, readonly MentionFact[]> | null;
  /** The newest touch of a job from touchReadFrom on, by job id; a job with none has no entry. */
  touched: ReadonlyMap<string, Date> | null;
  /** When a job's Holiday Cover last changed, by job id; a job whose cover never changed has no entry. */
  coverChanged: ReadonlyMap<string, Date> | null;
  /** The release requests still waiting for a manager, by job id. */
  releaseRequests: ReadonlyMap<string, readonly ReleaseRequestFact[]> | null;
  /** The company's users, id to e-mail (trimmed, lower case); null when they could not be read - then nobody can say whom a mention tagged. */
  emailOf: ReadonlyMap<string, string> | null;
}

/** The jobs judged by this file's rules on one `now`: their signals and the figures the people line adds up. */
export function teamFactsOf(jobs: readonly TeamJob[], reads: TeamReads, ctx: { now: Date; today: string; holidays: readonly string[] }): TeamFacts {
  const { now, today, holidays } = ctx;
  const mentionsKnown = reads.mentions !== null && reads.emailOf !== null;
  const byJob = new Map<string, TeamJobFacts>();
  for (const job of jobs) {
    const todos = reads.todos?.get(job.id) ?? [];
    const unread = mentionsKnown ? unreadMentionsOf(job, reads.mentions!.get(job.id) ?? [], reads.emailOf!, now, holidays) : [];
    const facts: TeamJobFacts = {
      signals: [...releaseRequestSignals(reads.releaseRequests?.get(job.id) ?? [], now, holidays), ...todoSignals(todos, today, holidays), ...mentionSignals(unread)],
      notTouched: reads.touched ? notTouchedSignal(job, reads.touched.get(job.id) ?? null, today, holidays) : null,
      todosLate: lateTodos(todos, today).length,
      mentionsUnread: new Map(unread.map((u) => [u.email, u.waiting])),
      coverSince: reads.coverChanged ? coverSinceOf(job, reads.coverChanged.get(job.id) ?? null) : null,
    };
    if (facts.signals.length || facts.notTouched || facts.coverSince) byJob.set(job.id, facts);
  }
  const known = { todos: reads.todos !== null, mentions: mentionsKnown, touched: reads.touched !== null, coverSince: reads.coverChanged !== null };
  const read = { ...known, releaseRequests: reads.releaseRequests !== null };
  return { byJob, known, notKnown: (Object.keys(TEAM_PARTS) as (keyof typeof TEAM_PARTS)[]).filter((part) => !read[part]).map((part) => TEAM_PARTS[part]) };
}
