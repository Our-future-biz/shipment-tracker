import { and, eq, asc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { contactTable } from "../schemas/contact.schema";

class ContactRepository extends TenantRepository<typeof contactTable> {
  constructor() {
    super(db as never, contactTable, "contact");
  }

  // Scoped by company as well as customer, so a guessed customerId from another
  // company returns nothing.
  async findByCustomer(customerId: string, companyId: string) {
    return this.db
      .select()
      .from(contactTable)
      .where(and(
        eq(contactTable.companyId, companyId),
        eq(contactTable.customerId, customerId),
        isNull(contactTable.deletedAt),
      ))
      .orderBy(asc(contactTable.createdAt));
  }

  async clearMainFlag(customerId: string, companyId: string) {
    await this.db
      .update(contactTable)
      .set({ isMain: false, updatedAt: new Date() })
      .where(and(
        eq(contactTable.companyId, companyId),
        eq(contactTable.customerId, customerId),
        isNull(contactTable.deletedAt),
      ));
  }
}

export const contactRepository = new ContactRepository();
