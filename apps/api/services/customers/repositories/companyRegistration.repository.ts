import { and, asc, desc, eq, gte, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import {
  companyApprovalMessageTable,
  companyApprovalParticipantTable,
  companyRegistrationLinkTable,
  companyRegistrationSettingsTable,
  companyRegistrationTable,
  type CompanyRegistrationRecord,
  type NewCompanyRegistrationRecord,
} from "../schemas/companyRegistration.schema";
import { customerTable } from "../schemas/customer.schema";
import type { CustomerRole } from "../interfaces/interfaces";

export type RegistrationAnswer = { status: "approved" | "declined"; by: string; byUserId: string; comment: string };

class CompanyRegistrationRepository {
  // ─── Settings ─────────────────────────────────────────────
  async settings(companyId: string) {
    const [row] = await db.select().from(companyRegistrationSettingsTable).where(eq(companyRegistrationSettingsTable.companyId, companyId));
    return row ?? null;
  }

  async saveSettings(companyId: string, values: { termsName: string; termsUrl: string }) {
    await db
      .insert(companyRegistrationSettingsTable)
      .values({ companyId, ...values })
      .onConflictDoUpdate({ target: companyRegistrationSettingsTable.companyId, set: { ...values, updatedAt: new Date() } });
  }

  // ─── Links ────────────────────────────────────────────────
  async createLink(values: { companyId: string; tokenHash: string; roles: CustomerRole[]; label: string; createdBy: string; createdByUserId: string; expiresAt: Date }) {
    const [row] = await db.insert(companyRegistrationLinkTable).values(values).returning();
    return row!;
  }

  /** The links that can still be used, newest first. */
  async openLinks(companyId: string, now: Date) {
    return db
      .select()
      .from(companyRegistrationLinkTable)
      .where(
        and(
          eq(companyRegistrationLinkTable.companyId, companyId),
          isNull(companyRegistrationLinkTable.usedAt),
          isNull(companyRegistrationLinkTable.revokedAt),
          gt(companyRegistrationLinkTable.expiresAt, now),
        ),
      )
      .orderBy(desc(companyRegistrationLinkTable.createdAt))
      .limit(200);
  }

  // The public side's two look-ups (this and claim) go by the token's hash alone: the token is the only key
  // a registering company has, and the link it finds says which company it is for.
  async linkByHash(hash: string) {
    const [row] = await db.select().from(companyRegistrationLinkTable).where(eq(companyRegistrationLinkTable.tokenHash, hash));
    return row ?? null;
  }

  async linkById(id: string, companyId: string) {
    const [row] = await db
      .select()
      .from(companyRegistrationLinkTable)
      .where(and(eq(companyRegistrationLinkTable.id, id), eq(companyRegistrationLinkTable.companyId, companyId)));
    return row ?? null;
  }

  /** Cancelled; false when it could no longer be used anyway. */
  async revokeLink(id: string, companyId: string, now: Date): Promise<boolean> {
    const rows = await db
      .update(companyRegistrationLinkTable)
      .set({ revokedAt: now })
      .where(
        and(
          eq(companyRegistrationLinkTable.id, id),
          eq(companyRegistrationLinkTable.companyId, companyId),
          isNull(companyRegistrationLinkTable.usedAt),
          isNull(companyRegistrationLinkTable.revokedAt),
        ),
      )
      .returning({ id: companyRegistrationLinkTable.id });
    return rows.length > 0;
  }

  /** The link taken for this registration: one registration only, however many clicks arrive at once. Null when it can't be used. */
  async claim(hash: string, now: Date) {
    const [row] = await db
      .update(companyRegistrationLinkTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(companyRegistrationLinkTable.tokenHash, hash),
          isNull(companyRegistrationLinkTable.usedAt),
          isNull(companyRegistrationLinkTable.revokedAt),
          gt(companyRegistrationLinkTable.expiresAt, now),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** A registration that failed before anything was written gives the link back. */
  async release(companyId: string, id: string): Promise<void> {
    await db
      .update(companyRegistrationLinkTable)
      .set({ usedAt: null })
      .where(and(eq(companyRegistrationLinkTable.id, id), eq(companyRegistrationLinkTable.companyId, companyId)));
  }

  // ─── Registrations ────────────────────────────────────────
  async insert(values: NewCompanyRegistrationRecord): Promise<CompanyRegistrationRecord> {
    const [row] = await db.insert(companyRegistrationTable).values(values).returning();
    return row!;
  }

  /** What waits, and what was answered since `since`. */
  async forApprovals(companyId: string, since: Date): Promise<CompanyRegistrationRecord[]> {
    return db
      .select()
      .from(companyRegistrationTable)
      .where(and(eq(companyRegistrationTable.companyId, companyId), or(eq(companyRegistrationTable.status, "pending"), gte(companyRegistrationTable.decidedAt, since))))
      .orderBy(desc(companyRegistrationTable.createdAt))
      .limit(500);
  }

  /** A registration of a company already in the database, by its own id. */
  async duplicateById(companyId: string, id: string): Promise<CompanyRegistrationRecord | null> {
    const [row] = await db
      .select()
      .from(companyRegistrationTable)
      .where(and(eq(companyRegistrationTable.id, id), eq(companyRegistrationTable.companyId, companyId), eq(companyRegistrationTable.alreadyInDatabase, true)));
    return row ?? null;
  }

  /** The registration a new company came from. */
  async ofCustomer(companyId: string, customerId: string): Promise<CompanyRegistrationRecord | null> {
    const [row] = await db
      .select()
      .from(companyRegistrationTable)
      .where(and(eq(companyRegistrationTable.customerId, customerId), eq(companyRegistrationTable.companyId, companyId), eq(companyRegistrationTable.alreadyInDatabase, false)));
    return row ?? null;
  }

  /** The answer to a registration that still waits; null when somebody answered first. */
  async answer(companyId: string, id: string, answer: RegistrationAnswer, now: Date): Promise<CompanyRegistrationRecord | null> {
    const [row] = await db
      .update(companyRegistrationTable)
      .set({
        status: answer.status,
        decidedBy: answer.by,
        decidedAt: now,
        comment: answer.comment,
        // A manager answering their own link has seen the answer.
        answerSeenAt: sql`case when ${companyRegistrationTable.requestedByUserId} = ${answer.byUserId} then ${now.toISOString()}::timestamptz else null end`,
      })
      .where(and(eq(companyRegistrationTable.id, id), eq(companyRegistrationTable.companyId, companyId), eq(companyRegistrationTable.status, "pending")))
      .returning();
    return row ?? null;
  }

  /** Back to waiting: an answer that could not be carried out, or a decline taken back. */
  async reopen(companyId: string, id: string): Promise<CompanyRegistrationRecord | null> {
    const [row] = await db
      .update(companyRegistrationTable)
      .set({ status: "pending", decidedBy: "", decidedAt: null, comment: "", answerSeenAt: null })
      .where(and(eq(companyRegistrationTable.id, id), eq(companyRegistrationTable.companyId, companyId), ne(companyRegistrationTable.status, "pending")))
      .returning();
    return row ?? null;
  }

  async markSeen(companyId: string, userId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await db
      .update(companyRegistrationTable)
      .set({ answerSeenAt: new Date() })
      .where(
        and(
          eq(companyRegistrationTable.companyId, companyId),
          inArray(companyRegistrationTable.id, ids),
          eq(companyRegistrationTable.requestedByUserId, userId),
          ne(companyRegistrationTable.status, "pending"),
          isNull(companyRegistrationTable.answerSeenAt),
        ),
      );
  }

  // ─── Chat ─────────────────────────────────────────────────
  /** What a thread is about: its company and who asked. Null when there is no such thread. */
  async thread(companyId: string, threadId: string): Promise<{ companyName: string; requesterUserId: string | null } | null> {
    const [customer] = await db
      .select({ companyName: customerTable.companyName, requesterUserId: customerTable.approvalRequestedByUserId, requestedAt: customerTable.approvalRequestedAt })
      .from(customerTable)
      .where(and(eq(customerTable.id, threadId), eq(customerTable.companyId, companyId)));
    if (customer?.requestedAt) return { companyName: customer.companyName, requesterUserId: customer.requesterUserId };
    const duplicate = await this.duplicateById(companyId, threadId);
    return duplicate ? { companyName: duplicate.companyName, requesterUserId: duplicate.requestedByUserId } : null;
  }

  async messages(companyId: string, threadId: string) {
    return db
      .select()
      .from(companyApprovalMessageTable)
      .where(and(eq(companyApprovalMessageTable.companyId, companyId), eq(companyApprovalMessageTable.threadId, threadId)))
      .orderBy(asc(companyApprovalMessageTable.createdAt))
      .limit(500);
  }

  async addMessage(values: { companyId: string; threadId: string; authorUserId: string | null; author: string; text: string }) {
    const [row] = await db.insert(companyApprovalMessageTable).values(values).returning();
    return row!;
  }

  async members(companyId: string, threadId: string) {
    return db
      .select()
      .from(companyApprovalParticipantTable)
      .where(and(eq(companyApprovalParticipantTable.companyId, companyId), eq(companyApprovalParticipantTable.threadId, threadId), eq(companyApprovalParticipantTable.member, true)))
      .orderBy(asc(companyApprovalParticipantTable.addedAt));
  }

  async isMember(companyId: string, threadId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select({ member: companyApprovalParticipantTable.member })
      .from(companyApprovalParticipantTable)
      .where(
        and(
          eq(companyApprovalParticipantTable.companyId, companyId),
          eq(companyApprovalParticipantTable.threadId, threadId),
          eq(companyApprovalParticipantTable.userId, userId),
        ),
      );
    return !!row?.member;
  }

  /** In the chat from now on; a manager who only read it becomes a member. */
  async addMember(companyId: string, threadId: string, userId: string, addedByUserId: string | null): Promise<void> {
    await db
      .insert(companyApprovalParticipantTable)
      .values({ companyId, threadId, userId, member: true, addedByUserId })
      .onConflictDoUpdate({
        target: [companyApprovalParticipantTable.threadId, companyApprovalParticipantTable.userId],
        // Brought back by a manager, it is news to them again.
        set: addedByUserId ? { member: true, addedByUserId, addedAt: new Date(), lastReadAt: null } : { member: true },
        // Only the company's own row.
        setWhere: eq(companyApprovalParticipantTable.companyId, companyId),
      });
  }

  /** Out of the chat; false when they were not in it. The row stays: a manager's reading state is kept on it. */
  async removeMember(companyId: string, threadId: string, userId: string): Promise<boolean> {
    const rows = await db
      .update(companyApprovalParticipantTable)
      .set({ member: false })
      .where(
        and(
          eq(companyApprovalParticipantTable.companyId, companyId),
          eq(companyApprovalParticipantTable.threadId, threadId),
          eq(companyApprovalParticipantTable.userId, userId),
          eq(companyApprovalParticipantTable.member, true),
        ),
      )
      .returning({ userId: companyApprovalParticipantTable.userId });
    return rows.length > 0;
  }

  async markRead(companyId: string, threadId: string, userId: string, now: Date): Promise<void> {
    await db
      .insert(companyApprovalParticipantTable)
      .values({ companyId, threadId, userId, member: false, lastReadAt: now })
      .onConflictDoUpdate({
        target: [companyApprovalParticipantTable.threadId, companyApprovalParticipantTable.userId],
        set: { lastReadAt: now },
        setWhere: eq(companyApprovalParticipantTable.companyId, companyId),
      });
  }

  /** The chats with something the user has not read: for a manager every chat colleagues wrote in, for others those they are in. */
  async unread(companyId: string, userId: string, isManager: boolean): Promise<{ threadId: string; unread: number; latestAt: Date }[]> {
    const m = companyApprovalMessageTable;
    const p = companyApprovalParticipantTable;
    const written = await db
      .select({ threadId: m.threadId, unread: sql<number>`count(*)::int`, latestAt: sql<Date>`max(${m.createdAt})` })
      .from(m)
      .leftJoin(p, and(eq(p.companyId, companyId), eq(p.threadId, m.threadId), eq(p.userId, userId)))
      .where(
        and(
          eq(m.companyId, companyId),
          sql`${m.authorUserId} is distinct from ${userId}::uuid`,
          sql`(${p.lastReadAt} is null or ${m.createdAt} > ${p.lastReadAt})`,
          isManager ? sql`(${p.member} is true or ${m.authorUserId} is not null)` : sql`${p.member} is true`,
        ),
      )
      .groupBy(m.threadId);
    // Added to a chat nobody has written in yet is news too.
    const added = await db
      .select({ threadId: p.threadId, latestAt: p.addedAt })
      .from(p)
      .where(and(eq(p.companyId, companyId), eq(p.userId, userId), eq(p.member, true), isNull(p.lastReadAt), sql`${p.addedByUserId} is not null`, ne(p.addedByUserId, userId)));
    const seen = new Set(written.map((w) => w.threadId));
    const rows = [...written.map((w) => ({ ...w, latestAt: new Date(w.latestAt) })), ...added.filter((a) => !seen.has(a.threadId)).map((a) => ({ threadId: a.threadId, unread: 0, latestAt: a.latestAt }))];
    return rows.sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime()).slice(0, 50);
  }
}

export const companyRegistrationRepository = new CompanyRegistrationRepository();
