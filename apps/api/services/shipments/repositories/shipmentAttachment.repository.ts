import type { PgColumn } from "drizzle-orm/pg-core";
import { eq, and, desc, gte, isNull, isNotNull, asc, inArray, ne, or, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import {
  shipmentAttachmentTable,
  type NewShipmentAttachmentRecord,
  type ShipmentAttachmentRecord,
} from "../schemas/shipmentAttachment.schema";
import { shipmentAlertReadTable } from "../schemas/shipmentAlertRead.schema";
import { shipmentTable } from "../schemas/shipment.schema";

// A person as a shipment names them: by e-mail, an old value with a name after it ("a@b.cz — Name").
const namedEmail = (column: PgColumn) => sql`lower(trim(split_part(${column}, ' — ', 1)))`;

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
  /** The files stay, in the Documents tab, when the message they came with goes. */
  async unlinkFromComment(commentId: string, companyId: string) {
    await this.db
      .update(shipmentAttachmentTable)
      .set({ commentId: null, updatedAt: new Date() })
      .where(and(eq(shipmentAttachmentTable.companyId, companyId), eq(shipmentAttachmentTable.commentId, commentId), isNull(shipmentAttachmentTable.deletedAt)));
  }

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

  /** The live file another module handed over as `sourceRef`. */
  async findBySourceRef(shipmentId: string, companyId: string, sourceRef: string): Promise<ShipmentAttachmentRecord | null> {
    const [row] = await this.db
      .select()
      .from(shipmentAttachmentTable)
      .where(and(eq(shipmentAttachmentTable.companyId, companyId), eq(shipmentAttachmentTable.shipmentId, shipmentId), eq(shipmentAttachmentTable.sourceRef, sourceRef), isNull(shipmentAttachmentTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** Adds a handed-over file unless one with its `sourceRef` is there; whether it did. */
  async addOnce(row: NewShipmentAttachmentRecord): Promise<boolean> {
    const added = await this.db.insert(shipmentAttachmentTable).values(row).onConflictDoNothing().returning({ id: shipmentAttachmentTable.id });
    return added.length > 0;
  }

  /**
   * Customs' verdicts for the bell, newest first: on the live shipments this user is the Person in
   * Charge or Holiday Cover of, not given by themselves, since `since`; of those read (opened the
   * shipment's Alerts after them), only the ones since `readSince`.
   */
  async customsVerdictsFor(companyId: string, userId: string, email: string, since: Date, readSince: Date, limit: number) {
    const a = shipmentAttachmentTable;
    const read = shipmentAlertReadTable;
    return this.db
      .select({
        id: a.id,
        shipmentId: a.shipmentId,
        jobNumber: shipmentTable.jobNumber,
        fileName: a.fileName,
        documentType: a.documentType,
        status: a.customsStatus,
        note: a.customsNote,
        reviewedAt: a.customsReviewedAt,
        reviewedById: a.customsReviewedById,
        readAt: read.readAt,
      })
      .from(a)
      .innerJoin(shipmentTable, eq(shipmentTable.id, a.shipmentId))
      .leftJoin(read, and(eq(read.shipmentId, a.shipmentId), eq(read.userId, userId)))
      .where(
        and(
          eq(a.companyId, companyId),
          isNull(a.deletedAt),
          isNull(shipmentTable.deletedAt),
          inArray(a.customsStatus, ["approved", "declined"]),
          gte(a.customsReviewedAt, since),
          or(isNull(a.customsReviewedById), ne(a.customsReviewedById, userId)),
          or(sql`${namedEmail(shipmentTable.personInCharge)} = ${email}`, sql`${namedEmail(shipmentTable.holidayCover)} = ${email}`),
          or(isNull(read.readAt), sql`${a.customsReviewedAt} > ${read.readAt}`, gte(a.customsReviewedAt, readSince)),
        ),
      )
      .orderBy(desc(a.customsReviewedAt))
      .limit(limit);
  }
}

export const shipmentAttachmentRepository = new ShipmentAttachmentRepository();
