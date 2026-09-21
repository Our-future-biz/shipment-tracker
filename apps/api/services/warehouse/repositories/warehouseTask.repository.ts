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

  // Creates a warehouse position under the next reference for the given day prefix
  // (WCZYYYYMMDD + 01, 02, …). Numbers are counted over deleted tasks too, so a reference is
  // never reused; the per-company advisory lock stops two concurrent adds taking the same one.
  // With a shipment, returns its existing live task instead if it is already in the warehouse;
  // without one (null) the position stands on its own — no shipment job behind it.
  async createForShipment(companyId: string, shipmentId: string | null, prefix: string) {
    return db.transaction(async (tx) => {
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

      const sameDay = await tx
        .select({ taskId: warehouseTaskTable.taskId })
        .from(warehouseTaskTable)
        .where(and(eq(warehouseTaskTable.companyId, companyId), like(warehouseTaskTable.taskId, `${prefix}%`)));
      let max = 0;
      for (const { taskId } of sameDay) {
        const n = parseInt(taskId.slice(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
      const taskId = `${prefix}${String(max + 1).padStart(2, "0")}`;

      const [row] = await tx.insert(warehouseTaskTable).values({ companyId, taskId, shipmentId }).returning();
      return { task: row!, created: true };
    });
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
