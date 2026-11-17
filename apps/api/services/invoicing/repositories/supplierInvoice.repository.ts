import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceCostTable as c, type InvoiceCostRecord } from "../schemas/invoiceCost.schema";
import { masterJobCostTable as m, type MasterJobCostRecord } from "../schemas/masterJobCost.schema";
import {
  supplierInvoiceEventTable as ev,
  supplierInvoiceSeenTable as seen,
  supplierInvoiceTable as t,
  type NewSupplierInvoiceRecord,
  type RefusedLine,
  type SupplierInvoiceAction,
  type SupplierInvoiceEventRecord,
  type SupplierInvoiceRecord,
  type SupplierInvoiceSource,
} from "../schemas/supplierInvoice.schema";
import { invoiceNumberKey, linkedMasterSiblings, masterSiblingKey, supplierKeyOf } from "../lib/supplierInvoices";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Which lines a sync looks at: a few shipments' or master jobs' after a write, or the whole company's. */
export type SyncScope = { shipmentIds: string[] } | { masterJobIds: string[] } | { all: true };

/** Who and what made the invoices a sync creates. */
export interface SyncOrigin {
  source: SupplierInvoiceSource;
  userId?: string | null;
  userEmail?: string;
}

export interface EventInput {
  action: SupplierInvoiceAction;
  fromStatus?: string;
  toStatus?: string;
  byUserId?: string | null;
  by?: string;
  reason?: string;
  payload?: Record<string, unknown>;
}

// Lines entered on a job (Trucking's rows and a master job's shares have their invoices elsewhere).
const ENTERED_HERE = [isNull(c.sourceTruckingRef), isNull(c.sourceMasterJobRef)];
const LIVE = (companyId: string) => and(eq(t.companyId, companyId), isNull(t.deletedAt));

/** A payment noted on Accounts Payable, as its job lines take it. */
export interface LinePayment {
  paidOn: string;
  paidAt: Date;
  paidByUserId: string;
  paidBy: string;
}

/** The payment taken back, as it was on the invoice. */
export interface PaymentTakenBack {
  paidOn: string;
  paidAt: Date | null;
  /** Taken as paid from its lines, all paid before Accounts Payable existed (no manager noted it) */
  fromLines: boolean;
}

interface SyncLine {
  id: string;
  invoiceNumber: string;
  vendor: string;
  supplierCustomerId: string | null;
  haulierId: string | null;
  supplierInvoiceId: string | null;
  currency: string;
  receivedAt: Date | null;
  /** A master job's line: its master job */
  masterJobId?: string;
}

