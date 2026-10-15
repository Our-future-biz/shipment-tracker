import { nextAttemptAt, outboxGivesUp, OUTBOX_MAX_ATTEMPTS } from "./outboxRetry";

// The delivery loop of a transactional outbox, without knowing what is sent or where it is
// stored: the owning service passes how to send a row and how to settle it (its repository and
// whatever it records alongside, e.g. a history event). Pure: no database, no Encore runtime.

export type OutboxOutcome = "sent" | "retry" | "failed";
export type OutboxCounts = Record<OutboxOutcome, number>;

/** What the delivery needs of a claimed row: `attempts` already counts this claim. */
export interface OutboxRowBase {
  id: string;
  attempts: number;
}

export interface OutboxHandlers<Row extends OutboxRowBase> {
  /** Sends the row; throws when it could not be delivered. */
  send(row: Row): Promise<void>;
  /** What users see of a failed delivery (stored as last_error): own wording, never upstream text. */
  errorText(err: unknown): string;
  /** Settles a delivered row. */
  onSent(row: Row): Promise<void>;
  /** Puts the row back to wait until `nextAttemptAt`. */
  onRetry(row: Row, error: string, nextAttemptAt: Date, err: unknown): Promise<void>;
  /** Stops the row for good (permanent error or attempts used up). */
  onFailed(row: Row, error: string, err: unknown): Promise<void>;
  maxAttempts?: number;
}

/** Sends one claimed row and settles it as sent, to retry later, or failed for good. */
export async function deliverOutboxRow<Row extends OutboxRowBase>(row: Row, h: OutboxHandlers<Row>): Promise<OutboxOutcome> {
  try {
    await h.send(row);
  } catch (err) {
    const error = h.errorText(err);
    if (outboxGivesUp(err, row.attempts, h.maxAttempts ?? OUTBOX_MAX_ATTEMPTS)) {
      await h.onFailed(row, error, err);
      return "failed";
    }
    await h.onRetry(row, error, nextAttemptAt(row.attempts), err);
    return "retry";
  }
  await h.onSent(row);
  return "sent";
}

export interface OutboxRunOptions<Row> {
  /** Claims up to `limit` due rows (oldest first). */
  claim(limit: number): Promise<Row[]>;
  deliver(row: Row): Promise<OutboxOutcome>;
  /** Called when a run stops on an error (claiming or settling failed). */
  onError(err: unknown): void;
  batch?: number;
  rounds?: number;
}

/**
 * Delivers what is due in a few rounds of `batch` rows: a delivered row can make the next update
 * of the same target due. Stops early when a round sends nothing and the queue is drained.
 * Never throws; returns what was done up to an error.
 */
export async function runOutboxDelivery<Row>(opts: OutboxRunOptions<Row>): Promise<OutboxCounts> {
  const batch = opts.batch ?? 20;
  const out: OutboxCounts = { sent: 0, retry: 0, failed: 0 };
  try {
    for (let round = 0; round < (opts.rounds ?? 5); round++) {
      const rows = await opts.claim(batch);
      if (!rows.length) break;
      const sentBefore = out.sent;
      for (const row of rows) out[await opts.deliver(row)]++;
      if (out.sent === sentBefore && rows.length < batch) break;
    }
  } catch (err) {
    opts.onError(err);
  }
  return out;
}
