import { and, eq, isNull, sql } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { userTable } from "../schemas/user.schema";

class UserRepository extends BaseRepository<typeof userTable> {
  constructor() {
    super(db as never, userTable, "app_user");
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
      .where(and(eq(userTable.companyId, companyId), isNull(userTable.deletedAt)))
      .limit(limit);
  }

  // User-management writes are always scoped to the admin's own company.
  async getByIdInCompany(id: string, companyId: string) {
    const [row] = await this.db
      .select()
      .from(userTable)
      .where(and(eq(userTable.id, id), eq(userTable.companyId, companyId), isNull(userTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async updateInCompany(id: string, companyId: string, patch: Record<string, unknown>) {
    const [row] = await this.db
      .update(userTable)
      .set({ ...patch, updatedAt: new Date() } as never)
      .where(and(eq(userTable.id, id), eq(userTable.companyId, companyId), isNull(userTable.deletedAt)))
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
      .set({ deletedAt: new Date(), updatedAt: new Date() } as never)
      .where(and(eq(userTable.id, id), eq(userTable.companyId, companyId), isNull(userTable.deletedAt)))
      .returning();
    return row ?? null;
  }
}

export const userRepository = new UserRepository();
