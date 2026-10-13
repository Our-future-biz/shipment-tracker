import { sql, asc, isNull, and, eq, count } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { termsConditionTable, type NewTermsConditionRecord, type TermsConditionRecord } from "../schemas/termsCondition.schema";

class TermsConditionRepository extends TenantRepository<typeof termsConditionTable> {
  constructor() {
    super(db as never, termsConditionTable, "terms_condition");
  }

  async listAll(companyId: string) {
    return this.db
      .select()
      .from(termsConditionTable)
      .where(and(eq(termsConditionTable.companyId, companyId), isNull(termsConditionTable.deletedAt)))
      .orderBy(asc(termsConditionTable.name));
  }

  async findByNameInsensitive(name: string, companyId: string) {
    const [row] = await this.db
      .select()
      .from(termsConditionTable)
      .where(and(
        eq(termsConditionTable.companyId, companyId),
        sql`lower(${termsConditionTable.name}) = ${name.toLowerCase()}`,
        isNull(termsConditionTable.deletedAt),
      ))
      .limit(1);
    return row ?? null;
  }

  // How many templates the company has had so far, the deleted ones included: 0 only for a
  // company that never had one.
  async countEver(companyId: string) {
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(termsConditionTable)
      .where(eq(termsConditionTable.companyId, companyId));
    return Number(value);
  }

  // Gives a company its first templates, empty, in one statement. A name the company already has
  // among its live templates is left out instead of failing - the unique index on the name
  // (terms_condition_company_name_unique) is the only rule an insert here can run into - so two
  // requests that both find the company without templates cannot fail each other.
  async seed(companyId: string, names: readonly string[]) {
    await this.db
      .insert(termsConditionTable)
      .values(names.map((name) => ({ companyId, name })))
      .onConflictDoNothing();
  }

  /**
   * Writes a change only while the template is still the version the caller edited
   * (`expectedUpdatedAt`), and returns the row as written - or null when nothing was written: the
   * template is gone, or somebody saved it since. The comparison is part of the UPDATE, so no
   * other save can slip in between the check and the write. A row stamped by the database default
   * (created, never updated) carries microseconds, while the API only ever hands out milliseconds:
   * compared at the precision the caller can know.
   */
  async updateIfUnchanged(
    id: string,
    companyId: string,
    data: Partial<NewTermsConditionRecord>,
    expectedUpdatedAt: Date,
  ): Promise<TermsConditionRecord | null> {
    const [row] = await this.db
      .update(termsConditionTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(termsConditionTable.id, id),
        eq(termsConditionTable.companyId, companyId),
        isNull(termsConditionTable.deletedAt),
        sql`date_trunc('milliseconds', ${termsConditionTable.updatedAt}) = ${expectedUpdatedAt.toISOString()}::timestamptz`,
      ))
      .returning();
    return row ?? null;
  }
}

export const termsConditionRepository = new TermsConditionRepository();
