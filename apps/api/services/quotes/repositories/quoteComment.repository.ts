import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { quoteCommentReadTable, quoteCommentTable, type QuoteCommentRecord } from "../schemas/quoteComment.schema";
import { quoteAttachmentTable } from "../schemas/quoteAttachment.schema";
import { quoteTable } from "../schemas/quote.schema";

const c = quoteCommentTable;
const r = quoteCommentReadTable;
const f = quoteAttachmentTable;

/**
 * The thread still has a live sales quote: its original reference, or one of its revisions
 * (QCZ…001-R2). A thread whose quotes were all deleted opens nowhere, so its messages count as
 * neither unread nor mentions - they would stay in the bell for good, with no chat to open and
 * mark them read in.
 */
export const threadAliveSql = sql`exists (select 1 from ${quoteTable} where ${quoteTable.companyId} = ${c.companyId} and ${quoteTable.deletedAt} is null and (${quoteTable.quoteNumber} = ${c.threadRef} or ${quoteTable.quoteNumber} like ${c.threadRef} || '-R%'))`;

// The quotes' chat (one thread per original Sales Reference, see quoteComment.schema): its
// messages, how far each user has read a thread, and the files sent in it (quote_attachment rows
// with a comment). The same queries as the shipments chat, keyed by the thread instead.
class QuoteCommentRepository extends TenantRepository<typeof quoteCommentTable> {
  constructor() {
    super(db, quoteCommentTable, "quote_comment");
  }

  /** Every message of a thread, oldest first: no time or count limit. */
  async listByThread(companyId: string, threadRef: string): Promise<QuoteCommentRecord[]> {
    return this.db
      .select()
      .from(c)
      .where(and(eq(c.companyId, companyId), eq(c.threadRef, threadRef), isNull(c.deletedAt)))
      .orderBy(asc(c.createdAt));
  }

  /** The files sent in a thread's messages. */
  async listChatFiles(companyId: string, threadRef: string) {
    return this.db
      .select({ id: f.id, commentId: f.commentId, fileName: f.fileName, fileSize: f.fileSize, fileType: f.fileType })
      .from(f)
      .where(and(eq(f.companyId, companyId), eq(f.quoteNumber, threadRef), sql`${f.commentId} IS NOT NULL`, isNull(f.deletedAt)))
      .orderBy(asc(f.createdAt));
  }

  /** A file uploaded for a thread's next message, not sent yet. */
  async createFile(companyId: string, threadRef: string, file: { fileName: string; fileSize: number; fileType: string; storageKey: string }) {
    const [row] = await this.db.insert(f).values({ companyId, quoteNumber: threadRef, ...file }).returning();
    return row!;
  }

  /** Ties uploaded files to the message they were sent with (only files of this thread not sent before). */
  async linkFiles(companyId: string, threadRef: string, fileIds: string[], commentId: string) {
    if (!fileIds.length) return;
    await this.db
      .update(f)
      .set({ commentId, updatedAt: new Date() })
      .where(and(eq(f.companyId, companyId), eq(f.quoteNumber, threadRef), inArray(f.id, fileIds), isNull(f.commentId), isNull(f.deletedAt)));
  }

  /** A file of a thread's message, for its download link. */
  async getFile(companyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(f)
      .where(and(eq(f.companyId, companyId), eq(f.id, id), sql`${f.commentId} IS NOT NULL`, isNull(f.deletedAt)));
    return row ?? null;
  }

  // Messages per thread that landed after the user last opened it (their own don't count).
  async unreadCounts(companyId: string, userId: string): Promise<{ threadRef: string; unread: number }[]> {
    const read = this.db
      .select({ threadRef: r.threadRef, readAt: r.readAt })
      .from(r)
      .where(and(eq(r.companyId, companyId), eq(r.userId, userId)))
      .as("read");
    return this.db
      .select({ threadRef: c.threadRef, unread: sql<number>`count(*)::int` })
      .from(c)
      .leftJoin(read, eq(read.threadRef, c.threadRef))
      .where(
        and(
          eq(c.companyId, companyId),
          isNull(c.deletedAt),
          threadAliveSql,
          sql`${c.authorId} <> ${userId}`,
          sql`(${read.readAt} is null or ${c.createdAt} > ${read.readAt})`,
        ),
      )
      .groupBy(c.threadRef);
  }

  // Messages that tag the user: unread ones, and read ones written in the last `keepReadDays`
  // days (the bell keeps them that long; as the shipments chat, only the last opening is stored).
  async mentions(companyId: string, userId: string, keepReadDays: number) {
    const read = this.db
      .select({ threadRef: r.threadRef, readAt: r.readAt })
      .from(r)
      .where(and(eq(r.companyId, companyId), eq(r.userId, userId)))
      .as("read");
    return this.db
      .select({ id: c.id, threadRef: c.threadRef, quoteNumber: c.quoteNumber, authorId: c.authorId, message: c.message, createdAt: c.createdAt, readAt: read.readAt })
      .from(c)
      .leftJoin(read, eq(read.threadRef, c.threadRef))
      .where(
        and(
          eq(c.companyId, companyId),
          isNull(c.deletedAt),
          threadAliveSql,
          sql`${c.mentionedUserIds} @> ARRAY[${userId}::uuid]`,
          sql`(${read.readAt} is null or ${c.createdAt} > ${read.readAt} or ${c.createdAt} > now() - make_interval(days => ${keepReadDays}))`,
        ),
      )
      .orderBy(desc(c.createdAt))
      .limit(100);
  }

  // When a colleague (anyone but the given user) last opened this thread.
  async lastReadByOthers(companyId: string, userId: string, threadRef: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ readAt: sql<Date | null>`max(${r.readAt})` })
      .from(r)
      .where(and(eq(r.companyId, companyId), eq(r.threadRef, threadRef), sql`${r.userId} <> ${userId}`));
    return row?.readAt ? new Date(row.readAt) : null;
  }

  // Marks a thread as read up to now.
  async markRead(companyId: string, userId: string, threadRef: string): Promise<void> {
    const now = new Date();
    await this.db
      .insert(r)
      .values({ companyId, userId, threadRef, readAt: now })
      .onConflictDoUpdate({ target: [r.companyId, r.userId, r.threadRef], set: { readAt: now, updatedAt: now } });
  }

  /** Only the author deletes a message (it is kept, marked deleted), with its files. Whether one was deleted. */
  async deleteOwn(companyId: string, threadRef: string, id: string, authorId: string): Promise<boolean> {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(c)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(c.id, id), eq(c.companyId, companyId), eq(c.threadRef, threadRef), eq(c.authorId, authorId), isNull(c.deletedAt)))
        .returning({ id: c.id });
      if (!rows.length) return false;
      await tx.update(f).set({ deletedAt: now, updatedAt: now }).where(and(eq(f.companyId, companyId), eq(f.commentId, id), isNull(f.deletedAt)));
      return true;
    });
  }
}

export const quoteCommentRepository = new QuoteCommentRepository();
