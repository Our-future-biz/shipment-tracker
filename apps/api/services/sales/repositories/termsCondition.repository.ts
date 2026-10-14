import { sql, asc, isNull, and, eq, count } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { termsConditionTable, type TermsConditionRecord } from "../schemas/termsCondition.schema";

class TermsConditionRepository extends TenantRepository<typeof termsConditionTable> {
  constructor() {
    super(db, termsConditionTable, "terms_condition");
  }

  async listAll(companyId: string): Promise<TermsConditionRecord[]> {
    return this.db
      .select()
      .from(termsConditionTable)
      .where(and(eq(termsConditionTable.companyId, companyId), isNull(termsConditionTable.deletedAt)))
      .orderBy(asc(termsConditionTable.name));
  }

  async findByNameInsensitive(name: string, companyId: string): Promise<TermsConditionRecord | null> {
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

  async count(companyId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(termsConditionTable)
      .where(and(eq(termsConditionTable.companyId, companyId), isNull(termsConditionTable.deletedAt)));
    return Number(row?.value ?? 0);
  }

  // Seeds templates; a name another request seeded meanwhile is skipped, not an error.
  async insertMissing(companyId: string, names: string[]): Promise<void> {
    if (!names.length) return;
    await this.db
      .insert(termsConditionTable)
      .values(names.map((name) => ({ companyId, name, includes: "", excludes: "" })))
      .onConflictDoNothing();
  }
}

export const termsConditionRepository = new TermsConditionRepository();
