import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { getAuthData } from "~encore/auth";
import { pragueDate } from "./storage";

// Floor mode on phones queues stamps, survey saves, exceptions and photos while there is no
// connection and sends them, in order, when the phone is back online. Each queued write carries
// the time it was made on the phone (`recordedAt`) and an id of its own (`clientRequestId`), so a
// write sent twice is recognised and never applied twice. Pure helpers, no database.

/** A queued write older than this is refused; the phone shows it as too old to send. */
export const OFFLINE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/**
 * A queued write recorded longer ago than this is still accepted (a phone can be offline for
 * hours in the yard — refusing it would lose real work), but it is logged with the user, so
 * late times that move the storage clock and the KPIs can be audited.
 */
export const OFFLINE_LOG_AGE_MS = 30 * 60 * 1000;
/** Phone clocks run a little ahead; a recorded time at most this far in the future is taken as now. */
export const OFFLINE_CLOCK_SKEW_MS = 2 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const hhmmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", day: "numeric", month: "short" });

/** HH:MM in the warehouse's local time (Europe/Prague). */
export const pragueHhmm = (d: Date) => hhmmFmt.format(d);

/** The request id as sent, or undefined when none; refused unless it is a UUID. */
export function checkRequestId(raw: string | null | undefined): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (!UUID.test(raw)) throw APIError.invalidArgument("clientRequestId must be a UUID");
  return raw.toLowerCase();
}

/**
 * The time a queued write was made on the phone, if the server can accept it: only from floor
 * mode (the write carries its `requestId`), a full ISO time with a zone, not more than
 * OFFLINE_CLOCK_SKEW_MS in the future (a little ahead is taken as `now`), not older than
 * OFFLINE_MAX_AGE_MS (older than OFFLINE_LOG_AGE_MS is logged for audit), and not before
 * `notBefore` (the step it follows). `userId` defaults to the caller's.
 */
export function acceptRecordedAt(
  raw: string,
  now: Date,
  opts: { notBefore?: Date | null; after?: string; requestId?: string; userId?: string } = {},
): Date {
  if (!opts.requestId) throw APIError.invalidArgument("recordedAt is accepted only from floor mode, with a clientRequestId");
  const at = ISO.test(raw.trim()) ? new Date(raw.trim()) : null;
  if (!at || Number.isNaN(at.getTime())) throw APIError.invalidArgument("recordedAt must be a date and time (ISO 8601 with a time zone)");
  const ahead = at.getTime() - now.getTime();
  if (ahead > OFFLINE_CLOCK_SKEW_MS) {
    throw APIError.invalidArgument(`Recorded at ${pragueHhmm(at)} is in the future — check the phone's clock`);
  }
  const when = ahead > 0 ? now : at;
  if (now.getTime() - when.getTime() > OFFLINE_MAX_AGE_MS) {
    throw APIError.invalidArgument("Recorded more than 12 hours ago — too old to send; record it again");
  }
  const ageMs = now.getTime() - when.getTime();
  if (ageMs > OFFLINE_LOG_AGE_MS) {
    log.info("warehouse: late floor write accepted", {
      requestId: opts.requestId,
      recordedAt: when.toISOString(),
      ageMinutes: Math.round(ageMs / 60000),
      userId: opts.userId ?? getAuthData()?.userID ?? "",
    });
  }
  if (opts.notBefore && when.getTime() < opts.notBefore.getTime()) {
    throw APIError.invalidArgument(
      `Recorded at ${pragueHhmm(when)}, before ${opts.after ?? "the previous step"} (${pragueHhmm(opts.notBefore)}) — check the phone's clock`,
    );
  }
  return when;
}

/** The latest of the given times; null when none is set. */
export const latest = (...dates: (Date | null | undefined)[]): Date | null =>
  dates.reduce<Date | null>((a, d) => (d && (!a || d.getTime() > a.getTime()) ? d : a), null);

/** Log detail of a write made offline: "Recorded offline at 10:05, sent 10:40" (Prague time). */
export function offlineDetail(recorded: Date, sent: Date): string {
  const day = pragueDate(recorded) === pragueDate(sent) ? "" : ` (${dayFmt.format(recorded)})`;
  return `Recorded offline at ${pragueHhmm(recorded)}${day}, sent ${pragueHhmm(sent)}`;
}

/** What happened to a stamp request. */
export type StampOutcome = "stamped" | "already_stamped" | "stamped_by_someone_else";
/** What happened to a survey save. */
export type SurveyOutcome = "saved" | "already_saved" | "newer_exists";
/** What happened to an exception create. */
export type ExceptionOutcome = "recorded" | "already_recorded";

