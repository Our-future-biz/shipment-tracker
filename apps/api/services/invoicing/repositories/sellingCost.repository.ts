import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { invoiceRepository } from "./invoice.repository";
import { truckingLinesLock } from "./truckingLines.repository";
import {
  invoiceSellingCostTable as t,
  type InvoiceSellingCostRecord,
  type NewInvoiceSellingCostRecord,
} from "../schemas/invoiceSellingCost.schema";
import type { SellingVatCode } from "../interfaces/interfaces";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One negative row a partial credit note puts on the shipment (lib/partialCredit). */
export interface CreditRowInput {
  /** Taken before the credit note's lines are written: each line names its row as its source. */
  id: string;
  /** The selling row the credited invoice line was made from, when it had one */
  sourceRowId: string | null;
  /** The invoice line's text */
  lineText: string;
  /** What was credited, in the line's own currency (positive) */
  amount: number;
  currency: string;
  vatCode: string;
}

const SELLING_VAT = new Set<string>(["S21", "Z69", "RC", "OUT"]);

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

/**
 * What a line write owes, in the write's own transaction: `before` is the line as it was (null for a
 * new one), `after` as it is now (null once deleted). invoicing.service hands one in so that the
 * shipment's statuses follow a charge added or taken away after invoicing (lib/shipmentStatus).
 */
export type AfterSellingWrite = (tx: Tx, before: InvoiceSellingCostRecord | null, after: InvoiceSellingCostRecord | null) => Promise<void>;

/** One line of a write that changes several at once (a Trucking push): `before` null for a new line, `now` null once deleted. */
export interface SellingLineWrite {
  before: SellingLineValue | null;
  now: SellingLineValue | null;
}
/** What a line's follow-up reads of it: its value, and its text for the shipment's history. */
export type SellingLineValue = Pick<InvoiceSellingCostRecord, "description" | "category" | "qty" | "amount" | "currency">;

/** What a write of several lines owes, in its own transaction, as AfterSellingWrite does for one. */
export type AfterSellingSetWrite = (tx: Tx, writes: SellingLineWrite[]) => Promise<void>;

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

  /**
   * The live selling rows of the shipments an Invoicing queue view lists, ticked for Invoice or not:
   * only those shipments' (at most the view's limit), never every row the company has.
   */
  async listLiveByShipments(
    shipmentIds: string[],
    companyId: string,
  ): Promise<Pick<InvoiceSellingCostRecord, "id" | "shipmentId" | "qty" | "amount" | "currency" | "invoice">[]> {
    const ids = [...new Set(shipmentIds)];
    if (!ids.length) return [];
    return this.db
      .select({ id: t.id, shipmentId: t.shipmentId, qty: t.qty, amount: t.amount, currency: t.currency, invoice: t.invoice })
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, ids), isNull(t.deletedAt)));
  }

  /**
   * Adds a line, and what it owes (`after`) with it in one transaction - under the shipment's
   * trucking-lines lock, the one an invoice issue takes, so the line and an invoice being issued
   * meanwhile are written one after the other, and their follow-ups are made in that order.
   */
  async createLine(companyId: string, values: Omit<NewInvoiceSellingCostRecord, "companyId">, after?: AfterSellingWrite): Promise<InvoiceSellingCostRecord> {
    return this.db.transaction(async (tx) => {
      await truckingLinesLock(tx, values.shipmentId);
      const [row] = await tx
        .insert(t)
        .values({ ...values, companyId })
        .returning();
      await after?.(tx, null, row!);
      return row!;
    });
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
    { mayUntickSplit = false, after }: { mayUntickSplit?: boolean; after?: AfterSellingWrite } = {},
  ): Promise<InvoiceSellingCostRecord | "invoiced" | null> {
    return this.db.transaction(async (tx) => {
      await truckingLinesLock(tx, shipmentId);
      if ((await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx)).has(id)) return "invoiced" as const;
      // The line as it was, for what the write owes: read only when something is owed.
      const [before] = after ? await tx.select().from(t).where(lineOf(id, companyId, shipmentId, true)).limit(1) : [];
      const now = new Date();
      const [row] = await tx
        .update(t)
        .set("delete" in change ? { deletedAt: now, updatedAt: now } : { ...change.data, updatedAt: now })
        .where(lineOf(id, companyId, shipmentId, "data" in change && billingOnly(change.data, mayUntickSplit)))
        .returning();
      if (row && after) await after(tx, before ?? null, "delete" in change ? null : row);
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

  /**
   * The negative rows of a partial credit note: one per credited line, below the shipment's other
   * rows, with the charge of the row the line was made from. They lower the shipment's revenue by
   * what was credited, and are its lines' sources, so they count as invoiced while the invoice stands.
   */
  async insertCreditRows(tx: Tx, companyId: string, shipmentId: string, creditNote: { id: string; number: string }, rows: CreditRowInput[]): Promise<void> {
    if (!rows.length) return;
    const sourceIds = rows.map((r) => r.sourceRowId).filter((x): x is string => !!x);
    const sources = sourceIds.length
      ? await tx.select({ id: t.id, category: t.category }).from(t).where(and(eq(t.companyId, companyId), inArray(t.id, sourceIds)))
      : [];
    const categoryOf = new Map(sources.map((r) => [r.id, r.category]));
    const [{ last }] = await tx
      .select({ last: sql<number>`coalesce(max(${t.sortOrder}), 0)::int` })
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)));
    await tx.insert(t).values(
      rows.map((r, i) => ({
        id: r.id,
        companyId,
        shipmentId,
        category: (r.sourceRowId && categoryOf.get(r.sourceRowId)) || "",
        description: `Credited on ${creditNote.number}`,
        customer: `${r.lineText} - credit note ${creditNote.number}`,
        qty: "1.00",
        amount: (-r.amount).toFixed(2),
        currency: r.currency || "CZK",
        invoice: true,
        vatCode: SELLING_VAT.has(r.vatCode) ? (r.vatCode as SellingVatCode) : null,
        sortOrder: (last ?? 0) + 1 + i,
        sourceCreditNoteId: creditNote.id,
      })),
    );
  }
}

export const sellingCostRepository = new SellingCostRepository();
