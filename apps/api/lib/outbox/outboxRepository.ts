import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { TenantRepository, type AnyDb } from "../db/repository";

// Claiming and settling the rows of a service's own outbox table (one that spreads outboxColumns).
// The service's repository extends this and adds what is particular to it (writing rows,
// cancelling them, its views of them).

type OutboxTable = PgTable & {
  id: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  deletedAt: PgColumn;
  companyId: PgColumn;
  status: PgColumn;
  attempts: PgColumn;
  nextAttemptAt: PgColumn;
  lockedUntil: PgColumn;
  lastError: PgColumn;
};

export interface OutboxRepositoryOptions {
  /** Column (SQL name) whose updates must go out in order, one at a time, e.g. "shipment_id". */
  orderKey: string;
  /** last_error kept on a row delivered after it was cancelled (the target got it anyway). */
  sentAfterCancelNote: string;
}

// A claimed row is held this long; a delivery that dies leaves it to the next run after that.
const LOCK = sql`interval '2 minutes'`;

export abstract class OutboxRepository<TTable extends OutboxTable> extends TenantRepository<TTable> {
  protected readonly outbox: OutboxRepositoryOptions;

  constructor(db: AnyDb, table: TTable, tableName: string, outbox: OutboxRepositoryOptions) {
    super(db, table, tableName);
    this.outbox = outbox;
  }

  // Takes up to `limit` due rows for delivery and counts the attempt. Safe to run from several
  // places at once (the cron and the local timer, or two app instances): rows are claimed with
  // SKIP LOCKED and held for a while. Updates of one order key go out in the order they were
  // made — a row waits while an older one of the same key is still pending, or failed for good.
  // `scope` narrows the rows (it refers to the candidate row as `x`).
  // Each claim adds one to `attempts`, which then serves as the claim's token: only the run
  // holding the latest claim can settle the row (markSent / markRetry / markFailed).
  protected async claimDueRows(limit: number, scope: SQL = sql``) {
    const o = this.table;
    const key = sql.identifier(this.outbox.orderKey);
    const res = await this.db.execute(sql`
      UPDATE ${o} SET locked_until = now() + ${LOCK}, attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT x.id FROM ${o} x
        WHERE x.status = 'pending' AND x.deleted_at IS NULL AND x.next_attempt_at <= now()
          AND (x.locked_until IS NULL OR x.locked_until < now())
          ${scope}
          AND NOT EXISTS (
            SELECT 1 FROM ${o} y
            WHERE y.${key} = x.${key} AND y.status IN ('pending', 'failed') AND y.deleted_at IS NULL
              AND (y.created_at, y.id) < (x.created_at, x.id))
        ORDER BY x.created_at, x.id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
      RETURNING id`);
    return (res.rows as { id: string }[]).map((r) => r.id);
  }

  // Settles a delivered row. A row cancelled meanwhile is recorded as sent too, since the target
  // did get it. Returns the status the row had ("pending" or "cancelled"), or null when the claim
  // was lost (another run took the row again after the lock ran out and settles it).
  async markSent(id: string, attempts: number): Promise<"pending" | "cancelled" | null> {
    const o = this.table;
    const res = await this.db.execute(sql`
      UPDATE ${o} SET status = 'sent', sent_at = now(), locked_until = NULL, updated_at = now(),
        last_error = CASE WHEN p.was = 'cancelled' THEN ${this.outbox.sentAfterCancelNote} ELSE '' END
      FROM (SELECT id, status AS was FROM ${o} WHERE id = ${id} FOR UPDATE) p
      WHERE ${o}.id = p.id AND ${o}.attempts = ${attempts} AND ${o}.status IN ('pending', 'cancelled')
      RETURNING p.was`);
    const was = (res.rows as { was: string }[])[0]?.was;
    return was === "pending" || was === "cancelled" ? was : null;
  }

  async markRetry(id: string, attempts: number, error: string, nextAttemptAt: Date) {
    const o = this.table;
    await this.db
      .update(o)
      .set({ nextAttemptAt, lockedUntil: null, lastError: error, updatedAt: new Date() } as never)
      .where(and(eq(o.id, id), eq(o.attempts, attempts), eq(o.status, "pending")));
  }

  async markFailed(id: string, attempts: number, error: string) {
    const o = this.table;
    await this.db
      .update(o)
      .set({ status: "failed", lockedUntil: null, lastError: error, updatedAt: new Date() } as never)
      .where(and(eq(o.id, id), eq(o.attempts, attempts), eq(o.status, "pending")));
  }

  // Pending rows (all companies) older than `minutes`: count and the oldest, for the warning log.
  async stalePending(minutes: number) {
    const o = this.table;
    const [row] = await this.db
      .select({ n: sql<number>`count(*)`, oldest: sql<Date | string | null>`min(${o.createdAt})` })
      .from(o as PgTable)
      .where(and(eq(o.status, "pending"), isNull(o.deletedAt), sql`${o.createdAt} < now() - make_interval(mins => ${minutes})`));
    return { count: Number(row?.n ?? 0), oldest: row?.oldest ? new Date(row.oldest).toISOString() : null };
  }
}
