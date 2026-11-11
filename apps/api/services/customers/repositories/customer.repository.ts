import { and, arrayContains, arrayOverlaps, asc, count, eq, getTableColumns, gte, inArray, desc, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
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
import { registerCountry } from "../lib/registerNumber";
import { SUPPLIER_ROLES, type CustomerLabel, type CustomerListKind, type CustomerRole, type CustomerStatus } from "../interfaces/interfaces";

export interface CustomerListFilters {
  search?: string;
  status?: CustomerStatus;
  label?: CustomerLabel;
  country?: string;
  /** Only companies that have this role (among possibly others). */
  role?: CustomerRole;
  /** Only customers (the customer role) or only suppliers (any other role); a company that is both is in each. */
  kind?: CustomerListKind;
  /** Only the companies of this Sales Owner (a user id), or those with none ("none"). */
  salesOwner?: string;
  /** Only companies with any of these roles (the supplier types picked). */
  anyRole?: CustomerRole[];
  /** Only these ratings: at least `min` stars, at most `max`, or not rated (`unrated`). */
  rating?: { min?: number; max?: number } | "unrated";
  limit?: number;
}

// Every column but the logo (up to 2 MB of base64 per customer), and the logo's length instead.
const { logoData: _logoData, ...withoutLogo } = getTableColumns(customerTable);
const ITEM_COLUMNS = { ...withoutLogo, logoLength: sql<number>`length(${customerTable.logoData})`.mapWith(Number) };
// The list also says when each company was last in touch: its newest live Communication entry (one
// index read per row, on customer_note_last_contact_idx). Spelled out with an alias: in a single-table
// select drizzle leaves column names unqualified, and inside the subquery "id" would be the note's own.
const LIST_COLUMNS = {
  ...ITEM_COLUMNS,
  lastContactAt: sql<Date | null>`(select max(note.created_at) from customer_note as note where note.customer_id = "customer"."id" and note.company_id = "customer"."company_id" and note.deleted_at is null)`.mapWith(customerNoteTable.createdAt),
};

/** The companies of a view of the list (and of its count): customers have the customer role, suppliers any other. */
export const kindClause = (kind: CustomerListKind) =>
  kind === "customers" ? arrayContains(customerTable.roles, ["customer"]) : arrayOverlaps(customerTable.roles, [...SUPPLIER_ROLES]);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Hides what is filed under a customer being deleted - its addresses, contacts, notes, documents,
 * invoices and sites - with the customer's own stamp, in the caller's transaction: a restore brings
 * back exactly the rows of that stamp.
 */
export async function hideChildren(tx: Tx, id: string, companyId: string, now: Date): Promise<void> {
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
}

// A manager's answer to a new supplier, wiped: the decline of one brought back no longer stands.
const NO_ANSWER = {
  approvalDecision: "" as const,
  approvalDecidedBy: "",
  approvalDecidedByUserId: null,
  approvalDecidedAt: null,
  approvalComment: "",
  approvalAnswerSeenAt: null,
};

class CustomerRepository extends TenantRepository<typeof customerTable> {
  constructor() {
    super(db, customerTable, "customer");
  }

  /**
   * Active when it is not already, live, of this company and a customer: a supplier only keeps its "In use" /
   * "Not in use" as it was set. True when a row changed.
   */
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
          arrayContains(customerTable.roles, ["customer"]),
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
  ): Promise<Pick<CustomerRecord, "id" | "companyName" | "status" | "label" | "salesOwner" | "roles" | "createdAt">[]> {
    return this.db
      .select({
        id: customerTable.id,
        companyName: customerTable.companyName,
        status: customerTable.status,
        label: customerTable.label,
        salesOwner: customerTable.salesOwner,
        roles: customerTable.roles,
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

  /** How many live companies each view of the list holds: customers, suppliers (any other role), all. */
  async viewCounts(companyId: string): Promise<{ customers: number; suppliers: number; all: number }> {
    const [row] = await this.db
      .select({
        customers: sql<number>`count(*) filter (where ${kindClause("customers")})`.mapWith(Number),
        suppliers: sql<number>`count(*) filter (where ${kindClause("suppliers")})`.mapWith(Number),
        all: count(),
      })
      .from(customerTable)
      .where(and(eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)));
    return { customers: row?.customers ?? 0, suppliers: row?.suppliers ?? 0, all: row?.all ?? 0 };
  }

  // Live companies of the company's Customer Database with a role (all of them, or only `ids` among
  // them), with the few fields other services show. No logo: it is a base64 image.
  async listWithRole(
    companyId: string,
    role: CustomerRole,
    ids?: string[],
  ): Promise<(Pick<CustomerRecord, "id" | "companyName" | "ico" | "dic" | "city" | "country"> & { rating: number | null; ratingReason: string; inUse: boolean })[]> {
    const clauses = [eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt), arrayContains(customerTable.roles, [role])];
    // Looked up by id, a company is found whatever it is; the whole list (Trucking's and Tariffs' pickers)
    // offers only approved ones: not a new supplier still waiting for a manager, nor one declined.
    if (ids) clauses.push(inArray(customerTable.id, ids));
    else clauses.push(eq(customerTable.approvalStatus, ""));
    return this.db
      .select({
        id: customerTable.id,
        companyName: customerTable.companyName,
        ico: customerTable.ico,
        dic: customerTable.dic,
        city: customerTable.city,
        country: customerTable.country,
        rating: customerTable.supplierRating,
        ratingReason: customerTable.supplierRatingReason,
        // "Not in use" is a supplier only stored Inactive (Council Outlay 7, D1): left out of pickers (D16). A
        // company that is also a customer keeps its customer status there, which says nothing of its supply.
        inUse: sql<boolean>`not (${customerTable.status} = 'Inactive' and not (${arrayContains(customerTable.roles, ["customer"])}))`,
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

  /**
   * The live customer of the company with this registration number in this country (lib/registerNumber):
   * the same number of another country's register is another company.
   */
  async findByIco(ico: string, country: string, companyId: string): Promise<CustomerRecord | null> {
    const [row] = await this.db
      .select()
      .from(customerTable)
      .where(and(
        eq(customerTable.companyId, companyId),
        eq(customerTable.country, registerCountry(country)),
        eq(customerTable.ico, ico),
        isNull(customerTable.deletedAt),
      ))
      .limit(1);
    return row ?? null;
  }

  // Server-side filtered list, always scoped to the company: the newest `limit` (2000) rows, and
  // how many match in all.
  async listFiltered(companyId: string, f: CustomerListFilters): Promise<{ rows: (CustomerItemRow & { lastContactAt: Date | null })[]; total: number }> {
    const clauses = [eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)];
    if (f.status) clauses.push(eq(customerTable.status, f.status));
    if (f.label) clauses.push(eq(customerTable.label, f.label));
    if (f.country) clauses.push(eq(customerTable.country, f.country));
    if (f.role) clauses.push(arrayContains(customerTable.roles, [f.role]));
    if (f.kind) clauses.push(kindClause(f.kind));
    if (f.salesOwner === "none") clauses.push(isNull(customerTable.salesOwnerUserId), sql`btrim(${customerTable.salesOwner}) = ''`);
    else if (f.salesOwner) clauses.push(eq(customerTable.salesOwnerUserId, f.salesOwner));
    if (f.anyRole?.length) clauses.push(arrayOverlaps(customerTable.roles, f.anyRole));
    if (f.rating === "unrated") clauses.push(isNull(customerTable.supplierRating));
    else if (f.rating) {
      if (f.rating.min !== undefined) clauses.push(gte(customerTable.supplierRating, f.rating.min));
      if (f.rating.max !== undefined) clauses.push(lte(customerTable.supplierRating, f.rating.max));
    }
    // Every word typed, anywhere in these columns, without regard to diacritics or case.
    if (f.search) {
      const match = containsAllWords([customerTable.companyName, customerTable.ico, customerTable.dic, customerTable.city], f.search);
      if (match) clauses.push(match);
    }
    const where = and(...clauses);
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select(LIST_COLUMNS)
        .from(customerTable)
        .where(where)
        .orderBy(desc(customerTable.createdAt), desc(customerTable.id))
        .limit(f.limit ?? 2000),
      this.db.select({ value: count() }).from(customerTable).where(where),
    ]);
    return { rows, total: Number(total) };
  }

  /**
   * Changes a live customer while its row is locked: `work` reads the row as it is now and gives the
   * values to write (null writes nothing). Two such changes of one customer run one after the other,
   * so what `work` does elsewhere before the write (a supplier's copy in Trucking) is in the same order.
   * Null when there is no such customer.
   */
  async updateLocked(id: string, companyId: string, work: (row: CustomerRecord) => Promise<Partial<NewCustomerRecord> | null>): Promise<CustomerRecord | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(customerTable)
        .where(and(eq(customerTable.id, id), eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)))
        .for("update");
      if (!row) return null;
      const values = await work(row);
      if (!values) return row;
      const [saved] = await tx.update(customerTable).set({ ...values, updatedAt: new Date() }).where(eq(customerTable.id, id)).returning();
      return saved ?? null;
    });
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
      await hideChildren(tx, id, companyId, now);
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
   * A new supplier a manager declined (and so deleted) comes back as a company like any other on a
   * restore: the decline is gone. Undoing the decline (`undoDecline`, only for such a supplier) puts
   * it back to waiting for a manager instead, as it was before the answer. Null when there is no such
   * deleted customer of this company - or it came back in this very moment: the write is conditional.
   */
  async restoreWithChildren(id: string, companyId: string, as: "restore" | "undoDecline" = "restore"): Promise<CustomerRecord | null> {
    return this.db.transaction(async (tx) => {
      const deletedOne = and(eq(customerTable.id, id), eq(customerTable.companyId, companyId), isNotNull(customerTable.deletedAt));
      const [deleted] = await tx
        .select({ deletedAt: customerTable.deletedAt, approvalDecision: customerTable.approvalDecision, approvalStatus: customerTable.approvalStatus })
        .from(customerTable)
        .where(as === "undoDecline" ? and(deletedOne, eq(customerTable.approvalDecision, "declined")) : deletedOne)
        .limit(1);
      if (!deleted?.deletedAt) return null;
      const stamp = deleted.deletedAt;
      const now = new Date();
      const back = { deletedAt: null, updatedAt: now };
      const declined = deleted.approvalDecision === "declined" || deleted.approvalStatus === "declined";
      const [customer] = await tx
        .update(customerTable)
        .set({ ...back, ...(as === "undoDecline" ? { ...NO_ANSWER, approvalStatus: "pending" as const } : declined ? { ...NO_ANSWER, approvalStatus: "" as const } : {}) })
        .where(
          and(
            eq(customerTable.id, id),
            eq(customerTable.companyId, companyId),
            eq(customerTable.deletedAt, stamp),
            ...(as === "undoDecline" ? [eq(customerTable.approvalDecision, "declined")] : []),
          ),
        )
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

  /** The credit limit and its currency of the company's live customers among `ids` (the Sales managers' cockpit). */
  async creditLimitsOf(companyId: string, ids: string[]): Promise<{ id: string; creditLimit: number; currency: string }[]> {
    if (!ids.length) return [];
    const rows = await this.db
      .select({ id: customerTable.id, creditLimit: customerTable.creditLimit, currency: customerTable.currency })
      .from(customerTable)
      .where(and(eq(customerTable.companyId, companyId), inArray(customerTable.id, ids), isNull(customerTable.deletedAt)));
    return rows.map((r) => ({ id: r.id, creditLimit: Number(r.creditLimit) || 0, currency: r.currency }));
  }
}

export type CustomerRefRow = Pick<CustomerRecord, "id" | "companyName" | "label">;

export type DeletedCustomerRow = Pick<
  CustomerRecord,
  "id" | "companyName" | "ico" | "city" | "country" | "label" | "status"
> & { deletedAt: Date; contactCount: number; addressCount: number };

export const customerRepository = new CustomerRepository();
