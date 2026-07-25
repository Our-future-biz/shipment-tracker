import { sql, asc, isNull, and } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { termsConditionTable } from "../schemas/termsCondition.schema";

class TermsConditionRepository extends BaseRepository<typeof termsConditionTable> {
  constructor() {
    super(db as never, termsConditionTable, "terms_condition");
  }

  async listAll() {
    return this.db
      .select()
      .from(termsConditionTable)
      .where(isNull(termsConditionTable.deletedAt))
      .orderBy(asc(termsConditionTable.name));
  }

  async findByNameInsensitive(name: string) {
    const [row] = await this.db
      .select()
      .from(termsConditionTable)
      .where(and(sql`lower(${termsConditionTable.name}) = ${name.toLowerCase()}`, isNull(termsConditionTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async count() {
    const rows = await this.db.select().from(termsConditionTable).where(isNull(termsConditionTable.deletedAt));
    return rows.length;
  }
}

export const termsConditionRepository = new TermsConditionRepository();
