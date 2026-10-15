// When an outbox row is tried again and when it gives up. Pure: no database, no Encore runtime.

/** Attempts after which a row stops retrying and is reported as failed. */
export const OUTBOX_MAX_ATTEMPTS = 15;

/** Minutes to wait before the next try after `attempts` tries: 2, 4, 8 … up to an hour. */
export const retryDelayMinutes = (attempts: number) => Math.min(2 ** Math.max(1, attempts), 60);

/** When the next try is due, counted from `now`. */
export const nextAttemptAt = (attempts: number, now = Date.now()) => new Date(now + retryDelayMinutes(attempts) * 60_000);

// Errors that a retry cannot fix: the target is gone, the update is refused, or the user may no
// longer change it.
const PERMANENT = new Set(["not_found", "invalid_argument", "permission_denied", "unauthenticated", "failed_precondition"]);

/** The error code of a failed call (an Encore APIError carries it as `code`); "" when none. */
export const outboxErrorCode = (err: unknown) => String((err as { code?: unknown } | null)?.code ?? "");

/** True when the row should stop retrying: the error is permanent or the attempts are used up. */
export const outboxGivesUp = (err: unknown, attempts: number, maxAttempts = OUTBOX_MAX_ATTEMPTS) =>
  PERMANENT.has(outboxErrorCode(err)) || attempts >= maxAttempts;
