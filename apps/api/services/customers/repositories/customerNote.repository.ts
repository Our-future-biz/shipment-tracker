import { and, eq, desc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerNoteTable } from "../schemas/customerNote.schema";

class CustomerNoteRepository extends TenantRepository<typeof customerNoteTable> {
  constructor() {
    super(db as never, customerNoteTable, "customer_note");
  }

  async findByCustomer(customerId: string, companyId: string) {
    return this.db
      .select()
      .from(customerNoteTable)
      .where(and(
        eq(customerNoteTable.companyId, companyId),
        eq(customerNoteTable.customerId, customerId),
        isNull(customerNoteTable.deletedAt),
      ))
      .orderBy(desc(customerNoteTable.createdAt));
  }
}

export const customerNoteRepository = new CustomerNoteRepository();
