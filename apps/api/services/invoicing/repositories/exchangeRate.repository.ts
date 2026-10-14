import { and, desc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { exchangeRateTable as t, type ExchangeRateRecord } from "../schemas/exchangeRate.schema";

class ExchangeRateRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "exchange_rate");
  }

  /** All of the company's live rates, newest week first. */
  async listByCompany(companyId: string): Promise<ExchangeRateRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt)))
      .orderBy(desc(t.validFrom));
  }

  async getByWeek(companyId: string, week: string): Promise<ExchangeRateRecord | null> {
    return this.getByColumnForCompany(t.week, week, companyId);
  }
}

export const exchangeRateRepository = new ExchangeRateRepository();
