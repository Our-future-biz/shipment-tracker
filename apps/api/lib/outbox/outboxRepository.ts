import { and, asc, eq, inArray, isNull, sql, type InferSelectModel, type SQL } from "drizzle-orm";
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
  actingUserId: PgColumn;
  actingRole: PgColumn;
};

/** Who rows written by a user no longer there are sent as when they are sent again. */
export interface ReplaceActors {
  /** Acting user ids that are no live user any more ("" included) */
  gone: string[];
  userId: string;
  role: string;
}

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
  // made — a row waits while an older one of the same key is still pending. A row that failed
  // for good does not hold the later ones back (it is shown, warned about and can be sent again).
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
            WHERE y.${key} = x.${key} AND y.status = 'pending' AND y.deleted_at IS NULL
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

  /** The company's rows that failed for good, matching `where` (the table's own columns), oldest first. */
  async failedWhere(companyId: string, where?: SQL): Promise<InferSelectModel<TTable>[]> {
    const o = this.table;
    const rows = await this.db
      .select()
      .from(o as PgTable)
      .where(and(eq(o.companyId, companyId), eq(o.status, "failed"), isNull(o.deletedAt), where))
      .orderBy(asc(o.createdAt), asc(o.id));
    return rows as InferSelectModel<TTable>[];
  }

  // "Send again": failed rows go back to pending, due now, with a fresh count of attempts. Rows
  // written by a user who is no longer there are sent as `replace` (the service identity) — they
  // would only fail again. Returns the rows requeued.
  async requeueFailed(companyId: string, ids: string[], replace: ReplaceActors | null) {
    if (!ids.length) return [];
    const o = this.table;
    const gone = replace?.gone.length ? replace.gone : null;
    const actor = (col: PgColumn, value: string) =>
      gone ? sql`CASE WHEN ${o.actingUserId} IN (${sql.join(gone.map((g) => sql`${g}`), sql`, `)}) THEN ${value} ELSE ${col} END` : sql`${col}`;
    return (await this.db
      .update(o)
      .set({
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedUntil: null,
        lastError: "",
        updatedAt: new Date(),
        actingRole: actor(o.actingRole, replace?.role ?? ""),
        actingUserId: actor(o.actingUserId, replace?.userId ?? ""),
      } as never)
      .where(and(eq(o.companyId, companyId), inArray(o.id, ids), eq(o.status, "failed"), isNull(o.deletedAt)))
      .returning()) as InferSelectModel<TTable>[];
  }

  // Rows (all companies) not delivered in time: failed for good, or still pending after `minutes`.
  // Counts and the oldest pending one, for the warning log.
  async unsentHealth(minutes: number) {
    const o = this.table;
    const [row] = await this.db
      .select({
        failed: sql<number>`count(*) FILTER (WHERE ${o.status} = 'failed')`,
        stale: sql<number>`count(*) FILTER (WHERE ${o.status} = 'pending' AND ${o.createdAt} < now() - make_interval(mins => ${minutes}))`,
        oldest: sql<Date | string | null>`min(${o.createdAt}) FILTER (WHERE ${o.status} = 'pending' AND ${o.createdAt} < now() - make_interval(mins => ${minutes}))`,
      })
      .from(o as PgTable)
      .where(and(inArray(o.status, ["pending", "failed"]), isNull(o.deletedAt)));
    return {
      failed: Number(row?.failed ?? 0),
      stalePending: Number(row?.stale ?? 0),
      oldestPending: row?.oldest ? new Date(row.oldest).toISOString() : null,
    };
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
