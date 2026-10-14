import { desc, eq } from "drizzle-orm";
import { db } from "../db/db";
import { cnbImportRunTable, type CnbImportRunRecord, type NewCnbImportRunRecord } from "../schemas/cnbImportRun.schema";

class CnbImportRunRepository {
  async start(data: NewCnbImportRunRecord): Promise<CnbImportRunRecord> {
    const [row] = await db.insert(cnbImportRunTable).values(data).returning();
    return row!;
  }

  async finish(id: string, data: Partial<NewCnbImportRunRecord>): Promise<void> {
    await db
      .update(cnbImportRunTable)
      .set({ ...data, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(cnbImportRunTable.id, id));
  }

  async recent(limit: number): Promise<CnbImportRunRecord[]> {
    return db.select().from(cnbImportRunTable).orderBy(desc(cnbImportRunTable.startedAt)).limit(limit);
  }
}

export const cnbImportRunRepository = new CnbImportRunRepository();
