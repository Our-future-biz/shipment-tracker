import { and, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { db, type Tx } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";
import { shipmentAuditTable, type NewShipmentAuditRecord, type ShipmentAuditRecord } from "../schemas/shipmentAudit.schema";
import { shipmentCommentTable } from "../schemas/shipmentComment.schema";
import { shipmentNoteTable } from "../schemas/shipmentNote.schema";
import { shipmentTaskTable } from "../schemas/shipmentTask.schema";
import { shipmentTrackingEventTable } from "../schemas/shipmentTrackingEvent.schema";

// The audit log is append-only and has no created/updated/deleted columns, so it does not use
// the tenant base repository; every entry is written with the shipment's company.
class ShipmentAuditRepository {
  async create(data: NewShipmentAuditRecord, tx: Tx | typeof db = db): Promise<void> {
    await tx.insert(shipmentAuditTable).values(data);
  }

  /** A shipment's changes of the given fields, newest first. */
  async listByShipmentId(shipmentId: string, companyId: string, fields: readonly string[], limit: number): Promise<ShipmentAuditRecord[]> {
    return db
      .select()
      .from(shipmentAuditTable)
      .where(and(
        eq(shipmentAuditTable.companyId, companyId),
        eq(shipmentAuditTable.shipmentId, shipmentId),
        inArray(shipmentAuditTable.field, [...fields]),
      ))
      .orderBy(desc(shipmentAuditTable.changedAt), desc(shipmentAuditTable.id))
      .limit(limit);
  }

  /**
   * The newest change of a field on a shipment, for each ask: one row per shipment and field, all
   * asks in one query. An ask names the fields and the shipments it wants them for, so a field
   * that matters on a few shipments only (how long a waiting status has stood) is not read for
   * all of them. For Shipments → Managers' cards.
   */
  async latestByShipmentIds(companyId: string, asks: readonly { fields: readonly string[]; shipmentIds: readonly string[] }[]): Promise<ShipmentAuditRecord[]> {
    const wanted = asks.filter((a) => a.fields.length > 0 && a.shipmentIds.length > 0);
    if (wanted.length === 0) return [];
    return db
      .selectDistinctOn([shipmentAuditTable.shipmentId, shipmentAuditTable.field])
      .from(shipmentAuditTable)
      .where(and(
        eq(shipmentAuditTable.companyId, companyId),
        or(...wanted.map((a) => and(inArray(shipmentAuditTable.field, [...a.fields]), inArray(shipmentAuditTable.shipmentId, [...a.shipmentIds])))),
      ))
      .orderBy(shipmentAuditTable.shipmentId, shipmentAuditTable.field, desc(shipmentAuditTable.changedAt), desc(shipmentAuditTable.id));
  }

  /**
   * When each job was last touched, as far as that was at or after `since`: the newest of a change
   * in its history, a chat line, a to-do written or ticked off, a task ticked and a tracking event
   * recorded. A job with none of them since then has no entry. For Shipments → Managers' "Not
   * touched" (lib/managersCockpitTeam), which asks only whether ANY touch is recent.
   *
   * One statement for the five tables - the page asks every minute, and five would take five of
   * the pool's ten connections. Bounded by `since` everywhere, never a job's whole history:
   *   history, chat, to-dos written, tracking events   the company's rows since then, by each
   *       table's index on company and time (company_id + created_at; the history's company_id +
   *       changed_at, migration 0087) - a week or so of one company, whatever job they are on:
   *       the caller keeps its own. Narrowing these to the jobs would hand the statement every
   *       job id four times more and read each job's rows by shipment_id, older ones included;
   *   to-dos ticked off, tasks ticked   no index knows done_at or completed_at, so these two are
   *       asked only of `shipmentIds` (the jobs old enough to be untouched), by shipment_id.
   */
  async lastTouchedSince(companyId: string, shipmentIds: readonly string[], since: Date): Promise<Map<string, Date>> {
    if (shipmentIds.length === 0) return new Map();
    const ids = [...shipmentIds];
    const [history, chat, notes, tasks, events] = [shipmentAuditTable, shipmentCommentTable, shipmentNoteTable, shipmentTaskTable, shipmentTrackingEventTable];
    const touches = unionAll(
      db.select({ shipmentId: history.shipmentId, at: sql<Date>`${history.changedAt}`.as("at") }).from(history).where(and(eq(history.companyId, companyId), gte(history.changedAt, since))),
      db.select({ shipmentId: chat.shipmentId, at: sql<Date>`${chat.createdAt}`.as("at") }).from(chat).where(and(eq(chat.companyId, companyId), gte(chat.createdAt, since))),
      db.select({ shipmentId: notes.shipmentId, at: sql<Date>`${notes.createdAt}`.as("at") }).from(notes).where(and(eq(notes.companyId, companyId), gte(notes.createdAt, since))),
      db.select({ shipmentId: notes.shipmentId, at: sql<Date>`${notes.doneAt}`.as("at") }).from(notes).where(and(eq(notes.companyId, companyId), inArray(notes.shipmentId, ids), gte(notes.doneAt, since))),
      db.select({ shipmentId: tasks.shipmentId, at: sql<Date>`${tasks.completedAt}`.as("at") }).from(tasks).where(and(eq(tasks.companyId, companyId), inArray(tasks.shipmentId, ids), gte(tasks.completedAt, since))),
      db.select({ shipmentId: events.shipmentId, at: sql<Date>`${events.createdAt}`.as("at") }).from(events).where(and(eq(events.companyId, companyId), gte(events.createdAt, since))),
    ).as("touches");
    const rows = await db
      .select({ shipmentId: touches.shipmentId, at: sql<Date>`max(${touches.at})`.mapWith(history.changedAt) })
      .from(touches)
      .groupBy(touches.shipmentId);
    return new Map(rows.map((r) => [r.shipmentId, r.at]));
  }

  /**
   * The company's changes since `since` that the audit line of Shipments → Managers asks about
   * (lib/managersCockpitAudit historyAsk), the newest first, each with its job's number and
   * Handled By as they are now. A deleted job's changes are among them: its deletion is one.
   *
   * Read by the index on (company_id, changed_at) (migration 0087) - a week of the company's
   * history - and narrowed to the few fields asked for; the job is joined by its key only for the
   * rows that are left.
   */
  async changesSince(
    companyId: string,
    since: Date,
    ask: { fields: readonly string[]; fieldPrefixes: readonly string[]; turnedInto: readonly { field: string; value: string }[] },
    limit: number,
  ) {
    const audit = shipmentAuditTable;
    const wanted = [
      ...(ask.fields.length ? [inArray(audit.field, [...ask.fields])] : []),
      ...ask.fieldPrefixes.map((prefix) => like(audit.field, `${prefix}%`)),
      ...ask.turnedInto.map((t) => and(eq(audit.field, t.field), eq(audit.newValue, t.value))),
    ];
    if (wanted.length === 0) return [];
    return db
      .select({
        shipmentId: audit.shipmentId,
        jobNumber: shipmentTable.jobNumber,
        personInCharge: shipmentTable.personInCharge,
        userId: audit.userId,
        field: audit.field,
        oldValue: audit.oldValue,
        newValue: audit.newValue,
        changedAt: audit.changedAt,
      })
      .from(audit)
      .innerJoin(shipmentTable, and(eq(shipmentTable.id, audit.shipmentId), eq(shipmentTable.companyId, audit.companyId)))
      .where(and(eq(audit.companyId, companyId), gte(audit.changedAt, since), or(...wanted)))
      .orderBy(desc(audit.changedAt), desc(audit.id))
      .limit(limit);
  }
}

export const shipmentAuditRepository = new ShipmentAuditRepository();
