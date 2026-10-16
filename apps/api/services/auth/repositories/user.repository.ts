import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { userTable } from "../schemas/user.schema";

export type UserPatch = Partial<typeof userTable.$inferInsert>;

// People only: the service identity (is_system) is never listed, edited or deactivated.
const person = eq(userTable.isSystem, false);

/** The service identity's name, shown wherever user names are resolved. */
export const SYSTEM_USER_NAME = "Trucking (system)";

class UserRepository extends BaseRepository<typeof userTable> {
  constructor() {
    super(db, userTable, "app_user");
  }

  // Login is global by email (a user types only their address, not their company),
  // so email must resolve to exactly one live user across all companies.
  async findByEmail(email: string) {
    const [row] = await this.db
      .select()
      .from(userTable)
      .where(and(sql`lower(${userTable.email}) = ${email.toLowerCase()}`, isNull(userTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async listByCompany(companyId: string, limit = 500) {
    return this.db
      .select()
      .from(userTable)
      .where(and(eq(userTable.companyId, companyId), isNull(userTable.deletedAt), person))
      .limit(limit);
  }

  // Live admins and superadmins across all companies — recipients of system alerts.
  async listAdmins(): Promise<{ email: string; displayName: string }[]> {
    return this.db
      .select({ email: userTable.email, displayName: userTable.displayName })
      .from(userTable)
      .where(and(sql`${userTable.role} IN ('admin', 'superadmin')`, isNull(userTable.deletedAt)));
  }

  // Live users of one company by id (other services resolve names and roles of their records).
  async listByIdsInCompany(ids: string[], companyId: string): Promise<{ id: string; displayName: string; email: string; role: string }[]> {
    if (!ids.length) return [];
    return this.db
      .select({ id: userTable.id, displayName: userTable.displayName, email: userTable.email, role: userTable.role })
      .from(userTable)
      .where(and(eq(userTable.companyId, companyId), inArray(userTable.id, ids), isNull(userTable.deletedAt)));
  }

  // User-management writes are always scoped to the admin's own company.
  async getByIdInCompany(id: string, companyId: string) {
    const [row] = await this.db
      .select()
      .from(userTable)
      .where(and(eq(userTable.id, id), eq(userTable.companyId, companyId), isNull(userTable.deletedAt), person))
      .limit(1);
    return row ?? null;
  }

  async updateInCompany(id: string, companyId: string, patch: UserPatch) {
    const [row] = await this.db
      .update(userTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(userTable.id, id), eq(userTable.companyId, companyId), isNull(userTable.deletedAt), person))
      .returning();
    return row ?? null;
  }

  // A removed department/branch must not stay assigned to anyone.
  async clearDepartment(companyId: string, departmentId: string) {
    await this.db
      .update(userTable)
      .set({ departmentId: null, updatedAt: new Date() })
      .where(and(eq(userTable.companyId, companyId), eq(userTable.departmentId, departmentId)));
  }

  async clearBranch(companyId: string, branchId: string) {
    await this.db
      .update(userTable)
      .set({ branchId: null, updatedAt: new Date() })
      .where(and(eq(userTable.companyId, companyId), eq(userTable.branchId, branchId)));
  }

  async softDeleteInCompany(id: string, companyId: string) {
    const [row] = await this.db
      .update(userTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(userTable.id, id), eq(userTable.companyId, companyId), isNull(userTable.deletedAt), person))
      .returning();
    return row ?? null;
  }

  // The company's service identity, created on first use. Idempotent under concurrent calls: the
  // partial unique index (one live system user per company) makes a second insert do nothing.
  // No password hash: it can never sign in (and login refuses it anyway).
  async ensureSystemUser(companyId: string): Promise<string> {
    const live = and(eq(userTable.companyId, companyId), eq(userTable.isSystem, true), isNull(userTable.deletedAt));
    const [found] = await this.db.select({ id: userTable.id }).from(userTable).where(live).limit(1);
    if (found) return found.id;
    await this.db
      .insert(userTable)
      .values({
        companyId,
        email: `trucking-system+${companyId}@system.invalid`,
        passwordHash: "",
        displayName: SYSTEM_USER_NAME,
        role: "user",
        isSystem: true,
      })
      .onConflictDoNothing();
    const [row] = await this.db.select({ id: userTable.id }).from(userTable).where(live).limit(1);
    if (!row) throw new Error("service identity could not be created");
    return row.id;
  }
}

export const userRepository = new UserRepository();
