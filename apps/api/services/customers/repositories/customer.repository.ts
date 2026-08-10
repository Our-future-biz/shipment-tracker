import { and, eq, desc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerTable } from "../schemas/customer.schema";

class CustomerRepository extends TenantRepository<typeof customerTable> {
  constructor() {
    super(db as never, customerTable, "customer");
  }

  async findByIco(ico: string, companyId: string) {
    return this.getByColumnForCompany(customerTable.ico, ico, companyId);
  }

  async listAll(companyId: string, limit = 2000) {
    return this.listForCompany(companyId, limit);
  }

  async listByStatus(status: string, companyId: string, limit = 2000) {
    const rows = await this.db
      .select()
      .from(customerTable)
      .where(and(
        eq(customerTable.companyId, companyId),
        eq(customerTable.status, status),
        isNull(customerTable.deletedAt),
      ))
      .orderBy(desc(customerTable.createdAt))
      .limit(limit);
    return rows;
  }
}

export const customerRepository = new CustomerRepository();
