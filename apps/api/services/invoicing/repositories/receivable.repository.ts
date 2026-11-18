import { and, asc, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceLineTable as lineT, invoiceTable as t, type InvoiceLineRecord, type InvoiceRecord } from "../schemas/invoice.schema";
import {
  receivableEventTable as ev,
  receivableNoteTable as n,
  receivablePaymentTable as p,
  receivableSeenTable as seen,
  receivableSettingsTable as settingsT,
  receivableTable as r,
  type NewReceivablePaymentRecord,
  type NewReceivableRecord,
  type ReceivableAction,
  type ReceivableEventRecord,
  type ReceivableNoteRecord,
  type ReceivablePaymentRecord,
  type ReceivableRecord,
  type ReceivableSettingsRecord,
} from "../schemas/receivable.schema";
import { invoiceFollowupOutboxTable as o, type InvoiceFollowupKind, type NewInvoiceFollowupOutboxRecord } from "../schemas/invoiceFollowupOutbox.schema";
import { invoiceFollowupOutboxRepository } from "./invoiceFollowupOutbox.repository";
import { invoiceRepository } from "./invoice.repository";
import { invoiceSeriesPrefix } from "../lib/invoiceNumber";
import { carriedOverAmount, leftToPayOf, statusOf } from "../lib/receivables";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = typeof db | Tx;

// Finance → Accounts Receivable's records (schemas/receivable). The issued invoice is only ever read here: its credit
// notes and payments are summed per invoice in SQL, so a row's figures never depend on what a page happened to load.

export interface EventInput {
  action: ReceivableAction;
  fromStatus?: string;
  toStatus?: string;
  byUserId?: string | null;
  by?: string;
  reason?: string;
  payload?: Record<string, unknown>;
}

/**
 * An invoice with what its credit notes took off, what its live payments paid (money), and its confirmed write-offs
 * and bank charges (step 7) apart; what is left to pay is gross − credited − paid − writtenOff − bankCharges
 * (lib/receivables leftToPayOf with settledOther). Amounts as numbers.
 */
export interface InvoiceFigures {
  invoice: InvoiceRecord;
  credited: number;
  /** Money: live payments and carried over */
  paid: number;
  /** Confirmed, live write-offs */
  writtenOff: number;
  /** Confirmed, live bank charges */
  bankCharges: number;
  /** Write-offs and bank charges waiting for a second manager (they count for nothing yet) */
  waiting: number;
  lastPaidOn: string | null;
  /** null until the invoice is first read by Accounts Receivable (made then: ensureRows) */
  receivable: ReceivableRecord | null;
}

/** Which invoices a read or the lazy creation looks at. */
export type InvoiceScope =
  | { all: true }
  /** Owed or to refund (whatever the day), and the others issued since the day (null: every one) */
  | { openOrSince: string | null }
  | { shipmentId: string }
  | { customerId: string }
  | { invoiceIds: string[] }
  /** Owed and due before the day (overdue on it) */
  | { overdueOn: string }
  /** Issued on or before the day (the month-end list as at it) */
  | { issuedOnOrBefore: string };

/** Paid before Accounts Receivable existed: the customer's list said Paid, and no day was kept (D15). */
export const CARRIED_OVER_NOTE = "Paid before Accounts Receivable, day not known";

