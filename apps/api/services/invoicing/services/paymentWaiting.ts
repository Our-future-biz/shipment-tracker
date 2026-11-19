import { businessDay } from "../../../lib/businessDate";
import { waitingPaymentsOf, type WaitingInvoice, type WaitingPayment } from "../lib/bankMatch";
import { isOwed, type ReceivableState } from "../lib/receivables";
import { bankStatementRepository } from "../repositories/bankStatement.repository";
import type { InvoiceFigures } from "../repositories/receivable.repository";

// Mock test council X5 (19 Nov 2026): a customer's payment read from a bank statement waits for a manager to confirm
// it, and meanwhile the invoice still reads as owed. Which owed invoices such an entry may pay (lib/bankMatch
// waitingPaymentsOf): the automatic reminders leave them alone, the drawer and the reminder form say so, and the bell
// marks its notice. Only an entry booked on or after the invoice's issue day, and in the last 30 days, holds it. Throws
// when the entries can't be read: each caller decides what that means for it.

/** The owed invoices among these an open bank entry may pay, with the entry. */
export async function waitingPaymentsFor(
  companyId: string,
  items: readonly { f: InvoiceFigures; s: ReceivableState }[],
  today = businessDay(new Date()),
): Promise<Map<string, WaitingPayment>> {
  const owed: WaitingInvoice[] = items
    .filter(({ s }) => isOwed(s))
    .map(({ f, s }) => ({
      invoiceId: f.invoice.id,
      number: f.invoice.number,
      customer: f.invoice.customer?.companyName ?? "",
      jobNumber: f.invoice.shipment?.jobNumber ?? "",
      leftToPay: s.leftToPay,
      currency: f.invoice.currency,
      dueDate: f.invoice.dueDate,
      version: f.receivable?.version ?? 1,
      issueDate: f.invoice.issueDate ?? null,
    }));
  if (!owed.length) return new Map();
  const entries = await bankStatementRepository.openIncoming(companyId);
  if (!entries.length) return new Map();
  return waitingPaymentsOf(
    entries.map((e) => ({
      statementId: e.statementId,
      fileName: e.fileName,
      bookingDate: e.bookingDate,
      // An entry with no booking day is as old as the statement it was read from.
      readOn: e.createdAt ? businessDay(e.createdAt) : null,
      credit: e.credit,
      amount: Number(e.amount),
      currency: e.currency,
      variableSymbol: e.variableSymbol,
      endToEndId: e.endToEndId,
      message: e.message,
    })),
    owed,
    today,
  );
}
