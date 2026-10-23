import { and, desc, eq, gte, inArray, isNull, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { gateMovementTable, type GateEvent, type GateMovementRecord, type NewGateMovementRecord } from "../schemas/gateMovement.schema";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";
import { dropPickupLineSql, hasPickupLineSql, linkedOutboundCond, linkedToShipmentCond, pickupPinLine, setPickupLineSql } from "../services/pickupPin";
import type { Tx } from "./warehouseSection.repository";
import { isUuid } from "../../../lib/uuid";

// Gate rows come back with the linked warehouse reference (WCZ…) of their task.
export type GateMovementRow = GateMovementRecord & { positionRef: string | null; shipmentId: string | null };

const liveRow = (companyId: string) =>
  and(eq(gateMovementTable.companyId, companyId), isNull(gateMovementTable.deletedAt));
// The record with this id. An id out of a request that is not a uuid matches nothing (the
// endpoint answers "not found"): Postgres would answer it in the uuid column with an error.
const byId = (id: string) => (isUuid(id) ? eq(gateMovementTable.id, id) : sql`false`);
const archivedRow = (companyId: string) =>
  and(eq(gateMovementTable.companyId, companyId), isNotNull(gateMovementTable.deletedAt));

/**
 * The record has at least one gate stamp (gate-in, gate-out, WH release, draft receipt or receipt),
 * or was received at a stripping tally, or left in a container — evidence a manager archives.
 */
export const hasStampSql = sql`(${gateMovementTable.gateIn} IS NOT NULL OR ${gateMovementTable.gateOut} IS NOT NULL
  OR ${gateMovementTable.impRelease} IS NOT NULL OR ${gateMovementTable.expDraft} IS NOT NULL OR ${gateMovementTable.expReceipt} IS NOT NULL
  OR ${gateMovementTable.receivedAt} IS NOT NULL OR ${gateMovementTable.leftAt} IS NOT NULL)`;
export const hasStamp = (
  m: Pick<GateMovementRecord, "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt"> & Partial<Pick<GateMovementRecord, "receivedAt" | "leftAt">>,
) => !!(m.gateIn || m.gateOut || m.impRelease || m.expDraft || m.expReceipt || m.receivedAt || m.leftAt);

const toRow = (r: { movement: GateMovementRecord; positionRef: string | null; shipmentId: string | null }): GateMovementRow => ({
  ...r.movement,
  positionRef: r.positionRef,
  shipmentId: r.shipmentId,
});

class GateMovementRepository {
  private select() {
    return db
      .select({ movement: gateMovementTable, positionRef: warehouseTaskTable.taskId, shipmentId: warehouseTaskTable.shipmentId })
      .from(gateMovementTable)
      .leftJoin(
        warehouseTaskTable,
        and(eq(warehouseTaskTable.id, gateMovementTable.warehouseTaskId), isNull(warehouseTaskTable.deletedAt)),
      );
  }

  // Archived rows keep showing the reference and shipment of their task, even when the task
  // was removed with them.
  private selectAny() {
    return db
      .select({ movement: gateMovementTable, positionRef: warehouseTaskTable.taskId, shipmentId: warehouseTaskTable.shipmentId })
      .from(gateMovementTable)
      .leftJoin(warehouseTaskTable, eq(warehouseTaskTable.id, gateMovementTable.warehouseTaskId));
  }

  // Companies with live gate records linked to a shipment and not released or left yet — the
  // records whose customs status the customs follow keeps up to date.
  async companiesFollowingShipments(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ companyId: gateMovementTable.companyId })
      .from(gateMovementTable)
      .innerJoin(warehouseTaskTable, and(eq(warehouseTaskTable.id, gateMovementTable.warehouseTaskId), isNull(warehouseTaskTable.deletedAt)))
      .where(and(isNull(gateMovementTable.deletedAt), isNotNull(warehouseTaskTable.shipmentId), isNull(gateMovementTable.impRelease), isNull(gateMovementTable.leftAt)));
    return rows.map((r) => r.companyId);
  }

  // Companies with live gate records not released or left yet.
  async companiesWithOpenRecords(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ companyId: gateMovementTable.companyId })
      .from(gateMovementTable)
      .where(and(isNull(gateMovementTable.deletedAt), isNull(gateMovementTable.impRelease), isNull(gateMovementTable.leftAt)));
    return rows.map((r) => r.companyId);
  }

  async listAll(companyId: string): Promise<GateMovementRow[]> {
    const rows = await this.select().where(liveRow(companyId)).orderBy(desc(gateMovementTable.createdAt));
    return rows.map(toRow);
  }

  // Archived (soft-deleted) records, newest archive first.
  async listArchived(companyId: string): Promise<GateMovementRow[]> {
    const rows = await this.selectAny().where(archivedRow(companyId)).orderBy(desc(gateMovementTable.deletedAt));
    return rows.map(toRow);
  }

  async findById(id: string, companyId: string): Promise<GateMovementRow | null> {
    const [row] = await this.select().where(and(byId(id), liveRow(companyId)));
    return row ? toRow(row) : null;
  }

  // Live or archived.
  async findByIdAny(id: string, companyId: string): Promise<GateMovementRow | null> {
    const [row] = await this.selectAny().where(and(byId(id), eq(gateMovementTable.companyId, companyId)));
    return row ? toRow(row) : null;
  }

  // Live or archived records by id (the houses of a container).
  async findByIdsAny(ids: string[], companyId: string): Promise<GateMovementRow[]> {
    if (!ids.length) return [];
    const rows = await this.selectAny().where(and(inArray(gateMovementTable.id, ids), eq(gateMovementTable.companyId, companyId)));
    return rows.map(toRow);
  }

  // Live records locked until the transaction ends, in id order (after their container's lock,
  // so a container action and a gate stamp never deadlock).
  async lockLive(tx: Tx, ids: string[], companyId: string): Promise<GateMovementRow[]> {
    if (!ids.length) return [];
    const rows = await tx
      .select({ movement: gateMovementTable, positionRef: warehouseTaskTable.taskId, shipmentId: warehouseTaskTable.shipmentId })
      .from(gateMovementTable)
      .leftJoin(warehouseTaskTable, and(eq(warehouseTaskTable.id, gateMovementTable.warehouseTaskId), isNull(warehouseTaskTable.deletedAt)))
      .where(and(inArray(gateMovementTable.id, ids), liveRow(companyId)))
      .orderBy(gateMovementTable.id)
      .for("update", { of: gateMovementTable });
    return rows.map(toRow);
  }

  async findTask(taskId: string, companyId: string) {
    if (!isUuid(taskId)) return null;
    const [row] = await db
      .select()
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.id, taskId), eq(warehouseTaskTable.companyId, companyId), isNull(warehouseTaskTable.deletedAt)));
    return row ?? null;
  }

  // Warehouse tasks that never had a gate row (deleted rows count, so a row removed by
  // hand does not come back).
  async tasksWithoutMovement(companyId: string) {
    return db
      .select()
      .from(warehouseTaskTable)
      .where(
        and(
          eq(warehouseTaskTable.companyId, companyId),
          isNull(warehouseTaskTable.deletedAt),
          isNotNull(warehouseTaskTable.shipmentId),
          sql`NOT EXISTS (SELECT 1 FROM ${gateMovementTable} WHERE ${gateMovementTable.warehouseTaskId} = ${warehouseTaskTable.id})`,
        ),
      );
  }

  // Whether the task ever had a gate row (archived ones count, so a record removed by hand does
  // not come back).
  async taskHasMovement(taskId: string, companyId: string, tx: Tx | typeof db = db) {
    const [row] = await tx
      .select({ id: gateMovementTable.id })
      .from(gateMovementTable)
      .where(and(eq(gateMovementTable.companyId, companyId), eq(gateMovementTable.warehouseTaskId, taskId)))
      .limit(1);
    return !!row;
  }

  // The live gate record of a task, if any.
  async liveIdForTask(taskId: string, companyId: string, tx: Tx | typeof db = db) {
    const [row] = await tx
      .select({ id: gateMovementTable.id })
      .from(gateMovementTable)
      .where(and(eq(gateMovementTable.companyId, companyId), eq(gateMovementTable.warehouseTaskId, taskId), isNull(gateMovementTable.deletedAt)))
      .orderBy(desc(gateMovementTable.createdAt))
      .limit(1);
    return row?.id ?? null;
  }

  // Live gate rows of a task, locked until the transaction ends (so no stamp lands between a
  // check of their stamps and their archiving).
  // (`lock` false: read only, for what must be locked before them.)
  async liveForTaskLocked(tx: Tx, taskId: string, companyId: string, lock = true) {
    const q = tx
      .select()
      .from(gateMovementTable)
      .where(and(liveRow(companyId), eq(gateMovementTable.warehouseTaskId, taskId)));
    return lock ? q.for("update") : q;
  }

  // Archives (soft-deletes) a record, recording who and why and logging `event`, only while
  // `cond` holds. Null when no live row matched.
  async archive(id: string, companyId: string, by: string, reason: string, event: GateEvent, cond?: SQL, tx: Tx | typeof db = db) {
    const t = gateMovementTable;
    const now = new Date();
    const [row] = await tx
      .update(t)
      .set({ deletedAt: now, archivedBy: by, archiveReason: reason, events: sql`${t.events} || ${JSON.stringify([event])}::jsonb`, updatedAt: now })
      .where(and(byId(id), liveRow(companyId), cond))
      .returning();
    return row ?? null;
  }

  // Archives every live record of a task removed from the warehouse.
  async archiveForTask(tx: Tx, taskId: string, companyId: string, by: string, reason: string, event: GateEvent) {
    const t = gateMovementTable;
    const now = new Date();
    return tx
      .update(t)
      .set({ deletedAt: now, archivedBy: by, archiveReason: reason, events: sql`${t.events} || ${JSON.stringify([event])}::jsonb`, updatedAt: now })
      .where(and(liveRow(companyId), eq(t.warehouseTaskId, taskId)))
      .returning({ id: t.id });
  }

  // Brings an archived record back, logging `event`. Null when it is not archived (any more).
  async restore(tx: Tx, id: string, companyId: string, event: GateEvent) {
    const t = gateMovementTable;
    const [row] = await tx
      .update(t)
      .set({ deletedAt: null, archivedBy: "", archiveReason: "", events: sql`${t.events} || ${JSON.stringify([event])}::jsonb`, updatedAt: new Date() })
      .where(and(byId(id), archivedRow(companyId)))
      .returning();
    return row ?? null;
  }

  // Brings back the records of a position that were archived when it was removed (at or after
  // `removedAt`, in the same transaction); records archived on their own before stay archived.
  async restoreArchivedWithTask(tx: Tx, taskId: string, companyId: string, removedAt: Date, event: GateEvent) {
    const t = gateMovementTable;
    return tx
      .update(t)
      .set({ deletedAt: null, archivedBy: "", archiveReason: "", events: sql`${t.events} || ${JSON.stringify([event])}::jsonb`, updatedAt: new Date() })
      .where(and(archivedRow(companyId), eq(t.warehouseTaskId, taskId), gte(t.deletedAt, removedAt)))
      .returning({ id: t.id });
  }

  // Adds events to a record whether it is live or archived (deliveries to the shipment report
  // back here even after the record was archived).
  async appendEvents(id: string, companyId: string, events: GateEvent[], tx: Tx | typeof db = db) {
    const t = gateMovementTable;
    await tx
      .update(t)
      .set({ events: sql`${t.events} || ${JSON.stringify(events)}::jsonb`, updatedAt: new Date() })
      .where(and(byId(id), eq(t.companyId, companyId)));
  }

  // Adds events to every live record of a position (section saves, "mark as sent").
  async appendEventsForTask(taskId: string, companyId: string, events: GateEvent[], tx: Tx | typeof db = db) {
    const t = gateMovementTable;
    await tx
      .update(t)
      .set({ events: sql`${t.events} || ${JSON.stringify(events)}::jsonb`, updatedAt: new Date() })
      .where(and(liveRow(companyId), eq(t.warehouseTaskId, taskId)));
  }

  // Records that the linked shipment was read just now (customs follow), without counting as
  // a change of the record.
  async markShipmentChecked(ids: string[], companyId: string, at: Date) {
    if (!ids.length) return;
    await db
      .update(gateMovementTable)
      .set({ shipmentCheckedAt: at })
      .where(and(eq(gateMovementTable.companyId, companyId), inArray(gateMovementTable.id, ids)));
  }

  async create(data: NewGateMovementRecord, tx: Tx | typeof db = db) {
    const [row] = await tx.insert(gateMovementTable).values(data).returning();
    return row!;
  }

  async update(id: string, companyId: string, data: Partial<NewGateMovementRecord>, tx: Tx | typeof db = db) {
    const [row] = await tx
      .update(gateMovementTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(byId(id), liveRow(companyId)))
      .returning();
    return row ?? null;
  }

  // One conditional UPDATE: sets `set` and appends `events` to the log in SQL, only while
  // `cond` still holds. Null when no live row matched, so two clerks racing on the same
  // stamp cannot both win and no event is lost to a read-modify-write.
  // `events` is a list of events, or SQL that yields a jsonb array.
  async conditionalUpdate(
    id: string,
    companyId: string,
    set: PgUpdateSetSource<typeof gateMovementTable>,
    events?: GateEvent[] | SQL,
    cond?: SQL,
    tx: Tx | typeof db = db,
  ): Promise<GateMovementRecord | null> {
    const t = gateMovementTable;
    const append = events === undefined ? null : Array.isArray(events) ? sql`${JSON.stringify(events)}::jsonb` : events;
    const [row] = await tx
      .update(t)
      .set({ ...set, ...(append ? { events: sql`${t.events} || ${append}` } : {}), updatedAt: new Date() })
      .where(and(byId(id), liveRow(companyId), cond))
      .returning();
    return row ?? null;
  }

  // Takes one PIN try before the PIN is checked, only while tries are left, so parallel
  // wrong guesses cannot get more than `max` tries. Null when there is no PIN or no try left.
  async takePinTry(id: string, companyId: string, max: number) {
    const t = gateMovementTable;
    const [row] = await db
      .update(t)
      .set({ pinTries: sql`${t.pinTries} + 1`, updatedAt: new Date() })
      .where(and(byId(id), liveRow(companyId), isNotNull(t.pinHash), lt(t.pinTries, max)))
      .returning({ pinHash: t.pinHash, pinTries: t.pinTries });
    return row?.pinHash ? { pinHash: row.pinHash, pinTries: row.pinTries } : null;
  }

  // A matching PIN gives its try back.
  async refundPinTry(id: string, companyId: string) {
    const t = gateMovementTable;
    await db
      .update(t)
      .set({ pinTries: sql`GREATEST(${t.pinTries} - 1, 0)` })
      .where(and(byId(id), liveRow(companyId)));
  }

  // Adds the Pick-up PIN line (Pending) to linked outbound rows that do not have it yet — rows
  // made before the line existed, or rows that became linked outbound. One idempotent UPDATE,
  // logged on each row it changes; released and deleted rows are never touched.
  // With `id`, only that row.
  async ensurePickupLine(companyId: string, event: GateEvent, id?: string) {
    const t = gateMovementTable;
    await db
      .update(t)
      .set({
        releaseGates: sql`${t.releaseGates} || jsonb_build_array(${JSON.stringify(pickupPinLine())}::jsonb)`,
        events: sql`${t.events} || ${JSON.stringify([event])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(liveRow(companyId), id ? byId(id) : undefined, isNull(t.impRelease), linkedOutboundCond, sql`NOT ${hasPickupLineSql}`));
  }

  // Takes the Pick-up PIN line off rows that are no longer linked outbound (direction changed,
  // the task was unlinked or deleted); logged. One row with `id`, else every row of the company.
  // Released rows keep what they were released with.
  async dropPickupLine(companyId: string, event: GateEvent, id?: string) {
    const t = gateMovementTable;
    await db
      .update(t)
      .set({ releaseGates: dropPickupLineSql, events: sql`${t.events} || ${JSON.stringify([event])}::jsonb`, updatedAt: new Date() })
      .where(and(liveRow(companyId), id ? byId(id) : undefined, isNull(t.impRelease), hasPickupLineSql, sql`NOT ${linkedOutboundCond}`));
  }

  // The row was linked to another shipment: a Pick-up PIN line verified against the old
  // shipment's PIN no longer counts, so it goes back to Pending; logged. Unreleased rows only.
  async resetPickupLine(id: string, companyId: string, shipmentId: string, note: string, event: GateEvent) {
    const t = gateMovementTable;
    await db
      .update(t)
      .set({
        releaseGates: setPickupLineSql(pickupPinLine(note)),
        events: sql`${t.events} || ${JSON.stringify([event])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(byId(id), liveRow(companyId), isNull(t.impRelease), linkedOutboundCond, linkedToShipmentCond(shipmentId)));
  }

  // A new pick-up PIN: the Pick-up PIN line of every unreleased linked outbound row of the
  // shipment goes back to Pending, logged. Runs inside the PIN's transaction.
  async resetPickupLineForShipment(tx: Tx, shipmentId: string, companyId: string, note: string, event: GateEvent) {
    const t = gateMovementTable;
    await tx
      .update(t)
      .set({
        releaseGates: setPickupLineSql(pickupPinLine(note)),
        events: sql`${t.events} || ${JSON.stringify([event])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(liveRow(companyId), isNull(t.impRelease), linkedOutboundCond, linkedToShipmentCond(shipmentId)));
  }
}

export const gateMovementRepository = new GateMovementRepository();
