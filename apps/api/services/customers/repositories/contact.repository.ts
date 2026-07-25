import { and, eq, asc, isNull } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { contactTable } from "../schemas/contact.schema";

class ContactRepository extends BaseRepository<typeof contactTable> {
  constructor() {
    super(db as never, contactTable, "contact");
  }

  async findByCustomer(customerId: string) {
    return this.db
      .select()
      .from(contactTable)
      .where(and(eq(contactTable.customerId, customerId), isNull(contactTable.deletedAt)))
      .orderBy(asc(contactTable.createdAt));
  }

  async clearMainFlag(customerId: string) {
    await this.db
      .update(contactTable)
      .set({ isMain: false, updatedAt: new Date() })
      .where(eq(contactTable.customerId, customerId));
  }
}

export const contactRepository = new ContactRepository();
