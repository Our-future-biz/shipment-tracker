import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, holidays } from "~encore/clients";
import { addDays, businessDay } from "../../../lib/businessDate";
import { userEmailOf } from "../../../lib/companyUsers";
import { emailConfigured, sendMail, type MailAttachment } from "../../../lib/email";
import type { Actor } from "../../../lib/rbac";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import { variableSymbol } from "../lib/invoicePdf";
import { loadPdfFonts } from "../lib/pdfFonts";
import { isOwed, type ReceivableState } from "../lib/receivables";
import { isReminderDay, reminderDue, reminderKey, type ReminderDecision, type ReminderSettings } from "../lib/reminderRules";
import { mailIssuerOf as issuerOf, reminderText, statementMailText, type MailBank } from "../lib/reminderTexts";
import { csvText, fileNamePart, languageOf, statementCsv, statementCurrencies, statementOf, type Statement, type StatementLanguage } from "../lib/statement";
import { renderStatementPdf, STATEMENT_TEXTS, type StatementIssuer } from "../lib/statementPdf";
import { invoiceRepository } from "../repositories/invoice.repository";
import { invoiceProfileRepository } from "../repositories/invoiceProfile.repository";
import { receivableRepository as repo, type InvoiceFigures } from "../repositories/receivable.repository";
import { receivableMailRepository as mails } from "../repositories/receivableMail.repository";
import type { InvoiceRecord } from "../schemas/invoice.schema";
import type { InvoiceProfileRecord } from "../schemas/invoiceProfile.schema";
import type { ReceivableMailRecord } from "../schemas/receivable.schema";
import { invoiceDocumentService } from "./invoiceDocument.service";
import { waitingPaymentsFor } from "./paymentWaiting";
import { receivableService, receivableStateOfFigures } from "./receivable.service";
import type {
  ReceivableMailItem,
  ReceivableMailResponse,
  ReceivableReminderRunResult,
  ReceivableStatementFile,
  ReceivableStatementSendResponse,
} from "../interfaces/receivableMail";

// Accounts Receivable step 7 (18 Nov 2026): a customer's statement as a file and by e-mail, the log of what the app
// e-mailed, and the automatic reminders. E-MAIL FROM THE APP IS SWITCHED OFF (lib/email emailConfigured() is false
// until the owner sets up the provider): while it is off nothing is sent and nothing is written (no mail row, no
// reminder note); the statement's send answers "off" and the daily run returns at once. Everything else is ready for
// the day it is switched on.
//
// How a mail is sent once (both kinds): its row is written first under the mail's idempotency key (status failed,
// "the send never finished"), so a second run or click finds the key taken and sends nothing; then the provider is
// called with the same key; the row becomes sent (a reminder's note and event in the same transaction), or keeps the
// provider's error. A reminder the provider refused frees its key, so a later run tries it again (once a day); one
// that timed out keeps it: it may have gone out, and is never sent again automatically.

/** Who the daily run writes as. */
export const AUTOMATIC = "Accounts Receivable (automatic)";
export const EMAIL_OFF = "E-mail from the app is switched off: download the statement and send it from your own mail program";
export const NEVER_FINISHED = "The send never finished: check the mailbox before sending it again";
const NO_RECIPIENT =
  "The customer has no contact with an e-mail to send it to (Accounts payable, Finance / Accounting or the main contact): add one in the Customer Database";

/** The user id the daily run's calls to the customers service go as: it reads only the company's customers. */
const AUTO_USER_ID = "00000000-0000-0000-0000-000000000000";
const RUN_LIMIT = 2000;
/**
 * How much earlier than the switch-on day the run still reads a due day (L2): a due day on a weekend or holiday is
 * reminded from the next working day (lib/reminderRules reminderDueDay), which may fall on or after the switch-on day.
 * The rule itself decides; this only keeps the read from filling its limit with the invoices due long before.
 */
