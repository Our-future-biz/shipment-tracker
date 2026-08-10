import { and, eq, isNull } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { companyTable } from "../schemas/company.schema";

class CompanyRepository extends BaseRepository<typeof companyTable> {
  constructor() {
    super(db as never, companyTable, "company");
  }

  async findBySlug(slug: string) {
    const [row] = await this.db
      .select()
      .from(companyTable)
      .where(and(eq(companyTable.slug, slug), isNull(companyTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }
}

export const companyRepository = new CompanyRepository();
