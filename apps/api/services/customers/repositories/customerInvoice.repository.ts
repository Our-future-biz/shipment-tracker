import { and, eq, desc, inArray, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerInvoiceTable, type CustomerInvoiceRecord, type NewCustomerInvoiceRecord } from "../schemas/customerInvoice.schema";
import type { InvoiceStatus } from "../interfaces/interfaces";

class CustomerInvoiceRepository extends TenantRepository<typeof customerInvoiceTable> {
  constructor() {
    super(db, customerInvoiceTable, "customer_invoice");
  }

  /**
   * The customer's entry of an invoice Invoicing issued, by its number: written once, and the same
   * entry again (an outbox delivery repeated) only brings it up to date. Under a lock of the number,
   * so two deliveries at the same moment never add it twice.
   */
  async upsertIssued(companyId: string, values: Omit<NewCustomerInvoiceRecord, "companyId">): Promise<CustomerInvoiceRecord> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`customer-invoice:${companyId}:${values.invoiceNumber}`}))`);
      const live = and(
        eq(customerInvoiceTable.companyId, companyId),
        eq(customerInvoiceTable.customerId, values.customerId),
        eq(customerInvoiceTable.invoiceNumber, values.invoiceNumber),
        isNull(customerInvoiceTable.deletedAt),
      );
      const [existing] = await tx.select().from(customerInvoiceTable).where(live).limit(1);
      if (existing) {
        // A status set since (Paid, Credited) stands; the figures are the invoice's own.
        const [row] = await tx
          .update(customerInvoiceTable)
          .set({ amount: values.amount, currency: values.currency, dueDate: values.dueDate, issuedAt: values.issuedAt, updatedAt: new Date() })
          .where(eq(customerInvoiceTable.id, existing.id))
          .returning();
        return row!;
      }
      const [row] = await tx.insert(customerInvoiceTable).values({ ...values, companyId }).returning();
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
   * What the customers owe, for the Sales managers' cockpit: unpaid (Open / Overdue) amounts per
   * currency, and the overdue ones - marked so, or Open past their due date - with the oldest due day.
   */
  async unpaidOf(companyId: string, customerIds: string[], today: string): Promise<{ customerId: string; currency: string; amount: number; overdue: number; oldestDue: string | null }[]> {
    if (!customerIds.length) return [];
    const overdue = sql`(${customerInvoiceTable.status} = 'Overdue' OR (${customerInvoiceTable.status} = 'Open' AND ${customerInvoiceTable.dueDate} < ${today}::date))`;
    const rows = await this.db
      .select({
        customerId: customerInvoiceTable.customerId,
        currency: customerInvoiceTable.currency,
        amount: sql<string>`sum(${customerInvoiceTable.amount})`,
        overdue: sql<number>`count(*) FILTER (WHERE ${overdue})::int`,
        oldestDue: sql<string | null>`min(${customerInvoiceTable.dueDate}) FILTER (WHERE ${overdue})`,
      })
      .from(customerInvoiceTable)
      .where(and(
        eq(customerInvoiceTable.companyId, companyId),
        inArray(customerInvoiceTable.customerId, customerIds),
        inArray(customerInvoiceTable.status, ["Open", "Overdue"]),
        isNull(customerInvoiceTable.deletedAt),
      ))
      .groupBy(customerInvoiceTable.customerId, customerInvoiceTable.currency);
    return rows.map((r) => ({ ...r, amount: Number(r.amount), oldestDue: r.oldestDue ? String(r.oldestDue).slice(0, 10) : null }));
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