const SWITCH_ON_MARGIN_DAYS = 14;
/** The company's uploaded holidays read this many days around today (a due day moved past a holiday is near it). */
const HOLIDAY_WINDOW_DAYS = 60;
const MAIL_LIST_LIMIT = 200;
const PER_CALL = 500;
/** An invoice PDF bigger than this is not attached (the reminder says nothing about an attachment then). */
const MAX_ATTACHMENT_BASE64 = 10 * 1024 * 1024;

const notThere = () => APIError.notFound("This customer is not there");
const managersOnly = () => APIError.permissionDenied("Only a manager e-mails a statement to a customer");

type AuthData = { userID: string; companyID: string; role: string };

/** What the mails need of a customer (customers _internalCustomerReceivableFacts). */
interface CustomerMailFacts {
  companyName: string;
  reminderTo: { name: string; email: string; role: string } | null;
  language: StatementLanguage;
}

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** The customers' names, reminder contacts and languages; throws when the Customer Database can't be read. */
async function customerFactsOf(ids: string[], authData?: AuthData): Promise<Map<string, CustomerMailFacts>> {
  const wanted = [...new Set(ids.filter(isUuid))];
  if (!wanted.length) return new Map();
  const answers = await Promise.all(
    chunks(wanted, PER_CALL).map((batch) =>
      authData ? customers._internalCustomerReceivableFacts({ ids: batch }, { authData }) : customers._internalCustomerReceivableFacts({ ids: batch }),
    ),
  );
  return new Map(
    answers.flatMap((a) =>
      a.customers.map(
        (c) =>
          [
            c.id,
            {
              companyName: c.companyName,
              reminderTo: c.reminderTo?.email?.trim() ? c.reminderTo : null,
              // cs | en from the Customer Database (A2, step 7); anything else, or none yet, reads as English.
              language: languageOf((c as { language?: unknown }).language),
            },
          ] as const,
      ),
    ),
  );
}

/** What a day's run knows besides the invoice: the company's extra holidays and the invoices a bank payment may pay. */
interface RunFacts {
  holidays: readonly string[];
  paymentWaiting: ReadonlySet<string>;
}

/** The automatic reminder an invoice is due today (lib/reminderRules), with its state. */
function decisionOf(f: InvoiceFigures, settings: ReminderSettings, today: string, run: RunFacts): { state: ReceivableState; decision: ReminderDecision } {
  // The same figures and rules as the page (write-offs and bank charges counted once confirmed).
  const state = receivableStateOfFigures(f, today);
  const decision = reminderDue(
    {
      status: state.status,
      leftToPay: state.leftToPay,
      dueDate: f.invoice.dueDate,
      currency: f.invoice.currency,
      fxRate: Number(f.invoice.fxRate) || undefined,
      disputed: f.receivable?.disputed ?? false,
      promisedOn: f.receivable?.promisedOn ?? null,
      reminderLevel: f.receivable?.reminderLevel ?? 0,
      lastRemindedOn: f.receivable?.lastRemindedOn ?? null,
      waiting: f.waiting ?? 0,
      paymentWaiting: run.paymentWaiting.has(f.invoice.id),
    },
    settings,
    today,
    run.holidays,
  );
  return { state, decision };
}

/** The national holidays the company uploaded around today (lib/workingDays knows the statutory ones); none when they can't be read. */
async function companyHolidaysOf(companyId: string, today: string): Promise<string[]> {
  try {
    const authData = { userID: AUTO_USER_ID, companyID: companyId, role: "user" };
    const { dates } = await holidays._internalHolidaysCzNational({ from: addDays(today, -HOLIDAY_WINDOW_DAYS), to: addDays(today, HOLIDAY_WINDOW_DAYS) }, { authData });
    return dates;
  } catch (err) {
    log.warn(err, "the company's holidays could not be read for the automatic reminders: weekends and the statutory holidays only", { companyId });
    return [];
  }
}

