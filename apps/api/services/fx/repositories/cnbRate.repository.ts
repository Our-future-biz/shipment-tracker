import { and, asc, desc, eq, gte, inArray, lte, max, sql } from "drizzle-orm";
import { db } from "../db/db";
import { cnbRateTable, type CnbRateRecord, type NewCnbRateRecord } from "../schemas/cnbRate.schema";

class CnbRateRepository {
  // Stores new fixings; a (date, currency) already stored is left untouched.
  // Returns how many rows were actually added.
  async insertNew(rows: NewCnbRateRecord[]): Promise<number> {
    let added = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const inserted = await db
        .insert(cnbRateTable)
        .values(rows.slice(i, i + 500))
        .onConflictDoNothing({ target: [cnbRateTable.validDate, cnbRateTable.currency] })
        .returning({ id: cnbRateTable.id });
      added += inserted.length;
    }
    return added;
  }

  async latestValidDate(): Promise<string | null> {
    const [row] = await db.select({ d: max(cnbRateTable.validDate) }).from(cnbRateTable);
    return row?.d ?? null;
  }

  async between(from: string, to: string, currencies?: string[]): Promise<CnbRateRecord[]> {
    const where = [gte(cnbRateTable.validDate, from), lte(cnbRateTable.validDate, to)];
    if (currencies?.length) where.push(inArray(cnbRateTable.currency, currencies));
    return db.select().from(cnbRateTable).where(and(...where)).orderBy(asc(cnbRateTable.validDate), asc(cnbRateTable.currency));
  }

  // The newest fixing on or before `date` for each currency asked for.
  async latestOnOrBefore(date: string, currencies: string[]): Promise<CnbRateRecord[]> {
    if (!currencies.length) return [];
    return db
      .selectDistinctOn([cnbRateTable.currency])
      .from(cnbRateTable)
      .where(and(inArray(cnbRateTable.currency, currencies), lte(cnbRateTable.validDate, date)))
      .orderBy(cnbRateTable.currency, desc(cnbRateTable.validDate));
  }

  // The two newest fixings on or before `date` for one currency (today's and the one before).
  async lastTwo(currency: string, date: string): Promise<CnbRateRecord[]> {
    return db
      .select()
      .from(cnbRateTable)
      .where(and(eq(cnbRateTable.currency, currency), lte(cnbRateTable.validDate, date)))
      .orderBy(desc(cnbRateTable.validDate))
      .limit(2);
  }

  async currencies(): Promise<string[]> {
    const rows = await db.selectDistinct({ c: cnbRateTable.currency }).from(cnbRateTable).orderBy(asc(cnbRateTable.currency));
    return rows.map((r) => r.c);
  }

  async count(): Promise<number> {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(cnbRateTable);
    return row?.n ?? 0;
  }
}

export const cnbRateRepository = new CnbRateRepository();
