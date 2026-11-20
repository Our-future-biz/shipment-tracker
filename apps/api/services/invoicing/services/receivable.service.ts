import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, shipments } from "~encore/clients";
import { addDays, businessDay, isRealYmd } from "../../../lib/businessDate";
import { companyUsersWithRoles, userEmailOf } from "../../../lib/companyUsers";
import { emailConfigured } from "../../../lib/email";
import { sendFailedAgain } from "../../../lib/outbox/sendAgain";
import type { Actor } from "../../../lib/rbac";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { userRefs } from "../../../lib/userNames";
import { isUuid } from "../../../lib/uuid";
import { round2 } from "../lib/invoiceCalc";
import {
  agingByCustomer,
  amountProblem,
  asAtDayProblem,
  asAtOf,
  batchCurrencyProblem,
  batchProblem,
  confirmProblem,
  isMoneyKind,
  isOwed,
  isWaiting,
  isWriteOffKind,
  lineWord,
  mayConfirm,
  MIN_REASON,
  noteProblem,
  overdueMilestone,
  paidNotice,
  parseNoticeKey,
  isPrepayment,
  paymentProblem,
  prepaymentInvoicesOf,
  prepaymentUninvoicedOf,
  prepaymentUnpaidOf,
  receivableStateOf,
  releaseCheckOf,
  releaseWarning,
  settledDisputeReason,
  DISPUTE_REOPENED_REASON,
  settingsProblem,
  switchOnDayOnSave,
  sumByCurrency,
  takeBackProblem,
  TAKE_BACK_KINDS,
  unbilledOf,
  writeOffProblem,
  AS_AT_CZK_RATE,
  BELL_PAID_DAYS,
  type BatchItemInput,
  type NoteKind,
  type ReceivableState,
  type ReleaseRow,
  type TakeBackKind,
} from "../lib/receivables";
import { waitingPaymentText, type WaitingPayment } from "../lib/bankMatch";
import { variableSymbol } from "../lib/invoicePdf";
import { mailIssuerOf, reminderText } from "../lib/reminderTexts";
import { languageOf } from "../lib/statement";
import { invoiceProfileRepository } from "../repositories/invoiceProfile.repository";
import { receivableRepository as repo, type EventInput, type InvoiceFigures, type InvoiceScope } from "../repositories/receivable.repository";
import { waitingPaymentsFor } from "./paymentWaiting";
import { invoiceFollowupOutboxRepository } from "../repositories/invoiceFollowupOutbox.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import type { InvoiceRecord } from "../schemas/invoice.schema";
import type { InvoiceFollowupKind } from "../schemas/invoiceFollowupOutbox.schema";
import type { NewReceivableRecord, ReceivableAction, ReceivablePaymentRecord, ReceivableRecord } from "../schemas/receivable.schema";
import { deliverInvoiceFollowups, followupsOfReceivable, type FollowupActor } from "./invoiceFollowups.service";
import { CARRY_OVER_CHUNK, carryOverAll, carryOverChunk, NOT_CHECKED } from "./receivableCarryOver";
import { asCompany } from "../../../lib/internalCall";
import type {
  ReceivableAsAtRow,
  ReceivableCustomerFacts,
  ReceivableCustomerOwedResponse,
  ReceivablePaymentWaiting,
  ReceivableReminderDraft,
  ReceivableCustomerRow,
  ReceivableCustomerRowsResponse,
  ReceivableDetailResponse,
  ReceivableItem,
  ReceivableNoticeItem,
  ReceivablePaymentItem,
  ReceivablePeriod,
  ReceivableRowsResponse,
  ReceivablesAsAtResponse,
  ReceivableSettingsResponse,
  ReceivablesForMeResponse,
  ReceivablesResponse,
  ReceivableUnbilledResponse,
  ReceivableWaitingResponse,
  ReleaseCheckInternalResponse,
  ReleaseCheckResponse,
} from "../interfaces/interfaces";

type Tx = Parameters<Parameters<typeof repo.underWriteLocks>[2]>[0];

// Finance → Accounts Receivable (Council Outlay 10, D1–D26 as the chair recommended, 18 Nov 2026). One row per issued
// invoice, read from the legal record with its credit notes folded in (D1, D8); payments, chasing and history are
// records of their own beside it (schemas/receivable). Everyone reads; managers note payments and take them back (D5,
// D11). The customer's list is a copy the app writes (the receivable_state follow-up). The rules are lib/receivables.

const LIST_LIMIT = 2000;
const PER_CALL = 500;
const SHIPMENT_LIMIT = 500;
const DAY = 86_400_000;
/** The month-end list reads at most this many invoices (it says when there are more). */
const AS_AT_LIMIT = 20_000;
/** Open jobs read at once for the work not yet invoiced. */
const UNBILLED_CHUNK = 1000;

const notThere = () => APIError.notFound("This invoice is not there");
const paymentNotThere = () => APIError.notFound("This payment is not there");
const changedMeanwhile = () => APIError.aborted("This invoice changed meanwhile: open it again to see how it is now");
const managersOnly = () => APIError.permissionDenied("Only a manager notes a payment, takes one back or sends an invoice again to the customer's list");
const lineNotThere = () => APIError.notFound("This line is not there");
const MANAGERS_UNREADABLE = "Whether the company has another manager could not be read just now: try again in a moment";
/** Who a dispute closed by itself is written by (as the automatic reminders are). */
const AUTOMATIC_BY = "Accounts Receivable (automatic)";
const OPEN_JOBS_UNREADABLE = "The customer's open jobs could not be read just now: try again in a moment";

/** The follow-ups that keep the customer's list in step: a failed one is shown and a manager may send it again (D24). */
const CUSTOMER_LIST_KINDS: readonly InvoiceFollowupKind[] = ["customer_invoice", "mark_credited", "receivable_state"];

