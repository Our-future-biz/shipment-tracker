import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentAttachmentTable } from "../schemas/shipmentAttachment.schema";

class ShipmentAttachmentRepository {
  async listByShipmentId(shipmentId: string) {
    return db
      .select()
      .from(shipmentAttachmentTable)
      .where(and(eq(shipmentAttachmentTable.shipmentId, shipmentId), isNull(shipmentAttachmentTable.deletedAt)))
      .orderBy(asc(shipmentAttachmentTable.createdAt));
  }

  async create(data: { shipmentId: string; fileName: string; fileSize: number; fileType: string; storageKey: string }) {
    const [row] = await db.insert(shipmentAttachmentTable).values(data).returning();
    return row!;
  }

  async delete(id: string) {
    await db
      .update(shipmentAttachmentTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(shipmentAttachmentTable.id, id));
  }
}

export const shipmentAttachmentRepository = new ShipmentAttachmentRepository();
