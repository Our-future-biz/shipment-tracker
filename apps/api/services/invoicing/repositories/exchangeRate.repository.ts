import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/db";
import { exchangeRateTable } from "../schemas/exchangeRate.schema";

class ExchangeRateRepository {
  /** vsechny kurzy firmy, od nejnovejsiho tydne */
  async listByCompany(companyId: string) {
    return db
      .select()
      .from(exchangeRateTable)
      .where(eq(exchangeRateTable.companyId, companyId))
      .orderBy(desc(exchangeRateTable.validFrom));
  }

  async getByWeek(companyId: string, week: string) {
    const [row] = await db
      .select()
      .from(exchangeRateTable)
      .where(and(eq(exchangeRateTable.companyId, companyId), eq(exchangeRateTable.week, week)))
      .limit(1);
    return row ?? null;
  }

  async create(data: { companyId: string; week: string; validFrom: string; validTo: string } & Record<string, unknown>) {
    const [row] = await db.insert(exchangeRateTable).values(data as never).returning();
    return row!;
  }

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(exchangeRateTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(exchangeRateTable.id, id), eq(exchangeRateTable.companyId, companyId)))
      .returning();
    return row!;
  }

  async delete(id: string, companyId: string) {
    await db
      .delete(exchangeRateTable)
      .where(and(eq(exchangeRateTable.id, id), eq(exchangeRateTable.companyId, companyId)));
  }
}

export const exchangeRateRepository = new ExchangeRateRepository();
