import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentAttachmentTable } from "../schemas/shipmentAttachment.schema";

class ShipmentAttachmentRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(shipmentAttachmentTable)
      .where(and(
        eq(shipmentAttachmentTable.companyId, companyId),
        eq(shipmentAttachmentTable.shipmentId, shipmentId),
        isNull(shipmentAttachmentTable.deletedAt),
      ))
      .orderBy(asc(shipmentAttachmentTable.createdAt));
  }

  // Company-agnostic lookup for the PUBLIC raw content endpoint (bare-URL download that
  // carries no token). The caller must still verify the attachment's shipmentId matches
  // the shipmentId in the request path.
  async getById(id: string) {
    const [row] = await db
      .select()
      .from(shipmentAttachmentTable)
      .where(and(eq(shipmentAttachmentTable.id, id), isNull(shipmentAttachmentTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async getByIdForCompany(id: string, companyId: string) {
    const [row] = await db
      .select()
      .from(shipmentAttachmentTable)
      .where(and(eq(shipmentAttachmentTable.id, id), eq(shipmentAttachmentTable.companyId, companyId), isNull(shipmentAttachmentTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async create(data: { companyId: string; shipmentId: string; fileName: string; fileSize: number; fileType: string; storageKey: string }) {
    const [row] = await db.insert(shipmentAttachmentTable).values(data).returning();
    return row!;
  }

  async delete(id: string, companyId: string) {
    await db
      .update(shipmentAttachmentTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shipmentAttachmentTable.id, id), eq(shipmentAttachmentTable.companyId, companyId), isNull(shipmentAttachmentTable.deletedAt)));
  }
}

export const shipmentAttachmentRepository = new ShipmentAttachmentRepository();
