import { and, eq, or, ilike, desc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerTable, type CustomerRecord, type NewCustomerRecord } from "../schemas/customer.schema";
import { contactTable, type NewContactRecord } from "../schemas/contact.schema";
import { customerAddressTable, type NewCustomerAddressRecord } from "../schemas/customerAddress.schema";
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

  // Every live customer of the company with what the sales pipeline shows of it. All of them -
  // the pipeline counts every customer, so a limit would be a silent cap - and only these
  // columns: a row also carries the logo, a base64 image.
  async pipelineList(
    companyId: string,
  ): Promise<Pick<CustomerRecord, "id" | "companyName" | "status" | "label" | "salesOwner" | "createdAt">[]> {
    return this.db
      .select({
        id: customerTable.id,
        companyName: customerTable.companyName,
        status: customerTable.status,
        label: customerTable.label,
        salesOwner: customerTable.salesOwner,
        createdAt: customerTable.createdAt,
      })
      .from(customerTable)
      .where(and(eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)));
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

  // A new customer together with its first contact and its registered address, in one transaction:
  // a customer is never left without them.
  async createWithContact(
    companyId: string,
    customer: Omit<NewCustomerRecord, "companyId">,
    contact: Omit<NewContactRecord, "companyId" | "customerId">,
    address: Omit<NewCustomerAddressRecord, "companyId" | "customerId">,
  ): Promise<CustomerRecord> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(customerTable).values({ ...customer, companyId }).returning();
      await tx.insert(contactTable).values({ ...contact, companyId, customerId: row!.id });
      await tx.insert(customerAddressTable).values({ ...address, companyId, customerId: row!.id });
      return row!;
    });
  }

  // The customer and everything filed under it go together, in one transaction, so no
  // address/contact/note/document/invoice outlives its customer.
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
      await tx.update(customerAddressTable).set(gone)
        .where(and(eq(customerAddressTable.companyId, companyId), eq(customerAddressTable.customerId, id), isNull(customerAddressTable.deletedAt)));
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