const PERIODS: readonly ReceivablePeriod[] = ["90d", "12m", "all"];

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};
const sameEmail = (a: string, b: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
const unique = <T>(items: readonly T[]) => [...new Set(items)];
const actorOf = (actor: Actor): FollowupActor => ({ userId: actor.userID, role: actor.role });

/** A payment whose idempotency key was used already: the request it repeats wrote it. */
class ReplayedPayment extends Error {}

/** A bank payment over several invoices noted before with the same keys: the lines it wrote, answered again. */
class ReplayedAllocations extends Error {
  constructor(readonly allocations: NoteAllocationResult[]) {
    super("replayed");
  }
}

/** The batch payment's engine as the bank import calls it too (A1b: idempotencyKeyPrefix `bank:<entryId>`). */
export interface NoteAllocationsInput {
  /** The day it was paid (yyyy-mm-dd): not after today, not before any of the invoices was issued */
  paidOn: string;
  /** The bank's reference of the payment: the same on every line it writes */
  bankRef?: string | null;
  note?: string | null;
  /** Each line's idempotency key is `${prefix}:${invoiceId}`: the same prefix again writes nothing and answers the lines written */
  idempotencyKeyPrefix?: string | null;
  /** The payment's currency, when known (a bank entry's): every invoice must be in it */
  currency?: string | null;
  /** 1–100 invoices, each once, with the receivable version the user saw and the amount in the invoice's currency */
  items: BatchItemInput[];
}

export interface NoteAllocationResult {
  invoiceId: string;
  /** The payment line written on the invoice */
  paymentId: string;
}

interface JobFacts {
  jobNumber: string;
  personInCharge: string;
  holidayCover: string;
}

/** What the Customer Database says of a customer (customers _internalCustomerReceivableFacts). */
interface CustomerFacts {
  id: string;
  companyName: string;
  salesOwner: string;
  salesOwnerUserId: string | null;
  paymentTerms: string;
  creditLimit: number;
  currency: string;
  reminderTo: { name: string; email: string; role: string } | null;
  deleted: boolean;
  /** cs | en (step 7, A2); anything else, or none, reads as English */
  language?: unknown;
}

/** What the rows need from the other services and the outbox, read for a set of invoices at once. */
interface Context {
  jobs: Map<string, JobFacts>;
  facts: Map<string, CustomerFacts>;
  /** Whether the job and customer facts could be read (else names and owners are blank) */
  factsRead: boolean;
  /** The invoices' and their credit notes' issuers, by user id (one lookup; a failed one leaves blanks) */
  issuers: Map<string, { name: string; email: string }>;
  creditNotes: Map<string, InvoiceRecord[]>;
  /** Invoices whose hand-over to the customer's list failed for good */
  notInList: Set<string>;
}

async function jobsOf(ids: string[]): Promise<Map<string, JobFacts>> {
  if (!ids.length) return new Map();
  const answers = await Promise.all(chunks(ids, PER_CALL).map((batch) => shipments._internalShipmentBasics({ ids: batch })));
  return new Map(answers.flatMap((a) => a.shipments.map((j) => [j.id, { jobNumber: j.jobNumber, personInCharge: j.personInCharge, holidayCover: j.holidayCover }] as const)));
}

async function customerFactsOf(ids: string[]): Promise<Map<string, CustomerFacts>> {
  if (!ids.length) return new Map();
  const answers = await Promise.all(chunks(ids, PER_CALL).map((batch) => customers._internalCustomerReceivableFacts({ ids: batch })));
  return new Map(answers.flatMap((a) => a.customers.map((c) => [c.id, c as CustomerFacts] as const)));
}

/** Everything the row shows of an invoice (lib/receivables): what is left to pay after everything that counts, its status and marks. */
export const receivableStateOfFigures = (f: InvoiceFigures, today: string, notInList = false): ReceivableState =>
  receivableStateOf(
    {
      invoiceStatus: f.invoice.status,
      gross: Number(f.invoice.gross),
      credited: f.credited,
      paid: f.paid,
      writtenOff: f.writtenOff ?? 0,
      bankCharges: f.bankCharges ?? 0,
      waiting: f.waiting ?? 0,
      dueDate: f.invoice.dueDate,
      paymentTerms: f.invoice.customer?.paymentTerms ?? "",
      promisedOn: f.receivable?.promisedOn ?? null,
      disputed: f.receivable?.disputed ?? false,
      reminderLevel: f.receivable?.reminderLevel ?? 0,
      customerListFailed: notInList,
    },
    today,
  );
const stateOf = receivableStateOfFigures;

/** Who issued an invoice or a credit note: e-mail and name, "" when the user is unknown or the lookup failed. */
const issuerOf = (ctx: Context, userId: string): { issuedBy: string; issuedByName: string } => {
  const user = ctx.issuers.get(userId);
  return { issuedBy: user?.email ?? "", issuedByName: user?.name ?? "" };
};

type Writable = InvoiceFigures & { receivable: ReceivableRecord };

class ReceivableService {
  canAct = (actor: Pick<Actor, "role">) => canDecideQuoteInquiry(actor.role);

  private requireManager(actor: Actor) {
    if (!this.canAct(actor)) throw managersOnly();
  }

  /** The e-mail of the signed-in user, or "" when it can't be read (only "mine" and the bell depend on it). */
  private async emailOrNothing(actor: Actor): Promise<string> {
    try {
      return await userEmailOf(actor.userID);
    } catch {
      return "";
    }
  }

  // ── Before a read or a write: the rows made, the old "Paid" carried over ──

  /**
   * Makes the missing receivables in scope (lock-free: INSERT … ON CONFLICT DO NOTHING), then carries the customer's
   * list's old "Paid" marks over (D15): one chunk of at most 500 invoices per request (services/receivableCarryOver),
   * each carried-over payment written in a short transaction of its own, so a read never holds the company's writes up
   * for long. What is not checked yet reads as unpaid, and is checked by the next opens; a payment or the customer's
   * list's follow-up on such an invoice carries that one over first.
   */
  private async prepare(actor: Actor, scope: InvoiceScope): Promise<void> {
    await repo.ensureRows(actor.companyID, scope);
    await carryOverChunk(actor.companyID, scope, (invoice) => followupsOfReceivable(invoice, actorOf(actor)));
    await this.closeSettledDisputes(actor, scope);
  }

  /**
   * A dispute that nothing is owed on any more - ended by a full credit note, a payment or a confirmed write-off that
   * settled the invoice, or a cancellation - closes itself, with a line in the invoice's history (mock test council n4,
   * L5). Done on the next read of the invoice, so it covers a credit note issued in Invoicing too. Housekeeping: a
   * failure is logged and the read or write goes on (the Disputed tab shows only disputes with something owed anyway).
   *
   * The other way too: a dispute that closed by itself opens again once the invoice is owed again - the payment,
   * write-off or bank charge that settled it taken back (a take-back answers with the invoice read again, so straight
   * away). Its own reason stands again, with a line in the history. One a person closed stays closed.
   */
  private async closeSettledDisputes(actor: Actor, scope: InvoiceScope): Promise<void> {
    try {
      await repo.reopenAutoClosedDisputes(actor.companyID, scope, AUTOMATIC_BY, DISPUTE_REOPENED_REASON);
    } catch (err) {
      log.warn(err, "disputes closed by themselves could not be opened again now: the next read tries again");
    }
    try {
      await repo.closeSettledDisputes(actor.companyID, scope, AUTOMATIC_BY, settledDisputeReason);
    } catch (err) {
      log.warn(err, "settled disputes could not be closed now: the next read tries again");
    }
  }

  /** prepare for a read: a failure is logged, the read still answers (from what is stored). */
  private async prepareQuietly(actor: Actor, scope: InvoiceScope): Promise<void> {
    try {
      await this.prepare(actor, scope);
    } catch (err) {
      log.error(err, "receivables could not be made or carried over before a read", { scope: Object.keys(scope)[0] });
    }
  }

  // ── Rows ──

  /** Reads what the rows of these invoices need from the other services, at once. A failed read leaves blanks (factsRead false). */
  private async context(actor: Actor, figures: InvoiceFigures[]): Promise<Context> {
    const invoices = figures.map((f) => f.invoice);
    const ids = invoices.map((i) => i.id);
    const [jobs, facts, { issuers, creditNotes }, failed] = await Promise.all([
      jobsOf(unique(invoices.map((i) => i.shipmentId))).catch((err) => {
        log.warn(err, "job facts could not be read for Accounts Receivable");
        return null;
      }),
      customerFactsOf(unique(invoices.map((i) => i.customerId))).catch((err) => {
        log.warn(err, "customer facts could not be read for Accounts Receivable");
        return null;
      }),
      // The credit notes first, so their issuers join the invoices' in the one users lookup.
      repo.creditNotesOf(actor.companyID, ids).then(async (creditNotes) => ({
        creditNotes,
        issuers: await userRefs(unique([...invoices, ...creditNotes].map((i) => i.issuedBy))),
      })),
      repo.failedFollowups(actor.companyID, ids, ["customer_invoice"]),
    ]);
    const byInvoice = new Map<string, InvoiceRecord[]>();
    for (const c of creditNotes) if (c.correctsInvoiceId) byInvoice.set(c.correctsInvoiceId, [...(byInvoice.get(c.correctsInvoiceId) ?? []), c]);
    return {
      jobs: jobs ?? new Map(),
      facts: facts ?? new Map(),
      factsRead: jobs !== null && facts !== null,
      issuers,
      creditNotes: byInvoice,
      notInList: new Set(failed.map((f) => f.invoiceId)),
    };
  }

  private build(actor: Actor, figures: InvoiceFigures[], ctx: Context, today: string, email: string): ReceivableItem[] {
    return figures.map((f) => {
      const inv = f.invoice;
      const rec = f.receivable;
      const s = stateOf(f, today, ctx.notInList.has(inv.id));
      const job = ctx.jobs.get(inv.shipmentId);
      const facts = ctx.facts.get(inv.customerId);
      const personInCharge = job?.personInCharge ?? "";
      const holidayCover = job?.holidayCover ?? "";
      const salesOwner = facts?.salesOwner ?? "";
      return {
        id: inv.id,
        number: inv.number,
        customerId: inv.customerId,
        customer: inv.customer?.companyName || facts?.companyName || "",
        shipmentId: inv.shipmentId,
        jobNumber: job?.jobNumber || inv.shipment?.jobNumber || "",
        issueDate: inv.issueDate,
        duzp: inv.duzp,
        dueDate: inv.dueDate,
        currency: inv.currency,
        net: Number(inv.net),
        vat: Number(inv.vat),
        gross: Number(inv.gross),
        grossCzk: Number(inv.grossCzk),
        credited: s.credited,
        paid: s.paid,
        writtenOff: s.writtenOff,
        bankCharges: s.bankCharges,
        leftToPay: s.leftToPay,
        status: s.status,
        marks: s.marks,
        daysOverdue: s.daysOverdue,
        agingBucket: s.agingBucket,
        paymentTerms: inv.customer?.paymentTerms ?? "",
        promisedOn: rec?.promisedOn ?? null,
        disputed: rec?.disputed ?? false,
        reminderLevel: rec?.reminderLevel ?? 0,
        lastRemindedOn: rec?.lastRemindedOn ?? null,
        lastPaidOn: f.lastPaidOn,
        creditNoteNumbers: (ctx.creditNotes.get(inv.id) ?? []).map((c) => c.number),
        creditNotes: [...(ctx.creditNotes.get(inv.id) ?? [])]
          .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number))
          .map((c) => ({ number: c.number, issueDate: c.issueDate, gross: Number(c.gross), ...issuerOf(ctx, c.issuedBy) })),
        personInCharge,
        holidayCover,
        salesOwner,
        mine: !!email && (sameEmail(personInCharge, email) || sameEmail(holidayCover, email)),
        myCustomer: (!!facts?.salesOwnerUserId && facts.salesOwnerUserId === actor.userID) || (!!email && sameEmail(salesOwner, email)),
        issuedBy: ctx.issuers.get(inv.issuedBy)?.email ?? "",
        version: rec?.version ?? 1,
        issuedAgainFrom: f.issuedAgainFrom ?? null,
      };
    });
  }

  private async rows(actor: Actor, figures: InvoiceFigures[], today: string): Promise<{ rows: ReceivableItem[]; ctx: Context }> {
    const [ctx, email] = await Promise.all([this.context(actor, figures), this.emailOrNothing(actor)]);
    return { rows: this.build(actor, figures, ctx, today, email), ctx };
  }

  /**
   * The page (D1–D7): every invoice still owed or to refund, whatever its age, and the others issued in the period
   * (90 days by default, 12 months, or all), up to 2000; tiles and counts over those rows; By customer with the aging.
   */
  async list(actor: Actor, periodText?: string): Promise<ReceivablesResponse> {
    const period = (periodText?.trim() || "90d") as ReceivablePeriod;
    if (!PERIODS.includes(period)) throw APIError.invalidArgument("The period is 90d, 12m or all");
    await this.prepareQuietly(actor, { all: true });
    const today = businessDay(new Date());
    const since = period === "all" ? null : addDays(today, period === "90d" ? -90 : -365);
    const figures = await repo.figures(actor.companyID, { openOrSince: since }, LIST_LIMIT + 1);
    const truncated = figures.length > LIST_LIMIT;
    const { rows, ctx } = await this.rows(actor, figures.slice(0, LIST_LIMIT), today);

    const owed = rows.filter(isOwed);
    const overdue = rows.filter((r) => r.marks.includes("overdue"));
    const weekEnd = addDays(today, 7);
    const byCustomer: ReceivableCustomerRow[] = agingByCustomer(rows).map((a) => {
      const facts = ctx.facts.get(a.customerId);
      return { ...a, salesOwner: facts?.salesOwner ?? "", creditLimit: Number(facts?.creditLimit ?? 0), creditCurrency: facts?.currency ?? "" };
    });
    const money = (list: ReceivableItem[]) => sumByCurrency(list.map((r) => ({ amount: r.leftToPay, currency: r.currency })));
    return {
      rows,
      truncated,
      period,
      counts: {
        unpaid: owed.length,
        overdue: overdue.length,
        paid: rows.filter((r) => r.status === "paid").length,
        writtenOff: rows.filter((r) => r.status === "written_off").length,
        creditedCancelled: rows.filter((r) => r.status === "credited" || r.status === "cancelled").length,
        all: rows.length,
        promised: rows.filter((r) => r.marks.includes("promised")).length,
        disputed: rows.filter((r) => r.marks.includes("disputed")).length,
        byCustomer: byCustomer.length,
      },
      totals: { toCollect: money(owed), overdue: money(overdue) },
      dueThisWeek: owed.filter((r) => r.dueDate >= today && r.dueDate <= weekEnd).length,
      over60: owed.filter((r) => r.daysOverdue > 60).length,
      customersOwing: new Set(owed.map((r) => r.customerId)).size,
      byCustomer,
      canAct: this.canAct(actor),
      factsRead: ctx.factsRead,
      today,
      autoRemindersSince: await this.autoRemindersSinceQuietly(actor),
    };
  }

  /**
   * The day the app's automatic reminders start (mock test council P18: the "Not reminded by the app" filter), null
   * while they are off, e-mail from the app is off or no run has set it yet - or the settings can't be read just now.
   */
  private async autoRemindersSinceQuietly(actor: Actor): Promise<string | null> {
    try {
      const s = await repo.settingsOf(actor.companyID);
      return s.autoReminders && emailConfigured() ? s.autoRemindersSince : null;
    } catch (err) {
      log.warn(err, "the reminder settings could not be read for the list");
      return null;
    }
  }

  /** The job's invoices, any status (the payment chip on the shipment's invoice panel, D19). */
  async rowsOfShipment(actor: Actor, shipmentId: string): Promise<ReceivableRowsResponse> {
    if (!isUuid(shipmentId)) return { rows: [] };
    await this.prepareQuietly(actor, { shipmentId });
    const today = businessDay(new Date());
    const figures = await repo.figures(actor.companyID, { shipmentId }, SHIPMENT_LIMIT);
    return { rows: (await this.rows(actor, figures, today)).rows };
  }

  /** The invoices billed to a customer, any status, the owed first (the customer's Finance tab, D19). */
  async rowsOfCustomer(actor: Actor, customerId: string): Promise<ReceivableCustomerRowsResponse> {
    const today = businessDay(new Date());
    if (!isUuid(customerId)) return { rows: [], truncated: false, canAct: this.canAct(actor), today };
    await this.prepareQuietly(actor, { customerId });
    const figures = await repo.figures(actor.companyID, { customerId }, LIST_LIMIT + 1);
    const { rows } = await this.rows(actor, figures.slice(0, LIST_LIMIT), today);
    return { rows, truncated: figures.length > LIST_LIMIT, canAct: this.canAct(actor), today };
  }

  // ── One invoice ──

  /** The invoice (kind 'invoice') with its receivable made and the old "Paid" carried over; not found otherwise. */
  private async writable(actor: Actor, invoiceId: string): Promise<Writable> {
    if (!isUuid(invoiceId)) throw notThere();
    await this.prepare(actor, { invoiceIds: [invoiceId] });
    const f = await repo.figuresOne(actor.companyID, invoiceId);
    if (!f || !f.receivable) throw notThere();
    return f as Writable;
  }

  /** One invoice with its lines, credit notes, payments, chasing, history and the customer's terms. */
  async detail(actor: Actor, invoiceId: string): Promise<ReceivableDetailResponse> {
    if (!isUuid(invoiceId)) throw notThere();
    await this.prepareQuietly(actor, { invoiceIds: [invoiceId] });
    const f = await repo.figuresOne(actor.companyID, invoiceId);
    if (!f) throw notThere();
    const today = businessDay(new Date());
    const [{ rows, ctx }, lines, payments, notes, events] = await Promise.all([
      this.rows(actor, [f], today),
      repo.linesOf(actor.companyID, invoiceId),
      repo.paymentsOf(actor.companyID, [invoiceId]),
      repo.notes(actor.companyID, invoiceId),
      repo.events(actor.companyID, invoiceId),
    ]);
    const creditNotes = ctx.creditNotes.get(invoiceId) ?? [];
    const [failed, customerFacts, paymentWaiting, reminderDrafts] = await Promise.all([
      repo.failedFollowups(actor.companyID, [invoiceId, ...creditNotes.map((c) => c.id)], CUSTOMER_LIST_KINDS),
      this.customerFacts(actor, f.invoice.customerId, ctx, today),
      this.paymentWaitingOf(actor, f, today),
      this.reminderDrafts(actor, f, rows[0]!, ctx),
    ]);
    const credited = f.invoice.status === "credited";
    return {
      row: rows[0]!,
      lines: lines.map((l) => {
        const net = Number(l.net);
        const vatRate = Number(l.vatRate);
        const vat = round2((net * vatRate) / 100);
        // Net, VAT and gross of a line are in the invoice's currency (the unit price may be in another one: it is not shown).
        return { description: l.description, qty: Number(l.qty), unit: "", unitPrice: Number(l.unitPrice), currency: f.invoice.currency, net, vatRate, vat, gross: round2(net + vat) };
      }),
      // A credited invoice's last credit note is the one of the whole invoice (none can follow it).
      creditNotes: creditNotes.map((c, i) => ({
        id: c.id,
        number: c.number,
        issueDate: c.issueDate,
        gross: Number(c.gross),
        reason: c.creditReason,
        full: credited && i === creditNotes.length - 1,
        ...issuerOf(ctx, c.issuedBy),
      })),
      payments: await this.paymentItems(actor, payments),
      notes: notes.map((n) => ({
        id: n.id,
        kind: n.kind,
        text: n.text,
        promisedOn: n.promisedOn,
        reminderLevel: n.reminderLevel,
        recipient: n.recipient,
        by: n.by,
        at: n.createdAt.toISOString(),
      })),
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        by: e.by,
        at: e.createdAt.toISOString(),
        reason: e.reason,
        payload: e.payload,
      })),
      customerFacts,
      canAct: this.canAct(actor),
      today,
      sendAgain: failed.length > 0,
      paymentWaiting,
      reminderDrafts,
    };
  }

  /**
   * A payment on a bank statement, not confirmed yet, that may be for this invoice (X5): the drawer and the reminder
   * form say so. null when none - or when the statements can't be read just now (nothing is claimed then).
   */
  private async paymentWaitingOf(actor: Actor, f: InvoiceFigures, today: string): Promise<ReceivablePaymentWaiting | null> {
    const s = stateOf(f, today);
    if (!isOwed(s)) return null;
    let w: WaitingPayment | undefined;
    try {
      w = (await waitingPaymentsFor(actor.companyID, [{ f, s }], today)).get(f.invoice.id);
    } catch (err) {
      log.warn(err, "the bank statements could not be read for an invoice's waiting payment");
      return null;
    }
    return w ? { ...w, text: waitingPaymentText(w) } : null;
  }

  /**
   * The reminder of each level the user may record, as the app's own e-mail writes it (lib/reminderTexts): in the
   * customer's language, with the issuer's account in the invoice's currency and the variable symbol (m3). The user
   * attaches the invoice themselves, so the text says nothing of an attachment. None for an invoice not owed.
   */
  private async reminderDrafts(actor: Actor, f: InvoiceFigures, row: ReceivableItem, ctx: Context): Promise<ReceivableReminderDraft[]> {
    if (!isOwed(row)) return [];
    const profile = await invoiceProfileRepository.getByCompany(actor.companyID).catch((err: unknown) => {
      log.warn(err, "the invoice profile could not be read for a reminder's text: the invoice's own issuer is used");
      return null;
    });
    const { issuer, bank } = mailIssuerOf(profile, f.invoice.currency, f.invoice);
    const language = languageOf(ctx.facts.get(f.invoice.customerId)?.language);
    const levels: (1 | 2 | 3)[] = this.canAct(actor) ? [1, 2, 3] : [1, 2];
    return levels.map((level) => ({
      level,
      language,
      ...reminderText(level, language, {
        invoiceNumber: row.number,
        jobNumber: row.jobNumber,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        daysOverdue: row.daysOverdue,
        leftToPay: row.leftToPay,
        currency: row.currency,
        paymentReference: variableSymbol(row.jobNumber),
        issuer: issuer.companyName,
        bank,
        invoiceAttached: false,
      }),
    }));
  }

  /** The customer's terms, limit and what it owes in all (from Invoicing's own records); null when the Customer Database can't be read. */
  private async customerFacts(actor: Actor, customerId: string, ctx: Context, today: string): Promise<ReceivableCustomerFacts | null> {
    const facts = ctx.facts.get(customerId);
    if (!ctx.factsRead || !facts) return null;
    const theirs = await repo.figures(actor.companyID, { customerId }, LIST_LIMIT);
    const states = theirs.map((f) => ({ f, s: stateOf(f, today) }));
    const owed = states.filter(({ s }) => isOwed(s));
    return {
      paymentTerms: facts.paymentTerms,
      creditLimit: Number(facts.creditLimit ?? 0),
      creditCurrency: facts.currency,
      salesOwner: facts.salesOwner,
      unpaid: sumByCurrency(owed.map(({ f, s }) => ({ amount: s.leftToPay, currency: f.invoice.currency }))),
      overdueCount: owed.filter(({ s }) => s.marks.includes("overdue")).length,
      reminderTo: facts.reminderTo ?? null,
    };
  }

  /**
   * The detail's lines: payments, carried over, write-offs and bank charges, and whether the user may confirm a waiting
   * one (another manager; the writer only when the company has no other manager - asked only when it matters, and a
   * failed lookup leaves the writer's button off).
   */
  private async paymentItems(actor: Actor, payments: ReceivablePaymentRecord[]): Promise<ReceivablePaymentItem[]> {
    const manager = this.canAct(actor);
    const ownWaiting = manager && payments.some((p) => isWaiting(p) && p.byUserId === actor.userID);
    const anotherManager = ownWaiting ? ((await this.anotherManagerQuietly(actor)) ?? true) : true;
    return payments.map((p) => {
      const waiting = isWaiting(p);
      return {
        id: p.id,
        kind: p.kind,
        paidOn: p.paidOn,
        amount: Number(p.amount),
        note: p.note,
        reason: p.reason ?? "",
        bankRef: p.bankRef ?? "",
        by: p.by,
        at: p.createdAt.toISOString(),
        confirmed: isWriteOffKind(p.kind) && p.confirmedAt ? { by: p.confirmedBy ?? "", at: p.confirmedAt.toISOString(), self: !!p.selfConfirmed } : null,
        waiting,
        canConfirm: waiting && mayConfirm({ manager, byUserId: p.byUserId, userId: actor.userID, anotherManager }),
        takenBack: p.takenBackAt
          ? { by: p.takenBackBy, at: p.takenBackAt.toISOString(), reason: p.takenBackReason, kind: p.takenBackKind === "reversed" ? "reversed" : "mistake", reversedOn: p.reversedOn ?? null }
          : null,
      };
    });
  }

  /** Whether the company has an active manager other than the user (Accounts Payable's self-approval rule). Throws unavailable when it can't be read. */
  private async anotherManager(actor: Actor): Promise<boolean> {
    try {
      const users = await companyUsersWithRoles();
      return users.some((u) => canDecideQuoteInquiry(u.role) && u.id !== actor.userID);
    } catch (err) {
      log.warn(err, "the company's managers could not be read for a write-off's confirmation");
      throw APIError.unavailable(MANAGERS_UNREADABLE);
    }
  }

  /** The same for a read: null when it can't be read. */
  private async anotherManagerQuietly(actor: Actor): Promise<boolean | null> {
    try {
      return await this.anotherManager(actor);
    } catch {
      return null;
    }
  }

  // ── Payments (D11, D12, D14) ──

  /**
   * A manager notes a payment: its day (not after today, not before the invoice was issued) and amount (above 0, at most
   * what is left to pay). Checked again under the company's lock against the figures then (a credit note issued
   * meanwhile counts). The customer's list follows (a receivable_state follow-up in the same transaction). The same
   * idempotency key twice notes one payment.
   */
  async notePayment(
    actor: Actor,
    invoiceId: string,
    input: { version: number; paidOn: string; amount: number; note?: string; bankRef?: string; idempotencyKey?: string },
  ): Promise<ReceivableDetailResponse> {
    this.requireManager(actor);
    const paidOn = String(input.paidOn ?? "").trim();
    if (!isRealYmd(paidOn)) throw APIError.invalidArgument("The day it was paid must be a date (yyyy-mm-dd)");
    const bad = amountProblem(input.amount);
    if (bad) throw APIError.invalidArgument(bad);
    if (!isUuid(invoiceId)) throw notThere();
    const key = input.idempotencyKey?.trim() || null;
    const replay = async () => {
      const earlier = key ? await repo.paymentByKey(actor.companyID, key) : null;
      if (!earlier) return null;
      if (earlier.invoiceId !== invoiceId) throw APIError.failedPrecondition("This payment was noted on another invoice");
      return this.detail(actor, invoiceId);
    };
    const earlier = await replay();
    if (earlier) return earlier;

    const f = await this.writable(actor, invoiceId);
    if (!f.receivable.carriedChecked) throw APIError.unavailable(NOT_CHECKED);
    if (f.receivable.version !== input.version) throw changedMeanwhile();
    const today = businessDay(new Date());
    const amount = round2(input.amount);
    const check = (figures: InvoiceFigures) => {
      const s = stateOf(figures, today);
      const problem = paymentProblem({
        invoiceStatus: figures.invoice.status,
        paidOn,
        amount,
        leftToPay: s.leftToPay,
        currency: figures.invoice.currency,
        issueDate: figures.invoice.issueDate,
        today,
        prepayment: isPrepayment(figures.invoice.customer?.paymentTerms),
        issuedAgainFrom: figures.issuedAgainFrom ?? null,
      });
      if (problem) throw APIError.failedPrecondition(problem);
      return s;
    };
    const before = check(f);
    const by = await userEmailOf(actor.userID);
    let row: ReceivableRecord | null;
    try {
      row = await repo.decide(
        actor.companyID,
        f.receivable,
        {},
        { action: "payment_noted", fromStatus: before.status, byUserId: actor.userID, by, payload: { paidOn, amount } },
        async (tx) => {
          // Read again under the invoice's credit lock and the company's lock: a credit note or a same-day cancellation
          // issued meanwhile is committed by now and counts.
          const now = await repo.figuresOne(actor.companyID, invoiceId, tx);
          if (!now) throw notThere();
          check(now);
          const made = await repo.insertPayment(tx, {
            companyId: actor.companyID,
            invoiceId,
            kind: "payment",
            paidOn,
            amount: amount.toFixed(2),
            note: (input.note ?? "").trim(),
            // as a payment over several invoices keeps it (user council A11)
            bankRef: String(input.bankRef ?? "").trim(),
            byUserId: actor.userID,
            by,
            idempotencyKey: key,
          });
          if (!made) throw new ReplayedPayment();
          await repo.refreshPaid(tx, actor.companyID, invoiceId);
          await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfReceivable(now.invoice, actorOf(actor)));
          return { toStatus: stateOf({ ...now, paid: round2(now.paid + amount) }, today).status, payload: { paymentId: made.id } };
        },
        { creditsOf: f.invoice },
      );
    } catch (err) {
      if (!(err instanceof ReplayedPayment)) throw err;
      row = null;
    }
    if (!row) {
      // The request this one repeats noted it a moment ago, or someone else wrote the invoice meanwhile.
      const again = await replay();
      if (again) return again;
      throw changedMeanwhile();
    }
    await deliverInvoiceFollowups(invoiceId);
    return this.detail(actor, invoiceId);
  }

  /**
   * A manager takes a line back with a reason: a payment noted by mistake, or one reversed on a day - a bank return or a
   * refund (mock test council P8; either way the invoice is owed again, but a reversed payment counted as paid on the
   * days before it went back: the month-end says so) - or a write-off or bank charge, confirmed or still waiting
   * (step 7), always as a mistake. It stays in the history.
   */
  async takeBackPayment(
    actor: Actor,
    invoiceId: string,
    paymentId: string,
    input: { version: number; reason: string; kind?: string; reversedOn?: string },
  ): Promise<ReceivableDetailResponse> {
    this.requireManager(actor);
    const why = String(input.reason ?? "").trim();
    if (why.length < MIN_REASON) throw APIError.invalidArgument("Say why it is taken back");
    if (!isUuid(paymentId)) throw paymentNotThere();
    const f = await this.writable(actor, invoiceId);
    if (f.receivable.version !== input.version) throw changedMeanwhile();
    const payment = await repo.paymentById(actor.companyID, invoiceId, paymentId);
    if (!payment) throw paymentNotThere();
    const today = businessDay(new Date());
    const how: TakeBackKind = input.kind === "reversed" ? "reversed" : "mistake";
    const reversedOn = how === "reversed" ? String(input.reversedOn ?? "").trim() : null;
    if (input.kind && !TAKE_BACK_KINDS.includes(input.kind as TakeBackKind)) throw APIError.invalidArgument("A take-back is noted by mistake or reversed on a day");
    const problem = takeBackProblem({ reason: why, takenBackAt: payment.takenBackAt, kind: payment.kind, takeBackKind: how, reversedOn, paidOn: payment.paidOn, today });
    if (problem) throw APIError.failedPrecondition(problem);
    const by = await userEmailOf(actor.userID);
    const word = lineWord(payment.kind);
    const row = await repo.decide(
      actor.companyID,
      f.receivable,
      {},
      {
        action: isWriteOffKind(payment.kind) ? "write_off_taken_back" : "payment_taken_back",
        fromStatus: stateOf(f, today).status,
        byUserId: actor.userID,
        by,
        reason: why,
        payload: { paymentId, kind: payment.kind, paidOn: payment.paidOn, amount: Number(payment.amount), takenBack: how, ...(reversedOn ? { reversedOn } : {}) },
      },
      async (tx) => {
        const taken = await repo.takeBack(tx, actor.companyID, invoiceId, paymentId, { userId: actor.userID, email: by, reason: why, kind: how, reversedOn });
        if (!taken) throw APIError.failedPrecondition(`This ${word} was taken back already`);
        await repo.refreshPaid(tx, actor.companyID, invoiceId);
        const now = await repo.figuresOne(actor.companyID, invoiceId, tx);
        if (!now) throw notThere();
        await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfReceivable(now.invoice, actorOf(actor)));
        return { toStatus: stateOf(now, today).status };
      },
    );
    if (!row) throw changedMeanwhile();
    await deliverInvoiceFollowups(invoiceId);
    // Read again through prepare: a dispute that closed by itself on what was taken back opens again there.
    return this.detail(actor, invoiceId);
  }

  // ── Chasing (D16, D17) ──

  /**
   * A note on the invoice: a plain note, a promised day, a dispute or its end, or a reminder sent from the user's own
   * mail program (recorded, the app sends nothing). Everyone; the final notice (reminder 3) managers only.
   */
  async addNote(
    actor: Actor,
    invoiceId: string,
    input: { kind: string; text: string; promisedOn?: string; reminderLevel?: number; recipient?: string },
  ): Promise<ReceivableDetailResponse> {
    if (!isUuid(invoiceId)) throw notThere();
    const by = await userEmailOf(actor.userID);
    const text = String(input.text ?? "").trim();
    const promisedOn = input.promisedOn?.trim() || null;
    const recipient = input.recipient?.trim() ?? "";
    const f = await this.writable(actor, invoiceId);
    const today = businessDay(new Date());
    const manager = this.canAct(actor);
    /** The note's rules on the invoice as it is (lib/receivables noteProblem), as the right kind of error. */
    const allowed = (figures: InvoiceFigures) => {
      const s = stateOf(figures, today);
      const problem = noteProblem({
        kind: input.kind,
        text,
        promisedOn,
        reminderLevel: input.reminderLevel ?? null,
        recipient,
        today,
        manager,
        status: s.status,
        leftToPay: s.leftToPay,
        disputed: figures.receivable?.disputed ?? false,
      });
      if (problem) {
        if (problem.kind === "forbidden") throw APIError.permissionDenied(problem.message);
        if (problem.kind === "state") throw APIError.failedPrecondition(problem.message);
        throw APIError.invalidArgument(problem.message);
      }
      return s;
    };
    const s = allowed(f);
    const kind = input.kind as NoteKind;
    const level = kind === "reminder" ? (input.reminderLevel as 1 | 2 | 3) : null;
    const { values, action, event } = this.noteEffect(kind, { text, promisedOn, level, recipient, today });
    // A note does not move the version (an open payment dialog stays good); it is written under the company's lock,
    // checked again there against the invoice as it is then (a dispute or a payment noted meanwhile counts).
    const row = await repo.chase(
      actor.companyID,
      invoiceId,
      values,
      { action, fromStatus: s.status, toStatus: s.status, byUserId: actor.userID, by, ...event },
      async (tx) => {
        const now = await repo.figuresOne(actor.companyID, invoiceId, tx);
        if (!now?.receivable) throw notThere();
        const status = allowed(now).status;
        const note = await repo.addNote(tx, {
          companyId: actor.companyID,
          invoiceId,
          kind,
          text,
          promisedOn: kind === "promise" ? promisedOn : null,
          reminderLevel: level,
          recipient: kind === "reminder" ? recipient : "",
          byUserId: actor.userID,
          by,
        });
        return { fromStatus: status, toStatus: status, payload: { noteId: note.id } };
      },
    );
    if (!row) throw notThere();
    return this.detail(actor, invoiceId);
  }

  /**
   * What a note sets on the receivable, and how its history reads. A reminder's level and day are the highest so far
   * (the repository's chase keeps the greater: a reminder never lowers them).
   */
  private noteEffect(
    kind: NoteKind,
    n: { text: string; promisedOn: string | null; level: number | null; recipient: string; today: string },
  ): { values: Pick<Partial<NewReceivableRecord>, "promisedOn" | "disputed" | "disputedReason" | "reminderLevel" | "lastRemindedOn">; action: ReceivableAction; event: Partial<EventInput> } {
    switch (kind) {
      case "promise":
        return { values: { promisedOn: n.promisedOn }, action: "promised", event: { payload: { promisedOn: n.promisedOn } } };
      case "dispute":
        return { values: { disputed: true, disputedReason: n.text }, action: "disputed", event: { reason: n.text } };
      case "dispute_closed":
        return { values: { disputed: false, disputedReason: "" }, action: "dispute_closed", event: { reason: n.text } };
      case "reminder":
        return { values: { reminderLevel: n.level ?? 0, lastRemindedOn: n.today }, action: "reminded", event: { payload: { level: n.level, recipient: n.recipient } } };
      default:
        return { values: {}, action: "note_added", event: {} };
    }
  }

  // ── The customer's list (D24) ──

  /**
   * A manager sends the invoice's failed hand-overs to the customer's list again (its entry, a Credited or Cancelled
   * mark, what is left to pay), and what is left to pay once more after them, so the list ends as Invoicing is now.
   */
  async sendAgain(actor: Actor, invoiceId: string): Promise<ReceivableDetailResponse> {
    this.requireManager(actor);
    const f = await this.writable(actor, invoiceId);
    const creditNotes = await repo.creditNotesOf(actor.companyID, [invoiceId]);
    const failed = await repo.failedFollowups(actor.companyID, [invoiceId, ...creditNotes.map((c) => c.id)], CUSTOMER_LIST_KINDS);
    if (!failed.length) throw APIError.failedPrecondition("Nothing waits to be sent again to the customer's list");
    const requeued = await sendFailedAgain(invoiceFollowupOutboxRepository, actor.companyID, failed);
    const by = await userEmailOf(actor.userID);
    const today = businessDay(new Date());
    const status = stateOf(f, today).status;
    // Like a note, it does not move the version (an open payment dialog stays good).
    await repo.chase(
      actor.companyID,
      invoiceId,
      {},
      { action: "sent_again", fromStatus: status, toStatus: status, byUserId: actor.userID, by, payload: { kinds: requeued.map((r) => r.kind) } },
      async (tx) => {
        await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfReceivable(f.invoice, actorOf(actor)));
      },
    );
    for (const id of unique([...requeued.map((r) => r.invoiceId), invoiceId])) await deliverInvoiceFollowups(id);
    return this.detail(actor, invoiceId);
  }

  // ── Write-offs and bank charges (step 7, D13) ──

  /**
   * A manager closes what is left (a short payment) as a write-off, or as a bank charge the bank kept, with a reason: on
   * today, at most what is left to pay less what already waits. It counts only once a second manager confirms it (the
   * waiting list, Billing approvals). Checked again under the invoice's credit lock and the company's lock.
   */
  async writeOff(actor: Actor, invoiceId: string, input: { version: number; kind: string; amount: number; reason: string }): Promise<ReceivableDetailResponse> {
    if (!this.canAct(actor)) throw APIError.permissionDenied("Only a manager writes off what is left or closes it as a bank charge");
    const kind = String(input.kind ?? "");
    if (!isWriteOffKind(kind)) throw APIError.invalidArgument("A write-off line is a write-off or a bank charge");
    const reason = String(input.reason ?? "").trim();
    if (reason.length < MIN_REASON) throw APIError.invalidArgument(`Say why the ${lineWord(kind)} closes what is left`);
    const bad = amountProblem(input.amount);
    if (bad) throw APIError.invalidArgument(bad);
    const f = await this.writable(actor, invoiceId);
    if (!f.receivable.carriedChecked) throw APIError.unavailable(NOT_CHECKED);
    if (f.receivable.version !== input.version) throw changedMeanwhile();
    const today = businessDay(new Date());
    const amount = round2(input.amount);
    const check = (figures: InvoiceFigures) => {
      const s = stateOf(figures, today);
      const problem = writeOffProblem({
        kind,
        invoiceStatus: figures.invoice.status,
        amount,
        reason,
        leftToPay: s.leftToPay,
        waiting: figures.waiting ?? 0,
        currency: figures.invoice.currency,
      });
      if (problem) throw APIError.failedPrecondition(problem);
      return s;
    };
    const before = check(f);
    const by = await userEmailOf(actor.userID);
    const row = await repo.decide(
      actor.companyID,
      f.receivable,
      {},
      // It counts for nothing yet: the status does not move until it is confirmed.
      { action: "write_off_noted", fromStatus: before.status, toStatus: before.status, byUserId: actor.userID, by, reason, payload: { kind, amount, paidOn: today } },
      async (tx) => {
        const now = await repo.figuresOne(actor.companyID, invoiceId, tx);
        if (!now) throw notThere();
        check(now);
        const made = await repo.insertPayment(tx, {
          companyId: actor.companyID,
          invoiceId,
          kind,
          paidOn: today,
          amount: amount.toFixed(2),
          reason,
          byUserId: actor.userID,
          by,
          idempotencyKey: null,
        });
        if (!made) throw changedMeanwhile();
        return { payload: { lineId: made.id } };
      },
      { creditsOf: f.invoice },
    );
    if (!row) throw changedMeanwhile();
    return this.detail(actor, invoiceId);
  }

  /**
   * A second manager confirms a waiting write-off or bank charge, and it counts (D13): the manager who wrote it only when
   * the company has no other manager (marked self-confirmed). It must still fit what is left to pay. The customer's list
   * follows (a receivable_state follow-up in the same transaction).
   */
  async confirmWriteOff(actor: Actor, invoiceId: string, lineId: string, input: { version: number }): Promise<ReceivableDetailResponse> {
    if (!this.canAct(actor)) throw APIError.permissionDenied("Only a manager confirms a write-off or a bank charge");
    if (!isUuid(lineId)) throw lineNotThere();
    const f = await this.writable(actor, invoiceId);
    if (f.receivable.version !== input.version) throw changedMeanwhile();
    const line = await repo.paymentById(actor.companyID, invoiceId, lineId);
    if (!line) throw lineNotThere();
    // Who else is a manager is asked only when it matters: the one confirming wrote it.
    const anotherManager = line.byUserId === actor.userID ? await this.anotherManager(actor) : true;
    const today = businessDay(new Date());
    const check = (figures: InvoiceFigures, l: ReceivablePaymentRecord) => {
      const s = stateOf(figures, today);
      const { problem, selfConfirmed } = confirmProblem({
        line: l,
        confirmerUserId: actor.userID,
        anotherManager,
        invoiceStatus: figures.invoice.status,
        leftToPay: s.leftToPay,
        currency: figures.invoice.currency,
      });
      if (problem) throw APIError.failedPrecondition(problem);
      return { s, selfConfirmed };
    };
    const { s: before } = check(f, line);
    const by = await userEmailOf(actor.userID);
    const amount = Number(line.amount);
    const row = await repo.decide(
      actor.companyID,
      f.receivable,
      {},
      { action: "write_off_confirmed", fromStatus: before.status, byUserId: actor.userID, by, reason: line.reason, payload: { lineId, kind: line.kind, amount } },
      async (tx) => {
        // Read again under the locks: taken back, confirmed, a payment or a credit note meanwhile all count.
        const nowLine = await repo.paymentById(actor.companyID, invoiceId, lineId, tx);
        if (!nowLine) throw lineNotThere();
        const now = await repo.figuresOne(actor.companyID, invoiceId, tx);
        if (!now) throw notThere();
        const { selfConfirmed } = check(now, nowLine);
        const done = await repo.confirmLine(tx, actor.companyID, invoiceId, lineId, { userId: actor.userID, email: by, selfConfirmed });
        if (!done) throw APIError.failedPrecondition(`This ${lineWord(nowLine.kind)} no longer waits for a second manager`);
        await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfReceivable(now.invoice, actorOf(actor)));
        const after = stateOf(
          { ...now, writtenOff: round2(now.writtenOff + (nowLine.kind === "write_off" ? amount : 0)), bankCharges: round2(now.bankCharges + (nowLine.kind === "bank_charge" ? amount : 0)), waiting: round2(now.waiting - amount) },
          today,
        );
        return { toStatus: after.status, payload: { selfConfirmed } };
      },
      { creditsOf: f.invoice },
    );
    if (!row) throw changedMeanwhile();
    await deliverInvoiceFollowups(invoiceId);
    return this.detail(actor, invoiceId);
  }

  /** The company's write-offs and bank charges waiting for a second manager (Billing approvals counts them). */
  async waiting(actor: Actor): Promise<ReceivableWaitingResponse> {
    const rows = await repo.waitingLines(actor.companyID);
    const manager = this.canAct(actor);
    const own = manager && rows.some((x) => x.line.byUserId === actor.userID);
    const anotherManager = own ? ((await this.anotherManagerQuietly(actor)) ?? true) : true;
    return {
      lines: rows.map(({ line, invoice, version }) => ({
        lineId: line.id,
        invoiceId: invoice.id,
        number: invoice.number,
        customerId: invoice.customerId,
        customer: invoice.customer?.companyName ?? "",
        jobNumber: invoice.shipment?.jobNumber ?? "",
        currency: invoice.currency,
        kind: line.kind === "bank_charge" ? "bank_charge" : "write_off",
        amount: Number(line.amount),
        reason: line.reason,
        by: line.by,
        at: line.createdAt.toISOString(),
        version,
        canConfirm: mayConfirm({ manager, byUserId: line.byUserId, userId: actor.userID, anotherManager }),
      })),
    };
  }

  // ── One bank payment over several invoices (step 7) ──

  /** Makes the receivables of these invoices and carries their old Paid over, before a write outside a caller's transaction. */
  async prepareInvoices(actor: Actor, invoiceIds: string[]): Promise<void> {
    const ids = unique(invoiceIds.filter(isUuid));
    if (ids.length) await this.prepare(actor, { invoiceIds: ids });
  }

  /**
   * The engine of one bank payment over several invoices (also the bank import's): managers; the same day, bank
   * reference and note on every line; each invoice with the receivable version the user saw and an amount in its own
   * currency, at most what is left to pay on it; all in one currency. All or nothing, in one transaction under the
   * invoices' credit locks and the company's lock - or, given `outer`, in a savepoint of the caller's transaction (then
   * the receivables must be made and checked before, prepareInvoices, and the caller sends the follow-ups after its
   * commit: deliverInvoiceFollowups per invoice; the outbox's cron sends them otherwise). With a key prefix, the same
   * request again writes nothing and answers the lines written.
   */
  async noteAllocations(actor: Actor, input: NoteAllocationsInput, outer?: Tx): Promise<NoteAllocationResult[]> {
    this.requireManager(actor);
    const paidOn = String(input.paidOn ?? "").trim();
    const items = (input.items ?? []).map((i) => ({ invoiceId: String(i.invoiceId ?? "").trim(), version: i.version, amount: i.amount }));
    const bad = batchProblem({ paidOn, items });
    if (bad) throw APIError.invalidArgument(bad);
    const prefix = input.idempotencyKeyPrefix?.trim() || null;
    const keyOf = (invoiceId: string) => (prefix ? `${prefix}:${invoiceId}` : null);
    const ids = items.map((i) => i.invoiceId);
    const companyId = actor.companyID;

    /** The lines a request with the same keys wrote; null when none. Refused when they don't match this request. */
    const replay = async (reader?: Tx): Promise<NoteAllocationResult[] | null> => {
      if (!prefix) return null;
      const earlier = await repo.paymentsByKeys(companyId, ids.map((id) => keyOf(id)!), reader);
      if (!earlier.length) return null;
      const byInvoice = new Map(earlier.map((p) => [p.invoiceId, p]));
      const same = items.every((i) => byInvoice.has(i.invoiceId) && round2(Number(byInvoice.get(i.invoiceId)!.amount)) === round2(i.amount));
      if (!same) throw APIError.failedPrecondition("This payment was noted before on other invoices or amounts: open the invoices to see how they are now");
      return items.map((i) => ({ invoiceId: i.invoiceId, paymentId: byInvoice.get(i.invoiceId)!.id }));
    };
    const earlier = await replay(outer);
    if (earlier) return earlier;

    if (!outer) await this.prepareInvoices(actor, ids);
    const first = await repo.figures(companyId, { invoiceIds: ids }, ids.length, outer);
    if (first.length !== ids.length) throw notThere();
    const today = businessDay(new Date());
    const bankRef = String(input.bankRef ?? "").trim();
    const note = String(input.note ?? "").trim();
    const expected = input.currency?.trim() || null;
    /** Every item against the invoices as they are (before the locks, then again under them). */
    const check = (figures: InvoiceFigures[]) => {
      const byId = new Map(figures.map((f) => [f.invoice.id, f]));
      const currency = batchCurrencyProblem(figures.map((f) => f.invoice.currency), expected);
      if (currency) throw APIError.failedPrecondition(currency);
      return items.map((item) => {
        const f = byId.get(item.invoiceId);
        if (!f) throw notThere();
        // Not made or not checked yet (in a caller's transaction prepareInvoices was not run first): try again.
        if (!f.receivable?.carriedChecked) throw APIError.unavailable(NOT_CHECKED);
        if (f.receivable.version !== item.version) throw APIError.aborted(`Invoice ${f.invoice.number} changed meanwhile: open it again to see how it is now`);
        const s = stateOf(f, today);
        const problem = paymentProblem({
          invoiceStatus: f.invoice.status,
          paidOn,
          amount: round2(item.amount),
          leftToPay: s.leftToPay,
          currency: f.invoice.currency,
          issueDate: f.invoice.issueDate,
          today,
          prepayment: isPrepayment(f.invoice.customer?.paymentTerms),
          issuedAgainFrom: f.issuedAgainFrom ?? null,
        });
        if (problem) throw APIError.failedPrecondition(`Invoice ${f.invoice.number}: ${problem}`);
        return { item, f, s };
      });
    };
    check(first);
    const by = await userEmailOf(actor.userID);
    let made: NoteAllocationResult[];
    try {
      made = await repo.underWriteLocks(
        companyId,
        first.map((f) => f.invoice),
        async (tx) => {
          // A request with the same keys that held the locks a moment ago wrote them: answered, nothing written twice.
          const again = await replay(tx);
          if (again) throw new ReplayedAllocations(again);
          const out: NoteAllocationResult[] = [];
          for (const { item, f, s } of check(await repo.figures(companyId, { invoiceIds: ids }, ids.length, tx))) {
            const amount = round2(item.amount);
            if (!(await repo.bumpVersion(tx, companyId, item.invoiceId, item.version))) {
              throw APIError.aborted(`Invoice ${f.invoice.number} changed meanwhile: open it again to see how it is now`);
            }
            const line = await repo.insertPayment(tx, {
              companyId,
              invoiceId: item.invoiceId,
              kind: "payment",
              paidOn,
              amount: amount.toFixed(2),
              note,
              bankRef,
              byUserId: actor.userID,
              by,
              idempotencyKey: keyOf(item.invoiceId),
            });
            if (!line) throw APIError.failedPrecondition(`Invoice ${f.invoice.number}: this payment was noted already`);
            await repo.refreshPaid(tx, companyId, item.invoiceId);
            await repo.addEvent(tx, companyId, item.invoiceId, {
              action: "payment_noted",
              fromStatus: s.status,
              toStatus: stateOf({ ...f, paid: round2(f.paid + amount) }, today).status,
              byUserId: actor.userID,
              by,
              payload: { paidOn, amount, paymentId: line.id, bankRef, invoices: items.length },
            });
            await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfReceivable(f.invoice, actorOf(actor)));
            out.push({ invoiceId: item.invoiceId, paymentId: line.id });
          }
          return out;
        },
        outer,
      );
    } catch (err) {
      if (err instanceof ReplayedAllocations) return err.allocations;
      throw err;
    }
    if (!outer) for (const id of ids) await deliverInvoiceFollowups(id);
    return made;
  }

  /** One bank payment over several invoices, noted by a manager (the batch dialog): the invoices' rows as they are after it. */
  async batchPayment(
    actor: Actor,
    input: { paidOn: string; note?: string; bankRef?: string; idempotencyKey?: string; items: BatchItemInput[] },
  ): Promise<ReceivableRowsResponse> {
    const key = input.idempotencyKey?.trim();
    await this.noteAllocations(actor, { paidOn: input.paidOn, note: input.note, bankRef: input.bankRef, idempotencyKeyPrefix: key ? `batch:${key}` : null, items: input.items });
    const ids = (input.items ?? []).map((i) => i.invoiceId.trim());
    const figures = await repo.figures(actor.companyID, { invoiceIds: ids }, ids.length);
    const order = new Map(ids.map((id, i) => [id, i]));
    figures.sort((a, b) => (order.get(a.invoice.id) ?? 0) - (order.get(b.invoice.id) ?? 0));
    return { rows: (await this.rows(actor, figures, businessDay(new Date()))).rows };
  }

  // ── Month-end as at a day (step 7) ──

  /**
   * The receivables as they stood at the end of a day (month-end): every invoice issued on or before it, not cancelled,
   * with something left to pay then (lib/receivables asAtOf), in its own currency and in CZK at its own ČNB rate. Totals
   * per currency, and one CZK total.
   */
  async asAt(actor: Actor, dayText?: string): Promise<ReceivablesAsAtResponse> {
    const today = businessDay(new Date());
    const day = String(dayText ?? "").trim();
    const bad = asAtDayProblem(day, today);
    if (bad) throw APIError.invalidArgument(bad);
    // Every invoice the day can include is asked about its old Paid first (a chunk of 500 at a time), so one paid
    // before Accounts Receivable is never listed as owed. When the Customer Database can't be asked, the list is still
    // answered and says how many of its invoices were not checked (they may already be paid): never overstated silently.
    const scope: InvoiceScope = { issuedOnOrBefore: day };
    await repo.ensureRows(actor.companyID, scope);
    await carryOverAll(actor.companyID, scope, (invoice) => followupsOfReceivable(invoice, actorOf(actor)), Math.ceil(AS_AT_LIMIT / CARRY_OVER_CHUNK) + 1);
    const found = await repo.asAtCandidates(actor.companyID, day, AS_AT_LIMIT + 1);
    const candidates = found.slice(0, AS_AT_LIMIT);
    const ids = candidates.map((c) => c.id);
    const [creditNotes, lines] = await Promise.all([repo.creditNotesOf(actor.companyID, ids), repo.paymentsOf(actor.companyID, ids)]);
    const notesBy = new Map<string, { issueDate: string; gross: string }[]>();
    for (const c of creditNotes) if (c.correctsInvoiceId) notesBy.set(c.correctsInvoiceId, [...(notesBy.get(c.correctsInvoiceId) ?? []), { issueDate: c.issueDate, gross: c.gross }]);
    const linesBy = new Map<string, ReceivablePaymentRecord[]>();
    for (const l of lines) linesBy.set(l.invoiceId, [...(linesBy.get(l.invoiceId) ?? []), l]);
    const rows: ReceivableAsAtRow[] = [];
    let unchecked = 0;
    for (const c of candidates) {
      const s = asAtOf(
        { invoiceStatus: c.status, issueDate: c.issueDate, dueDate: c.dueDate, gross: c.gross, fxRate: c.fxRate, creditNotes: notesBy.get(c.id) ?? [], lines: linesBy.get(c.id) ?? [] },
        day,
      );
      if (!s.listed) continue;
      if (!c.carriedChecked) unchecked++;
      rows.push({
        invoiceId: c.id,
        number: c.number,
        customerId: c.customerId,
        customer: c.customer,
        shipmentId: c.shipmentId,
        jobNumber: c.jobNumber,
        issueDate: c.issueDate,
        dueDate: c.dueDate,
        currency: c.currency,
        gross: c.gross,
        credited: s.credited,
        paid: s.paid,
        writtenOff: s.writtenOff,
        leftToPay: s.leftToPay,
        fxRate: c.fxRate,
        leftToPayCzk: s.leftToPayCzk,
        daysOverdue: s.daysOverdue,
        agingBucket: s.agingBucket,
        carriedOver: s.carriedOver,
      });
    }
    rows.sort((a, b) => a.customer.localeCompare(b.customer) || a.currency.localeCompare(b.currency) || a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number));
    return {
      day,
      rows,
      totals: sumByCurrency(rows.map((r) => ({ amount: r.leftToPay, currency: r.currency }))),
      totalCzk: round2(rows.reduce((sum, r) => sum + r.leftToPayCzk, 0)) || 0,
      czkRate: AS_AT_CZK_RATE,
      truncated: found.length > AS_AT_LIMIT,
      today,
      ...(unchecked
        ? {
            unchecked,
            uncheckedNote: `${unchecked} of these invoices could not be checked against the Customer Database's old "Paid" mark just now: they may already be paid. Open the list again in a moment.`,
          }
        : {}),
    };
  }

  // ── Work not yet invoiced (step 7) ──

  /**
   * What is done on the customer's open jobs and not invoiced yet, per currency (lib/receivables unbilledOf): beside the
   * credit limit, never added to "used". When the open jobs can't be read it throws (unavailable): never a 0 that isn't.
   */
  async unbilled(actor: Actor, customerId: string): Promise<ReceivableUnbilledResponse> {
    if (!isUuid(customerId)) return { amounts: [], jobs: 0, capped: false };
    let open: { shipmentIds: string[]; capped: boolean };
    try {
      open = await shipments._internalCustomerOpenJobIds({ customerId });
    } catch (err) {
      log.warn(err, "the customer's open jobs could not be read for the work not yet invoiced");
      throw APIError.unavailable(OPEN_JOBS_UNREADABLE);
    }
    const ids = unique(open.shipmentIds.filter(isUuid));
    const rows: Awaited<ReturnType<typeof sellingCostRepository.listLiveByShipments>> = [];
    const openInvoices: Awaited<ReturnType<typeof invoiceRepository.listOpenInvoicesWithSources>> = [];
    for (const batch of chunks(ids, UNBILLED_CHUNK)) {
      const [r, i] = await Promise.all([
        sellingCostRepository.listLiveByShipments(batch, actor.companyID),
        invoiceRepository.listOpenInvoicesWithSources(batch, actor.companyID),
      ]);
      rows.push(...r);
      openInvoices.push(...i);
    }
    return { ...unbilledOf(rows, openInvoices), capped: open.capped };
  }

  // ── Reminder settings (step 7) ──

  /** The company's reminder settings, whether e-mail from the app is on, and whether the user may change them. */
  async settings(actor: Actor): Promise<ReceivableSettingsResponse> {
    const s = await repo.settingsOf(actor.companyID);
    return {
      autoReminders: s.autoReminders,
      reminder1Days: s.reminder1Days,
      reminder2Days: s.reminder2Days,
      replyTo: s.replyTo,
      autoRemindersSince: s.autoReminders ? s.autoRemindersSince : null,
      remindersSkipped: s.autoReminders && s.remindersSkippedOn ? { on: s.remindersSkippedOn, since: s.remindersSkippedSince } : null,
      emailOn: emailConfigured(),
      canEdit: this.canAct(actor),
      updatedBy: s.updatedBy,
      updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
    };
  }

  /** A manager sets the automatic reminders (sent only while e-mail from the app is on) and their days, and the reply-to address. */
  async saveSettings(actor: Actor, input: { autoReminders: boolean; reminder1Days: number; reminder2Days: number; replyTo: string }): Promise<ReceivableSettingsResponse> {
    if (!this.canAct(actor)) throw APIError.permissionDenied("Only a manager changes the reminder settings");
    if (typeof input.autoReminders !== "boolean") throw APIError.invalidArgument("Say whether the app sends the reminders");
    const replyTo = String(input.replyTo ?? "").trim();
    const problem = settingsProblem({ reminder1Days: input.reminder1Days, reminder2Days: input.reminder2Days, replyTo });
    if (problem) throw APIError.invalidArgument(problem);
    const by = await userEmailOf(actor.userID);
    const before = await repo.settingsOf(actor.companyID);
    const autoRemindersSince = switchOnDayOnSave({ autoReminders: input.autoReminders, emailOn: emailConfigured(), before }, businessDay(new Date()));
    await repo.saveSettings(actor.companyID, {
      autoReminders: input.autoReminders,
      reminder1Days: input.reminder1Days,
      reminder2Days: input.reminder2Days,
      replyTo,
      autoRemindersSince,
      updatedByUserId: actor.userID,
      updatedBy: by,
    });
    log.info("receivable reminder settings changed", { companyId: actor.companyID, by, autoReminders: input.autoReminders, autoRemindersSince, reminder1Days: input.reminder1Days, reminder2Days: input.reminder2Days });
    return this.settings(actor);
  }

  // ── Operations (D20) ──

  /**
   * Whether releasing the job's cargo or documents should warn about payment: the job has an owed invoice on
   * prepayment, or whose customer has an overdue invoice. Never a stop here. Mock test council n6: also the stop before
   * any invoice (L3) - the customer on prepayment and selling not invoiced yet - named in prepaymentUninvoiced, with the
   * warning on, so a release dialog says the stop up front as for an unpaid prepayment invoice. When the customer's
   * terms can't be read just now, that part is left out (the server's own stop still decides).
   */
  async releaseCheck(actor: Actor, shipmentId: string): Promise<ReleaseCheckResponse> {
    if (!isUuid(shipmentId)) return { warn: false, customer: "", prepayment: false, customerOverdueCount: 0, unpaid: [], prepaymentUninvoiced: [] };
    const [rows, uninvoiced] = await Promise.all([
      this.releaseRows(actor, shipmentId),
      this.prepaymentUninvoiced(actor, shipmentId).catch((err: unknown) => {
        log.warn(err, "the work not invoiced yet could not be read for a release check", { shipmentId });
        return { amounts: [], unchecked: true };
      }),
    ]);
    const today = businessDay(new Date());
    const owedCustomers = unique(rows.filter(isOwed).map((r) => r.customerId));
    const overdueBy = await repo.overdueCountByCustomer(actor.companyID, owedCustomers, today);
    return releaseCheckOf(releaseWarning(rows, overdueBy), uninvoiced.amounts);
  }

  /**
   * The release check as the shipments service asks it before a House B/L release or Warehouse Released (step 7): the
   * warning, and whether the prepayment stop applies (an owed invoice on prepayment). A failure is not answered as
   * "paid": it throws, and the shipments service refuses the release ("could not be checked").
   */
  async releaseCheckInternal(actor: Actor, shipmentId: string): Promise<ReleaseCheckInternalResponse> {
    if (!isUuid(shipmentId)) {
      return { warn: false, customer: "", prepayment: false, customerOverdueCount: 0, unpaid: [], prepaymentUnpaid: false, prepaymentInvoices: [], prepaymentUninvoiced: [] };
    }
    // Strict: a prepayment invoice whose old Paid could not be checked is not answered as owed or paid - it throws
    // (unavailable), so the shipments service refuses the release ("could not be checked") and a manager's override is
    // recorded unchecked.
    const [rows, uninvoiced] = await Promise.all([this.releaseRows(actor, shipmentId, true), this.prepaymentUninvoiced(actor, shipmentId)]);
    const today = businessDay(new Date());
    const owedCustomers = unique(rows.filter(isOwed).map((r) => r.customerId));
    const overdueBy = await repo.overdueCountByCustomer(actor.companyID, owedCustomers, today);
    return {
      ...releaseWarning(rows, overdueBy),
      // L3: a job on prepayment is stopped before any invoice too, while it has selling not yet invoiced.
      prepaymentUnpaid: prepaymentUnpaidOf(rows) || uninvoiced.amounts.length > 0,
      prepaymentInvoices: prepaymentInvoicesOf(rows),
      prepaymentUninvoiced: uninvoiced.amounts,
      ...(uninvoiced.unchecked ? { prepaymentUninvoicedUnchecked: true } : {}),
    };
  }

  /**
   * The prepayment stop before any invoice (mock test council L3): when the job has selling with a value not yet
   * invoiced (lib/receivables unbilledOf, the same count as the credit warning's) and its customer's terms are
   * prepayment, the amounts not invoiced; else none. The customer's terms are asked only when something is not invoiced.
   * When they (or the job's customer) can't be read, L3 is left out of this answer (`unchecked`), never thrown: else a
   * Shipments or Customers outage would refuse every user's release of every job not invoiced yet, prepayment or not.
   * Before L3 only a prepayment invoice could stop a release, and it still does (releaseRows, strict).
   */
  private async prepaymentUninvoiced(actor: Actor, shipmentId: string): Promise<{ amounts: { currency: string; amount: number }[]; unchecked: boolean }> {
    const [lines, openInvoices] = await Promise.all([
      sellingCostRepository.listLiveByShipments([shipmentId], actor.companyID),
      invoiceRepository.listOpenInvoicesWithSources([shipmentId], actor.companyID),
    ]);
    const { amounts } = unbilledOf(lines, openInvoices);
    if (!amounts.some((a) => a.amount > 0)) return { amounts: [], unchecked: false };
    let terms = "";
    try {
      const { shipments: [job] = [] } = await shipments._internalShipmentBasics({ ids: [shipmentId] });
      if (!job?.customerId) return { amounts: [], unchecked: false };
      terms = (await customerFactsOf([job.customerId])).get(job.customerId)?.paymentTerms ?? "";
    } catch (err) {
      log.warn(err, "the job's customer terms could not be read: the prepayment stop before any invoice was left out of this release check", { shipmentId });
      return { amounts: [], unchecked: true };
    }
    return { amounts: prepaymentUninvoicedOf(terms, amounts), unchecked: false };
  }

  // ── The credit warning (mock test council m5) ──

  /**
   * What the customer owes by Invoicing's own figures - the same as its Finance tab and Accounts Receivable show, so an
   * invoice whose hand-over to the customer's list failed counts too: left to pay per currency, how many are overdue and
   * the oldest due day among them. The old "Paid" marks are carried over first (quietly: an invoice not checked yet
   * counts as owed, as the Finance tab shows it).
   */
  async customerOwed(actor: Actor, customerId: string): Promise<ReceivableCustomerOwedResponse> {
    if (!isUuid(customerId)) return { unpaid: [], overdueCount: 0, oldestOverdueDue: null };
    await this.prepareQuietly(actor, { customerId });
    const today = businessDay(new Date());
    const figures = await repo.figures(actor.companyID, { customerId }, LIST_LIMIT);
    const owed = figures.map((f) => ({ f, s: stateOf(f, today) })).filter(({ s }) => isOwed(s));
    const overdue = owed.filter(({ s }) => s.marks.includes("overdue"));
    return {
      unpaid: sumByCurrency(owed.map(({ f, s }) => ({ amount: s.leftToPay, currency: f.invoice.currency }))),
      overdueCount: overdue.length,
      oldestOverdueDue: overdue.map(({ f }) => f.invoice.dueDate).sort()[0] ?? null,
    };
  }

  /**
   * The job's invoices as the release check reads them (made and carried over first, quietly). `strict`: when one of
   * them on prepayment is still not checked against the customer's list's old Paid (or not made), it throws unavailable
   * instead. Only those can change the prepayment stop; another unchecked invoice reads as owed in the warning (never
   * as paid), so it does not hold the release of a job that is not on prepayment.
   */
  private async releaseRows(actor: Actor, shipmentId: string, strict = false): Promise<ReleaseRow[]> {
    await this.prepareQuietly(actor, { shipmentId });
    const today = businessDay(new Date());
    const figures = await repo.figures(actor.companyID, { shipmentId }, SHIPMENT_LIMIT);
    if (strict && figures.some((f) => !f.receivable?.carriedChecked && isPrepayment(f.invoice.customer?.paymentTerms))) throw APIError.unavailable(NOT_CHECKED);
    return figures.map((f) => {
      const s = stateOf(f, today);
      return {
        invoiceId: f.invoice.id,
        number: f.invoice.number,
        customerId: f.invoice.customerId,
        customer: f.invoice.customer?.companyName ?? "",
        currency: f.invoice.currency,
        status: s.status,
        leftToPay: s.leftToPay,
        daysOverdue: s.daysOverdue,
        paymentTerms: f.invoice.customer?.paymentTerms ?? "",
      };
    });
  }

  // ── The bell (D18) ──

  /**
   * Notices for the user as the customer's Sales Owner or the job's Person in Charge / Holiday Cover: each overdue
   * invoice at the highest milestone it reached (the first day, 14, 30 days) not yet seen, and an invoice paid in the
   * last 7 days that was overdue when it was paid.
   */
  async forMe(actor: Actor): Promise<ReceivablesForMeResponse> {
    const email = await this.emailOrNothing(actor);
    if (!email) return { notices: [] };
    // Polled by every open page: nothing is made or carried over here (the list does that), only read.
    const today = businessDay(new Date());
    const now = new Date();
    // Both capped: the overdue the oldest due first, the paid the latest noted first (repository), so the cap drops the least urgent.
    const [overdueRead, paidIds] = await Promise.all([
      repo.figures(actor.companyID, { overdueOn: today }, LIST_LIMIT),
      repo.paidSince(actor.companyID, new Date(now.getTime() - BELL_PAID_DAYS * DAY)),
    ]);
    const overdueIds = new Set(overdueRead.map((f) => f.invoice.id));
    const paidOnly = paidIds.filter((id) => !overdueIds.has(id));
    const paid = paidOnly.length ? await repo.figures(actor.companyID, { invoiceIds: paidOnly }, paidOnly.length) : [];
    const read = [...overdueRead, ...paid];
    if (!read.length) return { notices: [] };
    const readCtx = await this.context(actor, read);
    // An invoice whose old "Paid" in the customer's list was not carried over yet may be paid (m4). Mock test council n7:
    // only the user's own such invoices are asked about, and only those the customer's list says are Paid wait (until
    // the page carries the Paid over); the others are listed as overdue, as the page lists them.
    const listedPaid = await this.customerListPaidQuietly(
      actor,
      this.build(actor, overdueRead, readCtx, today, email)
        .filter((row, i) => (row.mine || row.myCustomer) && !overdueRead[i]!.receivable?.carriedChecked)
        .map((row) => ({ invoiceId: row.id, number: row.number, customerId: row.customerId })),
    );
    const overdue = overdueRead.filter((f) => !listedPaid.has(f.invoice.id));
    const all = [...overdue, ...paid];
    if (!all.length) return { notices: [] };
    const ids = all.map((f) => f.invoice.id);
    const [payments, seen] = await Promise.all([repo.paymentsOf(actor.companyID, paid.map((f) => f.invoice.id)), repo.seenKeys(actor.companyID, actor.userID, ids)]);
    const ctx = readCtx;
    const lastPayment = new Map<string, (typeof payments)[number]>();
    // Newest first: the first live money line per invoice is the payment noted last (a write-off after it is not a payment).
    for (const p of payments) if (!p.takenBackAt && isMoneyKind(p.kind) && !lastPayment.has(p.invoiceId)) lastPayment.set(p.invoiceId, p);
    const notices: ReceivableNoticeItem[] = [];
    for (const row of this.build(actor, all, ctx, today, email)) {
      const why = row.mine ? "person_in_charge" : row.myCustomer ? "sales_owner" : null;
      if (!why) continue;
      const last = lastPayment.get(row.id);
      const milestone = row.marks.includes("overdue")
        ? overdueMilestone(row.daysOverdue)
        : paidNotice({ status: row.status, dueDate: row.dueDate, lastPayment: last ? { kind: last.kind, paidOn: last.paidOn, createdAt: last.createdAt } : null, now })
          ? ("paid" as const)
          : null;
      if (!milestone) continue;
      const key = `${row.id}:${milestone}`;
      if (seen.has(key)) continue;
      notices.push({
        key,
        invoiceId: row.id,
        milestone,
        number: row.number,
        customer: row.customer,
        jobNumber: row.jobNumber,
        leftToPay: row.leftToPay,
        currency: row.currency,
        daysOverdue: row.daysOverdue,
        why,
        paymentWaiting: false,
      });
    }
    // A payment on a bank statement may be for an overdue one (X5): its notice says so. Asked only for the overdue
    // notices shown (the bell is polled); when the statements can't be read, nothing is said.
    const overdueNotices = notices.filter((n) => n.milestone !== "paid");
    if (overdueNotices.length) {
      const ids = new Set(overdueNotices.map((n) => n.invoiceId));
      const waiting = await waitingPaymentsFor(
        actor.companyID,
        overdue.filter((f) => ids.has(f.invoice.id)).map((f) => ({ f, s: stateOf(f, today) })),
        today,
      ).catch((err: unknown) => {
        log.warn(err, "the bank statements could not be read for the bell");
        return new Map<string, WaitingPayment>();
      });
      for (const n of overdueNotices) n.paymentWaiting = waiting.has(n.invoiceId);
    }
    return { notices };
  }

  /**
   * Of these invoices not carried over yet, those the customer's list says are Paid (read only: nothing is carried over
   * here - the bell is polled). At most one chunk is asked; when the customer's list can't be asked, every one of them
   * counts as maybe paid (it waits, as before n7), never as owed by guess.
   */
  private async customerListPaidQuietly(actor: Actor, items: { invoiceId: string; number: string; customerId: string }[]): Promise<Set<string>> {
    if (!items.length) return new Set();
    const asked = items.slice(0, CARRY_OVER_CHUNK);
    const out = new Set(items.slice(CARRY_OVER_CHUNK).map((i) => i.invoiceId));
    try {
      // Read only (m4): the bell is polled, and a poll must not write to the customer's list.
      const answer = await customers._internalCustomerInvoiceStatuses({ items: asked, readOnly: true }, asCompany(actor.companyID));
      const said = new Map(answer.items.map((i) => [i.invoiceId, i.status]));
      for (const i of asked) if (!said.has(i.invoiceId) || said.get(i.invoiceId) === "Paid") out.add(i.invoiceId);
    } catch (err) {
      log.warn(err, "the customer's list could not be asked for the bell: invoices not carried over yet wait");
      for (const i of asked) out.add(i.invoiceId);
    }
    return out;
  }

  async seen(actor: Actor, keys: string[]): Promise<void> {
    const parsed = unique(keys)
      .map(parseNoticeKey)
      .filter((k): k is NonNullable<typeof k> => !!k);
    await repo.markSeen(actor.companyID, actor.userID, parsed);
  }

  // ── For the customers service ──

  /** Of these numbers, those of the company's issued invoices or credit notes (D9: a posted row is not edited there). */
  async issuedNumbers(companyId: string, numbers: string[]): Promise<string[]> {
    return repo.issuedNumbers(companyId, numbers);
  }

  /**
   * How many invoices billed to the customer are still owed (D24: a customer is not deleted while one is). The old
   * "Paid" marks are carried over first; an invoice whose mark can't be read counts as owed (the delete waits).
   */
  async customerUnpaidCount(actor: Actor, customerId: string): Promise<number> {
    if (!isUuid(customerId)) return 0;
    await this.prepare(actor, { customerId });
    return repo.owedCountOfCustomer(actor.companyID, customerId);
  }
}

export const receivableService = new ReceivableService();
