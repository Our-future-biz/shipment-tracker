import type { controllers, interfaces } from "@/lib/api/client";

// Users' absences (Council Outlay 11, D12) as the web shows and asks for them: Settings → Users (a
// manager or an admin for anybody of the company) and the user menu's "Away…" (everybody for
// themself). The server decides (apps/api services/auth lib/absenceRules): what is checked here is
// only what keeps an obviously wrong absence from being sent - the overlap with another absence,
// who may change whose, and whether the cover is still a user are the server's, and its refusals
// are shown as they come. Days are Prague days, YYYY-MM-DD, both ends included.

export type UserAbsence = interfaces.UserAbsenceItem;

/** The longest absence and note the server keeps (MAX_ABSENCE_DAYS, MAX_ABSENCE_NOTE). */
export const MAX_ABSENCE_DAYS = 366;
export const MAX_ABSENCE_NOTE = 500;

const isDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day);

/** "24.11.2026" of a YYYY-MM-DD day; "" for anything else. */
export const czDay = (day: string | null | undefined): string => (day && isDay(day) ? `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}` : "");

/** An absence's days: "24.11.2026–28.11.2026", or the one day it is. */
export const absenceDays = (a: Pick<UserAbsence, "fromDate" | "toDate">): string =>
  a.fromDate === a.toDate ? czDay(a.fromDate) : `${czDay(a.fromDate)}–${czDay(a.toDate)}`;

/** Who covers, in words: the cover's name (or e-mail), or "no cover". */
export const coverText = (a: Pick<UserAbsence, "coverName" | "coverEmail">): string => a.coverName?.trim() || a.coverEmail?.trim() || "no cover";

const sameId = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether the absence takes in `today`. */
export const isAwayOn = (a: Pick<UserAbsence, "fromDate" | "toDate">, today: string): boolean => a.fromDate <= today && a.toDate >= today;

/** The absences not yet over on `today` (the one in force and the coming ones), the earliest first. */
export function comingAbsences<A extends Pick<UserAbsence, "fromDate" | "toDate">>(list: readonly A[], today: string): A[] {
  return list.filter((a) => a.toDate >= today).sort((a, b) => (a.fromDate < b.fromDate ? -1 : a.fromDate > b.fromDate ? 1 : 0));
}

/** What Settings → Users says of one user: the absence they are on today, else the next one. */
export interface AwaySummary {
  /** Away today (amber), or an absence to come (grey). */
  now: boolean;
  /** "Away until 28.11.2026" · "Away 24.11.2026–28.11.2026". */
  text: string;
  /** "cover: Jana Nováková" · "no cover". */
  cover: string;
  absence: UserAbsence;
}

/** A user's current absence, else their next; null for none. */
export function awaySummary(list: readonly UserAbsence[], userId: string, today: string): AwaySummary | null {
  const mine = comingAbsences(
    list.filter((a) => sameId(a.userId, userId)),
    today,
  );
  const current = mine.find((a) => isAwayOn(a, today));
  if (current) return { now: true, text: `Away until ${czDay(current.toDate)}`, cover: coverLine(current), absence: current };
  const next = mine[0];
  return next ? { now: false, text: `Away ${absenceDays(next)}`, cover: coverLine(next), absence: next } : null;
}

const coverLine = (a: UserAbsence) => (a.coverUserId || a.coverEmail ? `cover: ${coverText(a)}` : "no cover");

/** What the dialog's form holds: the days, the cover by e-mail (the user picker's value), the note. */
export interface AbsenceDraft {
  fromDate: string;
  toDate: string;
  /** "" for nobody. */
  coverEmail: string;
  note: string;
}

export const EMPTY_DRAFT: AbsenceDraft = { fromDate: "", toDate: "", coverEmail: "", note: "" };

/** The form filled with an absence, to change it. */
export const draftOf = (a: UserAbsence): AbsenceDraft => ({ fromDate: a.fromDate, toDate: a.toDate, coverEmail: a.coverEmail ?? "", note: a.note ?? "" });

/** A user as the cover is looked up. */
interface Person {
  id: string;
  email: string;
}

/** The id of the user an e-mail names (without regard to case); null for none. */
export function userIdOf(email: string, users: readonly Person[]): string | null {
  const named = email.trim().toLowerCase();
  if (!named) return null;
  return users.find((u) => u.email.trim().toLowerCase() === named)?.id ?? null;
}

const daysLong = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/**
 * Why the form can't be sent yet, in the server's words where it has them; null when it can.
 * `absentUserId` is who is away; `users` the company's users the cover is picked from.
 */
export function absenceProblem(draft: AbsenceDraft, absentUserId: string, users: readonly Person[]): string | null {
  if (!isDay(draft.fromDate)) return "Pick the first day away";
  if (!isDay(draft.toDate)) return "Pick the last day away";
  if (draft.toDate < draft.fromDate) return "An absence cannot end before it starts";
  if (daysLong(draft.fromDate, draft.toDate) > MAX_ABSENCE_DAYS) return `An absence can be at most ${MAX_ABSENCE_DAYS} days long`;
  if (draft.coverEmail.trim()) {
    const cover = userIdOf(draft.coverEmail, users);
    if (!cover) return "The cover must be an active user of the company";
    if (sameId(cover, absentUserId)) return "The cover cannot be the person who is away";
  }
  if (draft.note.trim().length > MAX_ABSENCE_NOTE) return `The note is too long (at most ${MAX_ABSENCE_NOTE} characters)`;
  return null;
}

/**
 * A new absence as the server takes it. Recorded for oneself (`self`), the user is left out - the
 * server takes the caller - so a user never names an id the server would have to refuse.
 */
export function createRequest(draft: AbsenceDraft, absentUserId: string, self: boolean, users: readonly Person[]): controllers.AbsenceCreateRequest {
  const coverUserId = userIdOf(draft.coverEmail, users);
  return {
    ...(self ? {} : { userId: absentUserId }),
    fromDate: draft.fromDate,
    toDate: draft.toDate,
    ...(coverUserId ? { coverUserId } : {}),
    note: draft.note.trim(),
  };
}

/** A change of an absence: everything the form holds; a cover taken away is an explicit null (it clears it). */
export function updateRequest(draft: AbsenceDraft, users: readonly Person[]): controllers.AbsenceUpdateRequest {
  return { fromDate: draft.fromDate, toDate: draft.toDate, coverUserId: userIdOf(draft.coverEmail, users), note: draft.note.trim() };
}

/**
 * The line beside the cover picker: what the cover does (the cover job, every 15 minutes, sets it as
 * the Holiday Cover of the jobs the absent person handles that have none, and takes it off when the
 * absence is over - where it is still the one it set).
 */
export function coverHint(self: boolean, name: string): string {
  return self
    ? "While you are away, each active job you handle with no Holiday Cover gets this cover as its Holiday Cover (within 15 minutes), and loses it when you are back."
    : `While ${name.trim() || "this user"} is away, each active job they handle with no Holiday Cover gets this cover as its Holiday Cover (within 15 minutes), and loses it when they are back.`;
}
