import { eq, and, isNull, isNotNull, asc, inArray } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import {
  shipmentAttachmentTable,
  type NewShipmentAttachmentRecord,
  type ShipmentAttachmentRecord,
} from "../schemas/shipmentAttachment.schema";

/** The review/classification columns an attachment update may change. */
export type AttachmentUpdate = Partial<
  Pick<NewShipmentAttachmentRecord, "documentType" | "customsStatus" | "customsNote" | "customsReviewedAt" | "customsReviewedById">
>;

class ShipmentAttachmentRepository extends TenantRepository<typeof shipmentAttachmentTable> {
  constructor() {
    super(db, shipmentAttachmentTable, "shipment_attachment");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<ShipmentAttachmentRecord[]> {
    return this.db
      .select()
      .from(shipmentAttachmentTable)
      .where(and(
        eq(shipmentAttachmentTable.companyId, companyId),
        eq(shipmentAttachmentTable.shipmentId, shipmentId),
        isNull(shipmentAttachmentTable.deletedAt),
      ))
      .orderBy(asc(shipmentAttachmentTable.createdAt));
  }

  /**
   * Document types present on each shipment, with their customs review — powers the Customs
   * "received" ticks and the customs status that follows the paperwork.
   */
  async documentTypesByShipmentIds(shipmentIds: string[], companyId: string) {
    if (shipmentIds.length === 0) return [];
    return this.db
      .select({
        shipmentId: shipmentAttachmentTable.shipmentId,
        documentType: shipmentAttachmentTable.documentType,
        customsStatus: shipmentAttachmentTable.customsStatus,
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
    return this.db
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
    const rows = await this.db
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
    await this.db
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

  /** One file of a shipment (also checks the file belongs to that shipment). */
  async getForShipment(id: string, shipmentId: string, companyId: string): Promise<ShipmentAttachmentRecord | null> {
    const [row] = await this.db
      .select()
      .from(shipmentAttachmentTable)
      .where(
        and(
          eq(shipmentAttachmentTable.id, id),
          eq(shipmentAttachmentTable.shipmentId, shipmentId),
          eq(shipmentAttachmentTable.companyId, companyId),
          isNull(shipmentAttachmentTable.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Partial update of an attachment's classification / customs review. */
  async updateReview(id: string, shipmentId: string, companyId: string, data: AttachmentUpdate): Promise<ShipmentAttachmentRecord | null> {
    const [row] = await this.db
      .update(shipmentAttachmentTable)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(shipmentAttachmentTable.id, id),
          eq(shipmentAttachmentTable.shipmentId, shipmentId),
          eq(shipmentAttachmentTable.companyId, companyId),
          isNull(shipmentAttachmentTable.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  }
}

export const shipmentAttachmentRepository = new ShipmentAttachmentRepository();