class SupplierInvoiceRepository {
  /**
   * Keeps lines and their invoices in step: every live line with an invoice number points to the invoice of its
   * supplier and number (created when there is none yet), a line without a number to none. Under one lock per
   * company, so two posts of one invoice make one record; the unique key holds it too. An invoice left with no
   * line that was never decided nor paid goes (a number typed and taken back). Answers the invoices it touched,
   * and those a line came to (an approved one goes back to be approved again: services/supplierInvoice).
   */
  async sync(companyId: string, scope: SyncScope, origin: SyncOrigin): Promise<{ touched: string[]; gained: string[] }> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`supplier-invoice:${companyId}`}))`);
      const costScope =
        "shipmentIds" in scope ? (scope.shipmentIds.length ? inArray(c.shipmentId, scope.shipmentIds) : sql`false`) : "all" in scope ? undefined : sql`false`;
      const masterScope =
        "masterJobIds" in scope ? (scope.masterJobIds.length ? inArray(m.masterJobId, scope.masterJobIds) : sql`false`) : "all" in scope ? undefined : sql`false`;
      const numbered = (num: typeof c.invoiceNumber | typeof m.invoiceNumber, link: typeof c.supplierInvoiceId | typeof m.supplierInvoiceId) =>
        or(sql`btrim(${num}) <> ''`, isNotNull(link));
      const touched = new Set<string>();
      const gained = new Set<string>();
      const created = new Set<string>();
      const now = new Date();
      // A deleted line leaves its invoice (a restored one is matched again): so an invoice whose only line went is
      // seen below, and goes while it was never decided nor paid.
      const deletedCost = await tx
        .select({ id: c.id, invoiceId: c.supplierInvoiceId })
        .from(c)
        .where(and(eq(c.companyId, companyId), isNotNull(c.deletedAt), isNotNull(c.supplierInvoiceId), costScope));
      const deletedMaster = await tx
        .select({ id: m.id, invoiceId: m.supplierInvoiceId })
        .from(m)
        .where(and(eq(m.companyId, companyId), isNotNull(m.deletedAt), isNotNull(m.supplierInvoiceId), masterScope));
      if (deletedCost.length) await tx.update(c).set({ supplierInvoiceId: null }).where(inArray(c.id, deletedCost.map((l) => l.id)));
      if (deletedMaster.length) await tx.update(m).set({ supplierInvoiceId: null }).where(inArray(m.id, deletedMaster.map((l) => l.id)));
      for (const l of [...deletedCost, ...deletedMaster]) if (l.invoiceId) touched.add(l.invoiceId);
      const costLines: SyncLine[] = await tx
        .select({
          id: c.id,
          invoiceNumber: c.invoiceNumber,
          vendor: c.vendor,
          supplierCustomerId: c.supplierCustomerId,
          haulierId: c.haulierId,
          supplierInvoiceId: c.supplierInvoiceId,
          currency: c.realCurrency,
          receivedAt: c.receivedAt,
        })
        .from(c)
        .where(and(eq(c.companyId, companyId), isNull(c.deletedAt), ...ENTERED_HERE, numbered(c.invoiceNumber, c.supplierInvoiceId), costScope));
      const masterLines: SyncLine[] = (
        await tx
          .select({ id: m.id, masterJobId: m.masterJobId, invoiceNumber: m.invoiceNumber, vendor: m.vendor, supplierInvoiceId: m.supplierInvoiceId, currency: m.realCurrency })
          .from(m)
          .where(and(eq(m.companyId, companyId), isNull(m.deletedAt), numbered(m.invoiceNumber, m.supplierInvoiceId), masterScope))
      ).map((l) => ({ ...l, supplierCustomerId: null, haulierId: null, receivedAt: null }));

      // The live invoices those lines could belong to, by supplier and number.
      const keys = [...costLines, ...masterLines].filter((l) => invoiceNumberKey(l.invoiceNumber)).map((l) => invoiceNumberKey(l.invoiceNumber));
      const existing = keys.length
        ? await tx
            .select()
            .from(t)
            .where(and(LIVE(companyId), ne(t.status, "refused"), inArray(t.numberKey, [...new Set(keys)])))
        : [];
      const byKey = new Map(existing.map((h) => [`${h.supplierKey}|${h.numberKey}`, h]));
      // A master job's line names its supplier by text only: once its invoice is linked to a supplier it keeps
      // that invoice while the number is the same, instead of being matched again by the text.
      const masterLinked = [...new Set(masterLines.map((l) => l.supplierInvoiceId).filter((id): id is string => !!id))];
      const linkedById = new Map(
        (masterLinked.length ? await tx.select().from(t).where(and(LIVE(companyId), ne(t.status, "refused"), inArray(t.id, masterLinked))) : []).map((h) => [h.id, h]),
      );
      // …and a new line of the same master job, supplier text and number joins that linked invoice too.
      const masterSiblings = linkedMasterSiblings(
        masterLines.map((l) => ({ masterJobId: l.masterJobId ?? "", vendor: l.vendor, invoiceNumber: l.invoiceNumber, supplierInvoiceId: l.supplierInvoiceId })),
        linkedById,
      );
      const headerFor = async (line: SyncLine, source: SupplierInvoiceSource): Promise<SupplierInvoiceRecord> => {
        const supplierKey = supplierKeyOf(line);
        const numberKey = invoiceNumberKey(line.invoiceNumber);
        const key = `${supplierKey}|${numberKey}`;
        const found = byKey.get(key);
        if (found) return found;
        const values: NewSupplierInvoiceRecord = {
          companyId,
          supplierKey,
          supplierCustomerId: line.supplierCustomerId,
          haulierId: line.haulierId,
          vendor: line.vendor.trim(),
          invoiceNumber: line.invoiceNumber.trim(),
          numberKey,
          currency: line.currency,
          receivedAt: line.receivedAt,
          source,
          enteredByUserId: source === "backfill" ? null : (origin.userId ?? null),
          enteredBy: source === "backfill" ? "" : (origin.userEmail ?? ""),
        };
        const [made] = await tx.insert(t).values(values).onConflictDoNothing().returning();
        const header =
          made ??
          (await tx
            .select()
            .from(t)
            .where(and(LIVE(companyId), ne(t.status, "refused"), eq(t.supplierKey, supplierKey), eq(t.numberKey, numberKey)))
            .limit(1))[0]!;
        if (made) created.add(made.id);
        if (made) await this.addEvent(tx, companyId, made.id, { action: "booked", toStatus: "booked", byUserId: values.enteredByUserId, by: values.enteredBy, payload: { source } });
        byKey.set(key, header);
        return header;
      };

      const link = async (table: "cost" | "master", line: SyncLine) => {
        const numbered = !!invoiceNumberKey(line.invoiceNumber);
        const kept = table === "master" && line.supplierInvoiceId ? linkedById.get(line.supplierInvoiceId) : undefined;
        if (kept && numbered && kept.numberKey === invoiceNumberKey(line.invoiceNumber)) return;
        const sibling = table === "master" && numbered && line.masterJobId ? masterSiblings.get(masterSiblingKey({ ...line, masterJobId: line.masterJobId })) : undefined;
        const header = numbered ? (sibling ?? (await headerFor(line, table === "master" ? "master_job" : origin.source))) : null;
        const want = header?.id ?? null;
        if (line.supplierInvoiceId === want) return;
        if (line.supplierInvoiceId) touched.add(line.supplierInvoiceId);
        if (want) {
          touched.add(want);
          gained.add(want);
        }
        if (table === "cost") await tx.update(c).set({ supplierInvoiceId: want, updatedAt: now }).where(eq(c.id, line.id));
        else await tx.update(m).set({ supplierInvoiceId: want, updatedAt: now }).where(eq(m.id, line.id));
      };
      for (const line of costLines) await link("cost", line);
      for (const line of masterLines) await link("master", line);

      const ids = [...touched];
      const inIds = (list: string[]) => sql`(${sql.join(list.map((id) => sql`${id}::uuid`), sql`, `)})`;
      // An invoice gathered from lines that were all paid before Accounts Payable existed stays paid (D11): it is
      // taken as approved and paid on its lines' last day, so it is neither approved nor paid again.
      const fresh = [...created];
      if (fresh.length) {
        const paid = (await tx.execute(sql`
          UPDATE supplier_invoice h
             SET status = 'approved', paid_on = s.paid_on, paid_at = s.paid_at, paid_by = coalesce(s.paid_by, ''),
                 decision_reason = 'Paid before Accounts Payable existed', version = h.version + 1, updated_at = now()
          FROM (SELECT supplier_invoice_id AS id, max(paid_on) AS paid_on, max(paid_at) AS paid_at, max(paid_by) AS paid_by,
                       bool_and(paid_on IS NOT NULL) AS all_paid
                FROM invoice_cost WHERE deleted_at IS NULL AND supplier_invoice_id IN ${inIds(fresh)}
                GROUP BY supplier_invoice_id) s
          WHERE h.id = s.id AND s.all_paid AND h.status = 'booked'
          RETURNING h.id, h.paid_on`)) as unknown as { rows?: { id: string; paid_on: string }[] } | { id: string; paid_on: string }[];
        const rows = Array.isArray(paid) ? paid : (paid.rows ?? []);
        for (const row of rows) {
          await this.addEvent(tx, companyId, row.id, { action: "paid", fromStatus: "booked", toStatus: "approved", reason: "Paid before Accounts Payable existed", payload: { paidOn: row.paid_on } });
        }
      }
      if (ids.length) {
        // Booked when its first line was: the earliest Received stamp of its lines.
        await tx.execute(sql`
          UPDATE supplier_invoice h SET received_at = s.first, updated_at = now()
          FROM (SELECT supplier_invoice_id AS id, min(received_at) AS first FROM invoice_cost
                WHERE deleted_at IS NULL AND supplier_invoice_id IN ${sql`(${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`}
                GROUP BY supplier_invoice_id) s
          WHERE h.id = s.id AND h.received_at IS NULL AND s.first IS NOT NULL`);
        // An invoice no line points to any more, never decided nor paid, was a number taken back: it goes.
        await tx.execute(sql`
          UPDATE supplier_invoice h SET deleted_at = now(), updated_at = now()
          WHERE h.id IN ${sql`(${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`}
            AND h.deleted_at IS NULL AND h.status = 'booked' AND h.paid_on IS NULL
            AND NOT EXISTS (SELECT 1 FROM invoice_cost l WHERE l.supplier_invoice_id = h.id AND l.deleted_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM master_job_cost l WHERE l.supplier_invoice_id = h.id AND l.deleted_at IS NULL)`);
      }
      if ("all" in scope) {
        // The whole company: any invoice left with no line, never decided nor paid, goes too.
        await tx.execute(sql`
          UPDATE supplier_invoice h SET deleted_at = now(), updated_at = now()
          WHERE h.company_id = ${companyId}::uuid AND h.deleted_at IS NULL AND h.status = 'booked' AND h.paid_on IS NULL
            AND NOT EXISTS (SELECT 1 FROM invoice_cost l WHERE l.supplier_invoice_id = h.id AND l.deleted_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM master_job_cost l WHERE l.supplier_invoice_id = h.id AND l.deleted_at IS NULL)`);
      }
      return { touched: ids, gained: [...gained] };
    });
  }

  async addEvent(tx: Tx | typeof db, companyId: string, invoiceId: string, e: EventInput): Promise<void> {
    await tx.insert(ev).values({
      companyId,
      invoiceId,
      action: e.action,
      fromStatus: e.fromStatus ?? "",
      toStatus: e.toStatus ?? "",
      byUserId: e.byUserId ?? null,
      by: e.by ?? "",
      reason: e.reason ?? "",
      payload: e.payload ?? {},
    });
  }

  /** The live invoice of this supplier and number (not a refused one), or null. */
  async idOf(companyId: string, supplierKey: string, numberKey: string): Promise<string | null> {
    if (!numberKey) return null;
    const [row] = await db
      .select({ id: t.id })
      .from(t)
      .where(and(LIVE(companyId), ne(t.status, "refused"), eq(t.supplierKey, supplierKey), eq(t.numberKey, numberKey)))
      .limit(1);
    return row?.id ?? null;
  }

  /**
   * The live invoice, linked to a supplier, that another line of this master job with this supplier text and number
   * is on (lib/supplierInvoices linkedMasterSiblings): the invoice a new such line joins.
   */
  async idOfMasterSibling(companyId: string, masterJobId: string, vendor: string, numberKey: string): Promise<string | null> {
    if (!numberKey || !masterJobId) return null;
    const rows = await db
      .select({ id: t.id, numberKey: t.numberKey, supplierKey: t.supplierKey, vendor: m.vendor, invoiceNumber: m.invoiceNumber, supplierInvoiceId: m.supplierInvoiceId, masterJobId: m.masterJobId })
      .from(m)
      .innerJoin(t, eq(t.id, m.supplierInvoiceId))
      .where(and(eq(m.companyId, companyId), eq(m.masterJobId, masterJobId), isNull(m.deletedAt), LIVE(companyId), ne(t.status, "refused"), eq(t.numberKey, numberKey)));
    const siblings = linkedMasterSiblings(rows, new Map(rows.map((r) => [r.id, r])));
    return siblings.get(masterSiblingKey({ masterJobId, vendor, invoiceNumber: numberKey }))?.id ?? null;
  }

  /** The day each of these live invoices was marked paid; the unpaid ones are left out. */
  async paidDays(companyId: string, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await db
      .select({ id: t.id, paidOn: t.paidOn })
      .from(t)
      .where(and(LIVE(companyId), inArray(t.id, ids), isNotNull(t.paidOn)));
    return new Map(rows.filter((r) => !!r.paidOn).map((r) => [r.id, r.paidOn!]));
  }

  /** Which of these invoices are still there (a merge on linking a supplier deletes the record it merged). */
  async liveIds(companyId: string, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await db.select({ id: t.id }).from(t).where(and(LIVE(companyId), inArray(t.id, ids)));
    return new Set(rows.map((r) => r.id));
  }

  /** The other shipments the live invoice of this supplier and number is booked on already (a second read of it). */
  async bookedOnOtherJobs(companyId: string, supplierKey: string, numberKey: string, shipmentIds: string[]): Promise<string[]> {
    const id = await this.idOf(companyId, supplierKey, numberKey);
    if (!id) return [];
    const rows = await db
      .selectDistinct({ shipmentId: c.shipmentId })
      .from(c)
      .where(
        and(
          eq(c.companyId, companyId),
          isNull(c.deletedAt),
          eq(c.supplierInvoiceId, id),
          isNull(c.sourceMasterJobRef),
          shipmentIds.length ? sql`${c.shipmentId} NOT IN (${sql.join(shipmentIds.map((s) => sql`${s}::uuid`), sql`, `)})` : undefined,
        ),
      );
    return rows.map((r) => r.shipmentId);
  }

  async byId(companyId: string, id: string): Promise<SupplierInvoiceRecord | null> {
    const [row] = await db.select().from(t).where(and(LIVE(companyId), eq(t.id, id))).limit(1);
    return row ?? null;
  }

  /** The company's live invoices, newest first, up to `limit`. */
  async list(companyId: string, limit: number): Promise<SupplierInvoiceRecord[]> {
    return db.select().from(t).where(LIVE(companyId)).orderBy(desc(t.createdAt), desc(t.id)).limit(limit);
  }

  /** Live invoices booked since `since` (a user's bell). */
  async bookedSince(companyId: string, since: Date): Promise<SupplierInvoiceRecord[]> {
    return db.select().from(t).where(and(LIVE(companyId), gte(t.createdAt, since))).orderBy(desc(t.createdAt)).limit(300);
  }

  async countByStatus(companyId: string, status: string): Promise<number> {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(t).where(and(LIVE(companyId), eq(t.status, status as never)));
    return row?.n ?? 0;
  }

  /** The job lines of these invoices. */
  async costLinesOf(companyId: string, invoiceIds: string[]): Promise<InvoiceCostRecord[]> {
    if (!invoiceIds.length) return [];
    return db.select().from(c).where(and(eq(c.companyId, companyId), isNull(c.deletedAt), inArray(c.supplierInvoiceId, invoiceIds)));
  }

  /** The master-job lines of these invoices. */
  async masterLinesOf(companyId: string, invoiceIds: string[]): Promise<MasterJobCostRecord[]> {
    if (!invoiceIds.length) return [];
    return db.select().from(m).where(and(eq(m.companyId, companyId), isNull(m.deletedAt), inArray(m.supplierInvoiceId, invoiceIds)));
  }

  /** The company's estimates still waiting for an invoice (the Expected tab), up to `limit`. */
  async expectedLines(companyId: string, limit: number): Promise<InvoiceCostRecord[]> {
    return db
      .select()
      .from(c)
      .where(
        and(
          eq(c.companyId, companyId),
          isNull(c.deletedAt),
          ...ENTERED_HERE,
          isNotNull(c.estAmount),
          isNull(c.realAmount),
          sql`btrim(${c.invoiceNumber}) = ''`,
          sql`round(${c.estAmount} * coalesce(${c.estQty}, 1), 2) <> 0`,
        ),
      )
      .orderBy(desc(c.createdAt))
      .limit(limit);
  }

  async events(companyId: string, invoiceId: string): Promise<SupplierInvoiceEventRecord[]> {
    return db.select().from(ev).where(and(eq(ev.companyId, companyId), eq(ev.invoiceId, invoiceId))).orderBy(desc(ev.createdAt));
  }

  /**
   * Moves the invoice from `from` to the values given, only while it still is as read (status and version): two
   * managers at once can't both decide it. Answers the row written, or null when it changed meanwhile.
   */
  async decide(
    companyId: string,
    current: Pick<SupplierInvoiceRecord, "id" | "status" | "version">,
    values: Partial<NewSupplierInvoiceRecord>,
    event: EventInput,
    work?: (tx: Tx) => Promise<void>,
  ): Promise<SupplierInvoiceRecord | null> {
    return db.transaction(async (tx) => {
      // The lock sync takes: a decision and a sync of the same company's lines never run interleaved (no deadlock).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`supplier-invoice:${companyId}`}))`);
      const [row] = await tx
        .update(t)
        .set({ ...values, version: current.version + 1, updatedAt: new Date() })
        .where(and(LIVE(companyId), eq(t.id, current.id), eq(t.status, current.status), eq(t.version, current.version)))
        .returning();
      if (!row) return null;
      if (work) await work(tx);
      await this.addEvent(tx, companyId, row.id, event);
      return row;
    });
  }

  /**
   * The invoice's payment on its job lines, so the job's Costs and What we owe say the same (D11). Paying stamps the
   * lines not paid yet: one paid before Accounts Payable existed keeps its own day. Taking the payment back unstamps
   * what this payment stamped (the lines of its paid time); an invoice taken as paid from its lines (all paid before
   * Accounts Payable existed) was their payment, so all of them.
   */
  async setLinesPaid(tx: Tx, companyId: string, invoiceId: string, change: { pay: LinePayment } | { takeBack: PaymentTakenBack }): Promise<void> {
    const now = new Date();
    const lines = and(eq(c.companyId, companyId), isNull(c.deletedAt), eq(c.supplierInvoiceId, invoiceId));
    if ("pay" in change) {
      await tx
        .update(c)
        .set({ received: true, receivedAt: sql`coalesce(${c.receivedAt}, ${now.toISOString()}::timestamptz)`, updatedAt: now })
        .where(lines);
      await tx
        .update(c)
        .set({ ...change.pay, updatedAt: now })
        .where(and(lines, isNull(c.paidOn)));
    } else {
      const { paidOn, paidAt, fromLines } = change.takeBack;
      const stampedByIt = fromLines
        ? undefined
        : paidAt
          ? sql`date_trunc('milliseconds', ${c.paidAt}) = date_trunc('milliseconds', ${paidAt.toISOString()}::timestamptz)`
          : eq(c.paidOn, paidOn);
      await tx
        .update(c)
        .set({ paidOn: null, paidAt: null, paidByUserId: null, paidBy: null, updatedAt: now })
        .where(and(lines, stampedByIt));
    }
    await this.sharesFollowPaid(tx, companyId, { invoiceId });
  }

  /**
   * A master job's invoice is paid once, at the master job, and its shares on the jobs follow (D16): each share
   * of a line of a paid invoice is paid as the invoice was, and a share of a line whose invoice is not paid (any
   * more) is unpaid. Shares are read-only on the jobs, so their Paid comes from here only. For one invoice's
   * lines, or a master job's (after its split is processed, which may write new shares).
   */
  async sharesFollowPaid(tx: Tx | null, companyId: string, scope: { invoiceId: string } | { masterJobId: string }): Promise<void> {
    const run = tx ?? db;
    const which = "invoiceId" in scope ? sql`l.supplier_invoice_id = ${scope.invoiceId}::uuid` : sql`l.master_job_id = ${scope.masterJobId}::uuid`;
    await run.execute(sql`
      UPDATE invoice_cost s
         SET received = true, received_at = coalesce(s.received_at, now()), paid_on = h.paid_on, paid_at = h.paid_at,
             paid_by_user_id = h.paid_by_user_id, paid_by = nullif(h.paid_by, ''), updated_at = now()
        FROM master_job_cost l
        JOIN supplier_invoice h ON h.id = l.supplier_invoice_id AND h.deleted_at IS NULL
       WHERE s.company_id = ${companyId}::uuid AND s.deleted_at IS NULL
         AND s.source_master_job_ref = 'master:' || l.master_job_id::text || ':' || l.id::text
         AND l.company_id = ${companyId}::uuid AND l.deleted_at IS NULL AND ${which}
         AND h.paid_on IS NOT NULL AND s.paid_on IS DISTINCT FROM h.paid_on`);
    await run.execute(sql`
      UPDATE invoice_cost s
         SET paid_on = NULL, paid_at = NULL, paid_by_user_id = NULL, paid_by = NULL, updated_at = now()
        FROM master_job_cost l
        LEFT JOIN supplier_invoice h ON h.id = l.supplier_invoice_id AND h.deleted_at IS NULL
       WHERE s.company_id = ${companyId}::uuid AND s.deleted_at IS NULL AND s.paid_on IS NOT NULL
         AND s.source_master_job_ref = 'master:' || l.master_job_id::text || ':' || l.id::text
         AND l.company_id = ${companyId}::uuid AND ${which}
         AND (h.id IS NULL OR h.paid_on IS NULL)`);
  }

  /**
   * Takes a refused invoice's lines off their jobs (D12): a line that was an estimate goes back to it, any other
   * line is deleted. A master job's line loses its invoice and real cost; its shares follow at the next split.
   * Answers the lines as they were, which the invoice keeps.
   */
  async takeLinesOff(tx: Tx, companyId: string, invoiceId: string): Promise<RefusedLine[]> {
    const now = new Date();
    const lines = await tx.select().from(c).where(and(eq(c.companyId, companyId), isNull(c.deletedAt), eq(c.supplierInvoiceId, invoiceId)));
    const masters = await tx.select().from(m).where(and(eq(m.companyId, companyId), isNull(m.deletedAt), eq(m.supplierInvoiceId, invoiceId)));
    const kept: RefusedLine[] = [
      ...lines.map((l) => ({ table: "invoice_cost" as const, lineId: l.id, ownerId: l.shipmentId, category: l.category, description: l.description, realQty: l.realQty, realAmount: l.realAmount, realCurrency: l.realCurrency })),
      ...masters.map((l) => ({ table: "master_job_cost" as const, lineId: l.id, ownerId: l.masterJobId, category: l.category, description: l.description, realQty: l.realQty, realAmount: l.realAmount, realCurrency: l.realCurrency })),
    ];
    const back = { realAmount: null, realQty: null, invoiceNumber: "", received: false, receivedAt: null, paidOn: null, paidAt: null, paidByUserId: null, paidBy: null, postedFromLines: false, supplierInvoiceId: null, updatedAt: now };
    for (const l of lines) {
      if (l.estAmount !== null) await tx.update(c).set(back).where(eq(c.id, l.id));
      else await tx.update(c).set({ deletedAt: now, supplierInvoiceId: null, updatedAt: now }).where(eq(c.id, l.id));
    }
    if (masters.length) {
      await tx
        .update(m)
        .set({ realAmount: null, realQty: null, invoiceNumber: "", received: false, supplierInvoiceId: null, updatedAt: now })
        .where(inArray(m.id, masters.map((l) => l.id)));
    }
    return kept;
  }

  /** Keeps a refused invoice's lines as they were (D12), in the refusal's transaction. */
  async storeRefusedLines(tx: Tx, companyId: string, invoiceId: string, lines: RefusedLine[]): Promise<void> {
    await tx.update(t).set({ refusedLines: lines }).where(and(eq(t.companyId, companyId), eq(t.id, invoiceId)));
  }

  /**
   * Links a booked invoice's supplier (D13): its job lines name the company, and the invoice is keyed by it. When
   * the supplier has an invoice of that number already, the lines join it and this one goes. Answers the invoice
   * the lines are on, or null when this one changed meanwhile.
   */
  async linkSupplier(
    companyId: string,
    current: Pick<SupplierInvoiceRecord, "id" | "status" | "version" | "numberKey">,
    supplier: { id: string; name: string },
    event: EventInput,
  ): Promise<SupplierInvoiceRecord | null | "paid"> {
    return db.transaction(async (tx) => {
      // Under the lock decide and sync take too: nothing else changes the invoice meanwhile.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`supplier-invoice:${companyId}`}))`);
      const [row] = await tx
        .select()
        .from(t)
        .where(and(LIVE(companyId), eq(t.id, current.id), eq(t.status, current.status), eq(t.version, current.version)))
        .limit(1)
        .for("update");
      if (!row) return null;
      const supplierKey = `c:${supplier.id.toLowerCase()}`;
      const now = new Date();
      const [other] = await tx
        .select()
        .from(t)
        .where(and(LIVE(companyId), ne(t.status, "refused"), ne(t.id, row.id), eq(t.supplierKey, supplierKey), eq(t.numberKey, row.numberKey)))
        .limit(1)
        .for("update");
      // Lines don't join an invoice that is paid already: it would bill more than was paid. Nothing is written then.
      if (other?.paidOn) return "paid";
      await tx
        .update(c)
        .set({ supplierCustomerId: supplier.id, updatedAt: now })
        .where(and(eq(c.companyId, companyId), isNull(c.deletedAt), eq(c.supplierInvoiceId, row.id)));
      if (other) {
        await tx.update(c).set({ supplierInvoiceId: other.id, updatedAt: now }).where(and(eq(c.companyId, companyId), eq(c.supplierInvoiceId, row.id)));
        await tx.update(m).set({ supplierInvoiceId: other.id, updatedAt: now }).where(and(eq(m.companyId, companyId), eq(m.supplierInvoiceId, row.id)));
        await tx.update(t).set({ deletedAt: now, updatedAt: now }).where(eq(t.id, row.id));
        const [merged] = await tx
          .update(t)
          .set({
            issueDate: sql`coalesce(${t.issueDate}, ${row.issueDate}::date)`,
            dueDate: sql`coalesce(${t.dueDate}, ${row.dueDate}::date)`,
            receivedAt: sql`least(${t.receivedAt}, ${row.receivedAt?.toISOString() ?? null}::timestamptz)`,
            documentShipmentId: sql`coalesce(${t.documentShipmentId}, ${row.documentShipmentId}::uuid)`,
            documentAttachmentId: sql`coalesce(${t.documentAttachmentId}, ${row.documentAttachmentId}::uuid)`,
            documentName: sql`coalesce(nullif(${t.documentName}, ''), ${row.documentName})`,
            // An approved invoice that gains lines is approved again (D8).
            ...(other.status === "approved" ? { status: "booked" as const, decidedByUserId: null, decidedBy: "", decidedAt: null, decisionReason: "", selfDecision: false } : {}),
            version: sql`${t.version} + 1`,
            updatedAt: now,
          })
          .where(eq(t.id, other.id))
          .returning();
        await this.addEvent(tx, companyId, other.id, { ...event, payload: { ...event.payload, mergedFrom: row.id } });
        return merged ?? other;
      }
      const [linked] = await tx
        .update(t)
        .set({ supplierKey, supplierCustomerId: supplier.id, haulierId: null, vendor: supplier.name || row.vendor, version: row.version + 1, updatedAt: now })
        .where(eq(t.id, row.id))
        .returning();
      await this.addEvent(tx, companyId, row.id, event);
      return linked ?? null;
    });
  }

  /** Keeps the read document with an invoice that is neither paid nor refused (checked in the write). */
  async setDocument(companyId: string, id: string, doc: Pick<NewSupplierInvoiceRecord, "documentShipmentId" | "documentAttachmentId" | "documentName">): Promise<boolean> {
    const rows = await db
      .update(t)
      .set({ ...doc, updatedAt: new Date() })
      .where(and(LIVE(companyId), eq(t.id, id), isNull(t.paidOn), ne(t.status, "refused")))
      .returning({ id: t.id });
    return rows.length > 0;
  }

  async setDetails(companyId: string, id: string, values: Partial<NewSupplierInvoiceRecord>): Promise<SupplierInvoiceRecord | null> {
    const [row] = await db
      .update(t)
      .set({ ...values, updatedAt: new Date() })
      .where(and(LIVE(companyId), eq(t.id, id)))
      .returning();
    return row ?? null;
  }

  /** Fills what an invoice doesn't know yet from a read (dates, totals, currency): what it holds stays. */
  async fillFromReading(
    companyId: string,
    id: string,
    read: { issueDate?: string | null; dueDate?: string | null; totalNet?: string | null; vatAmount?: string | null; totalGross?: string | null; currency?: string | null; kind?: "invoice" | "credit_note" },
  ): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (read.issueDate) set.issueDate = sql`coalesce(${t.issueDate}, ${read.issueDate}::date)`;
    if (read.dueDate) set.dueDate = sql`coalesce(${t.dueDate}, ${read.dueDate}::date)`;
    if (read.totalNet) set.totalNet = sql`coalesce(${t.totalNet}, ${read.totalNet}::numeric)`;
    if (read.vatAmount) set.vatAmount = sql`coalesce(${t.vatAmount}, ${read.vatAmount}::numeric)`;
    if (read.totalGross) set.totalGross = sql`coalesce(${t.totalGross}, ${read.totalGross}::numeric)`;
    if (read.currency) set.currency = sql`coalesce(nullif(${t.currency}, ''), ${read.currency})`;
    if (read.kind === "credit_note") set.kind = "credit_note";
    await db.update(t).set(set).where(and(LIVE(companyId), eq(t.id, id)));
  }

  async seenIds(companyId: string, userId: string, invoiceIds: string[]): Promise<Set<string>> {
    if (!invoiceIds.length) return new Set();
    const rows = await db
      .select({ id: seen.invoiceId })
      .from(seen)
      .where(and(eq(seen.companyId, companyId), eq(seen.userId, userId), inArray(seen.invoiceId, invoiceIds)));
    return new Set(rows.map((r) => r.id));
  }

  async markSeen(companyId: string, userId: string, invoiceIds: string[]): Promise<void> {
    if (!invoiceIds.length) return;
    await db
      .insert(seen)
      .values(invoiceIds.map((invoiceId) => ({ companyId, userId, invoiceId })))
      .onConflictDoNothing();
  }
}

export const supplierInvoiceRepository = new SupplierInvoiceRepository();
