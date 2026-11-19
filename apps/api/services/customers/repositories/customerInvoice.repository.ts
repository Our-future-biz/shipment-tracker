import { and, asc, eq, desc, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerInvoiceTable, type CustomerInvoiceRecord, type NewCustomerInvoiceRecord } from "../schemas/customerInvoice.schema";
import type { InvoiceStatus } from "../interfaces/interfaces";
import { OWED_STATUSES, receivablePatch, type OwedEntry, type ReceivableWord } from "../lib/receivable";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The lock an entry's number is written under (upsertIssued, the receivable word): one at a time per number. */
const lockNumbers = async (tx: Tx, companyId: string, numbers: string[]) => {
  // Always in the same order, so two writers that need the same numbers never wait for each other in a circle.
  for (const n of [...new Set(numbers)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`customer-invoice:${companyId}:${n}`}))`);
  }
};

/** Accounts Receivable's word on an issued invoice (customers' side of the receivable_state follow-up). */
export interface ReceivableInput extends ReceivableWord {
  customerId: string;
  invoiceId: string;
  invoiceNumber: string;
  /** The invoice's partial credit notes: netted into it, so each of their entries owes nothing on its own. */
  creditNoteNumbers: string[];
}

/** Which entry an issued document is: its id, and its customer and number for an entry that does not know the id yet. */
export interface IssuedRef {
  invoiceId: string;
  customerId: string;
  number: string;
}

/** What a manager may change of a typed entry. */
export type TypedInvoicePatch = Partial<Pick<NewCustomerInvoiceRecord, "invoiceNumber" | "amount" | "status" | "dueDate" | "issuedAt">>;

/** Accounts Receivable never changes these: the invoice is no longer owed for another reason. */
const UNTOUCHED_STATUSES: InvoiceStatus[] = ["Credited", "Cancelled"];

/** Of several live entries of one number, the one Invoicing posted, else the newest. */
const firstPosted = (a: CustomerInvoiceRecord, b: CustomerInvoiceRecord) =>
  Number(b.source === "invoicing") - Number(a.source === "invoicing") || b.createdAt.getTime() - a.createdAt.getTime();

class CustomerInvoiceRepository extends TenantRepository<typeof customerInvoiceTable> {
  constructor() {
    super(db, customerInvoiceTable, "customer_invoice");
  }

  /**
   * The customer's entry of an invoice Invoicing issued, by its number: written once, and the same
   * entry again (an outbox delivery repeated) only brings it up to date. Under a lock of the number,
   * so two deliveries at the same moment never add it twice.
   */
  async upsertIssued(companyId: string, values: Omit<NewCustomerInvoiceRecord, "companyId" | "source">): Promise<CustomerInvoiceRecord> {
    return this.db.transaction(async (tx) => {
      await lockNumbers(tx, companyId, [values.invoiceNumber]);
      const live = and(
        eq(customerInvoiceTable.companyId, companyId),
        eq(customerInvoiceTable.customerId, values.customerId),
        eq(customerInvoiceTable.invoiceNumber, values.invoiceNumber),
        isNull(customerInvoiceTable.deletedAt),
      );
      const [existing] = await tx.select().from(customerInvoiceTable).where(live).limit(1);
      // Posted by Invoicing from now on, whoever typed it first: only a credit note changes it.
      const posted = { source: "invoicing" as const, ...(values.invoiceId ? { invoiceId: values.invoiceId } : {}) };
      if (existing) {
        // Sent again: a status set since (Paid, Credited) stands, and so does what Accounts Receivable sent; the figures
        // are the invoice's own. An entry typed in before Invoicing issued the number takes the issued status instead: a
        // Paid typed ahead of the invoice would otherwise be carried over to Accounts Receivable as paid in full, with no
        // money and no second manager.
        const status = existing.source === "invoicing" ? {} : { status: values.status };
        const [row] = await tx
          .update(customerInvoiceTable)
          .set({ amount: values.amount, currency: values.currency, dueDate: values.dueDate, issuedAt: values.issuedAt, ...status, ...posted, updatedAt: new Date() })
          .where(eq(customerInvoiceTable.id, existing.id))
          .returning();
        return row!;
      }
      const [row] = await tx.insert(customerInvoiceTable).values({ ...values, ...posted, companyId }).returning();
      return row!;
    });
  }

  /** Sets the status of the company's live entries with these invoice numbers; returns how many changed. */
  async setStatusByNumbers(companyId: string, invoiceNumbers: string[], status: InvoiceStatus): Promise<number> {
    if (!invoiceNumbers.length) return 0;
    const rows = await this.db
      .update(customerInvoiceTable)
      .set({ status, updatedAt: new Date() })
      .where(and(
        eq(customerInvoiceTable.companyId, companyId),
        inArray(customerInvoiceTable.invoiceNumber, invoiceNumbers),
        isNull(customerInvoiceTable.deletedAt),
      ))
      .returning({ id: customerInvoiceTable.id });
    return rows.length;
  }

  /**
   * The unpaid (Open / Overdue) entries of the company's customers among `customerIds`, as what is owed is worked
   * out from them (lib/receivable owedByCustomer: left to pay when Accounts Receivable sent it, else the amount).
   */
  async owedEntriesOf(companyId: string, customerIds: string[]): Promise<OwedEntry[]> {
    if (!customerIds.length) return [];
    const rows = await this.db
      .select({
        customerId: customerInvoiceTable.customerId,
        currency: customerInvoiceTable.currency,
        amount: customerInvoiceTable.amount,
        leftToPay: customerInvoiceTable.leftToPay,
        status: customerInvoiceTable.status,
        dueDate: customerInvoiceTable.dueDate,
      })
      .from(customerInvoiceTable)
      .where(and(
        eq(customerInvoiceTable.companyId, companyId),
        inArray(customerInvoiceTable.customerId, customerIds),
        inArray(customerInvoiceTable.status, [...OWED_STATUSES]),
        isNull(customerInvoiceTable.deletedAt),
      ));
    return rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      leftToPay: r.leftToPay === null ? null : Number(r.leftToPay),
      dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
    }));
  }

  /**
   * Accounts Receivable's word on an issued invoice, on its entry (found by the invoice's id, else by its customer and
   * number): left to pay, the last payment day, Paid or back to Open (lib/receivable receivablePatch), and its partial
   * credit notes' entries owe nothing on their own. Under the locks of the numbers and of the rows, so deliveries at
   * the same moment are written one after the other and the last one read is the one that stands; repeated, it
   * changes nothing. A Credited or Cancelled entry is left as it is. False when the invoice has no live entry (then
   * nothing is written).
   */
  async applyReceivable(companyId: string, input: ReceivableInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await lockNumbers(tx, companyId, [input.invoiceNumber, ...input.creditNoteNumbers]);
      const live = (...where: SQL[]) => and(eq(customerInvoiceTable.companyId, companyId), isNull(customerInvoiceTable.deletedAt), ...where);
      let [entry] = await tx.select().from(customerInvoiceTable)
        .where(live(eq(customerInvoiceTable.invoiceId, input.invoiceId)))
        .orderBy(desc(customerInvoiceTable.createdAt))
        .limit(1)
        .for("update");
      if (!entry) {
        const byNumber = await tx.select().from(customerInvoiceTable)
          .where(live(
            eq(customerInvoiceTable.customerId, input.customerId),
            eq(customerInvoiceTable.invoiceNumber, input.invoiceNumber),
            sql`(${customerInvoiceTable.invoiceId} IS NULL OR ${customerInvoiceTable.invoiceId} = ${input.invoiceId})`,
          ))
          .orderBy(asc(customerInvoiceTable.id))
          .for("update");
        entry = byNumber.sort(firstPosted)[0];
      }
      if (!entry) return false;
      const patch = receivablePatch(entry, input);
      if (patch) {
        await tx.update(customerInvoiceTable)
          .set({ ...patch, source: "invoicing", invoiceId: input.invoiceId, updatedAt: new Date() })
          .where(eq(customerInvoiceTable.id, entry.id));
      }
      const creditNotes = input.creditNoteNumbers.filter((n) => n !== input.invoiceNumber);
      if (creditNotes.length) {
        await tx.update(customerInvoiceTable)
          .set({ leftToPay: 0, source: "invoicing", updatedAt: new Date() })
          .where(live(
            eq(customerInvoiceTable.customerId, entry.customerId),
            inArray(customerInvoiceTable.invoiceNumber, creditNotes),
            notInArray(customerInvoiceTable.status, UNTOUCHED_STATUSES),
            sql`(${customerInvoiceTable.leftToPay} IS DISTINCT FROM 0 OR ${customerInvoiceTable.source} <> 'invoicing')`,
          ));
      }
      return true;
    });
  }

  /**
   * The live entries of these issued documents (by the document's id, else by its customer and number - an entry that
   * names another document is not it), and each of them marked as posted by Invoicing with the document's id. One
   * entry per document id; none when the customer's list has no live entry of it.
   */
  async entriesOfIssued(companyId: string, refs: IssuedRef[]): Promise<Map<string, CustomerInvoiceRecord>> {
    const found = new Map<string, CustomerInvoiceRecord>();
    if (!refs.length) return found;
    const live = (...where: SQL[]) => and(eq(customerInvoiceTable.companyId, companyId), isNull(customerInvoiceTable.deletedAt), ...where);
    const byId = await this.db.select().from(customerInvoiceTable)
      .where(live(inArray(customerInvoiceTable.invoiceId, [...new Set(refs.map((r) => r.invoiceId))])));
    for (const row of byId.sort(firstPosted)) if (row.invoiceId && !found.has(row.invoiceId)) found.set(row.invoiceId, row);
    const rest = refs.filter((r) => !found.has(r.invoiceId));
    if (rest.length) {
      const byNumber = await this.db.select().from(customerInvoiceTable)
        .where(live(
          inArray(customerInvoiceTable.customerId, [...new Set(rest.map((r) => r.customerId))]),
          inArray(customerInvoiceTable.invoiceNumber, [...new Set(rest.map((r) => r.number))]),
        ));
      const taken = new Set([...found.values()].map((r) => r.id));
      for (const ref of rest) {
        const row = byNumber
          .filter((r) => r.customerId === ref.customerId && r.invoiceNumber === ref.number && (!r.invoiceId || r.invoiceId === ref.invoiceId) && !taken.has(r.id))
          .sort(firstPosted)[0];
        if (row) {
          found.set(ref.invoiceId, row);
          taken.add(row.id);
        }
      }
    }
    const unmarked = [...found.entries()].filter(([invoiceId, row]) => row.source !== "invoicing" || row.invoiceId !== invoiceId);
    if (unmarked.length) {
      const values = sql.join(unmarked.map(([invoiceId, row]) => sql`(${row.id}::uuid, ${invoiceId}::uuid)`), sql`, `);
      // Only an entry that names no other document; one marked meanwhile is left as it is.
      await this.db.execute(sql`
        update ${customerInvoiceTable} set source = 'invoicing', invoice_id = v.invoice_id, updated_at = now()
        from (values ${values}) as v(id, invoice_id)
        where ${customerInvoiceTable.id} = v.id and ${customerInvoiceTable.companyId} = ${companyId}
          and ${customerInvoiceTable.deletedAt} is null
          and (${customerInvoiceTable.invoiceId} is null or ${customerInvoiceTable.invoiceId} = v.invoice_id)`);
      for (const [invoiceId, row] of unmarked) found.set(invoiceId, { ...row, source: "invoicing", invoiceId: row.invoiceId ?? invoiceId });
    }
    return found;
  }

  /** A typed entry changed (a manager's edit); null when there is no live typed one - Invoicing may have posted it meanwhile. */
  async updateTyped(id: string, companyId: string, patch: TypedInvoicePatch): Promise<CustomerInvoiceRecord | null> {
    const [row] = await this.db.update(customerInvoiceTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(customerInvoiceTable.id, id), eq(customerInvoiceTable.companyId, companyId), isNull(customerInvoiceTable.deletedAt), eq(customerInvoiceTable.source, "typed")))
      .returning();
    return row ?? null;
  }

  /** A typed entry deleted (soft); false when there is no live typed one - Invoicing may have posted it meanwhile. */
  async softDeleteTyped(id: string, companyId: string): Promise<boolean> {
    const now = new Date();
    const rows = await this.db.update(customerInvoiceTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(customerInvoiceTable.id, id), eq(customerInvoiceTable.companyId, companyId), isNull(customerInvoiceTable.deletedAt), eq(customerInvoiceTable.source, "typed")))
      .returning({ id: customerInvoiceTable.id });
    return rows.length > 0;
  }

  async findByCustomer(customerId: string, companyId: string): Promise<CustomerInvoiceRecord[]> {
    return this.db
      .select()
      .from(customerInvoiceTable)
      .where(and(
        eq(customerInvoiceTable.companyId, companyId),
        eq(customerInvoiceTable.customerId, customerId),
        isNull(customerInvoiceTable.deletedAt),
      ))
      .orderBy(desc(customerInvoiceTable.createdAt));
  }
}

export const customerInvoiceRepository = new CustomerInvoiceRepository();
