import { and, asc, eq, isNull, like, sql } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceCostTable, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";
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

  async update(id: string, companyId: string, masterJobId: string, values: Partial<NewMasterJobCostRecord>): Promise<MasterJobCostRecord | null> {
    const [row] = await db.update(t).set({ ...values, updatedAt: new Date() }).where(lineOf(id, companyId, masterJobId)).returning();
    return row ?? null;
  }

  async softDelete(id: string, companyId: string, masterJobId: string): Promise<boolean> {
    const rows = await db.update(t).set({ deletedAt: new Date(), updatedAt: new Date() }).where(lineOf(id, companyId, masterJobId)).returning({ id: t.id });
    return rows.length > 0;
  }

  /**
   * Replaces the master job's shares in its shipments' Costs Breakdowns as one set, in one
   * transaction: every live row of the master job goes (also on a shipment no longer linked) and
   * the new ones come in. A lock on the master job keeps two re-splits from interleaving.
   */
  async replaceSplitRows(companyId: string, masterJobId: string, rows: SplitRowValues[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`master-job-costs:${masterJobId}`}))`);
      const c = invoiceCostTable;
      const now = new Date();
      await tx
        .update(c)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(c.companyId, companyId), like(c.sourceMasterJobRef, `${masterJobRefPrefix(masterJobId)}%`), isNull(c.deletedAt)));
      if (rows.length) {
        await tx.insert(c).values(rows.map(({ lineSort, ...row }) => ({ ...row, companyId, sortOrder: SPLIT_SORT_BASE + lineSort })));
      }
    });
  }
}

export const masterJobCostRepository = new MasterJobCostRepository();
