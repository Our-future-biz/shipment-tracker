import { eq, and, gt, inArray, isNull, ne, or, asc, desc, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentCommentTable, type ShipmentCommentRecord } from "../schemas/shipmentComment.schema";
import { shipmentCommentReadTable } from "../schemas/shipmentCommentRead.schema";
import { shipmentTable } from "../schemas/shipment.schema";
import { shipmentAuditRepository } from "./shipmentAudit.repository";

class ShipmentCommentRepository extends TenantRepository<typeof shipmentCommentTable> {
  constructor() {
    super(db, shipmentCommentTable, "shipment_comment");
  }

  /**
   * A message with a line in the shipment's history, written together or not at all (the
   * warehouse's Inform Operations: its chat message and the record the Alerts tab reads). The
   * history line is made from the new message's id.
   */
  async createWithHistory(
    companyId: string,
    comment: { shipmentId: string; authorId: string; message: string; mentionedUserIds: string[] },
    history: (commentId: string) => { field: string; oldValue: string | null; newValue: string | null },
  ): Promise<ShipmentCommentRecord> {
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(shipmentCommentTable).values({ ...comment, companyId }).returning();
      await shipmentAuditRepository.create({ companyId, shipmentId: comment.shipmentId, userId: comment.authorId, ...history(row!.id) }, tx);
      return row!;
    });
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
  // don't count, unless they tag them).
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
          // Others' messages, and the user's own ones that tag them (a notice posted for their click).
          sql`(${shipmentCommentTable.authorId} <> ${userId} or ${shipmentCommentTable.mentionedUserIds} @> ARRAY[${userId}::uuid])`,
          sql`(${read.readAt} is null or ${shipmentCommentTable.createdAt} > ${read.readAt})`,
        ),
      )
      .groupBy(shipmentCommentTable.shipmentId);
  }

  // Messages that tag the user: those that landed after they last opened that shipment's chat
  // (unread), and read ones written in the last `keepReadDays` days. Only the last opening of a
  // chat is stored, not when each message was read, so a read one is kept by its own date.
  async unreadMentions(companyId: string, userId: string, keepReadDays = 0) {
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
        readAt: read.readAt,
      })
      .from(shipmentCommentTable)
      .innerJoin(shipmentTable, eq(shipmentTable.id, shipmentCommentTable.shipmentId))
      .leftJoin(read, eq(read.shipmentId, shipmentCommentTable.shipmentId))
      .where(
        and(
          eq(shipmentCommentTable.companyId, companyId),
          isNull(shipmentCommentTable.deletedAt),
          isNull(shipmentTable.deletedAt),
          // @> (contains), not = ANY: only this form can use the GIN index on the tags.
          sql`${shipmentCommentTable.mentionedUserIds} @> ARRAY[${userId}::uuid]`,
          sql`(${read.readAt} is null or ${shipmentCommentTable.createdAt} > ${read.readAt} or ${shipmentCommentTable.createdAt} > now() - make_interval(days => ${keepReadDays}))`,
        ),
      )
      .orderBy(desc(shipmentCommentTable.createdAt))
      .limit(100);
  }

  /**
   * The chat lines of these shipments that tag one of `userIds` who has not opened that chat since
   * (no read mark, or an older one - as unreadMentions counts for the bell): one row per line and
   * tagged user. For Shipments → Managers' "@mention unread" (lib/managersCockpitTeam), which asks
   * about the jobs' Handled By and Holiday Cover only - `userIds` are theirs. A line that tags its
   * own writer (a notice the app posts in the name of who caused it) is left out: nobody is waited
   * for to read what they did themselves. So is a line its writer crossed out: it asks nothing any more.
   *
   * The lines are found by the shipments (shipment_id) and kept only when they tag somebody; each
   * tag is then looked up in the read marks by its unique (user_id, shipment_id).
   */
  async unreadMentionsByShipmentIds(shipmentIds: readonly string[], companyId: string, userIds: readonly string[]): Promise<{ shipmentId: string; userId: string; createdAt: Date }[]> {
    if (shipmentIds.length === 0 || userIds.length === 0) return [];
    const c = shipmentCommentTable;
    const r = shipmentCommentReadTable;
    // One row per tag of a line: the tagged user beside the line. Named apart from the read mark's
    // user_id: the column is written without its table, and two of one name would be one too many.
    const tagged = this.db
      .select({ shipmentId: c.shipmentId, createdAt: c.createdAt, authorId: c.authorId, userId: sql<string>`unnest(${c.mentionedUserIds})`.as("tagged_user_id") })
      .from(c)
      .where(and(eq(c.companyId, companyId), inArray(c.shipmentId, [...shipmentIds]), isNull(c.deletedAt), isNull(c.struckAt), sql`cardinality(${c.mentionedUserIds}) > 0`))
      .as("tagged");
    return this.db
      .select({ shipmentId: tagged.shipmentId, userId: tagged.userId, createdAt: tagged.createdAt })
      .from(tagged)
      .leftJoin(r, and(eq(r.companyId, companyId), eq(r.shipmentId, tagged.shipmentId), eq(r.userId, tagged.userId)))
      .where(and(inArray(tagged.userId, [...userIds]), ne(tagged.authorId, tagged.userId), or(isNull(r.readAt), gt(tagged.createdAt, r.readAt))));
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
}

export const shipmentCommentRepository = new ShipmentCommentRepository();
