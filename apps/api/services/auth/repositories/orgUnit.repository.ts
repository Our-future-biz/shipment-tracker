import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { departmentTable, branchTable, countryTable } from "../schemas/orgUnit.schema";
import { locationTable } from "../schemas/location.schema";
import type { Place } from "../../../lib/geo/place";

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

  async countByCountryCode(companyId: string, countryCode: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(branchTable)
      .where(and(eq(branchTable.companyId, companyId), eq(branchTable.countryCode, countryCode), isNull(branchTable.deletedAt)));
    return row?.n ?? 0;
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

  // Branches keep a copy of their country's code and name, so a changed country carries over
  // to them in the same transaction.
  async updateWithBranches(id: string, companyId: string, values: { code: string; name: string }) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(countryTable)
        .where(and(eq(countryTable.id, id), eq(countryTable.companyId, companyId), isNull(countryTable.deletedAt)))
        .limit(1);
      if (!before) return null;
      const [row] = await tx
        .update(countryTable)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(countryTable.id, id))
        .returning();
      await tx
        .update(branchTable)
        .set({ countryCode: values.code, country: values.name, updatedAt: new Date() })
        .where(and(eq(branchTable.companyId, companyId), eq(branchTable.countryCode, before.code), isNull(branchTable.deletedAt)));
      return row ?? null;
    });
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

  private readonly placeColumns = {
    code: locationTable.code,
    countryCode: locationTable.countryCode,
    name: locationTable.name,
    subdivisionName: locationTable.subdivisionName,
  };

  /**
   * Places worldwide whose code or name starts with the text (or a word of the name does), for
   * the place pickers. The exact code comes first, then names that start with the text.
   * `query` is ASCII-folded by the caller, matching `name_ascii`.
   */
  async search(query: string, countryCode: string | null, limit: number) {
    const prefix = `${query}%`;
    const inCountry = countryCode ? sql`AND country_code = ${countryCode}` : sql``;
    const result = await db.execute<Place & Record<string, unknown>>(sql`
      SELECT code, country_code AS "countryCode", name, subdivision_name AS "subdivisionName" FROM (
        SELECT DISTINCT ON (code) code, country_code, name, name_ascii, subdivision_name FROM location
        WHERE (code ILIKE ${prefix} OR name_ascii ILIKE ${prefix} OR name_ascii ILIKE ${`% ${query}%`} OR name_ascii ILIKE ${`%(${query}%`}) ${inCountry}
        ORDER BY code, id
      ) p
      ORDER BY CASE WHEN code ILIKE ${query} THEN 0 WHEN name_ascii ILIKE ${query} THEN 1 WHEN name_ascii ILIKE ${prefix} THEN 2 ELSE 3 END,
        length(name), name
      LIMIT ${limit}`);
    return result.rows;
  }

  /** One row per known code (the first-listed name where a code has several). */
  async findByCodes(codes: string[]) {
    if (codes.length === 0) return [];
    return db
      .selectDistinctOn([locationTable.code], this.placeColumns)
      .from(locationTable)
      .where(inArray(locationTable.code, codes))
      .orderBy(locationTable.code, asc(locationTable.id));
  }

  /**
   * Places a written name could mean: the same name, a name starting with it ("Shanghai" →
   * "Shanghai Pt") or carrying it in brackets ("Ostend (Oostende)"). `name` is ASCII-folded.
   */
  async findCandidates(name: string, countryCode: string | null, limit: number) {
    return db
      .selectDistinctOn([locationTable.code], this.placeColumns)
      .from(locationTable)
      .where(
        and(
          countryCode ? eq(locationTable.countryCode, countryCode) : undefined,
          sql`(${locationTable.nameAscii} ILIKE ${name} OR ${locationTable.nameAscii} ILIKE ${`${name} %`} OR ${locationTable.nameAscii} ILIKE ${`%(${name})%`})`,
        ),
      )
      .orderBy(locationTable.code, asc(locationTable.id))
      .limit(limit);
  }
}

export const departmentRepository = new DepartmentRepository();
export const branchRepository = new BranchRepository();
export const countryRepository = new CountryRepository();
export const locationRepository = new LocationRepository();
