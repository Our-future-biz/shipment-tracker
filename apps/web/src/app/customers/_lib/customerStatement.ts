import { roundCents } from "@/lib/money";

// The customer's statement (Finance → Accounts Receivable, step 7): one per currency the customer owes in, made by the
// server from the invoices issued in Invoicing that are still left to pay. E-mailing it from the app is built but
// switched off until the e-mail provider is set up: while off, nothing is sent and nothing is said to be sent.

/** The currencies the customer owes in, as Accounts Receivable reads its invoices: something left to pay. */
export function statementCurrencies(rows: readonly { currency: string; leftToPay: number; status: string }[]): string[] {
  const owed = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "unpaid" && r.status !== "part_paid") continue;
    owed.set(r.currency, (owed.get(r.currency) ?? 0) + r.leftToPay);
  }
  return [...owed]
    .filter(([, amount]) => roundCents(amount) > 0)
    .map(([currency]) => currency)
    .sort();
}

export const EMAIL_OFF = "E-mail from the app is switched off";

/** What the person is told after "Send by e-mail": only "sent" says it was sent. */
export function statementSendNotice(res: { status: "sent" | "failed" | "off"; message: string }, currency: string): { tone: "success" | "error" | "warning"; text: string } {
  const message = res.message.trim();
  if (res.status === "sent") return { tone: "success", text: message || `The ${currency} statement was sent` };
  if (res.status === "off") return { tone: "warning", text: `${EMAIL_OFF}: the ${currency} statement was not sent. Download it and send it from your mail program.` };
  return { tone: "error", text: `The ${currency} statement could not be sent${message ? `: ${message}` : ""}` };
}

/** The file's name as the server gives it, else a plain one: statement-<currency>.<format>. */
export function statementFileName(given: string, currency: string, format: "pdf" | "csv"): string {
  const name = given.trim();
  return name || `statement-${currency}.${format}`;
}
