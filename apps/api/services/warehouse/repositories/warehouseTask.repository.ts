import { eq, desc, isNull, and, like, sql } from "drizzle-orm";
import { db } from "../db/db";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";

class WarehouseTaskRepository {
  async listAll(companyId: string) {
    return db
      .select()
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.companyId, companyId), isNull(warehouseTaskTable.deletedAt)))
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

  /**
   * The warehouse reference of a shipment, creating it on first use: WHCZ + year + a
   * per-company sequence of that year (WHCZ2026001). An advisory lock keeps two parallel
   * calls from handing out the same number; deleted rows still hold their number, so one
   * is never reused.
   */
  async ensureForShipment(companyId: string, shipmentId: string, prefix: string) {
    const existing = await db
      .select()
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.companyId, companyId), eq(warehouseTaskTable.shipmentId, shipmentId), isNull(warehouseTaskTable.deletedAt)))
      .limit(1);
    if (existing[0]) return existing[0];

    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`warehouse-ref:${companyId}`}))`);

      const again = await tx
        .select()
        .from(warehouseTaskTable)
        .where(and(eq(warehouseTaskTable.companyId, companyId), eq(warehouseTaskTable.shipmentId, shipmentId), isNull(warehouseTaskTable.deletedAt)))
        .limit(1);
      if (again[0]) return again[0];

      const used = await tx
        .select({ taskId: warehouseTaskTable.taskId })
        .from(warehouseTaskTable)
        .where(and(eq(warehouseTaskTable.companyId, companyId), like(warehouseTaskTable.taskId, `${prefix}%`)));
      const highest = used.reduce((max, r) => Math.max(max, parseInt(r.taskId.slice(prefix.length), 10) || 0), 0);
      const taskId = `${prefix}${String(highest + 1).padStart(3, "0")}`;

      const [row] = await tx.insert(warehouseTaskTable).values({ companyId, shipmentId, taskId }).returning();
      return row!;
    });
  }

  async create(data: { companyId: string; taskId: string; shipmentId?: string; type?: string; priority?: string; status?: string }) {
    const [row] = await db.insert(warehouseTaskTable).values(data).returning();
    return row!;
  }

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(warehouseTaskTable)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(and(eq(warehouseTaskTable.id, id), eq(warehouseTaskTable.companyId, companyId), isNull(warehouseTaskTable.deletedAt)))
      .returning();
    return row ?? null;
  }

  async softDelete(id: string, companyId: string) {
    const [row] = await db
      .update(warehouseTaskTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(warehouseTaskTable.id, id), eq(warehouseTaskTable.companyId, companyId), isNull(warehouseTaskTable.deletedAt)))
      .returning();
    return row ?? null;
  }
}

export const warehouseTaskRepository = new WarehouseTaskRepository();
