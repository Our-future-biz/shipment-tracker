import { and, asc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceCostTable, type InvoiceCostRecord, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";
import { masterJobCostTable as t, type MasterJobCostRecord, type NewMasterJobCostRecord } from "../schemas/masterJobCost.schema";
import { masterJobRefPrefix } from "../lib/masterJobSplit";

// Split rows go after a shipment's own lines.
const SPLIT_SORT_BASE = 100_000;

const lineOf = (id: string, companyId: string, masterJobId: string) =>
  and(eq(t.id, id), eq(t.companyId, companyId), eq(t.masterJobId, masterJobId), isNull(t.deletedAt));

/** A shipment's share of a line, as written into its Costs Breakdown. */
export type SplitRowValues = Pick<
  NewInvoiceCostRecord,
  "shipmentId" | "category" | "description" | "vendor" | "estAmount" | "estCurrency" | "realAmount" | "realCurrency" | "invoiceNumber" | "received" | "sourceMasterJobRef"
> & { lineSort: number };

// The columns a split row takes from its line: an unchanged row is not written again.
const SPLIT_FIELDS = [
  "category", "description", "vendor", "estAmount", "estCurrency", "realAmount", "realCurrency", "invoiceNumber", "received", "sortOrder",
] as const;

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

  /**
   * Writes the master job's shares into its shipments' Costs Breakdowns as one set, in one
   * transaction: a row whose shipment and line are still in the set is updated in place (so
   * what refers to its id - a selling row copied from it - keeps working), a new one comes in and
   * every other live row of the master job goes (also on a shipment no longer linked). The rows
   * are worked out by `compute` while the master job's lock is held, so two re-splits can't
   * interleave and the one that writes last has read the lines and shipments as they are then.
   */
  async replaceSplitRows(companyId: string, masterJobId: string, compute: () => Promise<SplitRowValues[]>): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`master-job-costs:${masterJobId}`}))`);
      const rows = await compute();
      const c = invoiceCostTable;
      const now = new Date();
      const existing = await tx
        .select()
        .from(c)
        .where(and(eq(c.companyId, companyId), like(c.sourceMasterJobRef, `${masterJobRefPrefix(masterJobId)}%`), isNull(c.deletedAt)));
      const byKey = new Map<string, InvoiceCostRecord>();
      const gone: string[] = [];
      for (const row of existing) {
        const key = `${row.shipmentId} ${row.sourceMasterJobRef}`;
        if (byKey.has(key)) gone.push(row.id);
        else byKey.set(key, row);
      }
      const fresh: NewInvoiceCostRecord[] = [];
      for (const { lineSort, ...row } of rows) {
        const values = { ...row, sortOrder: SPLIT_SORT_BASE + lineSort };
        const key = `${row.shipmentId} ${row.sourceMasterJobRef}`;
        const current = byKey.get(key);
        if (!current) {
          fresh.push({ ...values, companyId });
          continue;
        }
        byKey.delete(key);
        if (SPLIT_FIELDS.some((f) => (current[f] ?? null) !== (values[f] ?? null))) {
          await tx.update(c).set({ ...values, updatedAt: now }).where(eq(c.id, current.id));
        }
      }
      gone.push(...[...byKey.values()].map((r) => r.id));
      if (gone.length) await tx.update(c).set({ deletedAt: now, updatedAt: now }).where(inArray(c.id, gone));
      if (fresh.length) await tx.insert(c).values(fresh);
    });
  }
}

export const masterJobCostRepository = new MasterJobCostRepository();
