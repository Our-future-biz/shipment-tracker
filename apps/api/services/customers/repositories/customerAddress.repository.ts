import { and, eq, asc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerAddressTable } from "../schemas/customerAddress.schema";

class CustomerAddressRepository extends TenantRepository<typeof customerAddressTable> {
  constructor() {
    super(db, customerAddressTable, "customer_address");
  }

  // Scoped by company as well as customer, so a guessed customerId from another company returns nothing.
  async findByCustomer(customerId: string, companyId: string) {
    return this.db
      .select()
      .from(customerAddressTable)
      .where(and(
        eq(customerAddressTable.companyId, companyId),
        eq(customerAddressTable.customerId, customerId),
        isNull(customerAddressTable.deletedAt),
      ))
      .orderBy(asc(customerAddressTable.createdAt));
  }
}

export const customerAddressRepository = new CustomerAddressRepository();
