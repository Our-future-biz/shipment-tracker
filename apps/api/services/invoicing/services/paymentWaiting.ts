import { addDays, businessDay } from "../../../lib/businessDate";
import { entryAllocationState, waitingPaymentsOf, WAITING_ENTRY_DAYS, type OpenBankEntry, type WaitingInvoice, type WaitingPayment } from "../lib/bankMatch";
import { isOwed, isPrepayment, type ReceivableState } from "../lib/receivables";
import { bankStatementRepository } from "../repositories/bankStatement.repository";
import type { InvoiceFigures } from "../repositories/receivable.repository";
import type { BankStatementEntryRecord } from "../schemas/bankStatement.schema";

// Mock test council X5 (19 Nov 2026): a customer's payment read from a bank statement waits for a manager to confirm
// it, and meanwhile the invoice still reads as owed. Which owed invoices such an entry may pay (lib/bankMatch
// waitingPaymentsOf): the automatic reminders leave them alone, the drawer and the reminder form say so, and the bell
// marks its notice. Only an entry booked on or after the first day a payment of the invoice may be booked on (its issue
// day; any day on prepayment; the replaced invoice's issue day for one issued again after a credit note - Y2), and in
// the last 30 days, holds it. A confirmed entry a payment of which was taken back by mistake is open again for what is
// free on it (n2), and holds as an undecided one does. Throws when the entries can't be read: each caller decides what
// that means for it.

type StoredEntry = BankStatementEntryRecord & { fileName: string };

const openEntryOf = (e: StoredEntry, amount: number): OpenBankEntry => ({
  statementId: e.statementId,
  fileName: e.fileName,
  bookingDate: e.bookingDate,
  // An entry with no booking day is as old as the statement it was read from.
  readOn: e.createdAt ? businessDay(e.createdAt) : null,
  credit: e.credit,
  amount,
  currency: e.currency,
  variableSymbol: e.variableSymbol,
  endToEndId: e.endToEndId,
  message: e.message,
});

/** The confirmed entries opened again by a take-back, each for what is free on it now (none left: it holds nothing). */
async function reopenedEntries(companyId: string, today: string): Promise<OpenBankEntry[]> {
  const confirmed = await bankStatementRepository.reopenedIncoming(companyId, addDays(today, -WAITING_ENTRY_DAYS));
  if (!confirmed.length) return [];
  const { takenBack, reversed } = await bankStatementRepository.takenBackKinds(
    companyId,
    confirmed.flatMap((e) => e.allocations.map((a) => a.paymentId)),
  );
  const out: OpenBankEntry[] = [];
  for (const e of confirmed) {
    const state = entryAllocationState({ status: e.status, amount: Number(e.amount), allocations: e.allocations }, takenBack, reversed);
    if (state.reopened && state.free > 0) out.push(openEntryOf(e, state.free));
  }
  return out;
}

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
      prepayment: isPrepayment(f.invoice.customer?.paymentTerms),
      issuedAgainFrom: f.issuedAgainFrom ?? null,
    }));
  if (!owed.length) return new Map();
  const [open, reopened] = await Promise.all([bankStatementRepository.openIncoming(companyId), reopenedEntries(companyId, today)]);
  const entries = [...open.map((e) => openEntryOf(e, Number(e.amount))), ...reopened];
  if (!entries.length) return new Map();
  return waitingPaymentsOf(entries, owed, today);
}
