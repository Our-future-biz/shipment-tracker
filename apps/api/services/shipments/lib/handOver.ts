// Handing many jobs over at once (Council Outlay 11, D11): a manager gives the jobs of somebody who is ill, on
// holiday or gone a new Handled By, a Holiday Cover, or both. Each job is changed exactly as an edit of the two
// fields on the job itself changes it (the shipment service's update: its checks, its history, the bell of
// whoever now covers it) - a hand-over only adds one line saying it was one, and why. Pure: what changes on a
// job, and that line; the service does the writes.

import { personEmail } from "./shipmentEditRule";

/** The most jobs one hand-over takes. */
export const HAND_OVER_MAX_JOBS = 200;
/** The most ids a request may carry before they are looked at at all (the same job named many times included). */
export const HAND_OVER_MAX_IDS_SENT = 1000;
export const MIN_HAND_OVER_REASON = 3;
export const MAX_HAND_OVER_REASON = 500;

/** The job's history field of a hand-over (Shipments → Managers' audit line reads it by this name). */
export const HAND_OVER_FIELD = "handOver";

/** Whom the jobs go to: e-mails as stored. `handledBy` null leaves Handled By; `holidayCover` null leaves the cover, "" clears it. */
export interface HandOverTarget {
  handledBy: string | null;
  holidayCover: string | null;
}

/** What a hand-over writes on one job. */
export interface HandOverChange {
  personInCharge?: string;
  holidayCover?: string;
}

/**
 * What the hand-over changes on this job; null when it is already so. A person is compared by
 * e-mail (lib/shipmentEditRule personEmail), so an old value with a name after it counts as that
 * person and is not rewritten.
 */
export function handOverChange(job: { personInCharge: string; holidayCover: string }, target: HandOverTarget): HandOverChange | null {
  const change: HandOverChange = {};
  if (target.handledBy !== null && personEmail(job.personInCharge) !== target.handledBy) change.personInCharge = target.handledBy;
  if (target.holidayCover !== null && personEmail(job.holidayCover) !== target.holidayCover) change.holidayCover = target.holidayCover;
  return Object.keys(change).length ? change : null;
}

/**
 * The hand-over's target as the list of jobs to hand over takes it (n25), read as a hand-over reads its
 * request: a Handled By left out or "" leaves it, a Holiday Cover left out leaves it and "" clears it. Null
 * when it names neither. Not checked against the users: the list only narrows, the hand-over checks.
 */
export function listTarget(to: { handledBy?: string; holidayCover?: string } | undefined): HandOverTarget | null {
  const handledBy = personEmail(to?.handledBy) || null;
  const holidayCover = to?.holidayCover === undefined ? null : personEmail(to.holidayCover);
  return handledBy === null && holidayCover === null ? null : { handledBy, holidayCover };
}

const who = (value: string) => value.trim() || "nobody";

/**
 * The hand-over's line in the job's history: "<from> → <to>: <reason>" for Handled By; a Holiday
 * Cover that changes is named ("Holiday Cover nobody → eva@firma.cz"), after it when both do.
 */
export function handOverLine(job: { personInCharge: string; holidayCover: string }, change: HandOverChange, reason: string): string {
  const parts: string[] = [];
  if (change.personInCharge !== undefined) parts.push(`${who(job.personInCharge)} → ${who(change.personInCharge)}`);
  if (change.holidayCover !== undefined) parts.push(`Holiday Cover ${who(job.holidayCover)} → ${who(change.holidayCover)}`);
  return `${parts.join("; ")}: ${reason}`;
}

/**
 * Whether the job, as its write turn finds it (`current`), still holds what the hand-over was
 * decided on (`job`, read before) in each field the change writes. Otherwise somebody changed it
 * meanwhile - by hand, or another hand-over - and the change and its line, made of the old read,
 * could name a wrong "from", or one that was already so: nothing is written.
 */
export function stillAsDecided(
  current: { personInCharge: string; holidayCover: string },
  job: { personInCharge: string; holidayCover: string },
  change: HandOverChange,
): boolean {
  return (Object.keys(change) as (keyof HandOverChange)[]).every((field) => current[field].trim() === job[field].trim());
}

export const ALREADY_SO = "Already so: nothing to change";
export const CHANGED_MEANWHILE = "Changed by somebody else meanwhile: left as they made it";
export const JOB_NOT_FOUND = "Job not found";
