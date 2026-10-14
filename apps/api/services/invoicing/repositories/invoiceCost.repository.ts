import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { invoiceCostTable as t, type InvoiceCostRecord, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";

// Every query on a line also matches its shipment, so a line can only be written through its
// own shipment's URL.
const lineOf = (id: string, companyId: string, shipmentId: string) =>
  and(eq(t.id, id), eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt));

class InvoiceCostRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "invoice_cost");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<InvoiceCostRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(asc(t.sortOrder), asc(t.createdAt));
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

  /** The live line of a category of a shipment (the older per-category costs). */
  async findByCategory(shipmentId: string, companyId: string, category: string): Promise<InvoiceCostRecord | null> {
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), eq(t.category, category), isNull(t.deletedAt)))
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
