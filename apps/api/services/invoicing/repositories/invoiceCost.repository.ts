import { and, asc, count, desc, eq, inArray, isNotNull, isNull, max, ne, notInArray, or, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { BUSINESS_TZ } from "../../../lib/businessDate";
import { db } from "../db/db";
import { invoiceCostTable as t, type InvoiceCostRecord, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";
import type { ExpectedGroupRow, ReceivedTotalsRow } from "../lib/supplierCosts";
import { truckingLinesLock } from "./truckingLines.repository";

// Every query on a line also matches its shipment, so a line can only be written through its
// own shipment's URL. Rows pushed by Trucking (source_trucking_ref) are kept by Trucking, and a
// master job's shares (source_master_job_ref) by the master job: read-only here, no line write reaches them.
const lineOf = (id: string, companyId: string, shipmentId: string) =>
  and(eq(t.id, id), eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt), isNull(t.sourceTruckingRef), isNull(t.sourceMasterJobRef));
const deletedLineOf = (id: string, companyId: string, shipmentId: string) =>
  and(eq(t.id, id), eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNotNull(t.deletedAt), isNull(t.sourceTruckingRef), isNull(t.sourceMasterJobRef));

// Rows entered in Costs Breakdown itself (not pushed by Trucking, not a master job's share).
const ENTERED_HERE = [isNull(t.sourceTruckingRef), isNull(t.sourceMasterJobRef)];

// A supplier's live rows entered here and not yet paid, linked to its company (picked, or its haulier id): the
// predicates of the two open-line indexes (invoicing migration 0022).
const openOf = (companyId: string, supplierId: string) =>
  and(eq(t.companyId, companyId), isNull(t.deletedAt), ...ENTERED_HERE, isNull(t.paidOn), or(eq(t.supplierCustomerId, supplierId), eq(t.haulierId, supplierId)));

// A line's amount as Costs Breakdown counts it: price × quantity (none typed = 1), to the cent (lib/invoiceCalc).
const realAmountOf = sql`round(${t.realAmount} * coalesce(${t.realQty}, 1), 2)`;
const estAmountOf = sql`round(${t.estAmount} * coalesce(${t.estQty}, 1), 2)`;
// A line not received yet is expected at its real cost once typed, else its estimate, each in its own currency.
const expectedAmountOf = sql`CASE WHEN ${t.realAmount} IS NOT NULL THEN ${realAmountOf} ELSE ${estAmountOf} END`;
const expectedCurrencyOf = sql<string>`CASE WHEN ${t.realAmount} IS NOT NULL THEN ${t.realCurrency} ELSE ${t.estCurrency} END`;
const expectedOf = (companyId: string, supplierId: string) => and(openOf(companyId, supplierId), eq(t.received, false), sql`${expectedAmountOf} <> 0`);

class InvoiceCostRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "invoice_cost");
  }

  /**
   * A supplier's received open lines per currency, summed over all of them (What we owe's totals): owed - since
   * when is known - with its part due before `today` (the Prague day it was received + `paymentDays`; none
   * without them), and those received before that day was kept (untracked, K2).
   */
  async openReceivedTotals(companyId: string, supplierId: string, paymentDays: number | null, today: string): Promise<ReceivedTotalsRow[]> {
    const tracked = isNotNull(t.receivedAt);
    const overdue = paymentDays === null ? sql`false` : sql`((${t.receivedAt} AT TIME ZONE ${BUSINESS_TZ})::date + ${paymentDays}::int) < ${today}::date`;
    return this.db
      .select({
        currency: t.realCurrency,
        owed: sql<string>`coalesce(sum(${realAmountOf}) FILTER (WHERE ${tracked}), 0)`,
        overdue: sql<string>`coalesce(sum(${realAmountOf}) FILTER (WHERE ${tracked} AND ${overdue}), 0)`,
        untracked: sql<string>`coalesce(sum(${realAmountOf}) FILTER (WHERE ${t.receivedAt} IS NULL), 0)`,
        owedLines: sql<number>`(count(*) FILTER (WHERE ${tracked}))::int`,
        withoutAmount: sql<number>`(count(*) FILTER (WHERE ${tracked} AND ${t.realAmount} IS NULL))::int`,
        untrackedLines: sql<number>`(count(*) FILTER (WHERE ${t.receivedAt} IS NULL))::int`,
        withAmount: sql<number>`count(${t.realAmount})::int`,
      })
      .from(t)
      .where(and(openOf(companyId, supplierId), eq(t.received, true)))
      .groupBy(t.realCurrency);
  }

  /** A supplier's open lines not received yet with an amount, summed per job and currency (a cancelled job's are left out by the caller). */
  async openExpectedByShipment(companyId: string, supplierId: string): Promise<ExpectedGroupRow[]> {
    return this.db
      .select({ shipmentId: t.shipmentId, currency: expectedCurrencyOf, amount: sql<string>`sum(${expectedAmountOf})`, lines: sql<number>`count(*)::int` })
      .from(t)
      .where(expectedOf(companyId, supplierId))
      .groupBy(t.shipmentId, expectedCurrencyOf);
  }

  /**
   * A supplier's owed open lines (received, since when is known), the oldest received first (at most `limit`):
   * every line of a supplier is due its received day + the same payment days, so this is the most overdue first.
   */
  async openOwed(companyId: string, supplierId: string, limit: number): Promise<InvoiceCostRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(openOf(companyId, supplierId), eq(t.received, true), isNotNull(t.receivedAt)))
      .orderBy(asc(t.receivedAt), asc(t.id))
      .limit(limit);
  }

  /** A supplier's open lines ticked Received before that day was kept (K2), the newest entered first (at most `limit`). */
  async openUntracked(companyId: string, supplierId: string, limit: number): Promise<InvoiceCostRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(openOf(companyId, supplierId), eq(t.received, true), isNull(t.receivedAt)))
      .orderBy(desc(t.createdAt), asc(t.id))
      .limit(limit);
  }

  /** A supplier's open lines not received yet with an amount, but none on `exceptShipmentIds`, the newest entered first (at most `limit`). */
  async openExpected(companyId: string, supplierId: string, exceptShipmentIds: string[], limit: number): Promise<InvoiceCostRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(expectedOf(companyId, supplierId), exceptShipmentIds.length ? notInArray(t.shipmentId, exceptShipmentIds) : undefined))
      .orderBy(desc(t.createdAt), asc(t.id))
      .limit(limit);
  }

  /**
   * The jobs a supplier is on: each shipment with a live buying row linked to it (picked, its haulier id,
   * any source - Trucking's rows too) and when the newest of them was entered, newest first (at most `limit`).
   * Read through the two used-line indexes (invoicing migration 0022).
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

  /**
   * `receivedStamp`: Received is ticked. The moment is stamped from the row as it is when written, so a line
   * still received keeps its stamp and one unticked meanwhile gets this one (two saves at once never leave a
   * received line without it, C-5).
   */
  async updateLine(id: string, companyId: string, shipmentId: string, data: Partial<NewInvoiceCostRecord>, receivedStamp?: Date): Promise<InvoiceCostRecord | null> {
    const stamp = receivedStamp ? { receivedAt: sql`CASE WHEN ${t.received} THEN ${t.receivedAt} ELSE ${receivedStamp.toISOString()}::timestamptz END` } : {};
    const [row] = await this.db
      .update(t)
      .set({ ...data, ...stamp, updatedAt: new Date() })
      .where(lineOf(id, companyId, shipmentId))
      .returning();
    return row ?? null;
  }

  /** A line of the shipment deleted here (not one of Trucking's or a master job's), or null. */
  async findDeletedLine(id: string, companyId: string, shipmentId: string): Promise<InvoiceCostRecord | null> {
    const [row] = await this.db.select().from(t).where(deletedLineOf(id, companyId, shipmentId)).limit(1);
    return row ?? null;
  }

  /** Brings a deleted line back as it was, at `sortOrder` when given. */
  async restoreLine(id: string, companyId: string, shipmentId: string, sortOrder?: number): Promise<InvoiceCostRecord | null> {
    const [row] = await this.db
      .update(t)
      .set({ deletedAt: null, updatedAt: new Date(), ...(sortOrder === undefined ? {} : { sortOrder }) })
      .where(deletedLineOf(id, companyId, shipmentId))
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

  /** The live rows of an invoice number on these shipments. */
  async ofInvoiceNumber(companyId: string, shipmentIds: string[], invoiceNumber: string): Promise<Pick<InvoiceCostRecord, "shipmentId" | "category">[]> {
    if (!shipmentIds.length) return [];
    return this.db
      .select({ shipmentId: t.shipmentId, category: t.category })
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, shipmentIds), eq(t.invoiceNumber, invoiceNumber), isNull(t.deletedAt)));
  }

  /**
   * New buying rows of one invoice, all or none, after each shipment's own lines. Written under the
   * shipments' trucking-lines locks, in one order so two writers can't wait on each other; `check`
   * runs once they are held.
   */
  async addInvoiceRows(companyId: string, rows: Omit<NewInvoiceCostRecord, "companyId">[], check: () => Promise<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      const shipmentIds = [...new Set(rows.map((r) => r.shipmentId))].sort();
      for (const id of shipmentIds) await truckingLinesLock(tx, id);
      await check();
      const lasts = await tx
        .select({ shipmentId: t.shipmentId, last: max(t.sortOrder) })
        .from(t)
        .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, shipmentIds), isNull(t.deletedAt)))
        .groupBy(t.shipmentId);
      const next = new Map(lasts.map((l) => [l.shipmentId, (l.last ?? -1) + 1]));
      const values = rows.map((row) => {
        const sortOrder = next.get(row.shipmentId) ?? 0;
        next.set(row.shipmentId, sortOrder + 1);
        return { ...row, companyId, sortOrder };
      });
      await tx.insert(t).values(values);
    });
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
