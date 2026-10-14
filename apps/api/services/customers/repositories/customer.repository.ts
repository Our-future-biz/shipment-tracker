import { and, eq, or, ilike, desc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerTable, type CustomerRecord } from "../schemas/customer.schema";
import { contactTable } from "../schemas/contact.schema";
import { customerNoteTable } from "../schemas/customerNote.schema";
import { customerDocumentTable } from "../schemas/customerDocument.schema";
import { customerInvoiceTable } from "../schemas/customerInvoice.schema";
import type { CustomerLabel, CustomerStatus } from "../interfaces/interfaces";

export interface CustomerListFilters {
  search?: string;
  status?: CustomerStatus;
  label?: CustomerLabel;
  country?: string;
  limit?: number;
}

class CustomerRepository extends TenantRepository<typeof customerTable> {
  constructor() {
    super(db, customerTable, "customer");
  }

  async findByIco(ico: string, companyId: string): Promise<CustomerRecord | null> {
    return this.getByColumnForCompany(customerTable.ico, ico, companyId);
  }

  // Server-side filtered list, always scoped to the company.
  async listFiltered(companyId: string, f: CustomerListFilters): Promise<CustomerRecord[]> {
    const clauses = [eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)];
    if (f.status) clauses.push(eq(customerTable.status, f.status));
    if (f.label) clauses.push(eq(customerTable.label, f.label));
    if (f.country) clauses.push(eq(customerTable.country, f.country));
    if (f.search) {
      const s = `%${f.search}%`;
      const match = or(
        ilike(customerTable.companyName, s),
        ilike(customerTable.ico, s),
        ilike(customerTable.dic, s),
        ilike(customerTable.city, s),
      );
      if (match) clauses.push(match);
    }
    return this.db
      .select()
      .from(customerTable)
      .where(and(...clauses))
      .orderBy(desc(customerTable.createdAt))
      .limit(f.limit ?? 2000);
  }

  // The customer and everything filed under it go together, in one transaction, so no
  // contact/note/document/invoice outlives its customer.
  async softDeleteWithChildren(id: string, companyId: string): Promise<CustomerRecord | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [customer] = await tx
        .update(customerTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(customerTable.id, id), eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)))
        .returning();
      if (!customer) return null;
      const gone = { deletedAt: now, updatedAt: now };
      await tx.update(contactTable).set(gone)
        .where(and(eq(contactTable.companyId, companyId), eq(contactTable.customerId, id), isNull(contactTable.deletedAt)));
      await tx.update(customerNoteTable).set(gone)
        .where(and(eq(customerNoteTable.companyId, companyId), eq(customerNoteTable.customerId, id), isNull(customerNoteTable.deletedAt)));
      await tx.update(customerDocumentTable).set(gone)
        .where(and(eq(customerDocumentTable.companyId, companyId), eq(customerDocumentTable.customerId, id), isNull(customerDocumentTable.deletedAt)));
      await tx.update(customerInvoiceTable).set(gone)
        .where(and(eq(customerInvoiceTable.companyId, companyId), eq(customerInvoiceTable.customerId, id), isNull(customerInvoiceTable.deletedAt)));
      return customer;
    });
  }
}

export const customerRepository = new CustomerRepository();
