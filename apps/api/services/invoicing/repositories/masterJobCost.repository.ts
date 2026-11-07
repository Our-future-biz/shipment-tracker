import { and, asc, eq, inArray, isNull, like, notInArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceCostTable, type InvoiceCostRecord, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";
import { invoiceSellingCostTable } from "../schemas/invoiceSellingCost.schema";
import { masterJobCostTable as t, type MasterJobCostRecord, type NewMasterJobCostRecord } from "../schemas/masterJobCost.schema";
import {
  masterJobRefPrefix,
  planSoldAtCost,
  soldAtCostInSync,
  soldAtCostRows,
  splitRowColumns,
  splitRowsInSync,
  splitRowUnchanged,
  SPLIT_SORT_BASE,
  type SoldAtCostPlan,
  type SoldAtCostRow,
  type SplitRowValues,
} from "../lib/masterJobSplit";
import { invoiceRepository } from "./invoice.repository";
import { sellingAmountRequestRepository } from "./sellingAmountRequest.repository";
import { truckingLinesLock } from "./truckingLines.repository";

export type { SplitRowValues };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = typeof db | Tx;

const lineOf = (id: string, companyId: string, masterJobId: string) =>
  and(eq(t.id, id), eq(t.companyId, companyId), eq(t.masterJobId, masterJobId), isNull(t.deletedAt));

/** The live rows of a master job's shares in its shipments' Costs Breakdowns. */
const liveSplitRows = (companyId: string, masterJobId: string) =>
  and(
    eq(invoiceCostTable.companyId, companyId),
    like(invoiceCostTable.sourceMasterJobRef, `${masterJobRefPrefix(masterJobId)}%`),
    isNull(invoiceCostTable.deletedAt),
  );

const lockMasterJobCosts = (masterJobId: string) => sql`select pg_advisory_xact_lock(hashtext(${`master-job-costs:${masterJobId}`}))`;

/** The live selling rows a master job's split keeps. */
const liveSoldAtCostRows = (companyId: string, masterJobId: string) =>
  and(
    eq(invoiceSellingCostTable.companyId, companyId),
    like(invoiceSellingCostTable.sourceMasterJobRef, `${masterJobRefPrefix(masterJobId)}%`),
    isNull(invoiceSellingCostTable.deletedAt),
  );

/** The selling rows the master job's split keeps now. */
const currentSoldAtCost = (reader: Reader, companyId: string, masterJobId: string) => {
  const s = invoiceSellingCostTable;
  return reader
    .select({ id: s.id, shipmentId: s.shipmentId, category: s.category, description: s.description, amount: s.amount, currency: s.currency, sourceMasterJobRef: s.sourceMasterJobRef, amountOverrideCost: s.amountOverrideCost })
    .from(s)
    .where(liveSoldAtCostRows(companyId, masterJobId));
};

/** Of these shipments' selling rows, those on an issued invoice. */
async function invoicedAmong(reader: Reader, companyId: string, shipmentIds: Iterable<string>): Promise<Set<string>> {
  const invoiced = new Set<string>();
  for (const shipmentId of shipmentIds) {
    for (const id of await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, reader)) invoiced.add(id);
  }
  return invoiced;
}

/** The buying share rows of a master job by shipment and ref, and those someone copied with Copy from buying. */
async function buyingSharesOf(reader: Reader, companyId: string, masterJobId: string) {
  const c = invoiceCostTable;
  const s = invoiceSellingCostTable;
  const buying = await reader.select({ id: c.id, shipmentId: c.shipmentId, ref: c.sourceMasterJobRef }).from(c).where(liveSplitRows(companyId, masterJobId));
  const idOf = new Map(buying.map((b) => [`${b.shipmentId} ${b.ref}`, b.id]));
  if (buying.length === 0) return { idOf, copied: new Set<string>() };
  const handCopies = await reader
    .select({ buyId: s.sourceBuyId })
    .from(s)
    .where(and(eq(s.companyId, companyId), isNull(s.deletedAt), isNull(s.sourceMasterJobRef), inArray(s.sourceBuyId, buying.map((b) => b.id))));
  const copiedIds = new Set(handCopies.map((r) => r.buyId));
  return { idOf, copied: new Set(buying.filter((b) => copiedIds.has(b.id)).map((b) => `${b.shipmentId} ${b.ref}`)) };
}

