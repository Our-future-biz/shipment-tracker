import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceLineTable, invoiceTable, type NewInvoiceLineRecord, type NewInvoiceRecord } from "../schemas/invoice.schema";
import { nextSequence } from "../lib/invoiceNumber";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type InvoiceHeaderInput = Omit<NewInvoiceRecord, "number" | "id" | "createdAt" | "updatedAt">;
export type InvoiceLineInput = Omit<NewInvoiceLineRecord, "invoiceId" | "companyId" | "id" | "createdAt" | "updatedAt">;

class InvoiceRepository {
  async listByShipment(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(invoiceTable)
      .where(and(eq(invoiceTable.companyId, companyId), eq(invoiceTable.shipmentId, shipmentId)))
      .orderBy(desc(invoiceTable.createdAt));
  }

  async getById(id: string, companyId: string) {
    const [row] = await db
      .select()
      .from(invoiceTable)
      .where(and(eq(invoiceTable.id, id), eq(invoiceTable.companyId, companyId)))
      .limit(1);
    return row ?? null;
  }

  async getLines(invoiceId: string, companyId: string) {
    return db
      .select()
      .from(invoiceLineTable)
      .where(and(eq(invoiceLineTable.invoiceId, invoiceId), eq(invoiceLineTable.companyId, companyId)))
      .orderBy(asc(invoiceLineTable.seq));
  }

  async getByIdempotencyKey(companyId: string, key: string) {
    const [row] = await db
      .select()
      .from(invoiceTable)
      .where(and(eq(invoiceTable.companyId, companyId), eq(invoiceTable.idempotencyKey, key)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Issues a document: takes the next number of its series and writes the header and the
   * lines in one transaction. The advisory lock serialises issuing within a series, so
   * two clicks at the same moment can never get the same number or leave a gap.
   * `afterInsert` runs inside the same transaction (e.g. marking the original as credited).
   */
  async issue(
    seriesPrefix: string,
    header: InvoiceHeaderInput,
    lines: InvoiceLineInput[],
    afterInsert?: (tx: Tx, invoiceId: string) => Promise<void>,
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-number:${header.companyId}:${seriesPrefix}`}))`);
      const used = await tx
        .select({ number: invoiceTable.number })
        .from(invoiceTable)
        .where(and(eq(invoiceTable.companyId, header.companyId), like(invoiceTable.number, `${seriesPrefix}%`)));
      const seq = nextSequence(used.map((r) => r.number), seriesPrefix);
      const number = `${seriesPrefix}${String(seq).padStart(3, "0")}`;

      const [invoice] = await tx.insert(invoiceTable).values({ ...header, number }).returning();
      const saved = lines.length
        ? await tx
            .insert(invoiceLineTable)
            .values(lines.map((l) => ({ ...l, invoiceId: invoice!.id, companyId: header.companyId })))
            .returning()
        : [];
      if (afterInsert) await afterInsert(tx, invoice!.id);
      return { invoice: invoice!, lines: saved };
    });
  }

  /**
   * The only status change an issued invoice allows (enforced by the database trigger too).
   * false = it was already credited, e.g. by a credit note issued a moment earlier.
   */
  async markCredited(tx: Tx, id: string, companyId: string): Promise<boolean> {
    const rows = await tx
      .update(invoiceTable)
      .set({ status: "credited", updatedAt: new Date() })
      .where(and(eq(invoiceTable.id, id), eq(invoiceTable.companyId, companyId), eq(invoiceTable.status, "issued")))
      .returning({ id: invoiceTable.id });
    return rows.length > 0;
  }

  /**
   * Stores the PDF reference once. false = another request stored one a moment earlier;
   * that first file stays the official copy.
   */
  async setPdfIfMissing(id: string, companyId: string, pdfKey: string, pdfSha256: string): Promise<boolean> {
    const rows = await db
      .update(invoiceTable)
      .set({ pdfKey, pdfSha256, updatedAt: new Date() })
      .where(and(eq(invoiceTable.id, id), eq(invoiceTable.companyId, companyId), eq(invoiceTable.pdfKey, "")))
      .returning({ id: invoiceTable.id });
    return rows.length > 0;
  }
}

export const invoiceRepository = new InvoiceRepository();
