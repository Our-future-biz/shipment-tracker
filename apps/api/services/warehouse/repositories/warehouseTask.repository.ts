import { eq, ne, desc, isNull, and, sql } from "drizzle-orm";
import { APIError } from "encore.dev/api";
import { db } from "../db/db";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";
import { warehouseRefCounterTable } from "../schemas/warehouseRefCounter.schema";
import { formatWarehouseRef, MAX_REF_NUMBER, warehouseRefYear } from "../services/warehouseRef";
import type { Tx } from "./warehouseSection.repository";

/** Type of the old truck-reference rows (TCZ…); no longer created, kept out of the positions list. */
export const TRUCK_TYPE = "Truck";

class WarehouseTaskRepository {
  async listAll(companyId: string) {
    return db
      .select()
      .from(warehouseTaskTable)
      .where(and(
        eq(warehouseTaskTable.companyId, companyId),
        isNull(warehouseTaskTable.deletedAt),
        // Truck references (TCZ…) live in the same table but are not warehouse positions.
        ne(warehouseTaskTable.type, TRUCK_TYPE),
      ))
      .orderBy(desc(warehouseTaskTable.createdAt));
  }

  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(warehouseTaskTable)
      .where(and(
        eq(warehouseTaskTable.companyId, companyId),
        eq(warehouseTaskTable.shipmentId, shipmentId),
        isNull(warehouseTaskTable.deletedAt),
      ));
  }

  // Hands out the next reference of the company for `year` (WCZ + year + six digits). The
  // counter row is bumped in one statement and stays locked until the transaction ends, so two
  // positions never get the same number and a rolled-back create gives its number back.
  // A number that spells a reference already used (old day-based references, live or deleted)
  // is skipped, so a reference is never reused.
  async allocateRef(tx: Tx, companyId: string, year: number): Promise<string> {
    for (;;) {
      const res = await tx.execute<{ last: number }>(sql`
        INSERT INTO ${warehouseRefCounterTable} (company_id, year, last) VALUES (${companyId}, ${year}, 1)
        ON CONFLICT (company_id, year) DO UPDATE SET last = ${warehouseRefCounterTable}.last + 1, updated_at = now()
        RETURNING last`);
      const n = Number(res.rows[0]!.last);
      if (n > MAX_REF_NUMBER) throw APIError.resourceExhausted(`Warehouse reference numbers for ${year} are used up`);
      const ref = formatWarehouseRef(year, n);
      const [taken] = await tx
        .select({ id: warehouseTaskTable.id })
        .from(warehouseTaskTable)
        .where(and(eq(warehouseTaskTable.companyId, companyId), eq(warehouseTaskTable.taskId, ref)))
        .limit(1);
      if (!taken) return ref;
    }
  }

  // Creates a warehouse position under the next reference, inside the caller's transaction.
  // The per-company advisory lock stops two adds of the same shipment both creating one.
  // With a shipment, returns its existing live task instead if it is already in the warehouse;
  // without one (null) the position stands on its own — no shipment job behind it.
  async createInTx(tx: Tx, companyId: string, shipmentId: string | null, now = new Date()) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`warehouse_ref:${companyId}`}))`);
    if (shipmentId) {
      const [existing] = await tx
        .select()
        .from(warehouseTaskTable)
        .where(and(
          eq(warehouseTaskTable.companyId, companyId),
          eq(warehouseTaskTable.shipmentId, shipmentId),
          isNull(warehouseTaskTable.deletedAt),
        ));
      if (existing) return { task: existing, created: false };
    }
    const taskId = await this.allocateRef(tx, companyId, warehouseRefYear(now));
    const [row] = await tx.insert(warehouseTaskTable).values({ companyId, taskId, shipmentId }).returning();
    return { task: row!, created: true };
  }

  // createInTx in a transaction of its own (a position without its gate row — tests and repairs).
  async createForShipment(companyId: string, shipmentId: string | null, now = new Date()) {
    return db.transaction((tx) => this.createInTx(tx, companyId, shipmentId, now));
  }

  async findAny(id: string, companyId: string, tx: Tx | typeof db = db) {
    const [row] = await tx
      .select()
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.id, id), eq(warehouseTaskTable.companyId, companyId)));
    return row ?? null;
  }

  // Live task of a shipment, if any.
  async findLiveForShipment(companyId: string, shipmentId: string, tx: Tx | typeof db = db) {
    const [row] = await tx
      .select()
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.companyId, companyId), eq(warehouseTaskTable.shipmentId, shipmentId), isNull(warehouseTaskTable.deletedAt)));
    return row ?? null;
  }

  // Live task holding a reference, if any.
  async findLiveByRef(companyId: string, taskId: string, tx: Tx | typeof db = db) {
    const [row] = await tx
      .select()
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.companyId, companyId), eq(warehouseTaskTable.taskId, taskId), isNull(warehouseTaskTable.deletedAt)));
    return row ?? null;
  }

  // Brings a removed task back (restore of its archived gate record).
  async undelete(tx: Tx, id: string, companyId: string) {
    const [row] = await tx
      .update(warehouseTaskTable)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(warehouseTaskTable.id, id), eq(warehouseTaskTable.companyId, companyId)))
      .returning();
    return row ?? null;
  }

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(warehouseTaskTable)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(and(eq(warehouseTaskTable.id, id), eq(warehouseTaskTable.companyId, companyId), isNull(warehouseTaskTable.deletedAt)))
      .returning();
    return row ?? null;
  }

  async softDelete(id: string, companyId: string, tx: Tx | typeof db = db) {
    const [row] = await tx
      .update(warehouseTaskTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(warehouseTaskTable.id, id), eq(warehouseTaskTable.companyId, companyId), isNull(warehouseTaskTable.deletedAt)))
      .returning();
    return row ?? null;
  }
}

export const warehouseTaskRepository = new WarehouseTaskRepository();
