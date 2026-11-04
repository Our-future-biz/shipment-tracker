import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { invoiceCostTable as t, type InvoiceCostRecord, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";

// Every query on a line also matches its shipment, so a line can only be written through its
// own shipment's URL. Rows pushed by Trucking (source_trucking_ref) are kept by Trucking, and a
// master job's shares (source_master_job_ref) by the master job: read-only here, no line write reaches them.
const lineOf = (id: string, companyId: string, shipmentId: string) =>
  and(eq(t.id, id), eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt), isNull(t.sourceTruckingRef), isNull(t.sourceMasterJobRef));

// Rows entered in Costs Breakdown itself (not pushed by Trucking, not a master job's share).
const ENTERED_HERE = [isNull(t.sourceTruckingRef), isNull(t.sourceMasterJobRef)];

class InvoiceCostRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "invoice_cost");
  }

  /**
   * A supplier's live buying rows not yet paid, newest first (at most `limit`): linked to its company
   * (picked, or its haulier id), entered here - Trucking's and a master job's rows are left out. Read
   * through the two open-line indexes (invoicing migration 0021).
   */
  async openOfSupplier(companyId: string, supplierId: string, limit: number): Promise<InvoiceCostRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), ...ENTERED_HERE, isNull(t.paidOn), or(eq(t.supplierCustomerId, supplierId), eq(t.haulierId, supplierId))))
      .orderBy(desc(t.createdAt), asc(t.id))
      .limit(limit);
  }

  /**
   * The jobs a supplier is on: each shipment with a live buying row linked to it (picked, its haulier id,
   * any source - Trucking's rows too) and when the newest of them was entered, newest first (at most `limit`).
   */
  async linkedShipments(companyId: string, supplierId: string, limit: number): Promise<{ shipmentId: string; lastAt: Date }[]> {
    const lastAt = sql<Date>`max(${t.createdAt})`;
    const rows = await this.db
      .select({ shipmentId: t.shipmentId, lastAt })
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), or(eq(t.supplierCustomerId, supplierId), eq(t.haulierId, supplierId))))
      .groupBy(t.shipmentId)
      .orderBy(desc(lastAt))
      .limit(limit);
    return rows.map((r) => ({ shipmentId: r.shipmentId, lastAt: new Date(r.lastAt) }));
  }

  /**
   * The vendor texts of live rows not yet paid and linked to no company, each with its row count: only rows
   * that would be counted once linked (not received yet, or received since that day is kept, K2).
   */
  async openTypedVendors(companyId: string): Promise<{ vendor: string; lines: number }[]> {
    return this.db
      .select({ vendor: t.vendor, lines: count() })
      .from(t)
      .where(
        and(
          eq(t.companyId, companyId),
          isNull(t.deletedAt),
          ...ENTERED_HERE,
          isNull(t.paidOn),
          isNull(t.supplierCustomerId),
          isNull(t.haulierId),
          sql`btrim(${t.vendor}) <> ''`,
          or(eq(t.received, false), isNotNull(t.receivedAt)),
        ),
      )
      .groupBy(t.vendor);
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

  /** Of these shipments, the ones with a live buying line copied from a quote (hasQuoteRows for many at once). */
  async quotePricedAmong(companyId: string, shipmentIds: string[]): Promise<Set<string>> {
    if (!shipmentIds.length) return new Set();
    const rows = await this.db
      .selectDistinct({ shipmentId: t.shipmentId })
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, shipmentIds), isNull(t.deletedAt), ne(t.sourceQuoteNumber, "")));
    return new Set(rows.map((r) => r.shipmentId));
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

  /** The first live line of a charge code of a shipment, in the order Costs Breakdown lists them (Trucking's and master jobs' rows left out). */
  async findByCategory(shipmentId: string, companyId: string, category: string): Promise<InvoiceCostRecord | null> {
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), eq(t.category, category), isNull(t.deletedAt), isNull(t.sourceTruckingRef), isNull(t.sourceMasterJobRef)))
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
