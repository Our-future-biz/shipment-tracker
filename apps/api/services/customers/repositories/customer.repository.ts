import { and, arrayContains, asc, count, eq, getTableColumns, inArray, desc, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { containsAllWords } from "../../../lib/db/textSearch";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerTable, type CustomerItemRow, type CustomerRecord, type NewCustomerRecord } from "../schemas/customer.schema";
import { contactTable, type NewContactRecord } from "../schemas/contact.schema";
import { customerAddressTable, type NewCustomerAddressRecord } from "../schemas/customerAddress.schema";
import { customerNoteTable } from "../schemas/customerNote.schema";
import { customerDocumentTable } from "../schemas/customerDocument.schema";
import { customerInvoiceTable } from "../schemas/customerInvoice.schema";
import { customerSiteTable } from "../schemas/customerSite.schema";
import type { CustomerLabel, CustomerRole, CustomerStatus } from "../interfaces/interfaces";

export interface CustomerListFilters {
  search?: string;
  status?: CustomerStatus;
  label?: CustomerLabel;
  country?: string;
  /** Only companies that have this role (among possibly others). */
  role?: CustomerRole;
  limit?: number;
}

// Every column but the logo (up to 2 MB of base64 per customer), and the logo's length instead.
const { logoData: _logoData, ...withoutLogo } = getTableColumns(customerTable);
const ITEM_COLUMNS = { ...withoutLogo, logoLength: sql<number>`length(${customerTable.logoData})`.mapWith(Number) };

class CustomerRepository extends TenantRepository<typeof customerTable> {
  constructor() {
    super(db, customerTable, "customer");
  }

  /** Active when it is not already, live and of this company; true when a row changed. */
  async activate(id: string, companyId: string): Promise<boolean> {
    const rows = await this.db
      .update(customerTable)
      .set({ status: "Active", updatedAt: new Date() })
      .where(
        and(
          eq(customerTable.id, id),
          eq(customerTable.companyId, companyId),
          isNull(customerTable.deletedAt),
          ne(customerTable.status, "Active"),
        ),
      )
      .returning({ id: customerTable.id });
    return rows.length > 0;
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

  /**
   * The sales owners of the company's live customers, one row per owner user and text, with how
   * many customers have it. Customers without an owner are left out.
   */
  async salesOwnerGroups(companyId: string): Promise<{ userId: string | null; label: string; count: number }[]> {
    const rows = await this.db
      .select({ userId: customerTable.salesOwnerUserId, label: customerTable.salesOwner, count: count() })
      .from(customerTable)
      .where(
        and(
          eq(customerTable.companyId, companyId),
          isNull(customerTable.deletedAt),
          sql`(${customerTable.salesOwnerUserId} IS NOT NULL OR ${customerTable.salesOwner} <> '')`,
        ),
      )
      .groupBy(customerTable.salesOwnerUserId, customerTable.salesOwner);
    return rows.map((r) => ({ ...r, count: Number(r.count) }));
  }

  /**
   * Records the owner of the live customers that still have the owner `from` as the user `to`,
   * by e-mail. A repair, not an edit: updatedAt stays. Returns how many customers changed.
   */
  async setSalesOwnerWhere(
    companyId: string,
    from: { userId: string | null; label: string },
    to: { id: string; email: string },
  ): Promise<number> {
    const rows = await this.db
      .update(customerTable)
      .set({ salesOwnerUserId: to.id, salesOwner: to.email })
      .where(
        and(
          eq(customerTable.companyId, companyId),
          isNull(customerTable.deletedAt),
          from.userId === null ? isNull(customerTable.salesOwnerUserId) : eq(customerTable.salesOwnerUserId, from.userId),
          eq(customerTable.salesOwner, from.label),
        ),
      )
      .returning({ id: customerTable.id });
    return rows.length;
  }

  // Live companies of the company's Customer Database with a role (all of them, or only `ids` among
  // them), with the few fields other services show. No logo: it is a base64 image.
  async listWithRole(
    companyId: string,
    role: CustomerRole,
    ids?: string[],
  ): Promise<Pick<CustomerRecord, "id" | "companyName" | "ico" | "dic" | "city" | "country">[]> {
    const clauses = [eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt), arrayContains(customerTable.roles, [role])];
    if (ids) clauses.push(inArray(customerTable.id, ids));
    return this.db
      .select({
        id: customerTable.id,
        companyName: customerTable.companyName,
        ico: customerTable.ico,
        dic: customerTable.dic,
        city: customerTable.city,
        country: customerTable.country,
      })
      .from(customerTable)
      .where(and(...clauses))
      .orderBy(asc(customerTable.companyName));
  }

