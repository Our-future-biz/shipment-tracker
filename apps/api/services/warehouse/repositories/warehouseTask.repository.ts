import { eq, desc, isNull, and } from "drizzle-orm";
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
