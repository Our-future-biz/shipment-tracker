import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentCommentTable } from "../schemas/shipmentComment.schema";

class ShipmentCommentRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(shipmentCommentTable)
      .where(and(
        eq(shipmentCommentTable.companyId, companyId),
        eq(shipmentCommentTable.shipmentId, shipmentId),
        isNull(shipmentCommentTable.deletedAt),
      ))
      .orderBy(asc(shipmentCommentTable.createdAt));
  }

  async create(data: { companyId: string; shipmentId: string; authorId: string; message: string }) {
    const [row] = await db.insert(shipmentCommentTable).values(data).returning();
    return row!;
  }

  async delete(id: string, companyId: string) {
    await db
      .update(shipmentCommentTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shipmentCommentTable.id, id), eq(shipmentCommentTable.companyId, companyId), isNull(shipmentCommentTable.deletedAt)));
  }
}

export const shipmentCommentRepository = new ShipmentCommentRepository();
