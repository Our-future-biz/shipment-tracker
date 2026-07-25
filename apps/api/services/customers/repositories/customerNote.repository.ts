import { and, eq, desc, isNull } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerNoteTable } from "../schemas/customerNote.schema";

class CustomerNoteRepository extends BaseRepository<typeof customerNoteTable> {
  constructor() {
    super(db as never, customerNoteTable, "customer_note");
  }

  async findByCustomer(customerId: string) {
    return this.db
      .select()
      .from(customerNoteTable)
      .where(and(eq(customerNoteTable.customerId, customerId), isNull(customerNoteTable.deletedAt)))
      .orderBy(desc(customerNoteTable.createdAt));
  }
}

export const customerNoteRepository = new CustomerNoteRepository();
