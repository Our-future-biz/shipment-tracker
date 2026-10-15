import { eq, and, isNull, asc, desc, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentCommentTable, type ShipmentCommentRecord } from "../schemas/shipmentComment.schema";
import { shipmentCommentReadTable } from "../schemas/shipmentCommentRead.schema";
import { shipmentTable } from "../schemas/shipment.schema";

class ShipmentCommentRepository extends TenantRepository<typeof shipmentCommentTable> {
  constructor() {
    super(db, shipmentCommentTable, "shipment_comment");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<ShipmentCommentRecord[]> {
    return this.db
      .select()
      .from(shipmentCommentTable)
      .where(and(
        eq(shipmentCommentTable.companyId, companyId),
        eq(shipmentCommentTable.shipmentId, shipmentId),
        isNull(shipmentCommentTable.deletedAt),
      ))
      .orderBy(asc(shipmentCommentTable.createdAt));
  }

  // Messages per live shipment that landed after the user last opened that chat (their own
  // don't count).
  async unreadCounts(companyId: string, userId: string): Promise<{ shipmentId: string; unread: number }[]> {
    const read = this.db
      .select({ shipmentId: shipmentCommentReadTable.shipmentId, readAt: shipmentCommentReadTable.readAt })
      .from(shipmentCommentReadTable)
      .where(and(eq(shipmentCommentReadTable.companyId, companyId), eq(shipmentCommentReadTable.userId, userId)))
      .as("read");

    return this.db
      .select({ shipmentId: shipmentCommentTable.shipmentId, unread: sql<number>`count(*)::int` })
      .from(shipmentCommentTable)
      .innerJoin(shipmentTable, eq(shipmentTable.id, shipmentCommentTable.shipmentId))
      .leftJoin(read, eq(read.shipmentId, shipmentCommentTable.shipmentId))
      .where(
        and(
          eq(shipmentCommentTable.companyId, companyId),
          isNull(shipmentCommentTable.deletedAt),
          isNull(shipmentTable.deletedAt),
          sql`${shipmentCommentTable.authorId} <> ${userId}`,
          sql`(${read.readAt} is null or ${shipmentCommentTable.createdAt} > ${read.readAt})`,
        ),
      )
      .groupBy(shipmentCommentTable.shipmentId);
  }

  // Messages that tag the user and landed after they last opened that shipment's chat.
  async unreadMentions(companyId: string, userId: string) {
    const read = this.db
      .select({ shipmentId: shipmentCommentReadTable.shipmentId, readAt: shipmentCommentReadTable.readAt })
      .from(shipmentCommentReadTable)
      .where(and(eq(shipmentCommentReadTable.companyId, companyId), eq(shipmentCommentReadTable.userId, userId)))
      .as("read");

    return this.db
      .select({
        id: shipmentCommentTable.id,
        shipmentId: shipmentCommentTable.shipmentId,
        jobNumber: shipmentTable.jobNumber,
        authorId: shipmentCommentTable.authorId,
        message: shipmentCommentTable.message,
        createdAt: shipmentCommentTable.createdAt,
      })
      .from(shipmentCommentTable)
      .innerJoin(shipmentTable, eq(shipmentTable.id, shipmentCommentTable.shipmentId))
      .leftJoin(read, eq(read.shipmentId, shipmentCommentTable.shipmentId))
      .where(
        and(
          eq(shipmentCommentTable.companyId, companyId),
          isNull(shipmentCommentTable.deletedAt),
          isNull(shipmentTable.deletedAt),
          sql`${userId}::uuid = ANY(${shipmentCommentTable.mentionedUserIds})`,
          sql`(${read.readAt} is null or ${shipmentCommentTable.createdAt} > ${read.readAt})`,
        ),
      )
      .orderBy(desc(shipmentCommentTable.createdAt))
      .limit(50);
  }

  // When a colleague (anyone but the given user) last opened this shipment's chat.
  async lastReadByOthers(companyId: string, userId: string, shipmentId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ readAt: sql<Date | null>`max(${shipmentCommentReadTable.readAt})` })
      .from(shipmentCommentReadTable)
      .where(
        and(
          eq(shipmentCommentReadTable.companyId, companyId),
          eq(shipmentCommentReadTable.shipmentId, shipmentId),
          sql`${shipmentCommentReadTable.userId} <> ${userId}`,
        ),
      );
    return row?.readAt ? new Date(row.readAt) : null;
  }

  // Marks the chat of one shipment as read up to now.
  async markRead(companyId: string, userId: string, shipmentId: string): Promise<void> {
    await this.db
      .insert(shipmentCommentReadTable)
      .values({ companyId, userId, shipmentId, readAt: new Date() })
      .onConflictDoUpdate({
        target: [shipmentCommentReadTable.userId, shipmentCommentReadTable.shipmentId],
        set: { readAt: new Date(), updatedAt: new Date() },
      });
  }

  /** Only the author can delete a message. Returns whether one was deleted. */
  async deleteOwn(id: string, companyId: string, authorId: string): Promise<boolean> {
    const rows = await this.db
      .update(shipmentCommentTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(shipmentCommentTable.id, id),
        eq(shipmentCommentTable.companyId, companyId),
        eq(shipmentCommentTable.authorId, authorId),
        isNull(shipmentCommentTable.deletedAt),
      ))
      .returning({ id: shipmentCommentTable.id });
    return rows.length > 0;
  }
}

export const shipmentCommentRepository = new ShipmentCommentRepository();
