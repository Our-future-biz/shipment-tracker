import { and, count, eq, desc, isNull, ne } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerNoteTable } from "../schemas/customerNote.schema";

class CustomerNoteRepository extends TenantRepository<typeof customerNoteTable> {
  constructor() {
    super(db, customerNoteTable, "customer_note");
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

  /** The authors of the company's live notes, one row per text, with how many notes have it. Notes without one are left out. */
  async authorGroups(companyId: string): Promise<{ value: string; count: number }[]> {
    const rows = await this.db
      .select({ value: customerNoteTable.author, count: count() })
      .from(customerNoteTable)
      .where(and(eq(customerNoteTable.companyId, companyId), isNull(customerNoteTable.deletedAt), ne(customerNoteTable.author, "")))
      .groupBy(customerNoteTable.author);
    return rows.map((r) => ({ ...r, count: Number(r.count) }));
  }

  /** The live notes written by `from` get the author `to` (a user's e-mail). A repair, not an edit: updatedAt stays. Returns how many changed. */
  async renameAuthor(companyId: string, from: string, to: string): Promise<number> {
    const rows = await this.db
      .update(customerNoteTable)
      .set({ author: to })
      .where(and(eq(customerNoteTable.companyId, companyId), isNull(customerNoteTable.deletedAt), eq(customerNoteTable.author, from)))
      .returning({ id: customerNoteTable.id });
    return rows.length;
  }
}

export const customerNoteRepository = new CustomerNoteRepository();
