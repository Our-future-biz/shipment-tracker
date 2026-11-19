import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import type { AbsenceSpan } from "../lib/absenceRules";
import { userAbsenceTable, type NewUserAbsenceRecord, type UserAbsenceRecord } from "../schemas/userAbsence.schema";
import { userTable } from "../schemas/user.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What a write may change of an absence: its days, its cover, its note, who changed it. */
export type UserAbsencePatch = Partial<Pick<NewUserAbsenceRecord, "fromDate" | "toDate" | "coverUserId" | "note">> & { updatedBy: string };

/** An absence in force or ended lately, of any company, with the people as they are now (the cover job's read). */
export interface AbsenceInForceRow {
  id: string;
  companyId: string;
  userId: string;
  userEmail: string;
  userName: string;
  fromDate: string;
  toDate: string;
  coverUserId: string | null;
  /** The cover's e-mail; null when none is named or the cover is no live user any more. */
  coverEmail: string | null;
  coverName: string | null;
}

const live = isNull(userAbsenceTable.deletedAt);

// Users' absences (schemas/userAbsence.schema). Every read and write is of one company, but the
// cover job's read (inForce), which is of every company and is called by Shipments only.
class UserAbsenceRepository {
  /** The company's live absences that end on `since` or later, the earliest first. */
  async listForCompany(companyId: string, since: string, limit: number, userId?: string): Promise<UserAbsenceRecord[]> {
    return db
      .select()
      .from(userAbsenceTable)
      .where(and(eq(userAbsenceTable.companyId, companyId), live, gte(userAbsenceTable.toDate, since), userId ? eq(userAbsenceTable.userId, userId) : undefined))
      .orderBy(asc(userAbsenceTable.fromDate), asc(userAbsenceTable.createdAt))
      .limit(limit);
  }

  async getLive(id: string, companyId: string): Promise<UserAbsenceRecord | null> {
    const [row] = await db
      .select()
      .from(userAbsenceTable)
      .where(and(eq(userAbsenceTable.id, id), eq(userAbsenceTable.companyId, companyId), live))
      .limit(1);
    return row ?? null;
  }

  /**
   * Runs `work` in one transaction holding a lock on the user's absences: two writes of one user's
   * absences at the same moment are made one after the other, so the overlap check of the second
   * sees the first.
   */
  async lockedForUser<T>(companyId: string, userId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`user-absence:${companyId}:${userId.toLowerCase()}`}))`);
      return work(tx);
    });
  }

  /** The user's other live absences (under lockedForUser), for the overlap check. */
  async spansOfUser(tx: Tx, companyId: string, userId: string): Promise<AbsenceSpan[]> {
    return tx
      .select({ id: userAbsenceTable.id, fromDate: userAbsenceTable.fromDate, toDate: userAbsenceTable.toDate })
      .from(userAbsenceTable)
      .where(and(eq(userAbsenceTable.companyId, companyId), eq(userAbsenceTable.userId, userId), live));
  }

  async create(tx: Tx, row: NewUserAbsenceRecord): Promise<UserAbsenceRecord> {
    const [created] = await tx.insert(userAbsenceTable).values(row).returning();
    return created!;
  }

  async update(tx: Tx, id: string, companyId: string, patch: UserAbsencePatch): Promise<UserAbsenceRecord | null> {
    const [row] = await tx
      .update(userAbsenceTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(userAbsenceTable.id, id), eq(userAbsenceTable.companyId, companyId), live))
      .returning();
    return row ?? null;
  }

  async softDelete(id: string, companyId: string, by: string): Promise<boolean> {
    const rows = await db
      .update(userAbsenceTable)
      .set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: by })
      .where(and(eq(userAbsenceTable.id, id), eq(userAbsenceTable.companyId, companyId), live))
      .returning({ id: userAbsenceTable.id });
    return rows.length > 0;
  }

  /**
   * Of every company: the live absences of live users that began on `day` or before and end on
   * `endedSince` or later - those covering the day, and those that ended since. The cover is
   * named only while it is a live user.
   */
  async inForce(day: string, endedSince: string): Promise<AbsenceInForceRow[]> {
    const absent = alias(userTable, "absent");
    const cover = alias(userTable, "cover");
    return db
      .select({
        id: userAbsenceTable.id,
        companyId: userAbsenceTable.companyId,
        userId: userAbsenceTable.userId,
        userEmail: absent.email,
        userName: absent.displayName,
        fromDate: userAbsenceTable.fromDate,
        toDate: userAbsenceTable.toDate,
        coverUserId: userAbsenceTable.coverUserId,
        coverEmail: cover.email,
        coverName: cover.displayName,
      })
      .from(userAbsenceTable)
      .innerJoin(absent, and(eq(absent.id, userAbsenceTable.userId), eq(absent.companyId, userAbsenceTable.companyId), isNull(absent.deletedAt), eq(absent.isSystem, false)))
      .leftJoin(cover, and(eq(cover.id, userAbsenceTable.coverUserId), eq(cover.companyId, userAbsenceTable.companyId), isNull(cover.deletedAt), eq(cover.isSystem, false)))
      .where(and(live, lte(userAbsenceTable.fromDate, day), gte(userAbsenceTable.toDate, endedSince)))
      .orderBy(asc(userAbsenceTable.companyId), asc(userAbsenceTable.fromDate));
  }
}

export const userAbsenceRepository = new UserAbsenceRepository();
