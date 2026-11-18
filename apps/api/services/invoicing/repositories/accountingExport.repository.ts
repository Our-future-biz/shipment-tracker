import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "../db/db";
import { accountingExportDocumentTable as d, accountingExportTable as e, type AccountingExportRecord, type AccountingSystem } from "../schemas/accountingExport.schema";
import { invoiceLineTable as lineT, invoiceTable as t, type InvoiceLineRecord, type InvoiceRecord } from "../schemas/invoice.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ExportTx = Tx;

// Exports to the accounting system (schemas/accountingExport). The issued documents are only read here. An export is
// built and recorded in one transaction under the company's export lock, so two managers exporting at once cannot
// both hand the same documents over as new.

/** When a document went to the accounting system last (its latest export). */
export interface ExportedBefore {
  exportId: string;
  fileName: string;
  at: Date;
}

const lock = (tx: Tx, companyId: string, system: AccountingSystem) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`accounting-export:${system}:${companyId}`}))`);

const PER_QUERY = 1000;
const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export const accountingExportRepository = {
  /** Runs `work` in one transaction holding the company's export lock for the system. */
  async inExport<T>(companyId: string, system: AccountingSystem, work: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await lock(tx, companyId, system);
      return work(tx);
    });
  },

  /** The company's invoices and credit notes issued from `from` to `to` (both days in), any status; at most `limit`. */
  async issuedIn(tx: Tx, companyId: string, from: string, to: string, limit: number): Promise<InvoiceRecord[]> {
    return tx
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), gte(t.issueDate, from), lte(t.issueDate, to)))
      .orderBy(asc(t.issueDate), asc(t.kind), asc(t.number))
      .limit(limit);
  },

  /** Number of each invoice by id (the invoices credit notes correct, which may be outside the period). */
  async numbersOf(tx: Tx, companyId: string, ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const batch of chunks([...new Set(ids)], PER_QUERY)) {
      const rows = await tx.select({ id: t.id, number: t.number }).from(t).where(and(eq(t.companyId, companyId), inArray(t.id, batch)));
      for (const r of rows) out.set(r.id, r.number);
    }
    return out;
  },

  async linesOf(tx: Tx, companyId: string, invoiceIds: string[]): Promise<Map<string, InvoiceLineRecord[]>> {
    const out = new Map<string, InvoiceLineRecord[]>();
    for (const batch of chunks(invoiceIds, PER_QUERY)) {
      const rows = await tx
        .select()
        .from(lineT)
        .where(and(eq(lineT.companyId, companyId), inArray(lineT.invoiceId, batch), isNull(lineT.deletedAt)))
        .orderBy(asc(lineT.invoiceId), asc(lineT.seq));
      for (const r of rows) out.set(r.invoiceId, [...(out.get(r.invoiceId) ?? []), r]);
    }
    return out;
  },

  /**
   * For each document already handed to the system: its latest export. `madeBefore`: only exports made before then
   * (an export answered again for its idempotency key sees what its first answer saw).
   */
  async exportedBefore(tx: Tx, companyId: string, system: AccountingSystem, invoiceIds: string[], madeBefore?: Date): Promise<Map<string, ExportedBefore>> {
    const out = new Map<string, ExportedBefore>();
    for (const batch of chunks([...new Set(invoiceIds)], PER_QUERY)) {
      const rows = await tx
        .select({ invoiceId: d.invoiceId, exportId: e.id, fileName: e.fileName, at: e.createdAt })
        .from(d)
        .innerJoin(e, eq(e.id, d.exportId))
        .where(and(eq(d.companyId, companyId), eq(d.system, system), inArray(d.invoiceId, batch), isNull(d.deletedAt), isNull(e.deletedAt), madeBefore ? lt(e.createdAt, madeBefore) : undefined))
        .orderBy(asc(e.createdAt));
      // the latest wins
      for (const r of rows) out.set(r.invoiceId, { exportId: r.exportId, fileName: r.fileName, at: r.at });
    }
    return out;
  },

  /** Records the export and the documents it carried (in the transaction that built the file). */
  async record(
    tx: Tx,
    values: { id: string; companyId: string; system: AccountingSystem; fromDate: string; toDate: string; fileName: string; fileSha256: string; createdByUserId: string; createdBy: string },
    invoiceIds: string[],
  ): Promise<AccountingExportRecord> {
    const [row] = await tx
      .insert(e)
      .values({ ...values, documents: invoiceIds.length })
      .returning();
    for (const batch of chunks(invoiceIds, PER_QUERY)) {
      await tx.insert(d).values(batch.map((invoiceId) => ({ companyId: values.companyId, exportId: values.id, invoiceId, system: values.system })));
    }
    return row!;
  },

  /** One export of the company, or null. */
  async exportById(tx: Tx, companyId: string, id: string): Promise<AccountingExportRecord | null> {
    const [row] = await tx
      .select()
      .from(e)
      .where(and(eq(e.companyId, companyId), eq(e.id, id), isNull(e.deletedAt)))
      .limit(1);
    return row ?? null;
  },

  /** The documents an export carried. */
  async documentIdsOf(tx: Tx, companyId: string, exportId: string): Promise<Set<string>> {
    const rows = await tx
      .select({ invoiceId: d.invoiceId })
      .from(d)
      .where(and(eq(d.companyId, companyId), eq(d.exportId, exportId), isNull(d.deletedAt)));
    return new Set(rows.map((r) => r.invoiceId));
  },

  /** The company's exports, the newest first. */
  async list(companyId: string, limit: number): Promise<AccountingExportRecord[]> {
    return db
      .select()
      .from(e)
      .where(and(eq(e.companyId, companyId), isNull(e.deletedAt)))
      .orderBy(desc(e.createdAt))
      .limit(limit);
  },
};
