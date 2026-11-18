// Accounts Receivable step 7 (18 Nov 2026): a customer's statement, what the app e-mailed (reminders and statements)
// and the automatic reminders. E-mail from the app is switched off until the owner sets up the provider
// (lib/email emailConfigured): while off nothing is sent and nothing is recorded as sent.

export type StatementFormat = "pdf" | "csv";

/** A customer's statement in one currency, as a file to save. */
export interface ReceivableStatementFile {
  fileName: string;
  contentBase64: string;
  contentType: string;
}

/** sent: the e-mail went out; failed: the provider refused it or did not answer; off: e-mail from the app is switched off. */
export type StatementSendStatus = "sent" | "failed" | "off";

export interface ReceivableStatementSendResponse {
  status: StatementSendStatus;
  message: string;
}

/** One e-mail the app sent (or tried to send) to a customer: a reminder of an invoice or a statement. */
export interface ReceivableMailItem {
  id: string;
  kind: "reminder" | "statement";
  /** The invoice of a reminder; null for a statement */
  invoiceId: string | null;
  customerId: string;
  /** The statement's currency, or the reminded invoice's */
  currency: string;
  /** A reminder's level (1, 2, 3 the final notice); null for a statement */
  reminderLevel: number | null;
  recipient: string;
  /** cs | en: the language the text was written in */
  language: string;
  status: "sent" | "failed";
  /** Why it was not sent; "" when sent */
  error: string;
  /** Sent by the daily run, not by a person */
  automatic: boolean;
  /** Who sent it (e-mail), or "Accounts Receivable (automatic)" */
  by: string;
  at: string;
}

export interface ReceivableMailResponse {
  mails: ReceivableMailItem[];
  /** E-mail from the app is switched on */
  emailOn: boolean;
}

/** What one automatic reminder run did. */
export interface ReceivableReminderRunResult {
  /** Companies whose reminders were looked at (automatic reminders on) */
  companies: number;
  sent: number;
  failed: number;
  skipped: number;
}