  /** A live customer of the company as reads show it: without the logo's bytes. */
  async getItemForCompany(id: string, companyId: string): Promise<CustomerItemRow | null> {
    const [row] = await this.db
      .select(ITEM_COLUMNS)
      .from(customerTable)
      .where(and(eq(customerTable.id, id), eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** The logo (a data URL) of a live customer of the company; "" when it has none. */
  async logoOf(id: string, companyId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ logoData: customerTable.logoData })
      .from(customerTable)
      .where(and(eq(customerTable.id, id), eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)))
      .limit(1);
    return row ? row.logoData : null;
  }

  async findByIco(ico: string, companyId: string): Promise<CustomerRecord | null> {
    return this.getByColumnForCompany(customerTable.ico, ico, companyId);
  }

  // Server-side filtered list, always scoped to the company: the newest `limit` (2000) rows, and
  // how many match in all.
  async listFiltered(companyId: string, f: CustomerListFilters): Promise<{ rows: CustomerItemRow[]; total: number }> {
    const clauses = [eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)];
    if (f.status) clauses.push(eq(customerTable.status, f.status));
    if (f.label) clauses.push(eq(customerTable.label, f.label));
    if (f.country) clauses.push(eq(customerTable.country, f.country));
    if (f.role) clauses.push(arrayContains(customerTable.roles, [f.role]));
    // Every word typed, anywhere in these columns, without regard to diacritics or case.
    if (f.search) {
      const match = containsAllWords([customerTable.companyName, customerTable.ico, customerTable.dic, customerTable.city], f.search);
      if (match) clauses.push(match);
    }
    const where = and(...clauses);
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select(ITEM_COLUMNS)
        .from(customerTable)
        .where(where)
        .orderBy(desc(customerTable.createdAt), desc(customerTable.id))
        .limit(f.limit ?? 2000),
      this.db.select({ value: count() }).from(customerTable).where(where),
    ]);
    return { rows, total: Number(total) };
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
  // address/contact/note/document/invoice/site outlives its customer.
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
      await tx.update(customerSiteTable).set(gone)
        .where(and(eq(customerSiteTable.companyId, companyId), eq(customerSiteTable.customerId, id), isNull(customerSiteTable.deletedAt)));
      return customer;
    });
  }

  /**
   * The company's deleted customers, the most recently deleted first, with how many contacts and
   * addresses were hidden together with each one (same deleted_at): those come back on a restore.
   */
  async listDeleted(companyId: string, limit = 1000): Promise<DeletedCustomerRow[]> {
    // Spelled out with an alias: in a single-table select drizzle leaves column names unqualified,
    // and inside the subquery they would then mean the child table's own columns.
    const hiddenWith = (table: typeof contactTable | typeof customerAddressTable) =>
      sql<number>`(select count(*) from ${table} as hidden where hidden.customer_id = "customer"."id" and hidden.company_id = "customer"."company_id" and hidden.deleted_at = "customer"."deleted_at")`.mapWith(Number);
    const rows = await this.db
      .select({
        id: customerTable.id,
        companyName: customerTable.companyName,
        ico: customerTable.ico,
        city: customerTable.city,
        country: customerTable.country,
        label: customerTable.label,
        status: customerTable.status,
        deletedAt: customerTable.deletedAt,
        contactCount: hiddenWith(contactTable),
        addressCount: hiddenWith(customerAddressTable),
      })
      .from(customerTable)
      .where(and(eq(customerTable.companyId, companyId), isNotNull(customerTable.deletedAt)))
      .orderBy(desc(customerTable.deletedAt), asc(customerTable.companyName))
      .limit(limit);
    return rows.map((r) => ({ ...r, deletedAt: r.deletedAt! }));
  }

  /** A deleted customer of the company; null when there is none (or it is live). */
  async getDeletedForCompany(id: string, companyId: string): Promise<CustomerRecord | null> {
    const [row] = await this.db
      .select()
      .from(customerTable)
      .where(and(eq(customerTable.id, id), eq(customerTable.companyId, companyId), isNotNull(customerTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Undoes softDeleteWithChildren in one transaction: the customer and every row hidden together
   * with it (the same deleted_at) come back. Rows deleted on their own before stay deleted.
   * Null when the customer is not deleted (or not of this company).
   */
  async restoreWithChildren(id: string, companyId: string): Promise<CustomerRecord | null> {
    return this.db.transaction(async (tx) => {
      const [deleted] = await tx
        .select({ deletedAt: customerTable.deletedAt })
        .from(customerTable)
        .where(and(eq(customerTable.id, id), eq(customerTable.companyId, companyId), isNotNull(customerTable.deletedAt)))
        .limit(1);
      if (!deleted?.deletedAt) return null;
      const stamp = deleted.deletedAt;
      const now = new Date();
      const back = { deletedAt: null, updatedAt: now };
      const [customer] = await tx
        .update(customerTable)
        .set(back)
        .where(and(eq(customerTable.id, id), eq(customerTable.companyId, companyId), eq(customerTable.deletedAt, stamp)))
        .returning();
      if (!customer) return null;
      await tx.update(customerAddressTable).set(back)
        .where(and(eq(customerAddressTable.companyId, companyId), eq(customerAddressTable.customerId, id), eq(customerAddressTable.deletedAt, stamp)));
      await tx.update(contactTable).set(back)
        .where(and(eq(contactTable.companyId, companyId), eq(contactTable.customerId, id), eq(contactTable.deletedAt, stamp)));
      await tx.update(customerNoteTable).set(back)
        .where(and(eq(customerNoteTable.companyId, companyId), eq(customerNoteTable.customerId, id), eq(customerNoteTable.deletedAt, stamp)));
      await tx.update(customerDocumentTable).set(back)
        .where(and(eq(customerDocumentTable.companyId, companyId), eq(customerDocumentTable.customerId, id), eq(customerDocumentTable.deletedAt, stamp)));
      await tx.update(customerInvoiceTable).set(back)
        .where(and(eq(customerInvoiceTable.companyId, companyId), eq(customerInvoiceTable.customerId, id), eq(customerInvoiceTable.deletedAt, stamp)));
      await tx.update(customerSiteTable).set(back)
        .where(and(eq(customerSiteTable.companyId, companyId), eq(customerSiteTable.customerId, id), eq(customerSiteTable.deletedAt, stamp)));
      return customer;
    });
  }

  /** Live customers of the company among `ids`: id, name and account type only. */
  async refsByIds(companyId: string, ids: string[]): Promise<CustomerRefRow[]> {
    if (!ids.length) return [];
    return this.db
      .select({ id: customerTable.id, companyName: customerTable.companyName, label: customerTable.label })
      .from(customerTable)
      .where(and(eq(customerTable.companyId, companyId), inArray(customerTable.id, ids), isNull(customerTable.deletedAt)));
  }
}

export type CustomerRefRow = Pick<CustomerRecord, "id" | "companyName" | "label">;

export type DeletedCustomerRow = Pick<
  CustomerRecord,
  "id" | "companyName" | "ico" | "city" | "country" | "label" | "status"
> & { deletedAt: Date; contactCount: number; addressCount: number };

export const customerRepository = new CustomerRepository();
