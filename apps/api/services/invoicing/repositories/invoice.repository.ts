import { and, asc, count, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { containsAllWords } from "../../../lib/db/textSearch";
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
  /**
   * Runs in the same transaction after the insert, e.g. marking the original as credited, or writing
   * what the document owes the other services (services/invoiceFollowups).
   */
  afterInsert?: (tx: Tx, invoice: InvoiceRecord) => Promise<void>;
}

// An issued, not credited invoice (credit notes are never "open").
const openInvoice = (companyId: string) =>
  and(eq(t.companyId, companyId), eq(t.kind, "invoice"), eq(t.status, "issued"), isNull(t.deletedAt));

// A live selling row "sc" of a job with an open invoice that no document billing now (billsNow, in SQL) has a line
// of: what the two reads below look through - below nothing it is a credit owed, above nothing a charge to bill.
const OPEN_INVOICE_ROW_UNBILLED = sql`exists (select 1 from "invoice" oi where oi.company_id = sc.company_id and oi.shipment_id = sc.shipment_id
          and oi.kind = 'invoice' and oi.status = 'issued' and oi.deleted_at is null)
        and not exists (select 1 from "invoice_line" bl join "invoice" bd on bd.id = bl.invoice_id
          where bl.source_selling_cost_id = sc.id and bl.company_id = sc.company_id and bd.company_id = sc.company_id and bd.deleted_at is null
            and ((bd.kind = 'invoice' and bd.status = 'issued')
              or (bd.kind = 'credit_note' and exists (select 1 from "invoice" corrected where corrected.id = bd.corrects_invoice_id
                and corrected.status = 'issued' and corrected.deleted_at is null))))`;

/**
 * A document whose lines bill selling rows now: an open invoice, or a partial credit note of one -
 * its lines' rows (the negative rows it put on the shipment) are settled while the invoice stands.
 * A credit note of an invoice credited to its end settles nothing: what it reversed is billed again.
 */
const billsNow = (companyId: string) =>
  and(
    eq(t.companyId, companyId),
    isNull(t.deletedAt),
    or(
      and(eq(t.kind, "invoice"), eq(t.status, "issued")),
      and(
        eq(t.kind, "credit_note"),
        // the invoice it corrects (lib/partialCredit) still stands
        sql`exists (select 1 from "invoice" "corrected" where "corrected"."id" = ${t.correctsInvoiceId} and "corrected"."status" = 'issued' and "corrected"."deleted_at" is null)`,
      ),
    ),
  );

/**
 * Tax documents are immutable once issued (database triggers, migration 0011): nothing here
 * updates their content or deletes them; the only writes are issuing, marking an invoice as
 * credited and storing its PDF.
 */
class InvoiceRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "invoice");
  }

  /**
   * The main search (the top bar): the company's live tax documents whose number, customer (name,
   * IČO) or job number - as printed on them - hold every word typed, the newest issue date first
   * (`limit` of them), and how many match in all.
   */
  async searchMain(companyId: string, search: string, limit: number) {
    const match = containsAllWords(
      [t.number, sql`${t.customer}->>'companyName'`, sql`${t.customer}->>'ico'`, sql`${t.shipment}->>'jobNumber'`],
      search,
    );
    if (!match) return { rows: [], total: 0 };
    const where = and(eq(t.companyId, companyId), isNull(t.deletedAt), match);
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: t.id,
          number: t.number,
          kind: t.kind,
          status: t.status,
          customerName: sql<string>`coalesce(${t.customer}->>'companyName', '')`,
          jobNumber: sql<string>`coalesce(${t.shipment}->>'jobNumber', '')`,
          shipmentId: t.shipmentId,
          issueDate: t.issueDate,
          gross: t.gross,
          currency: t.currency,
        })
        .from(t)
        .where(where)
        .orderBy(desc(t.issueDate), desc(t.createdAt), desc(t.id))
        .limit(limit),
      this.db.select({ value: count() }).from(t).where(where),
    ]);
    return { rows, total: Number(total) };
  }

  async listByShipment(shipmentId: string, companyId: string): Promise<InvoiceRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(desc(t.createdAt));
  }

  async getLines(invoiceId: string, companyId: string, reader: Reader = db): Promise<InvoiceLineRecord[]> {
    return reader
      .select()
      .from(lineT)
      .where(and(eq(lineT.invoiceId, invoiceId), eq(lineT.companyId, companyId), isNull(lineT.deletedAt)))
      .orderBy(asc(lineT.seq));
  }

  /**
   * Issued, not credited invoices of the shipments an Invoicing queue view lists, with the selling
   * rows their lines were made from. Only those shipments' are read, and the lines through a join on
   * the same shipments - never a list of every invoice id, which Postgres refuses past 65,535.
   */
  async listOpenInvoicesWithSources(shipmentIds: string[], companyId: string): Promise<OpenInvoiceWithSources[]> {
    const ids = [...new Set(shipmentIds)];
    if (!ids.length) return [];
    const ofShipments = and(openInvoice(companyId), inArray(t.shipmentId, ids));
    const invoices = await this.db
      .select({ id: t.id, shipmentId: t.shipmentId, number: t.number, currency: t.currency, gross: t.gross, duzp: t.duzp })
      .from(t)
      .where(ofShipments);
    if (!invoices.length) return [];
    // The lines of the open invoices and of their partial credit notes, each kept with the invoice:
    // a partial credit note's rows are billed by it, and its gross comes off the invoice's.
    const lines = await this.db
      .select({ invoiceId: sql<string>`coalesce(${t.correctsInvoiceId}, ${t.id})`, source: lineT.sourceSellingCostId })
      .from(lineT)
      .innerJoin(t, eq(lineT.invoiceId, t.id))
      .where(and(billsNow(companyId), inArray(t.shipmentId, ids), eq(lineT.companyId, companyId)));
    const credits = await this.db
      .select({ invoiceId: t.correctsInvoiceId, gross: t.gross })
      .from(t)
      .where(and(billsNow(companyId), eq(t.kind, "credit_note"), inArray(t.shipmentId, ids)));
    const sources = new Map<string, (string | null)[]>();
    for (const l of lines) {
      const list = sources.get(l.invoiceId) ?? [];
      list.push(l.source);
      sources.set(l.invoiceId, list);
    }
    const credited = new Map<string, number>();
    for (const c of credits) if (c.invoiceId) credited.set(c.invoiceId, (credited.get(c.invoiceId) ?? 0) + Number(c.gross));
    return invoices.map((i) => ({
      ...i,
      gross: credited.has(i.id) ? (Number(i.gross) + credited.get(i.id)!).toFixed(2) : i.gross,
      sourceSellingCostIds: sources.get(i.id) ?? [],
    }));
  }

  /**
   * Selling rows of a shipment that are already on an issued, not credited invoice, or on a partial
   * credit note of one (billsNow): they must
   * not be invoiced again. `reader` lets the issue transaction re-check under its lock.
   */
  async invoicedSellingRowIds(shipmentId: string, companyId: string, reader: Reader = db): Promise<Set<string>> {
    const rows = await reader
      .select({ source: lineT.sourceSellingCostId })
      .from(lineT)
      .innerJoin(t, eq(lineT.invoiceId, t.id))
      .where(and(billsNow(companyId), eq(t.shipmentId, shipmentId), eq(lineT.companyId, companyId)));
    return new Set(rows.map((r) => r.source).filter((s): s is string => !!s));
  }

  /** The credit notes issued against an invoice, oldest first. */
  async creditNotesOf(invoiceId: string, companyId: string, reader: Reader = db): Promise<InvoiceRecord[]> {
    return reader
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.correctsInvoiceId, invoiceId), eq(t.kind, "credit_note"), isNull(t.deletedAt)))
      .orderBy(asc(t.createdAt));
  }

  /** The lines of these documents. */
  async linesOf(invoiceIds: string[], companyId: string, reader: Reader = db): Promise<InvoiceLineRecord[]> {
    if (!invoiceIds.length) return [];
    return reader
      .select()
      .from(lineT)
      .where(and(inArray(lineT.invoiceId, invoiceIds), eq(lineT.companyId, companyId), isNull(lineT.deletedAt)))
      .orderBy(asc(lineT.seq));
  }

  /** Of the shipments, those with an issued invoice not credited: billed (lib/billedLock). */
  async billedShipmentIds(shipmentIds: Iterable<string>, companyId: string, reader: Reader = db): Promise<Set<string>> {
    const ids = [...new Set(shipmentIds)];
    if (!ids.length) return new Set();
    const rows = await reader.selectDistinct({ shipmentId: t.shipmentId }).from(t).where(and(openInvoice(companyId), inArray(t.shipmentId, ids)));
    return new Set(rows.map((r) => r.shipmentId));
  }

  /**
   * The company's jobs that owe their customer a credit (M3): an open invoice, and a live selling row below nothing
   * that no document billing now has a line of (lib/billingQueue countCreditsOwed, in SQL) - a price lowered after the
   * invoice, on no credit note yet. However long ago the job was invoiced: the Money tab reads these besides the jobs
   * invoiced lately. The newest such row first, at most `limit` jobs.
   */
  async creditOwedShipmentIds(companyId: string, limit: number): Promise<string[]> {
    const rows = await this.db.execute<{ shipment_id: string }>(sql`
      select sc.shipment_id from "invoice_selling_cost" sc
      where sc.company_id = ${companyId} and sc.deleted_at is null
        and coalesce(sc.amount, 0) * coalesce(sc.qty, 1) < 0
        and ${OPEN_INVOICE_ROW_UNBILLED}
      group by sc.shipment_id
      order by max(sc.created_at) desc
      limit ${limit}`);
    return rows.rows.map((r) => r.shipment_id);
  }

  /**
   * The company's jobs with a charge added after their invoice (User Council B4, owner's answer Q9): an open invoice,
   * and a live selling row above nothing that no document billing now has a line of (lib/billingQueue
   * countInvoicedLines, in SQL: a charge on no invoice). Such a job reads Not Invoiced, and its Shipment Status may
   * never have been Billing (issuing before Billing is allowed), so Invoicing → To bill lists it by this, whatever
   * its status. The newest such row first, at most `limit` jobs.
   */
  async lateChargeShipmentIds(companyId: string, limit: number): Promise<string[]> {
    const rows = await this.db.execute<{ shipment_id: string }>(sql`
      select sc.shipment_id from "invoice_selling_cost" sc
      where sc.company_id = ${companyId} and sc.deleted_at is null
        and coalesce(sc.amount, 0) * coalesce(sc.qty, 1) > 0
        and ${OPEN_INVOICE_ROW_UNBILLED}
      group by sc.shipment_id
      order by max(sc.created_at) desc
      limit ${limit}`);
    return rows.rows.map((r) => r.shipment_id);
  }

  /** Of the shipments, those an invoice was ever issued for (a credited one counts too). */
  async shipmentIdsWithInvoices(shipmentIds: string[], companyId: string): Promise<string[]> {
    if (!shipmentIds.length) return [];
    const rows = await this.db
      .selectDistinct({ shipmentId: t.shipmentId })
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.kind, "invoice"), isNull(t.deletedAt), inArray(t.shipmentId, shipmentIds)));
    return rows.map((r) => r.shipmentId);
  }

  /** The day each of these shipments was first billed by an invoice that stands (Accounts Payable: arrived after billing). */
  async firstBilledOn(companyId: string, shipmentIds: string[]): Promise<Map<string, string>> {
    if (!shipmentIds.length) return new Map();
    const rows = await this.db
      .select({ shipmentId: t.shipmentId, first: sql<string>`min(${t.issueDate})::text` })
      .from(t)
      .where(and(openInvoice(companyId), inArray(t.shipmentId, shipmentIds)))
      .groupBy(t.shipmentId);
    return new Map(rows.filter((r) => r.shipmentId && r.first).map((r) => [r.shipmentId as string, r.first]));
  }

  /** The shipment's newest open invoice (issued, not credited, not cancelled); null when it has none. */
  async latestOpenInvoiceId(shipmentId: string, companyId: string, reader: Reader = db): Promise<string | null> {
    const [row] = await reader
      .select({ id: t.id })
      .from(t)
      .where(and(openInvoice(companyId), eq(t.shipmentId, shipmentId)))
      .orderBy(desc(t.createdAt))
      .limit(1);
    return row?.id ?? null;
  }

  /**
   * The shipment's newest invoice whatever its state (issued, credited, cancelled); null when it never had
   * one. A charge added to a job with no open invoice keeps its status follow-up under it (the outbox row
   * needs an invoice: services/sellingStatusFollow).
   */
  async latestInvoiceId(shipmentId: string, companyId: string, reader: Reader = db): Promise<string | null> {
    const [row] = await reader
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.kind, "invoice"), isNull(t.deletedAt), eq(t.shipmentId, shipmentId)))
      .orderBy(desc(t.createdAt))
      .limit(1);
    return row?.id ?? null;
  }

  async countOpenInvoices(shipmentId: string, companyId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(openInvoice(companyId), eq(t.shipmentId, shipmentId)));
    return row?.n ?? 0;
  }

  async getByIdempotencyKey(companyId: string, key: string, reader: Reader = db): Promise<InvoiceRecord | null> {
    const [row] = await reader
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
   *
   * `replayed`: a document with the header's idempotency key exists already - the request this one
   * repeats (a double click) held the lock first. That document is given back as it is, nothing is
   * written; the caller checks it is the same kind of document.
   */
  async issue(
    seriesPrefix: string,
    header: InvoiceHeaderInput,
    lines: InvoiceLineInput[],
    hooks: IssueHooks = {},
  ): Promise<{ invoice: InvoiceRecord; lines: InvoiceLineRecord[]; replayed: boolean }> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-number:${header.companyId}:${seriesPrefix}`}))`);
      // Looked up again under the lock, before beforeInsert: the request this one repeats billed the
      // same rows a moment ago, so beforeInsert would refuse them instead of answering its document.
      if (header.idempotencyKey) {
        const earlier = await this.getByIdempotencyKey(header.companyId, header.idempotencyKey, tx);
        if (earlier) return { invoice: earlier, lines: await this.getLines(earlier.id, header.companyId, tx), replayed: true };
      }
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
      if (hooks.afterInsert) await hooks.afterInsert(tx, invoice!);
      return { invoice: invoice!, lines: saved, replayed: false };
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
   * Cancels an invoice on its issue day (services/invoiceChangeRequest): the one other status change
   * an issued invoice allows (the database trigger too). false = it is no longer issued, or was not
   * issued on `issueDate`.
   */
  async markCancelled(tx: Tx, id: string, companyId: string, issueDate: string): Promise<boolean> {
    const rows = await tx
      .update(t)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.kind, "invoice"), eq(t.status, "issued"), eq(t.issueDate, issueDate)))
      .returning({ id: t.id });
    return rows.length > 0;
  }

  /** Takes the series lock of a job's credit notes, so no credit note of it is issued meanwhile. */
  async lockSeries(tx: Tx, companyId: string, seriesPrefix: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-number:${companyId}:${seriesPrefix}`}))`);
  }

  /** The invoice as it is now, read in a transaction. */
  async getInTx(tx: Tx, id: string, companyId: string): Promise<InvoiceRecord | null> {
    const [row] = await tx.select().from(t).where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt))).limit(1);
    return row ?? null;
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
