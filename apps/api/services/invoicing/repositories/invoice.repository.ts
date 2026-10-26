import { and, asc, desc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import {
  invoiceLineTable as lineT,
  invoiceTable as t,
  type InvoiceLineRecord,
  type InvoiceRecord,
  type NewInvoiceLineRecord,
  type NewInvoiceRecord,
} from "../schemas/invoice.schema";
import { nextSequence } from "../lib/invoiceNumber";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = typeof db | Tx;

export type InvoiceHeaderInput = Omit<NewInvoiceRecord, "number" | "id" | "createdAt" | "updatedAt">;
export type InvoiceLineInput = Omit<NewInvoiceLineRecord, "invoiceId" | "companyId" | "id" | "createdAt" | "updatedAt">;

export interface OpenInvoiceWithSources {
  id: string;
  shipmentId: string;
  number: string;
  currency: string;
  gross: string;
  duzp: string;
  sourceSellingCostIds: (string | null)[];
}

export interface IssueHooks {
  /** Runs under the series lock before the number is taken, e.g. to re-check what may be invoiced. */
  beforeInsert?: (tx: Tx) => Promise<void>;
  /** Runs in the same transaction after the insert, e.g. marking the original as credited. */
  afterInsert?: (tx: Tx, invoiceId: string) => Promise<void>;
}

// An issued, not credited invoice (credit notes are never "open").
const openInvoice = (companyId: string) =>
  and(eq(t.companyId, companyId), eq(t.kind, "invoice"), eq(t.status, "issued"), isNull(t.deletedAt));

/**
 * Tax documents are immutable once issued (database triggers, migration 0011): nothing here
 * updates their content or deletes them; the only writes are issuing, marking an invoice as
 * credited and storing its PDF.
 */
class InvoiceRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "invoice");
  }

  async listByShipment(shipmentId: string, companyId: string): Promise<InvoiceRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(desc(t.createdAt));
  }

  async getLines(invoiceId: string, companyId: string): Promise<InvoiceLineRecord[]> {
    return this.db
      .select()
      .from(lineT)
      .where(and(eq(lineT.invoiceId, invoiceId), eq(lineT.companyId, companyId), isNull(lineT.deletedAt)))
      .orderBy(asc(lineT.seq));
  }

  /**
   * Issued, not credited invoices of the company, with the selling rows their lines were
   * made from (for the "Ready to bill" queue).
   */
  async listOpenInvoicesWithSources(companyId: string): Promise<OpenInvoiceWithSources[]> {
    const invoices = await this.db
      .select({ id: t.id, shipmentId: t.shipmentId, number: t.number, currency: t.currency, gross: t.gross, duzp: t.duzp })
      .from(t)
      .where(openInvoice(companyId));
    if (!invoices.length) return [];
    const lines = await this.db
      .select({ invoiceId: lineT.invoiceId, source: lineT.sourceSellingCostId })
      .from(lineT)
      .where(and(eq(lineT.companyId, companyId), inArray(lineT.invoiceId, invoices.map((i) => i.id))));
    return invoices.map((i) => ({
      ...i,
      sourceSellingCostIds: lines.filter((l) => l.invoiceId === i.id).map((l) => l.source),
    }));
  }

  /**
   * Selling rows of a shipment that are already on an issued, not credited invoice: they must
   * not be invoiced again. `reader` lets the issue transaction re-check under its lock.
   */
  async invoicedSellingRowIds(shipmentId: string, companyId: string, reader: Reader = db): Promise<Set<string>> {
    const rows = await reader
      .select({ source: lineT.sourceSellingCostId })
      .from(lineT)
      .innerJoin(t, eq(lineT.invoiceId, t.id))
      .where(and(openInvoice(companyId), eq(t.shipmentId, shipmentId), eq(lineT.companyId, companyId)));
    return new Set(rows.map((r) => r.source).filter((s): s is string => !!s));
  }

  async countOpenInvoices(shipmentId: string, companyId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(openInvoice(companyId), eq(t.shipmentId, shipmentId)));
    return row?.n ?? 0;
  }

  async getByIdempotencyKey(companyId: string, key: string): Promise<InvoiceRecord | null> {
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.idempotencyKey, key)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Issues a document: takes the next number of its series and writes the header and the
   * lines in one transaction. The advisory lock serialises issuing within a series (one per
   * job and document type), so two clicks at the same moment can never get the same number,
   * leave a gap, or bill the same selling rows twice (checked in `beforeInsert`).
   */
  async issue(
    seriesPrefix: string,
    header: InvoiceHeaderInput,
    lines: InvoiceLineInput[],
    hooks: IssueHooks = {},
  ): Promise<{ invoice: InvoiceRecord; lines: InvoiceLineRecord[] }> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-number:${header.companyId}:${seriesPrefix}`}))`);
      if (hooks.beforeInsert) await hooks.beforeInsert(tx);
      const used = await tx
        .select({ number: t.number })
        .from(t)
        .where(and(eq(t.companyId, header.companyId), like(t.number, `${seriesPrefix}%`)));
      const seq = nextSequence(used.map((r) => r.number), seriesPrefix);
      const number = `${seriesPrefix}${String(seq).padStart(3, "0")}`;

      const [invoice] = await tx.insert(t).values({ ...header, number }).returning();
      const saved = lines.length
        ? await tx
            .insert(lineT)
            .values(lines.map((l) => ({ ...l, invoiceId: invoice!.id, companyId: header.companyId })))
            .returning()
        : [];
      if (hooks.afterInsert) await hooks.afterInsert(tx, invoice!.id);
      return { invoice: invoice!, lines: saved };
    });
  }

  /**
   * The only status change an issued invoice allows (enforced by the database trigger too).
   * false = it was already credited, e.g. by a credit note issued a moment earlier.
   */
  async markCredited(tx: Tx, id: string, companyId: string): Promise<boolean> {
    const rows = await tx
      .update(t)
      .set({ status: "credited", updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.status, "issued")))
      .returning({ id: t.id });
    return rows.length > 0;
  }

  /**
   * Stores the PDF reference once. false = another request stored one a moment earlier;
   * that first file stays the official copy.
   */
  async setPdfIfMissing(id: string, companyId: string, pdfKey: string, pdfSha256: string): Promise<boolean> {
    const rows = await this.db
      .update(t)
      .set({ pdfKey, pdfSha256, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.pdfKey, "")))
      .returning({ id: t.id });
    return rows.length > 0;
  }
}

export const invoiceRepository = new InvoiceRepository();