/** The customer's address lines as the invoice names it: its Billing address, else its seat. */
function customerLines(invoice: InvoiceRecord | null, language: StatementLanguage): string[] {
  const c = invoice?.customer;
  if (!c) return [];
  const t = STATEMENT_TEXTS[language];
  const lines: string[] = [];
  const bill = c.billingAddress;
  if (bill) {
    if (bill.label) lines.push(bill.label);
    if (bill.street) lines.push(bill.street);
    const city = [bill.postalCode, bill.city].filter(Boolean).join(" ");
    if (city) lines.push(city);
    if (bill.country && bill.country !== "CZ") lines.push(bill.country);
  } else {
    if (c.address) lines.push(c.address);
    if (c.city && !c.address.includes(c.city)) lines.push(c.city);
    if (c.country && c.country !== "CZ") lines.push(c.country);
  }
  if (c.ico) lines.push(`${t.ico}: ${c.ico}`);
  if (c.dic) lines.push(`${t.dic}: ${c.dic}`);
  return lines;
}

function mailItem(r: ReceivableMailRecord): ReceivableMailItem {
  return {
    id: r.id,
    kind: r.kind,
    invoiceId: r.invoiceId,
    customerId: r.customerId,
    currency: r.currency,
    reminderLevel: r.reminderLevel,
    recipient: r.recipient,
    language: r.language,
    status: r.status,
    error: r.error,
    automatic: r.automatic,
    by: r.by,
    at: r.createdAt.toISOString(),
  };
}

/** A statement send answered again from its row (the same idempotency key twice). */
const answerOf = (r: ReceivableMailRecord): ReceivableStatementSendResponse =>
  r.status === "sent" ? { status: "sent", message: `The statement was e-mailed to ${r.recipient}` } : { status: "failed", message: r.error || "The e-mail could not be sent" };

interface StatementData {
  statement: Statement;
  language: StatementLanguage;
  recipient: string | null;
  issuer: StatementIssuer;
  bank: MailBank | null;
  customer: { companyName: string; lines: string[] };
}

type Outcome = "sent" | "failed" | "skipped";

class ReceivableMailService {
  canAct = (actor: Pick<Actor, "role">) => canDecideQuoteInquiry(actor.role);

  // ── The statement ──

  /**
   * What a statement of the customer in `currencyText` holds, from Accounts Receivable's own rows
   * (receivableService.rowsOfCustomer). No currency given: the one the customer owes in (asked to choose when it owes
   * in several). `needFacts`: the Customer Database must answer (to send); otherwise a failed read only leaves the
   * language English.
   */
  private async statementData(actor: Actor, customerId: string, currencyText: string | undefined, needFacts: boolean): Promise<StatementData> {
    if (!isUuid(customerId)) throw notThere();
    const { rows, truncated, today } = await receivableService.rowsOfCustomer(actor, customerId);
    const owedIn = statementCurrencies(rows);
    let currency = (currencyText ?? "").trim().toUpperCase();
    if (!currency) {
      if (owedIn.length > 1) throw APIError.invalidArgument(`Choose the currency: the customer owes in ${owedIn.join(", ")}`);
      currency = owedIn[0] ?? rows[0]?.currency ?? "";
      if (!currency) throw APIError.failedPrecondition("Nothing was ever invoiced to this customer: there is no statement");
    }
    if (!/^[A-Z]{3}$/.test(currency)) throw APIError.invalidArgument("The currency is a 3-letter code (EUR, CZK …)");
    // The owed come first and are never cut off by the cap, unless they alone fill it.
    if (truncated && rows.every((r) => isOwed(r))) throw APIError.failedPrecondition("The customer owes on more than 2000 invoices: a statement of them would not be complete");

    let facts: CustomerMailFacts | null = null;
    try {
      facts = (await customerFactsOf([customerId])).get(customerId) ?? null;
    } catch (err) {
      if (needFacts) throw APIError.unavailable("The Customer Database could not be read just now (whom to send it to): try again in a moment");
      log.warn(err, "customer facts could not be read for a statement: written in English");
    }
    const language = facts?.language ?? "en";
    const name = rows[0]?.customer || facts?.companyName || "";
    const statement = statementOf(rows, { customerId, customer: name, currency, today });
    // The newest invoice owed in the currency names the customer's address and, with no profile, the issuer.
    const newest = [...rows]
      .filter((r) => r.currency === currency)
      .sort((a, b) => Number(isOwed(b)) - Number(isOwed(a)) || b.issueDate.localeCompare(a.issueDate))[0];
    const [invoice, profile] = await Promise.all([
      newest ? invoiceRepository.getByIdForCompany(newest.id, actor.companyID) : Promise.resolve(null),
      invoiceProfileRepository.getByCompany(actor.companyID),
    ]);
    const { issuer, bank } = issuerOf(profile, currency, invoice);
    return {
      statement,
      language,
      recipient: facts?.reminderTo?.email?.trim() || null,
      issuer,
      bank,
      customer: { companyName: invoice?.customer?.companyName || name, lines: customerLines(invoice, language) },
    };
  }

