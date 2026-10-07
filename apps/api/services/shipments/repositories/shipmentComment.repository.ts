import { eq, and, isNull, asc, desc, sql } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentCommentTable } from "../schemas/shipmentComment.schema";
import { shipmentCommentReadTable } from "../schemas/shipmentCommentRead.schema";
import { shipmentTable } from "../schemas/shipment.schema";

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

  async create(data: { companyId: string; shipmentId: string; authorId: string; message: string; mentionedUserIds?: string[] }) {
    const [row] = await db.insert(shipmentCommentTable).values(data).returning();
    return row!;
  }

  // Messages per shipment that landed after the user last opened that chat (their own don't count).
  async unreadCounts(companyId: string, userId: string) {
    const read = db
      .select({ shipmentId: shipmentCommentReadTable.shipmentId, readAt: shipmentCommentReadTable.readAt })
      .from(shipmentCommentReadTable)
      .where(and(eq(shipmentCommentReadTable.companyId, companyId), eq(shipmentCommentReadTable.userId, userId)))
      .as("read");

    return db
      .select({ shipmentId: shipmentCommentTable.shipmentId, unread: sql<number>`count(*)::int` })
      .from(shipmentCommentTable)
      .leftJoin(read, eq(read.shipmentId, shipmentCommentTable.shipmentId))
      .where(
        and(
          eq(shipmentCommentTable.companyId, companyId),
          isNull(shipmentCommentTable.deletedAt),
          sql`${shipmentCommentTable.authorId} <> ${userId}`,
          sql`(${read.readAt} is null or ${shipmentCommentTable.createdAt} > ${read.readAt})`,
        ),
      )
      .groupBy(shipmentCommentTable.shipmentId);
  }

  // Messages that tag the user and landed after they last opened that shipment's chat.
  async unreadMentions(companyId: string, userId: string) {
    const read = db
      .select({ shipmentId: shipmentCommentReadTable.shipmentId, readAt: shipmentCommentReadTable.readAt })
      .from(shipmentCommentReadTable)
      .where(and(eq(shipmentCommentReadTable.companyId, companyId), eq(shipmentCommentReadTable.userId, userId)))
      .as("read");

    return db
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
  async lastReadByOthers(companyId: string, userId: string, shipmentId: string) {
    const [row] = await db
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
  async markRead(companyId: string, userId: string, shipmentId: string) {
    await db
      .insert(shipmentCommentReadTable)
      .values({ companyId, userId, shipmentId, readAt: new Date() })
      .onConflictDoUpdate({
        target: [shipmentCommentReadTable.userId, shipmentCommentReadTable.shipmentId],
        set: { readAt: new Date(), updatedAt: new Date() },
      });
  }

  async delete(id: string, companyId: string) {
    await db
      .update(shipmentCommentTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shipmentCommentTable.id, id), eq(shipmentCommentTable.companyId, companyId), isNull(shipmentCommentTable.deletedAt)));
  }
}

export const shipmentCommentRepository = new ShipmentCommentRepository();
