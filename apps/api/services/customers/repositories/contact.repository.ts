import { and, eq, asc, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { contactTable } from "../schemas/contact.schema";

class ContactRepository extends TenantRepository<typeof contactTable> {
  constructor() {
    super(db, contactTable, "contact");
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

  /** The contacts hidden together with their customer (the same deleted_at as the customer's). */
  async hiddenWithCustomer(companyId: string, customerId: string, deletedAt: Date) {
    return this.db
      .select()
      .from(contactTable)
      .where(and(eq(contactTable.companyId, companyId), eq(contactTable.customerId, customerId), eq(contactTable.deletedAt, deletedAt)));
  }

  /** Live contacts of the company's customers among `customerIds`, oldest first. */
  async refsByCustomers(companyId: string, customerIds: string[]) {
    if (!customerIds.length) return [];
    return this.db
      .select({
        id: contactTable.id,
        customerId: contactTable.customerId,
        name: contactTable.name,
        email: contactTable.email,
        phone: contactTable.phone,
        isMain: contactTable.isMain,
      })
      .from(contactTable)
      .where(and(eq(contactTable.companyId, companyId), inArray(contactTable.customerId, customerIds), isNull(contactTable.deletedAt)))
      .orderBy(asc(contactTable.createdAt));
  }
}

export const contactRepository = new ContactRepository();