  private async statementPdf(data: StatementData): Promise<Buffer> {
    return Buffer.from(
      await renderStatementPdf({ statement: data.statement, language: data.language, issuer: data.issuer, customer: data.customer, bank: data.bank }, await loadPdfFonts()),
    );
  }

  private fileName(data: StatementData, ext: "pdf" | "csv"): string {
    const s = data.statement;
    return `${data.language === "cs" ? "vypis" : "statement"}-${fileNamePart(data.customer.companyName || s.customer)}-${s.currency}-${s.asAt}.${ext}`;
  }

  /** A customer's statement in one currency as a PDF (the default) or a CSV, as at today. Everyone. */
  async statementFile(actor: Actor, customerId: string, input: { currency?: string; format?: string }): Promise<ReceivableStatementFile> {
    const format = (input.format?.trim().toLowerCase() || "pdf") as "pdf" | "csv";
    if (format !== "pdf" && format !== "csv") throw APIError.invalidArgument("The format is pdf or csv");
    const data = await this.statementData(actor, customerId, input.currency, false);
    if (format === "csv") {
      return {
        fileName: this.fileName(data, "csv"),
        contentBase64: Buffer.from(csvText(statementCsv(data.statement, data.language)), "utf8").toString("base64"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    return { fileName: this.fileName(data, "pdf"), contentBase64: (await this.statementPdf(data)).toString("base64"), contentType: "application/pdf" };
  }

  /**
   * A manager e-mails the statement (as a PDF) to the customer's reminder contact. While e-mail from the app is
   * switched off: "off", and nothing is written. The same idempotency key twice sends once and answers the same.
   */
  async sendStatement(actor: Actor, customerId: string, input: { currency: string; idempotencyKey?: string }): Promise<ReceivableStatementSendResponse> {
    if (!this.canAct(actor)) throw managersOnly();
    if (!emailConfigured()) return { status: "off", message: EMAIL_OFF };
    if (!isUuid(customerId)) throw notThere();
    const currency = String(input.currency ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw APIError.invalidArgument("The currency is a 3-letter code (EUR, CZK …)");
    const clientKey = input.idempotencyKey?.trim();
    const key = `statement:${customerId}:${currency}:${clientKey || randomUUID()}`;
    if (clientKey) {
      const earlier = await mails.byKey(actor.companyID, key);
      if (earlier) return answerOf(earlier);
    }
    const data = await this.statementData(actor, customerId, currency, true);
    if (!data.statement.lines.length) throw APIError.failedPrecondition(`Nothing is left to pay in ${currency}: there is no statement to send`);
    if (!data.recipient) throw APIError.failedPrecondition(NO_RECIPIENT);
    const [by, settings, pdf] = await Promise.all([userEmailOf(actor.userID), repo.settingsOf(actor.companyID), this.statementPdf(data)]);
    const s = data.statement;
    const text = statementMailText(data.language, {
      currency,
      asAt: s.asAt,
      invoices: s.lines.length,
      leftToPay: s.totals.leftToPay,
      overdue: s.totals.overdue,
      issuer: data.issuer.companyName,
      bank: data.bank,
    });
    const mail = await mails.claim({
      companyId: actor.companyID,
      kind: "statement",
      invoiceId: null,
      customerId,
      currency,
      reminderLevel: null,
      recipient: data.recipient,
      language: data.language,
      status: "failed",
      error: NEVER_FINISHED,
      automatic: false,
      byUserId: actor.userID,
      by,
      idempotencyKey: key,
    });
    if (!mail) {
      const earlier = await mails.byKey(actor.companyID, key);
      return earlier ? answerOf(earlier) : { status: "failed", message: "This statement is being sent already" };
    }
    const result = await sendMail({
      to: [data.recipient],
      cc: [],
      replyTo: settings.replyTo || undefined,
      subject: text.subject,
      text: text.body,
      attachments: [{ filename: this.fileName(data, "pdf"), content: pdf.toString("base64") }],
      idempotencyKey: key,
    });
    if (!result.sent) {
      await mails.markFailed(actor.companyID, mail.id, result.error || "The e-mail could not be sent");
      return { status: "failed", message: result.error || "The e-mail could not be sent" };
    }
    await mails.markSent(actor.companyID, mail.id, result.providerId);
    return { status: "sent", message: `The statement was e-mailed to ${data.recipient}` };
  }

  // ── The mail log ──

  /** What the app e-mailed (reminders and statements), newest first, of a customer and/or an invoice. Everyone. */
  async mailLog(actor: Actor, input: { customerId?: string; invoiceId?: string }): Promise<ReceivableMailResponse> {
    const emailOn = emailConfigured();
    const customerId = input.customerId?.trim() || undefined;
    const invoiceId = input.invoiceId?.trim() || undefined;
    if ((customerId && !isUuid(customerId)) || (invoiceId && !isUuid(invoiceId))) return { mails: [], emailOn };
    const rows = await mails.list(actor.companyID, { customerId, invoiceId }, MAIL_LIST_LIMIT);
    return { mails: rows.map(mailItem), emailOn };
  }

  // ── Automatic reminders (switched off) ──

  /**
   * The daily run: for each company that switched automatic reminders on, reminder 1 and 2 of its overdue invoices
   * (lib/reminderRules), one mail per invoice and level ever. Returns at once, doing nothing, while e-mail from the
   * app is switched off; a company whose settings say off is left out.
   */
  async runReminders(now: Date = new Date()): Promise<ReceivableReminderRunResult> {
    const result: ReceivableReminderRunResult = { companies: 0, sent: 0, failed: 0, skipped: 0 };
    if (!emailConfigured()) return result;
    const today = businessDay(now);
    // Only on a Czech working day (K8): a weekend or a statutory holiday sends nothing; a company's own holiday below.
    if (!isReminderDay(today)) return result;
    for (const companyId of await mails.companiesWithAutoReminders()) {
      try {
        const settings = await repo.settingsOf(companyId);
        if (!settings.autoReminders) continue;
        const extra = await companyHolidaysOf(companyId, today);
        if (!isReminderDay(today, extra)) continue;
        result.companies += 1;
        const counts = await this.runCompany(companyId, settings, today, extra);
        result.sent += counts.sent;
        result.failed += counts.failed;
        result.skipped += counts.skipped;
      } catch (err) {
        log.error(err, "automatic reminders could not run for a company: tried again tomorrow", { companyId });
      }
    }
    return result;
  }

  private async runCompany(
    companyId: string,
    settings: ReminderSettings & { replyTo: string },
    today: string,
    holidayDays: readonly string[] = [],
  ): Promise<Omit<ReceivableReminderRunResult, "companies">> {
    const counts = { sent: 0, failed: 0, skipped: 0 };
    // Read only (as the bell reads): the overdue invoices, the oldest due first - only those due around or after the
    // day the reminders were switched on (L2): the older ones are never reminded by the app, and read first they would
    // take the whole limit.
    if (!settings.autoRemindersSince) return counts;
    const dueFrom = addDays(settings.autoRemindersSince, -SWITCH_ON_MARGIN_DAYS);
    const figures = await repo.figures(companyId, { overdueOn: today, dueFrom }, RUN_LIMIT);
    if (!figures.length) return counts;
    // A payment read from a bank statement and not confirmed yet may be for one of them (X5): that one waits. When the
    // statements can't be read, none is sent today (the customer may have paid).
    let waitingIds: Set<string>;
    try {
      const waiting = await waitingPaymentsFor(
        companyId,
        figures.map((f) => ({ f, s: receivableStateOfFigures(f, today) })),
        today,
      );
      waitingIds = new Set(waiting.keys());
    } catch (err) {
      log.warn(err, "automatic reminders wait: the bank statements could not be read (a payment may be waiting)", { companyId });
      counts.skipped += figures.length;
      return counts;
    }
    const run: RunFacts = { holidays: holidayDays, paymentWaiting: waitingIds };
    const due: { f: InvoiceFigures; level: 1 | 2 }[] = [];
    for (const f of figures) {
      const { decision } = decisionOf(f, settings, today, run);
      if (!decision.level && decision.why === "payment_waiting") {
        log.info("automatic reminder waits: a payment that may be for it is on a bank statement", { companyId, invoice: f.invoice.number });
        counts.skipped += 1;
        continue;
      }
      if (!decision.level) continue;
      // Not read by Accounts Receivable yet: whether the customer's list said Paid before is not known, so it waits
      // until the page has read it (the old "Paid" carried over first).
      if (!f.receivable?.carriedChecked) {
        log.info("automatic reminder waits: the invoice was not read by Accounts Receivable yet", { companyId, invoice: f.invoice.number });
        counts.skipped += 1;
        continue;
      }
      due.push({ f, level: decision.level });
    }
    if (!due.length) return counts;

    const authData: AuthData = { userID: AUTO_USER_ID, companyID: companyId, role: "user" };
    let facts: Map<string, CustomerMailFacts>;
    try {
      facts = await customerFactsOf(
        due.map((d) => d.f.invoice.customerId),
        authData,
      );
    } catch (err) {
      log.warn(err, "automatic reminders wait: the Customer Database could not be read (whom to send them to)", { companyId });
      counts.skipped += due.length;
      return counts;
    }
    const profile = await invoiceProfileRepository.getByCompany(companyId);
    for (const { f, level } of due) {
      let outcome: Outcome;
      try {
        outcome = await this.remindOne(companyId, f, level, facts.get(f.invoice.customerId) ?? null, settings, today, profile, run);
      } catch (err) {
        log.error(err, "an automatic reminder could not be sent", { companyId, invoice: f.invoice.number, level });
        outcome = "failed";
      }
      counts[outcome] += 1;
    }
    return counts;
  }

  /** One invoice's reminder: checked again, written as an attempt, sent, then recorded (or its failure kept). */
  private async remindOne(
    companyId: string,
    f: InvoiceFigures,
    level: 1 | 2,
    customer: CustomerMailFacts | null,
    settings: ReminderSettings & { replyTo: string },
    today: string,
    profile: InvoiceProfileRecord | null,
    run: RunFacts,
  ): Promise<Outcome> {
    const invoiceId = f.invoice.id;
    const key = reminderKey(invoiceId, level);
    if (await mails.byKey(companyId, key)) return "skipped";
    const to = customer?.reminderTo?.email?.trim() ?? "";
    if (!to) {
      log.info("automatic reminder skipped: the customer has no contact with an e-mail", { companyId, invoice: f.invoice.number, level });
      return "skipped";
    }
    // Read again just before sending: a payment, a promise or a dispute noted since counts.
    const now = await repo.figuresOne(companyId, invoiceId);
    if (!now?.receivable) return "skipped";
    const { state, decision } = decisionOf(now, settings, today, run);
    if (decision.level !== level) return "skipped";

    const inv = now.invoice;
    const attachments: MailAttachment[] = [];
    try {
      const pdf = await invoiceDocumentService.pdf(invoiceId, companyId);
      if (pdf.contentBase64.length <= MAX_ATTACHMENT_BASE64) attachments.push({ filename: pdf.fileName, content: pdf.contentBase64 });
    } catch (err) {
      log.warn(err, "the invoice PDF could not be read for an automatic reminder: sent without it", { companyId, invoice: inv.number });
    }
    const { issuer, bank } = issuerOf(profile, inv.currency, inv);
    const language = customer?.language ?? "en";
    const jobNumber = inv.shipment?.jobNumber ?? "";
    const text = reminderText(level, language, {
      invoiceNumber: inv.number,
      jobNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      daysOverdue: state.daysOverdue,
      leftToPay: state.leftToPay,
      currency: inv.currency,
      paymentReference: variableSymbol(jobNumber),
      issuer: issuer.companyName,
      bank,
      invoiceAttached: attachments.length > 0,
    });
    const mail = await mails.claim({
      companyId,
      kind: "reminder",
      invoiceId,
      customerId: inv.customerId,
      currency: inv.currency,
      reminderLevel: level,
      recipient: to,
      language,
      status: "failed",
      error: NEVER_FINISHED,
      automatic: true,
      byUserId: null,
      by: AUTOMATIC,
      idempotencyKey: key,
    });
    if (!mail) return "skipped";
    const result = await sendMail({ to: [to], cc: [], replyTo: settings.replyTo || undefined, subject: text.subject, text: text.body, attachments, idempotencyKey: key });
    if (!result.sent) {
      // Timed out: it may have gone out, so its key stays (never sent again by the run). Refused: the key is freed
      // for a later run (the row keeps a key of its own, so the log shows the attempt).
      await mails.markFailed(companyId, mail.id, result.error || "The e-mail could not be sent", result.timedOut ? undefined : `${key}:failed:${mail.id}`);
      return "failed";
    }
    await this.recordReminder(companyId, invoiceId, { mailId: mail.id, providerId: result.providerId, level, to, today, status: state.status });
    return "sent";
  }

  /**
   * A reminder that went out is recorded as a person's reminder is: a reminder note and a "reminded" event on the
   * invoice, its level and day on the receivable (never lowered), by "Accounts Receivable (automatic)", in the same
   * transaction as the mail row's sent. If that fails the mail row is still marked sent (it went out): never sent twice.
   */
  private async recordReminder(
    companyId: string,
    invoiceId: string,
    m: { mailId: string; providerId: string; level: 1 | 2; to: string; today: string; status: string },
  ): Promise<void> {
    try {
      const row = await repo.chase(
        companyId,
        invoiceId,
        { reminderLevel: m.level, lastRemindedOn: m.today },
        { action: "reminded", fromStatus: m.status, toStatus: m.status, byUserId: null, by: AUTOMATIC, payload: { level: m.level, recipient: m.to, automatic: true, mailId: m.mailId } },
        async (tx) => {
          await mails.markSent(companyId, m.mailId, m.providerId, tx);
          const note = await repo.addNote(tx, {
            companyId,
            invoiceId,
            kind: "reminder",
            text: `Reminder ${m.level} e-mailed by the app`,
            promisedOn: null,
            reminderLevel: m.level,
            recipient: m.to,
            byUserId: null,
            by: AUTOMATIC,
          });
          return { payload: { noteId: note.id } };
        },
      );
      if (row) return;
      log.error("an automatic reminder went out, but the invoice has no receivable to note it on", { companyId, invoiceId, level: m.level });
    } catch (err) {
      log.error(err, "an automatic reminder went out, but its note could not be written", { companyId, invoiceId, level: m.level });
    }
    await mails.markSent(companyId, m.mailId, m.providerId).catch((err) => log.error(err, "an automatic reminder went out, but its mail row could not be marked sent", { companyId, invoiceId }));
  }
}

export const receivableMailService = new ReceivableMailService();
