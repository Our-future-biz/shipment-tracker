import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import { receivableMailService } from "../services/receivableMail.service";
import type {
  ReceivableMailResponse,
  ReceivableReminderRunResult,
  ReceivableStatementFile,
  ReceivableStatementSendResponse,
} from "../interfaces/receivableMail";

// Accounts Receivable step 7: a customer's statement (a file for everyone, an e-mail by a manager), the log of what
// the app e-mailed, and the daily automatic reminders. E-mail from the app is switched off for now (lib/email): the
// send answers "off", the run does nothing (services/receivableMail).

interface StatementFileRequest {
  customerId: string;
  /** The currency of the statement (one per currency); left out: the one the customer owes in */
  currency?: string & MaxLen<10>;
  /** pdf (the default) or csv */
  format?: string & MaxLen<10>;
}

/** The customer's invoices still owed in one currency, as at today, as a PDF or a CSV. */
export const receivableStatementFile = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/customer/:customerId/statement" },
  async ({ customerId, currency, format }: StatementFileRequest): Promise<ReceivableStatementFile> =>
    receivableMailService.statementFile(requireRole(), customerId, { currency, format }),
);

interface StatementSendRequest {
  customerId: string;
  currency: string & MaxLen<10>;
  /** The same key twice (a double click, a retry) sends one e-mail */
  idempotencyKey?: string & MaxLen<200>;
}

/** A manager e-mails the statement to the customer's reminder contact ("off" while e-mail from the app is off). */
export const receivableStatementSend = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/customer/:customerId/statement/send" },
  async ({ customerId, currency, idempotencyKey }: StatementSendRequest): Promise<ReceivableStatementSendResponse> =>
    receivableMailService.sendStatement(requireRole(), customerId, { currency, idempotencyKey }),
);

interface MailLogRequest {
  customerId?: string & MaxLen<64>;
  invoiceId?: string & MaxLen<64>;
}

/** What the app e-mailed (reminders and statements), of a customer and/or an invoice, newest first. */
export const receivableMailLog = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/mail" },
  async ({ customerId, invoiceId }: MailLogRequest): Promise<ReceivableMailResponse> => receivableMailService.mailLog(requireRole(), { customerId, invoiceId }),
);

// Called by the daily cron only (expose: false), without a login: the automatic reminders of every company that
// switched them on, only while e-mail from the app is switched on.
export const _cronReceivableReminders = api(
  { expose: false, auth: false, method: "POST", path: "/internal/invoicing/receivable-reminders/run" },
  async (): Promise<ReceivableReminderRunResult> => receivableMailService.runReminders(),
);
