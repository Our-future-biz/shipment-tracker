import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { invoiceRepository } from "./invoice.repository";
import { truckingLinesLock } from "./truckingLines.repository";
import {
  invoiceSellingCostTable as t,
  type InvoiceSellingCostRecord,
  type NewInvoiceSellingCostRecord,
} from "../schemas/invoiceSellingCost.schema";

// Every query on a line also matches its shipment, so a line can only be written through its
// own shipment's URL. Rows pushed by Trucking (source_trucking_ref) are read-only here: no line
// write reaches them. A row a master job's split keeps (source_master_job_ref) has its charge,
// amount and currency from the split, but how it is billed is the shipment's: putting it on an
// invoice, its own line text and its VAT code - a write of only those reaches it too. Taking it
// off the invoice bills it for nothing, so that is a manager's (`mayUntickSplit`); anyone else asks
// for the row's deletion, which a manager approves.
const SPLIT_ROW_BILLING = new Set<string>(["invoice", "customer", "vatCode"]);
const billingOnly = (data: Partial<NewInvoiceSellingCostRecord>, mayUntickSplit: boolean) =>
  Object.keys(data).every((k) => SPLIT_ROW_BILLING.has(k)) && (data.invoice !== false || mayUntickSplit);
const lineOf = (id: string, companyId: string, shipmentId: string, splitRowToo = false) =>
  and(
    eq(t.id, id),
    eq(t.companyId, companyId),
    eq(t.shipmentId, shipmentId),
    isNull(t.deletedAt),
    isNull(t.sourceTruckingRef),
    splitRowToo ? undefined : isNull(t.sourceMasterJobRef),
  );

class SellingCostRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "invoice_selling_cost");
  }

  /** Live rows of these shipments (the job-profit report reads many jobs at once). */
  async listByShipmentIds(companyId: string, shipmentIds: string[]): Promise<InvoiceSellingCostRecord[]> {
    if (!shipmentIds.length) return [];
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, shipmentIds), isNull(t.deletedAt)));
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<InvoiceSellingCostRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(asc(t.sortOrder), asc(t.createdAt));
  }

  /** Every live selling row in the company, ticked for Invoice or not (for the Invoicing queue). */
  async listLiveByCompany(
    companyId: string,
  ): Promise<Pick<InvoiceSellingCostRecord, "id" | "shipmentId" | "qty" | "amount" | "currency" | "invoice">[]> {
    return this.db
      .select({ id: t.id, shipmentId: t.shipmentId, qty: t.qty, amount: t.amount, currency: t.currency, invoice: t.invoice })
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt)));
  }

  async updateLine(
    id: string,
    companyId: string,
    shipmentId: string,
    data: Partial<NewInvoiceSellingCostRecord>,
    { mayUntickSplit = false } = {},
  ): Promise<InvoiceSellingCostRecord | null> {
    const [row] = await this.db
      .update(t)
      .set({ ...data, updatedAt: new Date() })
      .where(lineOf(id, companyId, shipmentId, billingOnly(data, mayUntickSplit)))
      .returning();
    return row ?? null;
  }

  /**
   * Changes (or, with `delete`, soft-deletes) a row unless it is on an issued, not credited
   * invoice: "invoiced" then, and nothing is written. The check and the write are one transaction
   * under the shipment's trucking-lines lock, the one an invoice issue takes, so a row can't be
   * changed while an invoice with it is being issued.
   */
  async writeUnlessInvoiced(
    id: string,
    companyId: string,
    shipmentId: string,
    change: { delete: true } | { data: Partial<NewInvoiceSellingCostRecord> },
    { mayUntickSplit = false } = {},
  ): Promise<InvoiceSellingCostRecord | "invoiced" | null> {
    return this.db.transaction(async (tx) => {
      await truckingLinesLock(tx, shipmentId);
      if ((await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx)).has(id)) return "invoiced" as const;
      const now = new Date();
      const [row] = await tx
        .update(t)
        .set("delete" in change ? { deletedAt: now, updatedAt: now } : { ...change.data, updatedAt: now })
        .where(lineOf(id, companyId, shipmentId, "data" in change && billingOnly(change.data, mayUntickSplit)))
        .returning();
      return row ?? null;
    });
  }

  /** Whether this is a live row a master job's split keeps on the shipment. */
  async isSplitRow(id: string, companyId: string, shipmentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ ref: t.sourceMasterJobRef })
      .from(t)
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .limit(1);
    return !!row?.ref;
  }

  async softDeleteForShipment(shipmentId: string, companyId: string): Promise<void> {
    await this.db
      .update(t)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)));
  }
}

export const sellingCostRepository = new SellingCostRepository();
