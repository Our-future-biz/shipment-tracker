import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceProfileTable } from "../schemas/invoiceProfile.schema";
import type { InvoiceProfileInput } from "../lib/invoiceProfile";

class InvoiceProfileRepository {
  async getByCompany(companyId: string) {
    const [row] = await db.select().from(invoiceProfileTable).where(eq(invoiceProfileTable.companyId, companyId)).limit(1);
    return row ?? null;
  }

  /** One row per company; the unique index on company_id makes this a safe upsert. */
  async upsert(companyId: string, data: InvoiceProfileInput) {
    const [row] = await db
      .insert(invoiceProfileTable)
      .values({ companyId, ...data })
      .onConflictDoUpdate({ target: invoiceProfileTable.companyId, set: { ...data, updatedAt: new Date() } })
      .returning();
    return row!;
  }
}

export const invoiceProfileRepository = new InvoiceProfileRepository();
