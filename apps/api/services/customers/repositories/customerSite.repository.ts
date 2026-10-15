import { and, eq, asc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerSiteTable } from "../schemas/customerSite.schema";

class CustomerSiteRepository extends TenantRepository<typeof customerSiteTable> {
  constructor() {
    super(db, customerSiteTable, "customer_site");
  }

  // Scoped by company as well as customer, so a guessed customerId from another
  // company returns nothing.
  async findByCustomer(customerId: string, companyId: string) {
    return this.db
      .select()
      .from(customerSiteTable)
      .where(and(
        eq(customerSiteTable.companyId, companyId),
        eq(customerSiteTable.customerId, customerId),
        isNull(customerSiteTable.deletedAt),
      ))
      .orderBy(asc(customerSiteTable.createdAt));
  }

  async clearDefaultFlag(customerId: string, companyId: string) {
    await this.db
      .update(customerSiteTable)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(
        eq(customerSiteTable.companyId, companyId),
        eq(customerSiteTable.customerId, customerId),
        isNull(customerSiteTable.deletedAt),
      ));
  }
}

export const customerSiteRepository = new CustomerSiteRepository();
