import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { departmentTable, branchTable } from "../schemas/orgUnit.schema";

class DepartmentRepository extends TenantRepository<typeof departmentTable> {
  constructor() {
    super(db as never, departmentTable, "department");
  }

  async listByName(companyId: string) {
    return this.db
      .select()
      .from(departmentTable)
      .where(and(eq(departmentTable.companyId, companyId), isNull(departmentTable.deletedAt)))
      .orderBy(asc(departmentTable.name));
  }
}

class BranchRepository extends TenantRepository<typeof branchTable> {
  constructor() {
    super(db as never, branchTable, "branch");
  }

  async listByName(companyId: string) {
    return this.db
      .select()
      .from(branchTable)
      .where(and(eq(branchTable.companyId, companyId), isNull(branchTable.deletedAt)))
      .orderBy(asc(branchTable.name));
  }
}

export const departmentRepository = new DepartmentRepository();
export const branchRepository = new BranchRepository();