const lock = (tx: Tx, companyId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`receivable:${companyId}`}))`);

/**
 * The lock a credit note, a partial credit note and a same-day cancellation of the invoice are issued under (the job's
 * credit note series, invoice.repository lockSeries): taken by a payment and a carry-over too, so what is left to pay is
 * read after any of them that was being issued has committed, never beside it.
 *
 * The order is always this one: first the invoice's series lock, then the company's receivable lock. An Accounts
 * Receivable transaction takes one series lock, or - one bank payment over several jobs (step 7) - several, always in
 * sorted order (lockCreditsOfMany). The issuing side holds only the series lock (never the receivable lock), so the two
 * can never wait for each other in a circle.
 */
const lockCredits = (tx: Tx, invoice: Pick<InvoiceRecord, "companyId" | "shipment">) =>
  invoiceRepository.lockSeries(tx, invoice.companyId, invoiceSeriesPrefix("CN", invoice.shipment.jobYear, invoice.shipment.jobNumber));

/**
 * The credit locks of several invoices (one bank payment over several jobs, step 7): each series once, always in the
 * same (sorted) order, all before the company's lock - so two such payments can't wait for each other in a circle, and
 * the issuing side (one series lock, never the receivable lock) never waits for one of them while it holds what they want.
 */
async function lockCreditsOfMany(tx: Tx, invoices: readonly Pick<InvoiceRecord, "companyId" | "shipment">[]): Promise<void> {
  const series = new Map<string, Pick<InvoiceRecord, "companyId" | "shipment">>();
  for (const i of invoices) series.set(`${i.companyId}:${invoiceSeriesPrefix("CN", i.shipment.jobYear, i.shipment.jobNumber)}`, i);
  for (const key of [...series.keys()].sort()) await lockCredits(tx, series.get(key)!);
}

// Per invoice row of the outer query ("invoice"): its credit notes (negative gross, so credited is positive), the money
// paid (payments and carried over, not taken back), the confirmed write-offs and bank charges apart, and what waits for
// a second manager. A credit note's own table name is aliased, so "invoice"."id" is always the outer invoice. A line
// counts when it is live and confirmed: money is confirmed when it is written (a check of the table, 0037), a write-off
// or bank charge only by a second manager (lib/receivables countsNow).
const LIVE = sql`rp.invoice_id = ${t.id} and rp.taken_back_at is null and rp.deleted_at is null`;
const CREDITED = sql<string>`coalesce((select -sum(cn.gross) from "invoice" cn where cn.corrects_invoice_id = ${t.id} and cn.kind = 'credit_note' and cn.deleted_at is null), 0)`;
const PAID = sql<string>`coalesce((select sum(rp.amount) from "receivable_payment" rp where ${LIVE} and rp.kind in ('payment', 'carried_over')), 0)`;
const WRITTEN_OFF = sql<string>`coalesce((select sum(rp.amount) from "receivable_payment" rp where ${LIVE} and rp.kind = 'write_off' and rp.confirmed_at is not null), 0)`;
const BANK_CHARGED = sql<string>`coalesce((select sum(rp.amount) from "receivable_payment" rp where ${LIVE} and rp.kind = 'bank_charge' and rp.confirmed_at is not null), 0)`;
const WAITING = sql<string>`coalesce((select sum(rp.amount) from "receivable_payment" rp where ${LIVE} and rp.kind in ('write_off', 'bank_charge') and rp.confirmed_at is null), 0)`;
const COUNTED = sql<string>`coalesce((select sum(rp.amount) from "receivable_payment" rp where ${LIVE} and rp.confirmed_at is not null), 0)`;
const LAST_PAID = sql<string | null>`(select max(rp.paid_on)::text from "receivable_payment" rp where ${LIVE} and rp.kind in ('payment', 'carried_over'))`;
// What is left to pay (lib/receivables leftToPayOf): a cancelled invoice is not owed.
const LEFT = sql`((case when ${t.status} = 'cancelled' then 0 else ${t.gross} end) - ${CREDITED} - ${COUNTED})`;
const FIGURES = { invoice: t, credited: CREDITED, paid: PAID, writtenOff: WRITTEN_OFF, bankCharges: BANK_CHARGED, waiting: WAITING, lastPaidOn: LAST_PAID, receivable: r };

const INVOICES = (companyId: string) => and(eq(t.companyId, companyId), eq(t.kind, "invoice"), isNull(t.deletedAt));

function scopeWhere(scope: InvoiceScope): SQL | undefined {
  if ("all" in scope) return undefined;
  if ("openOrSince" in scope) return scope.openOrSince ? sql`(${LEFT} <> 0 or ${t.issueDate} >= ${scope.openOrSince})` : undefined;
  if ("shipmentId" in scope) return eq(t.shipmentId, scope.shipmentId);
  if ("customerId" in scope) return eq(t.customerId, scope.customerId);
  if ("invoiceIds" in scope) return scope.invoiceIds.length ? inArray(t.id, scope.invoiceIds) : sql`false`;
  if ("issuedOnOrBefore" in scope) return sql`${t.issueDate} <= ${scope.issuedOnOrBefore}::date`;
  return and(eq(t.status, "issued"), sql`${LEFT} > 0`, lt(t.dueDate, scope.overdueOn));
}

// The same scope as raw SQL on an invoice aliased "i" (the lazy creation's INSERT … SELECT).
function rawScope(scope: InvoiceScope): SQL {
  if ("shipmentId" in scope) return sql`and i.shipment_id = ${scope.shipmentId}::uuid`;
  if ("customerId" in scope) return sql`and i.customer_id = ${scope.customerId}::uuid`;
  if ("invoiceIds" in scope) return scope.invoiceIds.length ? sql`and i.id in (${sql.join(scope.invoiceIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql`and false`;
  if ("issuedOnOrBefore" in scope) return sql`and i.issue_date <= ${scope.issuedOnOrBefore}::date`;
  return sql``;
}

type FigureRow = {
  invoice: InvoiceRecord;
  credited: string | number | null;
  paid: string | number | null;
  writtenOff: string | number | null;
  bankCharges: string | number | null;
  waiting: string | number | null;
  lastPaidOn: string | null;
  receivable: ReceivableRecord | null;
};
const figuresOf = (row: FigureRow): InvoiceFigures => ({
  invoice: row.invoice,
  credited: Number(row.credited ?? 0),
  paid: Number(row.paid ?? 0),
  writtenOff: Number(row.writtenOff ?? 0),
  bankCharges: Number(row.bankCharges ?? 0),
  waiting: Number(row.waiting ?? 0),
  lastPaidOn: row.lastPaidOn ?? null,
  receivable: row.receivable,
});

/** The company's reminder settings when it never saved any (the table's defaults). */
export const DEFAULT_RECEIVABLE_SETTINGS = { autoReminders: false, reminder1Days: 7, reminder2Days: 21, replyTo: "", updatedBy: "", updatedAt: null } as const;

/** The reminder settings as everyone reads them (the row, or the defaults). */
export interface ReceivableSettingsValues {
  autoReminders: boolean;
  reminder1Days: number;
  reminder2Days: number;
  replyTo: string;
  updatedBy: string;
  updatedAt: Date | null;
}

/** A write-off or bank charge waiting for a second manager, with its invoice's facts (the waiting list). */
export interface WaitingLineRow {
  line: ReceivablePaymentRecord;
  invoice: Pick<InvoiceRecord, "id" | "number" | "customerId" | "customer" | "shipment" | "currency">;
  version: number;
}

/** An invoice the month-end list may show, with only what it needs. */
export interface AsAtCandidate {
  id: string;
  number: string;
  status: string;
  customerId: string;
  customer: string;
  shipmentId: string;
  jobNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  gross: number;
  fxRate: number;
  /** Whether the customer's list was asked if it says Paid (D15); false also when the receivable is not made yet */
  carriedChecked: boolean;
}

/** chase found no receivable to write: its transaction is rolled back. */
class NoReceivable extends Error {}

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

class ReceivableRepository {
  /**
   * Makes the receivable of every invoice in scope that has none (rows are made lazily, the issue code is not changed):
   * one per invoice of kind 'invoice', whatever its status. Safe to run at once from two requests (the unique key).
   */
  async ensureRows(companyId: string, scope: InvoiceScope): Promise<void> {
    await db.execute(sql`
      INSERT INTO receivable (company_id, invoice_id)
      SELECT i.company_id, i.id FROM invoice i
      WHERE i.company_id = ${companyId}::uuid AND i.kind = 'invoice' AND i.deleted_at IS NULL ${rawScope(scope)}
        AND NOT EXISTS (SELECT 1 FROM receivable x WHERE x.invoice_id = i.id)
      ON CONFLICT (invoice_id) DO NOTHING`);
  }

  /**
   * The company's invoices in scope with their figures: those owed or to refund first, then the newest issued; the
   * overdue ones (the bell) the oldest due first, so a cap never drops the longest overdue. Up to `limit` (the caller
   * asks one more than it shows, to know when there are more).
   */
  async figures(companyId: string, scope: InvoiceScope, limit: number, reader: Reader = db): Promise<InvoiceFigures[]> {
    const order =
      "overdueOn" in scope
        ? [asc(t.dueDate), asc(t.issueDate), asc(t.id)]
        : [sql`(${LEFT} <> 0) desc`, desc(t.issueDate), desc(t.createdAt), desc(t.id)];
    const rows = await reader
      .select(FIGURES)
      .from(t)
      .leftJoin(r, eq(r.invoiceId, t.id))
      .where(and(INVOICES(companyId), scopeWhere(scope)))
      .orderBy(...order)
      .limit(limit);
    return rows.map(figuresOf);
  }

  /** One invoice (kind 'invoice') with its figures, or null. */
  async figuresOne(companyId: string, invoiceId: string, reader: Reader = db): Promise<InvoiceFigures | null> {
    const [row] = await reader
      .select(FIGURES)
      .from(t)
      .leftJoin(r, eq(r.invoiceId, t.id))
      .where(and(INVOICES(companyId), eq(t.id, invoiceId)))
      .limit(1);
    return row ? figuresOf(row) : null;
  }

  /** The credit notes of these invoices, oldest first. */
  async creditNotesOf(companyId: string, invoiceIds: string[], reader: Reader = db): Promise<InvoiceRecord[]> {
    const ids = [...new Set(invoiceIds)];
    if (!ids.length) return [];
    const parts = await Promise.all(
      chunks(ids, 5000).map((batch) =>
        reader
          .select()
          .from(t)
          .where(and(eq(t.companyId, companyId), eq(t.kind, "credit_note"), isNull(t.deletedAt), inArray(t.correctsInvoiceId, batch)))
          .orderBy(asc(t.createdAt), asc(t.id)),
      ),
    );
    return parts.flat();
  }

  async linesOf(companyId: string, invoiceId: string): Promise<InvoiceLineRecord[]> {
    return db
      .select()
      .from(lineT)
      .where(and(eq(lineT.companyId, companyId), eq(lineT.invoiceId, invoiceId), isNull(lineT.deletedAt)))
      .orderBy(asc(lineT.seq));
  }

  /** Follow-ups of these documents (an invoice and its credit notes) that failed for good, of the kinds given. */
  async failedFollowups(companyId: string, documentIds: string[], kinds: readonly InvoiceFollowupKind[]) {
    const ids = [...new Set(documentIds)];
    if (!ids.length || !kinds.length) return [];
    const parts = await Promise.all(
      chunks(ids, 5000).map((batch) =>
        db
          .select({ id: o.id, invoiceId: o.invoiceId, kind: o.kind, actingUserId: o.actingUserId })
          .from(o)
          .where(and(eq(o.companyId, companyId), eq(o.status, "failed"), isNull(o.deletedAt), inArray(o.invoiceId, batch), inArray(o.kind, [...kinds])))
          .orderBy(asc(o.createdAt), asc(o.id)),
      ),
    );
    return parts.flat();
  }

  /** Invoices in scope whose customer's list was not asked yet whether it says Paid (carried over once, D15). */
  async notCarriedChecked(companyId: string, scope: InvoiceScope, limit = 5000) {
    return db
      .select({ invoiceId: t.id, number: t.number, customerId: t.customerId, status: t.status, shipmentId: t.shipmentId })
      .from(r)
      .innerJoin(t, eq(t.id, r.invoiceId))
      .where(and(eq(r.companyId, companyId), eq(r.carriedChecked, false), INVOICES(companyId), scopeWhere(scope)))
      .orderBy(asc(t.createdAt), asc(t.id))
      .limit(limit);
  }

  /**
   * Carries the customer's list's "Paid" over (D15): an invoice it says is paid, still issued, with no live payment,
   * gets one payment of kind carried_over for what is owed after its credit notes, its day not known; and a
   * receivable_state follow-up (`stateRows`) in the same transaction. Each such invoice is written in a transaction of
   * its own, under its credit lock and then the company's lock (lockCredits), its credit notes read again under them, so
   * a credit note issued at the same moment is never paid over. Every invoice given is then checked, so this happens
   * once. Answers the invoices a payment was carried over to.
   */
  async carryOver(
    companyId: string,
    items: { invoiceId: string; paid: boolean }[],
    stateRows: (invoice: InvoiceRecord) => NewInvoiceFollowupOutboxRecord[],
  ): Promise<string[]> {
    if (!items.length) return [];
    const carried: string[] = [];
    for (const item of items.filter((i) => i.paid)) {
      // Read first only to know the invoice's series (its snapshot never changes); everything is read again under the locks.
      const first = await this.figuresOne(companyId, item.invoiceId);
      if (!first || first.invoice.status !== "issued") continue;
      const done = await db.transaction(async (tx) => {
        await lockCredits(tx, first.invoice);
        await lock(tx, companyId);
        const [rec] = await tx
          .select()
          .from(r)
          .where(and(eq(r.companyId, companyId), eq(r.invoiceId, item.invoiceId), eq(r.carriedChecked, false)))
          .limit(1);
        if (!rec) return false;
        const state = await this.figuresOne(companyId, item.invoiceId, tx);
        if (!state || state.invoice.status !== "issued" || (await this.livePaymentCount(tx, companyId, item.invoiceId)) > 0) return false;
        const gross = Number(state.invoice.gross);
        const amount = carriedOverAmount(gross, state.credited);
        if (amount === null) return false;
        const [made] = await tx
          .insert(p)
          .values({ companyId, invoiceId: item.invoiceId, kind: "carried_over", paidOn: null, amount: amount.toFixed(2), note: CARRIED_OVER_NOTE, by: "", confirmedAt: new Date() })
          .onConflictDoNothing()
          .returning();
        if (!made) return false;
        const now = new Date();
        await this.refreshPaid(tx, companyId, item.invoiceId);
        await tx.update(r).set({ version: sql`${r.version} + 1`, carriedChecked: true, updatedAt: now }).where(eq(r.id, rec.id));
        const before = statusOf({ invoiceStatus: "issued", leftToPay: leftToPayOf({ invoiceStatus: "issued", gross, credited: state.credited, paid: 0 }), paid: 0 });
        await this.addEvent(tx, companyId, item.invoiceId, {
          action: "carried_over",
          fromStatus: before,
          toStatus: "paid",
          reason: CARRIED_OVER_NOTE,
          payload: { paymentId: made.id, amount },
        });
        await invoiceFollowupOutboxRepository.enqueue(tx, stateRows(state.invoice));
        return true;
      });
      if (done) carried.push(item.invoiceId);
    }
    // The rest only become checked (nothing is written for them, so no lock is needed).
    await this.markCarriedChecked(companyId, items.map((i) => i.invoiceId));
    return carried;
  }

  /** Marks these invoices as checked without asking (they are credited or cancelled: nothing to carry over). */
  async markCarriedChecked(companyId: string, invoiceIds: string[]): Promise<void> {
    if (!invoiceIds.length) return;
    await db
      .update(r)
      .set({ carriedChecked: true, updatedAt: new Date() })
      .where(and(eq(r.companyId, companyId), eq(r.carriedChecked, false), inArray(r.invoiceId, invoiceIds)));
  }

  private async livePaymentCount(reader: Reader, companyId: string, invoiceId: string): Promise<number> {
    const [row] = await reader
      .select({ n: sql<number>`count(*)::int` })
      .from(p)
      .where(and(eq(p.companyId, companyId), eq(p.invoiceId, invoiceId), isNull(p.takenBackAt), isNull(p.deletedAt)));
    return Number(row?.n ?? 0);
  }

  async byInvoice(companyId: string, invoiceId: string): Promise<ReceivableRecord | null> {
    const [row] = await db
      .select()
      .from(r)
      .where(and(eq(r.companyId, companyId), eq(r.invoiceId, invoiceId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Writes the receivable from the version read, under the company's lock: two managers at once can't both note a
   * payment against the same figures. With `creditsOf` (a payment) the invoice's credit lock is taken first
   * (lockCredits: that order, always), so a credit note or a cancellation being issued is committed before `work` reads
   * the figures again. `work` runs in the same transaction after the version is taken (it may throw to roll everything
   * back) and may add to the event. Answers the row written, or null when it changed meanwhile.
   */
  async decide(
    companyId: string,
    current: Pick<ReceivableRecord, "invoiceId" | "version">,
    values: Partial<NewReceivableRecord>,
    event: EventInput,
    work?: (tx: Tx) => Promise<Partial<EventInput> | void>,
    options: { creditsOf?: Pick<InvoiceRecord, "companyId" | "shipment"> } = {},
  ): Promise<ReceivableRecord | null> {
    return db.transaction(async (tx) => {
      if (options.creditsOf) await lockCredits(tx, options.creditsOf);
      await lock(tx, companyId);
      const [row] = await tx
        .update(r)
        .set({ ...values, version: current.version + 1, updatedAt: new Date() })
        .where(and(eq(r.companyId, companyId), eq(r.invoiceId, current.invoiceId), eq(r.version, current.version)))
        .returning();
      if (!row) return null;
      const more = work ? await work(tx) : undefined;
      await this.addEvent(tx, companyId, current.invoiceId, { ...event, ...(more ?? {}), payload: { ...(event.payload ?? {}), ...(more?.payload ?? {}) } });
      return row;
    });
  }

  /**
   * Writes chasing on the receivable (a note, a promise, a dispute or its end, a reminder; a send again) under the
   * company's lock, with its event, WITHOUT the version: the version guards payments and take-backs only, so an open
   * payment dialog is not broken by a note. A reminder never lowers the level (the highest stands) and its day only
   * moves on. `work` runs first in the same transaction, on the figures as they are under the lock (it may throw to roll
   * everything back) and may add to the event. Answers the row written, or null when the invoice has no receivable.
   */
  async chase(
    companyId: string,
    invoiceId: string,
    values: Pick<Partial<NewReceivableRecord>, "promisedOn" | "disputed" | "disputedReason" | "reminderLevel" | "lastRemindedOn">,
    event: EventInput,
    work?: (tx: Tx) => Promise<Partial<EventInput> | void>,
  ): Promise<ReceivableRecord | null> {
    try {
      return await this.chaseInTx(companyId, invoiceId, values, event, work);
    } catch (err) {
      if (err instanceof NoReceivable) return null;
      throw err;
    }
  }

  private chaseInTx(
    companyId: string,
    invoiceId: string,
    values: Pick<Partial<NewReceivableRecord>, "promisedOn" | "disputed" | "disputedReason" | "reminderLevel" | "lastRemindedOn">,
    event: EventInput,
    work?: (tx: Tx) => Promise<Partial<EventInput> | void>,
  ): Promise<ReceivableRecord> {
    return db.transaction(async (tx) => {
      await lock(tx, companyId);
      const more = work ? await work(tx) : undefined;
      const { reminderLevel, lastRemindedOn, ...rest } = values;
      const [row] = await tx
        .update(r)
        .set({
          ...rest,
          ...(reminderLevel !== undefined ? { reminderLevel: sql`greatest(${r.reminderLevel}, ${reminderLevel})` } : {}),
          ...(lastRemindedOn !== undefined ? { lastRemindedOn: sql`greatest(${r.lastRemindedOn}, ${lastRemindedOn}::date)` } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(r.companyId, companyId), eq(r.invoiceId, invoiceId)))
        .returning();
      // No receivable: what `work` wrote is rolled back.
      if (!row) throw new NoReceivable();
      await this.addEvent(tx, companyId, invoiceId, { ...event, ...(more ?? {}), payload: { ...(event.payload ?? {}), ...(more?.payload ?? {}) } });
      return row;
    });
  }

  async addEvent(tx: Reader, companyId: string, invoiceId: string, e: EventInput): Promise<void> {
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

  /** Keeps the receivable's paid so far and last paid day in step with its live money (payments and carried over). */
  async refreshPaid(tx: Tx, companyId: string, invoiceId: string): Promise<void> {
    await tx.execute(sql`
      UPDATE receivable SET paid_total = coalesce(s.total, 0), last_paid_on = s.last, updated_at = now()
      FROM (SELECT sum(amount) AS total, max(paid_on) AS last FROM receivable_payment
            WHERE company_id = ${companyId}::uuid AND invoice_id = ${invoiceId}::uuid AND taken_back_at IS NULL AND deleted_at IS NULL
              AND kind IN ('payment', 'carried_over')) s
      WHERE receivable.company_id = ${companyId}::uuid AND receivable.invoice_id = ${invoiceId}::uuid`);
  }

  /**
   * A line: a payment or one carried over counts at once (confirmed now, unless given); a write-off or bank charge waits
   * for a second manager (never confirmed here). null when its idempotency key was used already (the request it repeats
   * wrote it).
   */
  async insertPayment(tx: Tx, values: NewReceivablePaymentRecord): Promise<ReceivablePaymentRecord | null> {
    const kind = values.kind ?? "payment";
    const confirmedAt = kind === "write_off" || kind === "bank_charge" ? null : (values.confirmedAt ?? new Date());
    const [row] = await tx
      .insert(p)
      .values({ ...values, kind, confirmedAt })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  /**
   * Runs `work` under the credit locks of these invoices (sorted, lockCreditsOfMany) and then the company's lock: in a
   * transaction of its own, or - when the caller gives its transaction - in a savepoint of it, so a refusal rolls back
   * everything written here even if the caller goes on. The caller's transaction must not hold the company's receivable
   * lock yet (the order is always the credit locks first).
   */
  async underWriteLocks<T>(companyId: string, invoices: readonly Pick<InvoiceRecord, "companyId" | "shipment">[], work: (tx: Tx) => Promise<T>, outer?: Tx): Promise<T> {
    const run = async (tx: Tx) => {
      await lockCreditsOfMany(tx, invoices);
      await lock(tx, companyId);
      return work(tx);
    };
    return outer ? outer.transaction(run) : db.transaction(run);
  }

  /** Moves the receivable on from the version read; false when it changed meanwhile (or has none). */
  async bumpVersion(tx: Tx, companyId: string, invoiceId: string, version: number): Promise<boolean> {
    const rows = await tx
      .update(r)
      .set({ version: version + 1, updatedAt: new Date() })
      .where(and(eq(r.companyId, companyId), eq(r.invoiceId, invoiceId), eq(r.version, version)))
      .returning({ id: r.id });
    return rows.length > 0;
  }

  /** These invoices' payments with these idempotency keys (a bank payment over several invoices noted before). */
  async paymentsByKeys(companyId: string, keys: string[], reader: Reader = db): Promise<ReceivablePaymentRecord[]> {
    const wanted = [...new Set(keys)];
    if (!wanted.length) return [];
    return reader
      .select()
      .from(p)
      .where(and(eq(p.companyId, companyId), inArray(p.idempotencyKey, wanted)));
  }

  /** Confirms a waiting write-off or bank charge; null when it is not waiting any more (confirmed or taken back meanwhile). */
  async confirmLine(
    tx: Tx,
    companyId: string,
    invoiceId: string,
    lineId: string,
    by: { userId: string; email: string; selfConfirmed: boolean },
  ): Promise<ReceivablePaymentRecord | null> {
    const now = new Date();
    const [row] = await tx
      .update(p)
      .set({ confirmedAt: now, confirmedByUserId: by.userId, confirmedBy: by.email, selfConfirmed: by.selfConfirmed, updatedAt: now })
      .where(
        and(
          eq(p.companyId, companyId),
          eq(p.invoiceId, invoiceId),
          eq(p.id, lineId),
          inArray(p.kind, ["write_off", "bank_charge"]),
          isNull(p.confirmedAt),
          isNull(p.takenBackAt),
          isNull(p.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** The company's write-offs and bank charges waiting for a second manager, the oldest first, with their invoices. */
  async waitingLines(companyId: string, limit = 500): Promise<WaitingLineRow[]> {
    const rows = await db
      .select({
        line: p,
        invoice: { id: t.id, number: t.number, customerId: t.customerId, customer: t.customer, shipment: t.shipment, currency: t.currency },
        version: r.version,
      })
      .from(p)
      .innerJoin(t, eq(t.id, p.invoiceId))
      .leftJoin(r, eq(r.invoiceId, p.invoiceId))
      .where(
        and(
          eq(p.companyId, companyId),
          eq(t.companyId, companyId),
          inArray(p.kind, ["write_off", "bank_charge"]),
          isNull(p.confirmedAt),
          isNull(p.takenBackAt),
          isNull(p.deletedAt),
        ),
      )
      .orderBy(asc(p.createdAt), asc(p.id))
      .limit(limit);
    return rows.map((x) => ({ line: x.line, invoice: x.invoice, version: x.version ?? 1 }));
  }

  /**
   * The invoices the month-end list as at `day` may show - a superset the rules then decide on (lib/receivables asAtOf):
   * of kind invoice, issued on or before the day, not cancelled, and either owed now, or with something that did not
   * yet count on the day (a credit note issued after it, a payment paid after it, a write-off or bank charge confirmed
   * after it). An invoice settled now with nothing after the day was settled on it too: a line taken back after the day
   * only counted more then. Up to `limit` (the caller asks one more, to know when there are more).
   */
  async asAtCandidates(companyId: string, day: string, limit: number): Promise<AsAtCandidate[]> {
    const later = sql`(
      exists (select 1 from "invoice" cn where cn.corrects_invoice_id = ${t.id} and cn.kind = 'credit_note' and cn.deleted_at is null and cn.issue_date > ${day}::date)
      or exists (select 1 from "receivable_payment" rp where ${LIVE} and rp.confirmed_at is not null
        and ((rp.kind = 'payment' and rp.paid_on > ${day}::date)
          or (rp.kind in ('write_off', 'bank_charge') and (rp.confirmed_at at time zone 'Europe/Prague')::date > ${day}::date))))`;
    const rows = await db
      .select({
        id: t.id,
        number: t.number,
        status: t.status,
        customerId: t.customerId,
        customer: sql<string>`coalesce(${t.customer}->>'companyName', '')`,
        shipmentId: t.shipmentId,
        jobNumber: sql<string>`coalesce(${t.shipment}->>'jobNumber', '')`,
        issueDate: t.issueDate,
        dueDate: t.dueDate,
        currency: t.currency,
        gross: t.gross,
        fxRate: t.fxRate,
        carriedChecked: sql<boolean>`coalesce(${r.carriedChecked}, false)`,
      })
      .from(t)
      .leftJoin(r, eq(r.invoiceId, t.id))
      .where(and(INVOICES(companyId), sql`${t.status} <> 'cancelled'`, sql`${t.issueDate} <= ${day}::date`, sql`(${LEFT} > 0 or ${later})`))
      .orderBy(asc(t.issueDate), asc(t.id))
      .limit(limit);
    return rows.map((x) => ({ ...x, gross: Number(x.gross), fxRate: Number(x.fxRate), carriedChecked: x.carriedChecked === true }));
  }

  /** The company's reminder settings: its row, or the defaults when it never saved any. */
  async settingsOf(companyId: string): Promise<ReceivableSettingsValues> {
    const [row] = await db
      .select()
      .from(settingsT)
      .where(and(eq(settingsT.companyId, companyId), isNull(settingsT.deletedAt)))
      .limit(1);
    if (!row) return { ...DEFAULT_RECEIVABLE_SETTINGS };
    return { autoReminders: row.autoReminders, reminder1Days: row.reminder1Days, reminder2Days: row.reminder2Days, replyTo: row.replyTo, updatedBy: row.updatedBy, updatedAt: row.updatedAt };
  }

  /** Saves the company's reminder settings (one row per company, written or replaced). */
  async saveSettings(
    companyId: string,
    values: Pick<ReceivableSettingsRecord, "autoReminders" | "reminder1Days" | "reminder2Days" | "replyTo" | "updatedByUserId" | "updatedBy">,
  ): Promise<void> {
    const now = new Date();
    await db
      .insert(settingsT)
      .values({ companyId, ...values, updatedAt: now })
      .onConflictDoUpdate({ target: settingsT.companyId, set: { ...values, updatedAt: now, deletedAt: null } });
  }

  /** Takes a live payment back; null when it is not there or was taken back already. */
  async takeBack(
    tx: Tx,
    companyId: string,
    invoiceId: string,
    paymentId: string,
    by: { userId: string; email: string; reason: string },
  ): Promise<ReceivablePaymentRecord | null> {
    const now = new Date();
    const [row] = await tx
      .update(p)
      .set({ takenBackAt: now, takenBackByUserId: by.userId, takenBackBy: by.email, takenBackReason: by.reason, updatedAt: now })
      .where(and(eq(p.companyId, companyId), eq(p.invoiceId, invoiceId), eq(p.id, paymentId), isNull(p.takenBackAt), isNull(p.deletedAt)))
      .returning();
    return row ?? null;
  }

  async paymentById(companyId: string, invoiceId: string, paymentId: string, reader: Reader = db): Promise<ReceivablePaymentRecord | null> {
    const [row] = await reader
      .select()
      .from(p)
      .where(and(eq(p.companyId, companyId), eq(p.invoiceId, invoiceId), eq(p.id, paymentId), isNull(p.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async paymentByKey(companyId: string, key: string): Promise<ReceivablePaymentRecord | null> {
    const [row] = await db
      .select()
      .from(p)
      .where(and(eq(p.companyId, companyId), eq(p.idempotencyKey, key)))
      .limit(1);
    return row ?? null;
  }

  /** The lines of these invoices (payments, carried over, write-offs, bank charges; taken back ones too), newest first. */
  async paymentsOf(companyId: string, invoiceIds: string[]): Promise<ReceivablePaymentRecord[]> {
    const ids = [...new Set(invoiceIds)];
    if (!ids.length) return [];
    const parts = await Promise.all(
      chunks(ids, 5000).map((batch) =>
        db
          .select()
          .from(p)
          .where(and(eq(p.companyId, companyId), inArray(p.invoiceId, batch), isNull(p.deletedAt)))
          .orderBy(desc(p.createdAt), desc(p.id)),
      ),
    );
    const all = parts.flat();
    if (parts.length > 1) all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    return all;
  }

  /**
   * Invoices a payment (not carried over, not taken back) was noted on since `since`: the bell's paid notices. The
   * latest noted first, so the cap drops the oldest.
   */
  async paidSince(companyId: string, since: Date): Promise<string[]> {
    const rows = await db
      .select({ invoiceId: p.invoiceId })
      .from(p)
      .where(and(eq(p.companyId, companyId), eq(p.kind, "payment"), isNull(p.takenBackAt), isNull(p.deletedAt), gte(p.createdAt, since)))
      .groupBy(p.invoiceId)
      .orderBy(desc(sql`max(${p.createdAt})`), asc(p.invoiceId))
      .limit(1000);
    return rows.map((x) => x.invoiceId);
  }

  async addNote(tx: Tx, values: typeof n.$inferInsert): Promise<ReceivableNoteRecord> {
    const [row] = await tx.insert(n).values(values).returning();
    return row!;
  }

  async notes(companyId: string, invoiceId: string): Promise<ReceivableNoteRecord[]> {
    return db
      .select()
      .from(n)
      .where(and(eq(n.companyId, companyId), eq(n.invoiceId, invoiceId), isNull(n.deletedAt)))
      .orderBy(desc(n.createdAt), desc(n.id));
  }

  async events(companyId: string, invoiceId: string): Promise<ReceivableEventRecord[]> {
    return db
      .select()
      .from(ev)
      .where(and(eq(ev.companyId, companyId), eq(ev.invoiceId, invoiceId)))
      .orderBy(desc(ev.createdAt), desc(ev.id));
  }

  /** How many overdue invoices each of these customers has on `today` (owed, due before it). */
  async overdueCountByCustomer(companyId: string, customerIds: string[], today: string): Promise<Map<string, number>> {
    const ids = [...new Set(customerIds)];
    if (!ids.length) return new Map();
    const rows = await db
      .select({ customerId: t.customerId, n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(INVOICES(companyId), inArray(t.customerId, ids), scopeWhere({ overdueOn: today })))
      .groupBy(t.customerId);
    return new Map(rows.map((x) => [x.customerId, Number(x.n)]));
  }

  /** How many invoices billed to the customer are owed (issued, something left to pay). */
  async owedCountOfCustomer(companyId: string, customerId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(INVOICES(companyId), eq(t.customerId, customerId), eq(t.status, "issued"), sql`${LEFT} > 0`));
    return Number(row?.n ?? 0);
  }

  /** Of these numbers, those of the company's issued documents (invoices or credit notes, any status). */
  async issuedNumbers(companyId: string, numbers: string[]): Promise<string[]> {
    const wanted = [...new Set(numbers.map((x) => x.trim()).filter(Boolean))];
    if (!wanted.length) return [];
    const parts = await Promise.all(
      chunks(wanted, 5000).map((batch) =>
        db
          .select({ number: t.number })
          .from(t)
          .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), inArray(t.number, batch))),
      ),
    );
    return [...new Set(parts.flat().map((x) => x.number))];
  }

  /** Which of these bell keys (invoice and milestone) the user has seen. */
  async seenKeys(companyId: string, userId: string, invoiceIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(invoiceIds)];
    if (!ids.length) return new Set();
    const rows = await db
      .select({ invoiceId: seen.invoiceId, milestone: seen.milestone })
      .from(seen)
      .where(and(eq(seen.companyId, companyId), eq(seen.userId, userId), inArray(seen.invoiceId, ids)));
    return new Set(rows.map((x) => `${x.invoiceId}:${x.milestone}`));
  }

  /** Marks bell keys seen; keys of invoices that are not the company's are left out. */
  async markSeen(companyId: string, userId: string, items: { invoiceId: string; milestone: string }[]): Promise<void> {
    if (!items.length) return;
    const own = new Set(
      (
        await db
          .select({ id: t.id })
          .from(t)
          .where(and(eq(t.companyId, companyId), inArray(t.id, [...new Set(items.map((i) => i.invoiceId))])))
      ).map((x) => x.id),
    );
    const values = items.filter((i) => own.has(i.invoiceId)).map((i) => ({ companyId, userId, invoiceId: i.invoiceId, milestone: i.milestone }));
    if (!values.length) return;
    await db.insert(seen).values(values).onConflictDoNothing();
  }
}

export const receivableRepository = new ReceivableRepository();
