import { and, eq, desc, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerInvoiceTable, type CustomerInvoiceRecord } from "../schemas/customerInvoice.schema";
import type { InvoiceStatus } from "../interfaces/interfaces";

class CustomerInvoiceRepository extends TenantRepository<typeof customerInvoiceTable> {
  constructor() {
    super(db, customerInvoiceTable, "customer_invoice");
  }

  /** Sets the status of the company's live entries with these invoice numbers; returns how many changed. */
  async setStatusByNumbers(companyId: string, invoiceNumbers: string[], status: InvoiceStatus): Promise<number> {
    if (!invoiceNumbers.length) return 0;
    const rows = await this.db
      .update(customerInvoiceTable)
      .set({ status, updatedAt: new Date() })
      .where(and(
        eq(customerInvoiceTable.companyId, companyId),
        inArray(customerInvoiceTable.invoiceNumber, invoiceNumbers),
        isNull(customerInvoiceTable.deletedAt),
      ))
      .returning({ id: customerInvoiceTable.id });
    return rows.length;
  }

  async findByCustomer(customerId: string, companyId: string): Promise<CustomerInvoiceRecord[]> {
    return this.db
      .select()
      .from(customerInvoiceTable)
      .where(and(
        eq(customerInvoiceTable.companyId, companyId),
        eq(customerInvoiceTable.customerId, customerId),
        isNull(customerInvoiceTable.deletedAt),
      ))
      .orderBy(desc(customerInvoiceTable.createdAt));
  }
}

export const customerInvoiceRepository = new CustomerInvoiceRepository();
