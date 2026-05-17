import { eq, desc, isNull, and } from "drizzle-orm";
import { db } from "../db/db";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";

class WarehouseTaskRepository {
  async listAll() {
    return db
      .select()
      .from(warehouseTaskTable)
      .where(isNull(warehouseTaskTable.deletedAt))
      .orderBy(desc(warehouseTaskTable.createdAt));
  }

  async listByShipmentId(shipmentId: string) {
    return db
      .select()
      .from(warehouseTaskTable)
      .where(and(eq(warehouseTaskTable.shipmentId, shipmentId), isNull(warehouseTaskTable.deletedAt)));
  }

  async create(data: { taskId: string; shipmentId?: string; type?: string; priority?: string; status?: string }) {
    const [row] = await db.insert(warehouseTaskTable).values(data).returning();
    return row!;
  }

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(warehouseTaskTable)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(eq(warehouseTaskTable.id, id))
      .returning();
    return row ?? null;
  }

  async softDelete(id: string) {
    const [row] = await db
      .update(warehouseTaskTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(warehouseTaskTable.id, id))
      .returning();
    return row ?? null;
  }
}

export const warehouseTaskRepository = new WarehouseTaskRepository();
