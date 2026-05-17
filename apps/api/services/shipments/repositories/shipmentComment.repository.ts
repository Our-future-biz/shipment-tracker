import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentCommentTable } from "../schemas/shipmentComment.schema";

class ShipmentCommentRepository {
  async listByShipmentId(shipmentId: string) {
    return db
      .select()
      .from(shipmentCommentTable)
      .where(and(eq(shipmentCommentTable.shipmentId, shipmentId), isNull(shipmentCommentTable.deletedAt)))
      .orderBy(asc(shipmentCommentTable.createdAt));
  }

  async create(data: { shipmentId: string; authorId: string; message: string }) {
    const [row] = await db.insert(shipmentCommentTable).values(data).returning();
    return row!;
  }

  async delete(id: string) {
    await db
      .update(shipmentCommentTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(shipmentCommentTable.id, id));
  }
}

export const shipmentCommentRepository = new ShipmentCommentRepository();