class MasterJobCostRepository {
  async list(companyId: string, masterJobId: string): Promise<MasterJobCostRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.masterJobId, masterJobId), isNull(t.deletedAt)))
      .orderBy(asc(t.sortOrder), asc(t.createdAt));
  }

  async create(companyId: string, masterJobId: string, values: Partial<NewMasterJobCostRecord>): Promise<MasterJobCostRecord> {
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${t.sortOrder}), -1)::int + 1` })
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.masterJobId, masterJobId), isNull(t.deletedAt)));
    const [row] = await db
      .insert(t)
      .values({ sortOrder: next ?? 0, ...values, companyId, masterJobId })
      .returning();
    return row!;
  }

  async get(id: string, companyId: string, masterJobId: string): Promise<MasterJobCostRecord | null> {
    const [row] = await db.select().from(t).where(lineOf(id, companyId, masterJobId)).limit(1);
    return row ?? null;
  }

  async update(id: string, companyId: string, masterJobId: string, values: Partial<NewMasterJobCostRecord>): Promise<MasterJobCostRecord | null> {
    const [row] = await db.update(t).set({ ...values, updatedAt: new Date() }).where(lineOf(id, companyId, masterJobId)).returning();
    return row ?? null;
  }

  async softDelete(id: string, companyId: string, masterJobId: string): Promise<boolean> {
    const rows = await db.update(t).set({ deletedAt: new Date(), updatedAt: new Date() }).where(lineOf(id, companyId, masterJobId)).returning({ id: t.id });
    return rows.length > 0;
  }

  /** How many share rows the shipments carry, and whether they, and the selling rows the shares call for, are exactly these. */
  async splitState(companyId: string, masterJobId: string, rows: SplitRowValues[]): Promise<{ written: number; inSync: boolean; sellingOnInvoices: number }> {
    const written = await db.select().from(invoiceCostTable).where(liveSplitRows(companyId, masterJobId));
    const wanted = soldAtCostRows(rows);
    const current = await currentSoldAtCost(db, companyId, masterJobId);
    const invoiced = await invoicedAmong(db, companyId, new Set(current.map((r) => r.shipmentId)));
    const { copied } = await buyingSharesOf(db, companyId, masterJobId);
    const plan = planSoldAtCost(current, wanted, invoiced, copied);
    return { written: written.length, inSync: splitRowsInSync(written, rows) && soldAtCostInSync(plan), sellingOnInvoices: plan.onInvoices };
  }

  /**
   * Takes the master job's shares off every shipment but these (worked out under its lock), and
   * the selling rows they called for unless those are on an issued invoice: a shipment that left
   * carries no cost of it. Nothing is written to the shipments still on it.
   */
  async dropSplitRowsOutside(companyId: string, masterJobId: string, shipmentIds: () => Promise<string[]>): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(lockMasterJobCosts(masterJobId));
      const keep = await shipmentIds();
      const c = invoiceCostTable;
      const now = new Date();
      await tx
        .update(c)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(liveSplitRows(companyId, masterJobId), keep.length ? notInArray(c.shipmentId, keep) : undefined));
      const gone = (await currentSoldAtCost(tx, companyId, masterJobId)).filter((r) => !keep.includes(r.shipmentId));
      const shipments = [...new Set(gone.map((r) => r.shipmentId))].sort();
      for (const shipmentId of shipments) await truckingLinesLock(tx, shipmentId);
      const invoiced = await invoicedAmong(tx, companyId, shipments);
      const remove = gone.filter((r) => !invoiced.has(r.id)).map((r) => r.id);
      if (remove.length) await tx.update(invoiceSellingCostTable).set({ deletedAt: now, updatedAt: now }).where(inArray(invoiceSellingCostTable.id, remove));
      await sellingAmountRequestRepository.withdrawFor(tx, remove);
    });
  }

  /** Writes the selling rows the shares call for, under each shipment's invoice lock. Rows on an issued invoice stay. */
  private async writeSoldAtCost(tx: Tx, companyId: string, masterJobId: string, rows: SplitRowValues[]): Promise<void> {
    const wanted = soldAtCostRows(rows);
    const current = await currentSoldAtCost(tx, companyId, masterJobId);
    const shipments = [...new Set([...wanted.map((r) => r.shipmentId), ...current.map((r) => r.shipmentId)])].sort();
    if (shipments.length === 0) return;
    for (const shipmentId of shipments) await truckingLinesLock(tx, shipmentId);
    const invoiced = await invoicedAmong(tx, companyId, shipments);
    const { idOf, copied } = await buyingSharesOf(tx, companyId, masterJobId);
    const plan: SoldAtCostPlan = planSoldAtCost(current, wanted, invoiced, copied);
    const s = invoiceSellingCostTable;
    const now = new Date();
    const sortOf = new Map(rows.map((r) => [`${r.shipmentId} ${r.sourceMasterJobRef}`, SPLIT_SORT_BASE + r.lineSort]));
    const columns = (row: SoldAtCostRow) => {
      const key = `${row.shipmentId} ${row.sourceMasterJobRef}`;
      return {
        category: row.category,
        description: row.description,
        qty: "1.00",
        amount: row.amount,
        currency: row.currency,
        // Copy from buying sees the buying row is sold already.
        sourceBuyId: idOf.get(key) ?? null,
        sourceMasterJobRef: row.sourceMasterJobRef,
        sortOrder: sortOf.get(key) ?? SPLIT_SORT_BASE,
      };
    };
    if (plan.remove.length) await tx.update(s).set({ deletedAt: now, updatedAt: now }).where(inArray(s.id, plan.remove));
    // A row that left the split has nothing left to approve.
    await sellingAmountRequestRepository.withdrawFor(tx, plan.remove);
    for (const { id, row, keepAmount } of plan.change) {
      const { amount, ...others } = columns(row);
      await tx.update(s).set({ ...others, ...(keepAmount ? {} : { amount, amountOverrideCost: null }), updatedAt: now }).where(eq(s.id, id));
    }
    if (plan.add.length) await tx.insert(s).values(plan.add.map((row) => ({ ...columns(row), companyId, shipmentId: row.shipmentId })));
  }

  /**
   * Writes the master job's shares into its shipments' Costs Breakdowns as one set, in one
   * transaction: a row whose shipment and line are still in the set is updated in place (so
   * what refers to its id - a selling row copied from it - keeps working), a new one comes in and
   * every other live row of the master job goes (also on a shipment no longer linked). The rows
   * are worked out by `compute` while the master job's lock is held, so two writes can't
   * interleave and the one that writes last has read the lines and shipments as they are then.
   */
  async replaceSplitRows(companyId: string, masterJobId: string, compute: () => Promise<SplitRowValues[]>): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(lockMasterJobCosts(masterJobId));
      const rows = await compute();
      const c = invoiceCostTable;
      const now = new Date();
      const existing = await tx.select().from(c).where(liveSplitRows(companyId, masterJobId));
      const byKey = new Map<string, InvoiceCostRecord>();
      const gone: string[] = [];
      for (const row of existing) {
        const key = `${row.shipmentId} ${row.sourceMasterJobRef}`;
        if (byKey.has(key)) gone.push(row.id);
        else byKey.set(key, row);
      }
      const fresh: NewInvoiceCostRecord[] = [];
      for (const row of rows) {
        const values = splitRowColumns(row);
        const key = `${row.shipmentId} ${row.sourceMasterJobRef}`;
        const current = byKey.get(key);
        if (!current) {
          fresh.push({ ...values, companyId });
          continue;
        }
        byKey.delete(key);
        if (!splitRowUnchanged(current, row)) {
          await tx.update(c).set({ ...values, updatedAt: now }).where(eq(c.id, current.id));
        }
      }
      gone.push(...[...byKey.values()].map((r) => r.id));
      if (gone.length) await tx.update(c).set({ deletedAt: now, updatedAt: now }).where(inArray(c.id, gone));
      if (fresh.length) await tx.insert(c).values(fresh);
      await this.writeSoldAtCost(tx, companyId, masterJobId, rows);
    });
  }
}

export const masterJobCostRepository = new MasterJobCostRepository();
