import { and, eq, desc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerInvoiceTable } from "../schemas/customerInvoice.schema";

class CustomerInvoiceRepository extends TenantRepository<typeof customerInvoiceTable> {
  constructor() {
    super(db as never, customerInvoiceTable, "customer_invoice");
  }

  async findByCustomer(customerId: string, companyId: string) {
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
