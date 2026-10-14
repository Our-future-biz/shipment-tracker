import { and, desc, eq, isNull, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { gateMovementTable, type GateEvent, type GateMovementRecord, type NewGateMovementRecord } from "../schemas/gateMovement.schema";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";

// Gate rows come back with the linked warehouse reference (WCZ…) of their task.
export type GateMovementRow = GateMovementRecord & { positionRef: string | null; shipmentId: string | null };

const liveRow = (companyId: string) =>
  and(eq(gateMovementTable.companyId, companyId), isNull(gateMovementTable.deletedAt));

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

  async listAll(companyId: string): Promise<GateMovementRow[]> {
    const rows = await this.select().where(liveRow(companyId)).orderBy(desc(gateMovementTable.createdAt));
    return rows.map((r) => ({ ...r.movement, positionRef: r.positionRef, shipmentId: r.shipmentId }));
  }

  async findById(id: string, companyId: string): Promise<GateMovementRow | null> {
    const [row] = await this.select().where(and(eq(gateMovementTable.id, id), liveRow(companyId)));
    return row ? { ...row.movement, positionRef: row.positionRef, shipmentId: row.shipmentId } : null;
  }

  async findTask(taskId: string, companyId: string) {
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

  // Inserts one gate row per task under a per-company lock, skipping tasks that got a
  // row meanwhile (two list calls racing on the same backfill).
  async createForTasks(companyId: string, rows: NewGateMovementRecord[]) {
    if (!rows.length) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`warehouse_gate:${companyId}`}))`);
      for (const row of rows) {
        const [existing] = await tx
          .select({ id: gateMovementTable.id })
          .from(gateMovementTable)
          .where(eq(gateMovementTable.warehouseTaskId, row.warehouseTaskId!));
        if (!existing) await tx.insert(gateMovementTable).values(row);
      }
    });
  }

  // Gate rows of a task removed from the warehouse that never saw any gate activity.
  async removeUntouchedForTask(taskId: string, companyId: string) {
    await db
      .update(gateMovementTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          liveRow(companyId),
          eq(gateMovementTable.warehouseTaskId, taskId),
          eq(gateMovementTable.status, "Expected"),
          isNull(gateMovementTable.gateIn),
          sql`jsonb_array_length(${gateMovementTable.events}) <= 1`,
        ),
      );
  }

  async create(data: NewGateMovementRecord) {
    const [row] = await db.insert(gateMovementTable).values(data).returning();
    return row!;
  }

  async update(id: string, companyId: string, data: Partial<NewGateMovementRecord>) {
    const [row] = await db
      .update(gateMovementTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(gateMovementTable.id, id), liveRow(companyId)))
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
  ): Promise<GateMovementRecord | null> {
    const t = gateMovementTable;
    const append = events === undefined ? null : Array.isArray(events) ? sql`${JSON.stringify(events)}::jsonb` : events;
    const [row] = await db
      .update(t)
      .set({ ...set, ...(append ? { events: sql`${t.events} || ${append}` } : {}), updatedAt: new Date() })
      .where(and(eq(t.id, id), liveRow(companyId), cond))
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
      .where(and(eq(t.id, id), liveRow(companyId), isNotNull(t.pinHash), lt(t.pinTries, max)))
      .returning({ pinHash: t.pinHash, pinTries: t.pinTries });
    return row?.pinHash ? { pinHash: row.pinHash, pinTries: row.pinTries } : null;
  }

  // A matching PIN gives its try back.
  async refundPinTry(id: string, companyId: string) {
    const t = gateMovementTable;
    await db
      .update(t)
      .set({ pinTries: sql`GREATEST(${t.pinTries} - 1, 0)` })
      .where(and(eq(t.id, id), liveRow(companyId)));
  }

  async softDelete(id: string, companyId: string) {
    const [row] = await db
      .update(gateMovementTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(gateMovementTable.id, id), liveRow(companyId)))
      .returning();
    return row ?? null;
  }
}

export const gateMovementRepository = new GateMovementRepository();
