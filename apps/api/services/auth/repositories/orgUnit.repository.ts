import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { departmentTable, branchTable, countryTable } from "../schemas/orgUnit.schema";
import { locationTable } from "../schemas/location.schema";

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

class CountryRepository extends TenantRepository<typeof countryTable> {
  constructor() {
    super(db as never, countryTable, "country");
  }

  async listByName(companyId: string) {
    return this.db
      .select()
      .from(countryTable)
      .where(and(eq(countryTable.companyId, companyId), isNull(countryTable.deletedAt)))
      .orderBy(asc(countryTable.name));
  }

  async findByCode(companyId: string, code: string) {
    const [row] = await this.db
      .select()
      .from(countryTable)
      .where(and(eq(countryTable.companyId, companyId), eq(countryTable.code, code), isNull(countryTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }
}

// UN/LOCODE places: reference data, the same for every company.
class LocationRepository {
  async listByCountry(countryCode: string) {
    return db
      .select({
        id: locationTable.id,
        code: locationTable.code,
        name: locationTable.name,
        nameAscii: locationTable.nameAscii,
        subdivisionName: locationTable.subdivisionName,
      })
      .from(locationTable)
      .where(eq(locationTable.countryCode, countryCode))
      .orderBy(asc(locationTable.name), asc(locationTable.subdivisionName));
  }

  async getById(id: number) {
    const [row] = await db.select().from(locationTable).where(eq(locationTable.id, id)).limit(1);
    return row ?? null;
  }
}

export const departmentRepository = new DepartmentRepository();
export const branchRepository = new BranchRepository();
export const countryRepository = new CountryRepository();
export const locationRepository = new LocationRepository();
