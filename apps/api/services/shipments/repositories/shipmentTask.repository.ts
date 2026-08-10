import { eq, and } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentTaskTable } from "../schemas/shipmentTask.schema";

class ShipmentTaskRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(shipmentTaskTable)
      .where(and(eq(shipmentTaskTable.companyId, companyId), eq(shipmentTaskTable.shipmentId, shipmentId)));
  }

  async upsert(shipmentId: string, companyId: string, taskKey: string, completed: boolean, completedById?: string) {
    const [existing] = await db
      .select()
      .from(shipmentTaskTable)
      .where(and(
        eq(shipmentTaskTable.companyId, companyId),
        eq(shipmentTaskTable.shipmentId, shipmentId),
        eq(shipmentTaskTable.taskKey, taskKey),
      ))
      .limit(1);

    if (existing) {
      if (existing.completed) return existing;
      const [row] = await db
        .update(shipmentTaskTable)
        .set({
          completed,
          completedAt: completed ? new Date() : null,
          completedById: completedById ?? null,
          updatedAt: new Date(),
        })
        .where(eq(shipmentTaskTable.id, existing.id))
        .returning();
      return row!;
    }

    const [row] = await db.insert(shipmentTaskTable).values({
      companyId,
      shipmentId,
      taskKey,
      completed,
      completedAt: completed ? new Date() : null,
      completedById: completedById ?? null,
    }).returning();
    return row!;
  }
}

export const shipmentTaskRepository = new ShipmentTaskRepository();
