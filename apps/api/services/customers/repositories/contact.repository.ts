import { and, eq, asc, inArray, isNull, ne } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { contactTable, type ContactRecord, type NewContactRecord } from "../schemas/contact.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What an edit of a contact may change. */
export type ContactPatch = Partial<Pick<NewContactRecord, "firstName" | "lastName" | "name" | "email" | "phone" | "role" | "isMain">>;

// The customer's other live main contact made an ordinary one, in the write's own transaction: a
// write refused after it never leaves the customer without its main contact.
async function clearMain(tx: Tx, customerId: string, companyId: string, exceptId?: string): Promise<void> {
  await tx
    .update(contactTable)
    .set({ isMain: false, updatedAt: new Date() })
    .where(and(
      eq(contactTable.companyId, companyId),
      eq(contactTable.customerId, customerId),
      eq(contactTable.isMain, true),
      isNull(contactTable.deletedAt),
      ...(exceptId ? [ne(contactTable.id, exceptId)] : []),
    ));
}

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

  /**
   * A new contact of the customer; made the main one, the customer's other main contact stops being
   * it in the same transaction (contact_one_main_per_customer allows one).
   */
  async createInCustomer(companyId: string, values: Omit<NewContactRecord, "companyId">): Promise<ContactRecord> {
    return this.db.transaction(async (tx) => {
      if (values.isMain) await clearMain(tx, values.customerId, companyId);
      const [row] = await tx.insert(contactTable).values({ ...values, companyId }).returning();
      return row!;
    });
  }

  /**
   * An edit of a live contact of the customer; null when there is none. Made the main one, the
   * customer's other main contact stops being it in the same transaction. The contact is locked
   * first, so one deleted meanwhile changes nobody else.
   */
  async updateInCustomer(id: string, companyId: string, customerId: string, patch: ContactPatch): Promise<ContactRecord | null> {
    return this.db.transaction(async (tx) => {
      const live = and(eq(contactTable.id, id), eq(contactTable.companyId, companyId), eq(contactTable.customerId, customerId), isNull(contactTable.deletedAt));
      const [found] = await tx.select({ id: contactTable.id }).from(contactTable).where(live).limit(1).for("update");
      if (!found) return null;
      if (patch.isMain) await clearMain(tx, customerId, companyId, id);
      const [row] = await tx.update(contactTable).set({ ...patch, updatedAt: new Date() }).where(live).returning();
      return row ?? null;
    });
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
