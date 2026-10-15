import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { invoiceProfileTable as t, type InvoiceProfileRecord } from "../schemas/invoiceProfile.schema";
import type { InvoiceProfileInput } from "../lib/invoiceProfile";

class InvoiceProfileRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "invoice_profile");
  }

  async getByCompany(companyId: string): Promise<InvoiceProfileRecord | null> {
    return this.getByColumnForCompany(t.companyId, companyId, companyId);
  }

  /** One row per company; the unique index on company_id makes this a safe upsert. */
  async upsert(companyId: string, data: InvoiceProfileInput): Promise<InvoiceProfileRecord> {
    const [row] = await this.db
      .insert(t)
      .values({ companyId, ...data })
      .onConflictDoUpdate({ target: t.companyId, set: { ...data, updatedAt: new Date(), deletedAt: null } })
      .returning();
    return row!;
  }
}

export const invoiceProfileRepository = new InvoiceProfileRepository();
