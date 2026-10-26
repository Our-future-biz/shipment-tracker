import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import {
  invoiceSellingCostTable as t,
  type InvoiceSellingCostRecord,
  type NewInvoiceSellingCostRecord,
} from "../schemas/invoiceSellingCost.schema";

// Every query on a line also matches its shipment, so a line can only be written through its
// own shipment's URL. Rows pushed by Trucking (source_trucking_ref) are kept by Trucking and
// read-only here: no line write reaches them.
const lineOf = (id: string, companyId: string, shipmentId: string) =>
  and(eq(t.id, id), eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt), isNull(t.sourceTruckingRef));

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
  ): Promise<InvoiceSellingCostRecord | null> {
    const [row] = await this.db
      .update(t)
      .set({ ...data, updatedAt: new Date() })
      .where(lineOf(id, companyId, shipmentId))
      .returning();
    return row ?? null;
  }

  async softDeleteLine(id: string, companyId: string, shipmentId: string): Promise<boolean> {
    const rows = await this.db
      .update(t)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(lineOf(id, companyId, shipmentId))
      .returning({ id: t.id });
    return rows.length > 0;
  }

  async softDeleteForShipment(shipmentId: string, companyId: string): Promise<void> {
    await this.db
      .update(t)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)));
  }
}

export const sellingCostRepository = new SellingCostRepository();
