import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { invoiceCostTable as t, type InvoiceCostRecord, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";

// Every query on a line also matches its shipment, so a line can only be written through its
// own shipment's URL. Rows pushed by Trucking (source_trucking_ref) are kept by Trucking and
// read-only here: no line write reaches them.
const lineOf = (id: string, companyId: string, shipmentId: string) =>
  and(eq(t.id, id), eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt), isNull(t.sourceTruckingRef));

class InvoiceCostRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "invoice_cost");
  }

  /** Live rows of these shipments (the job-profit report reads many jobs at once). */
  async listByShipmentIds(companyId: string, shipmentIds: string[]): Promise<InvoiceCostRecord[]> {
    if (!shipmentIds.length) return [];
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, shipmentIds), isNull(t.deletedAt)));
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<InvoiceCostRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(asc(t.sortOrder), asc(t.createdAt));
  }

  /** Whether the shipment has a live buying line copied from a quote: its estimate is then the quote's alone. */
  async hasQuoteRows(companyId: string, shipmentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt), ne(t.sourceQuoteNumber, "")))
      .limit(1);
    return !!row;
  }

  /** A live line of the shipment that may be written here (not one of Trucking's), or null. */
  async findLine(id: string, companyId: string, shipmentId: string): Promise<InvoiceCostRecord | null> {
    const [row] = await this.db.select().from(t).where(lineOf(id, companyId, shipmentId)).limit(1);
    return row ?? null;
  }

  async updateLine(id: string, companyId: string, shipmentId: string, data: Partial<NewInvoiceCostRecord>): Promise<InvoiceCostRecord | null> {
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

  /** The first live line of a charge code of a shipment, in the order Costs Breakdown lists them (Trucking's rows left out). */
  async findByCategory(shipmentId: string, companyId: string, category: string): Promise<InvoiceCostRecord | null> {
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), eq(t.category, category), isNull(t.deletedAt), isNull(t.sourceTruckingRef)))
      .orderBy(asc(t.sortOrder), asc(t.createdAt))
      .limit(1);
    return row ?? null;
  }

  async softDeleteForShipment(shipmentId: string, companyId: string): Promise<void> {
    await this.db
      .update(t)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)));
  }
}

export const invoiceCostRepository = new InvoiceCostRepository();
