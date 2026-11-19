// Users' absences (Council Outlay 11, D12): who may record one, and what makes one right - the
// days, the cover, no overlap with another of the same user. Pure: the service reads and writes;
// tested in tests/absenceRules.test.ts.

import { addDays, isRealYmd } from "../../../lib/businessDate";

/** The longest absence, in calendar days (both ends included). */
export const MAX_ABSENCE_DAYS = 366;
/** The longest note. */
export const MAX_ABSENCE_NOTE = 500;
/** The list's default: absences that ended within this many days before today, and every later one. */
export const ABSENCE_LIST_PAST_DAYS = 30;
/** The most absences one list answers. */
export const ABSENCE_LIST_LIMIT = 1000;
/** The cover job is also told of the absences that ended within this many days before the day it asks about. */
export const ABSENCE_ENDED_LOOKBACK_DAYS = 14;

/** Who records and changes anybody's absences; anybody else only their own. */
export const MANAGES_ABSENCES: readonly string[] = ["superadmin", "admin", "manager"];

export const ABSENCE_NOT_FOUND = "Absence not found";
export const NOT_YOUR_ABSENCE = "You can only record or change your own absences - a manager can change anybody's";
export const ABSENCE_DAYS_BAD = "From and To must be days, written as YYYY-MM-DD";
export const ABSENCE_ENDS_BEFORE = "An absence cannot end before it starts";
export const ABSENCE_TOO_LONG = `An absence can be at most ${MAX_ABSENCE_DAYS} days long`;
export const COVER_IS_ABSENT = "The cover cannot be the person who is away";
export const COVER_NOT_USER = "The cover must be an active user of the company";
export const ABSENT_NOT_USER = "The person away must be an active user of the company";
export const ABSENCE_NOTE_TOO_LONG = `The note is too long (at most ${MAX_ABSENCE_NOTE} characters)`;

// The same user: ids compared as the database compares uuids (without regard to case).
const sameId = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether the actor may record or change an absence of `absentUserId`: their own, or anybody's as a manager. */
export function mayChangeAbsenceOf(actor: { userID: string; role: string }, absentUserId: string): boolean {
  return MANAGES_ABSENCES.includes(actor.role) || sameId(actor.userID, absentUserId);
}

/** Calendar days from `from` to `to`, both included. */
export const absenceLength = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** Why the days are no absence; null when they are one. */
export function absenceDaysRefusal(from: string, to: string): string | null {
  if (!isRealYmd(from) || !isRealYmd(to)) return ABSENCE_DAYS_BAD;
  if (to < from) return ABSENCE_ENDS_BEFORE;
  if (absenceLength(from, to) > MAX_ABSENCE_DAYS) return ABSENCE_TOO_LONG;
  return null;
}

/** Why the cover can't cover; null when it can (or none is named). `coverIsUser`: a live person of the company. */
export function coverRefusal(absentUserId: string, coverUserId: string | null, coverIsUser: boolean): string | null {
  if (!coverUserId) return null;
  if (sameId(absentUserId, coverUserId)) return COVER_IS_ABSENT;
  return coverIsUser ? null : COVER_NOT_USER;
}

/** An absence as the overlap check reads it. */
export interface AbsenceSpan {
  id: string;
  fromDate: string;
  toDate: string;
}

/** The first of `others` (live absences of the same user) that shares a day with from–to; the absence itself (`selfId`) left out. */
export function overlapOf(others: readonly AbsenceSpan[], from: string, to: string, selfId?: string): AbsenceSpan | null {
  return [...others].sort((a, b) => (a.fromDate < b.fromDate ? -1 : 1)).find((o) => o.id !== selfId && o.fromDate <= to && o.toDate >= from) ?? null;
}

/** "19.11.2026" of a YYYY-MM-DD day. */
export const czDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

/** The refusal of an absence that overlaps another of the same user. */
export const overlapRefusal = (who: string, other: AbsenceSpan) => `${who || "This user"} is already away ${czDay(other.fromDate)}–${czDay(other.toDate)}: change that absence instead`;

/** The list's first day by default: ABSENCE_LIST_PAST_DAYS before today. */
export const listSinceDefault = (today: string) => addDays(today, -ABSENCE_LIST_PAST_DAYS);
