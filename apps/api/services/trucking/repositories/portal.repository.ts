import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import {
  truckingPortalSessionTable,
  truckingPortalTokenTable,
  truckingPortalUserTable,
  type NewPortalSessionRecord,
  type NewPortalUserRecord,
  type PortalSessionRecord,
  type PortalTokenKind,
  type PortalTokenRecord,
  type PortalUserRecord,
} from "../schemas/portal.schema";

const u = truckingPortalUserTable;
const s = truckingPortalSessionTable;
const t = truckingPortalTokenTable;

export type PortalUserValues = Partial<Omit<NewPortalUserRecord, "id" | "companyId" | "version" | "createdAt" | "createdBy">>;

// The haulier portal's users, sessions and one-time links. Session and link lookups by hash know
// no company (the portal request carries only the token); everything else is company-scoped.
class PortalRepository {
  // ---- users ---------------------------------------------------------------------------------

  async insertUser(tx: Tx, values: NewPortalUserRecord): Promise<PortalUserRecord> {
    const [row] = await tx.insert(u).values(values).returning();
    return row!;
  }

  async findUser(companyId: string, id: string, reader: Tx | typeof db = db): Promise<PortalUserRecord | null> {
    const [row] = await reader.select().from(u).where(and(eq(u.companyId, companyId), eq(u.id, id), isNull(u.deletedAt)));
    return row ?? null;
  }

  /** The live users of a haulier, by name. */
  async usersOf(companyId: string, haulierCustomerId: string): Promise<PortalUserRecord[]> {
    return db
      .select()
      .from(u)
      .where(and(eq(u.companyId, companyId), eq(u.haulierCustomerId, haulierCustomerId), isNull(u.deletedAt)))
      .orderBy(asc(u.name), asc(u.id));
  }

  async userByEmail(companyId: string, email: string): Promise<PortalUserRecord | null> {
    const [row] = await db.select().from(u).where(and(eq(u.companyId, companyId), eq(u.email, email), isNull(u.deletedAt)));
    return row ?? null;
  }

  /** The live users with this (lower-cased) e-mail, whatever their company: the login knows no company. */
  async usersByEmail(email: string): Promise<PortalUserRecord[]> {
    return db.select().from(u).where(and(eq(u.email, email), isNull(u.deletedAt))).orderBy(asc(u.createdAt));
  }

  /** Writes `values` (bumps the version); with `version`, only when the row is still at it. Null when it no longer is. */
  async updateUser(tx: Tx | typeof db, companyId: string, id: string, values: PortalUserValues, version?: number): Promise<PortalUserRecord | null> {
    const [row] = await tx
      .update(u)
      .set({ ...values, version: sql`${u.version} + 1`, updatedAt: new Date() })
      .where(and(eq(u.companyId, companyId), eq(u.id, id), isNull(u.deletedAt), ...(version === undefined ? [] : [eq(u.version, version)])))
      .returning();
    return row ?? null;
  }

  /**
   * One more failed login, counted in the database (two wrong passwords at once both count); at
   * `max` the user is locked until `lockUntil` and the count starts again.
   */
  async failLogin(companyId: string, id: string, max: number, lockUntil: Date): Promise<PortalUserRecord | null> {
    const next = sql`${u.failedAttempts} + 1`;
    const [row] = await db
      .update(u)
      .set({
        failedAttempts: sql`CASE WHEN ${next} >= ${max} THEN 0 ELSE ${next} END`,
        lockedUntil: sql`CASE WHEN ${next} >= ${max} THEN ${lockUntil.toISOString()}::timestamptz ELSE ${u.lockedUntil} END`,
        updatedAt: new Date(),
      })
      .where(and(eq(u.companyId, companyId), eq(u.id, id), isNull(u.deletedAt)))
      .returning();
    return row ?? null;
  }

  // ---- sessions ------------------------------------------------------------------------------

  async insertSession(tx: Tx | typeof db, values: NewPortalSessionRecord): Promise<PortalSessionRecord> {
    const [row] = await tx.insert(s).values(values).returning();
    return row!;
  }

  async sessionByHash(tokenHash: string): Promise<PortalSessionRecord | null> {
    const [row] = await db.select().from(s).where(eq(s.tokenHash, tokenHash));
    return row ?? null;
  }

  /** Slides a live session's expiry. */
  async touchSession(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void> {
    await db
      .update(s)
      .set({ lastSeenAt, expiresAt })
      .where(and(eq(s.id, id), isNull(s.revokedAt)));
  }

  async revokeSession(tx: Tx | typeof db, id: string): Promise<void> {
    await tx
      .update(s)
      .set({ revokedAt: new Date() })
      .where(and(eq(s.id, id), isNull(s.revokedAt)));
  }

  /** Ends every live session of these users. */
  async revokeSessionsOf(tx: Tx | typeof db, companyId: string, userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    await tx
      .update(s)
      .set({ revokedAt: new Date() })
      .where(and(eq(s.companyId, companyId), inArray(s.userId, userIds), isNull(s.revokedAt)));
  }

  /** Ends every live session of a haulier's users (the haulier was blocked). */
  async revokeSessionsOfHaulier(companyId: string, haulierCustomerId: string, tx: Tx | typeof db = db): Promise<void> {
    const users = await tx
      .select({ id: u.id })
      .from(u)
      .where(and(eq(u.companyId, companyId), eq(u.haulierCustomerId, haulierCustomerId)));
    await this.revokeSessionsOf(tx, companyId, users.map((x) => x.id));
  }

  // ---- one-time links ------------------------------------------------------------------------

  /** A new link for the user; the user's links not used yet are closed first (one open link per user). */
  async newToken(tx: Tx, values: { companyId: string; userId: string; kind: PortalTokenKind; tokenHash: string; expiresAt: Date; createdBy: string }): Promise<PortalTokenRecord> {
    await this.closeTokens(tx, values.companyId, values.userId);
    const [row] = await tx.insert(t).values(values).returning();
    return row!;
  }

  /** Marks the user's open links used (a newer link, a disabled user). */
  async closeTokens(tx: Tx | typeof db, companyId: string, userId: string): Promise<void> {
    await tx
      .update(t)
      .set({ usedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.userId, userId), isNull(t.usedAt)));
  }

  async tokenByHash(tokenHash: string): Promise<PortalTokenRecord | null> {
    const [row] = await db.select().from(t).where(eq(t.tokenHash, tokenHash));
    return row ?? null;
  }

  /** Uses the link once: false when it was used (or expired) meanwhile. */
  async useToken(tx: Tx, id: string, now: Date): Promise<boolean> {
    const rows = await tx
      .update(t)
      .set({ usedAt: now })
      .where(and(eq(t.id, id), isNull(t.usedAt), gt(t.expiresAt, now)))
      .returning({ id: t.id });
    return rows.length > 0;
  }
}

export const portalRepository = new PortalRepository();
