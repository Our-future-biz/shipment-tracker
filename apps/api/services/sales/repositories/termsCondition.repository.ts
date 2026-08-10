import { sql, asc, isNull, and, eq, count } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { termsConditionTable } from "../schemas/termsCondition.schema";

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

  async count(companyId: string) {
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(termsConditionTable)
      .where(and(eq(termsConditionTable.companyId, companyId), isNull(termsConditionTable.deletedAt)));
    return Number(value);
  }
}

export const termsConditionRepository = new TermsConditionRepository();
