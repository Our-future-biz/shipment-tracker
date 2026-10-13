import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import {
  customsInvoiceLineTable,
  customsInvoiceTable,
  type CustomsInvoiceLineRecord,
  type CustomsInvoiceRecord,
  type NewCustomsInvoiceLineRecord,
} from "../schemas/customsInvoice.schema";

// Every query also matches the shipment, so a line id from one shipment can't touch another's.
const lineOf = (id: string, companyId: string, shipmentId: string) =>
  and(
    eq(customsInvoiceLineTable.id, id),
    eq(customsInvoiceLineTable.companyId, companyId),
    eq(customsInvoiceLineTable.shipmentId, shipmentId),
    isNull(customsInvoiceLineTable.deletedAt),
  );

class CustomsInvoiceLineRepository extends TenantRepository<typeof customsInvoiceLineTable> {
  constructor() {
    super(db as never, customsInvoiceLineTable, "customs_invoice_line");
  }

  async listLines(shipmentId: string, companyId: string): Promise<CustomsInvoiceLineRecord[]> {
    return this.db
      .select()
      .from(customsInvoiceLineTable)
      .where(
        and(
          eq(customsInvoiceLineTable.companyId, companyId),
          eq(customsInvoiceLineTable.shipmentId, shipmentId),
          isNull(customsInvoiceLineTable.deletedAt),
        ),
      )
      .orderBy(asc(customsInvoiceLineTable.sortOrder), asc(customsInvoiceLineTable.createdAt));
  }

  async updateLine(
    id: string,
    companyId: string,
    shipmentId: string,
    data: Partial<NewCustomsInvoiceLineRecord>,
  ): Promise<CustomsInvoiceLineRecord | null> {
    const [row] = await this.db
      .update(customsInvoiceLineTable)
      .set({ ...data, updatedAt: new Date() })
      .where(lineOf(id, companyId, shipmentId))
      .returning();
    return row ?? null;
  }

  async softDeleteLine(id: string, companyId: string, shipmentId: string): Promise<CustomsInvoiceLineRecord | null> {
    const [row] = await this.db
      .update(customsInvoiceLineTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(lineOf(id, companyId, shipmentId))
      .returning();
    return row ?? null;
  }
}

class CustomsInvoiceRepository extends TenantRepository<typeof customsInvoiceTable> {
  constructor() {
    super(db as never, customsInvoiceTable, "customs_invoice");
  }

  async getInvoice(shipmentId: string, companyId: string): Promise<CustomsInvoiceRecord | null> {
    return this.getByColumnForCompany(customsInvoiceTable.shipmentId, shipmentId, companyId);
  }

  // One statement, so two saves at once can't both insert and trip the unique key.
  async upsertInvoice(shipmentId: string, companyId: string, issuedInvoiceNumber: string): Promise<CustomsInvoiceRecord> {
    const [row] = await this.db
      .insert(customsInvoiceTable)
      .values({ companyId, shipmentId, issuedInvoiceNumber })
      .onConflictDoUpdate({
        target: [customsInvoiceTable.companyId, customsInvoiceTable.shipmentId],
        set: { issuedInvoiceNumber, updatedAt: new Date(), deletedAt: null },
      })
      .returning();
    return row!;
  }
}

export const customsInvoiceLineRepository = new CustomsInvoiceLineRepository();
export const customsInvoiceRepository = new CustomsInvoiceRepository();
