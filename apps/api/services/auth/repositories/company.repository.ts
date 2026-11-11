import { and, eq, isNull } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { companyTable } from "../schemas/company.schema";
import { userTable } from "../schemas/user.schema";

type NewCompany = typeof companyTable.$inferInsert;
type NewUser = typeof userTable.$inferInsert;

class CompanyRepository extends BaseRepository<typeof companyTable> {
  constructor() {
    super(db, companyTable, "company");
  }

  async findBySlug(slug: string) {
    const [row] = await this.db
      .select()
      .from(companyTable)
      .where(and(eq(companyTable.slug, slug), isNull(companyTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  // A new company and its first admin, both or neither: an admin the database refuses (an e-mail
  // taken a moment ago) must not leave behind a company nobody can sign in to, holding its slug.
  async createWithAdmin(company: NewCompany, admin: Omit<NewUser, "companyId">) {
    return this.db.transaction(async (tx) => {
      const [createdCompany] = await tx.insert(companyTable).values(company).returning();
      const [createdAdmin] = await tx.insert(userTable).values({ ...admin, companyId: createdCompany.id }).returning();
      return { company: createdCompany, admin: createdAdmin };
    });
  }
}

export const companyRepository = new CompanyRepository();
