import { eq, and, isNull, isNotNull, asc, inArray } from "drizzle-orm";
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

  /** Document types present on each shipment — powers the Customs "received" ticks. */
  async documentTypesByShipmentIds(shipmentIds: string[], companyId: string) {
    if (shipmentIds.length === 0) return [];
    return db
      .select({
        shipmentId: shipmentAttachmentTable.shipmentId,
        documentType: shipmentAttachmentTable.documentType,
      })
      .from(shipmentAttachmentTable)
      .where(and(
        eq(shipmentAttachmentTable.companyId, companyId),
        inArray(shipmentAttachmentTable.shipmentId, shipmentIds),
        isNull(shipmentAttachmentTable.deletedAt),
      ));
  }

  /** Files sent through the shipment's chat, oldest first. */
  async listChatFilesByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select({
        id: shipmentAttachmentTable.id,
        commentId: shipmentAttachmentTable.commentId,
        fileName: shipmentAttachmentTable.fileName,
        fileSize: shipmentAttachmentTable.fileSize,
        fileType: shipmentAttachmentTable.fileType,
      })
      .from(shipmentAttachmentTable)
      .where(and(
        eq(shipmentAttachmentTable.companyId, companyId),
        eq(shipmentAttachmentTable.shipmentId, shipmentId),
        isNotNull(shipmentAttachmentTable.commentId),
        isNull(shipmentAttachmentTable.deletedAt),
      ))
      .orderBy(asc(shipmentAttachmentTable.createdAt));
  }

  /** Ids of the files sent with one chat message. */
  async listIdsByCommentId(commentId: string, companyId: string) {
    const rows = await db
      .select({ id: shipmentAttachmentTable.id })
      .from(shipmentAttachmentTable)
      .where(and(
        eq(shipmentAttachmentTable.companyId, companyId),
        eq(shipmentAttachmentTable.commentId, commentId),
        isNull(shipmentAttachmentTable.deletedAt),
      ));
    return rows.map((r) => r.id);
  }

  /**
   * Ties already-uploaded files to the chat message they were sent with. Scoped
   * to the shipment and to files not yet sent, so a message can neither claim
   * another shipment's file nor steal one from an earlier message.
   */
  async linkToComment(ids: string[], commentId: string, shipmentId: string, companyId: string) {
    if (ids.length === 0) return;
    await db
      .update(shipmentAttachmentTable)
      .set({ commentId, updatedAt: new Date() })
      .where(and(
        eq(shipmentAttachmentTable.companyId, companyId),
        eq(shipmentAttachmentTable.shipmentId, shipmentId),
        inArray(shipmentAttachmentTable.id, ids),
        isNull(shipmentAttachmentTable.commentId),
        isNull(shipmentAttachmentTable.deletedAt),
      ));
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

  async create(data: { companyId: string; shipmentId: string; fileName: string; fileSize: number; fileType: string; storageKey: string; documentType?: string; uploadedById?: string | null }) {
    const [row] = await db.insert(shipmentAttachmentTable).values(data).returning();
    return row!;
  }

  /** Partial update of an attachment's classification / customs review. */
  async update(
    id: string,
    companyId: string,
    data: Partial<{
      documentType: string;
      customsStatus: string;
      customsNote: string;
      customsReviewedAt: Date | null;
      customsReviewedById: string | null;
    }>,
  ) {
    const [row] = await db
      .update(shipmentAttachmentTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(shipmentAttachmentTable.id, id), eq(shipmentAttachmentTable.companyId, companyId), isNull(shipmentAttachmentTable.deletedAt)))
      .returning();
    return row ?? null;
  }

  async delete(id: string, companyId: string) {
    await db
      .update(shipmentAttachmentTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shipmentAttachmentTable.id, id), eq(shipmentAttachmentTable.companyId, companyId), isNull(shipmentAttachmentTable.deletedAt)));
  }
}

export const shipmentAttachmentRepository = new ShipmentAttachmentRepository();
