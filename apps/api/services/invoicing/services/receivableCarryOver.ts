import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers } from "~encore/clients";
import { asCompany } from "../../../lib/internalCall";
import { receivableRepository as repo, type InvoiceScope } from "../repositories/receivable.repository";
import type { InvoiceRecord } from "../schemas/invoice.schema";
import type { NewInvoiceFollowupOutboxRecord } from "../schemas/invoiceFollowupOutbox.schema";

// Carrying the customer's list's old "Paid" over (D15), shared by Accounts Receivable's reads and writes
// (services/receivable) and by the receivable_state follow-up (services/invoiceFollowups), which must not tell the
// customer's list that an invoice is owed before its old Paid was carried over. The writes are the repository's
// carryOver (each under the invoice's credit lock, then the company's lock).

/** How many invoices one request asks the customer's list about: one call, at most. */
export const CARRY_OVER_CHUNK = 500;

export const NOT_CHECKED = "Whether the Customer Database marked this invoice paid before could not be read just now: try again in a moment";

/**
 * One chunk: the invoices in scope not checked yet (at most 500, the oldest first). Credited or cancelled ones are only
 * checked (their own status says it all); the issued ones are asked about in one call to the customer's list, and those
 * it says are Paid carried over once, with the follow-ups `stateRows` gives. False when the customer's list could not be
 * asked: those invoices stay unchecked (they read as unpaid meanwhile) and are asked again next time.
 */
export async function carryOverChunk(
  companyId: string,
  scope: InvoiceScope,
  stateRows: (invoice: InvoiceRecord) => NewInvoiceFollowupOutboxRecord[],
): Promise<boolean> {
  return carryOverPending(companyId, await repo.notCarriedChecked(companyId, scope, CARRY_OVER_CHUNK), stateRows);
}

type Pending = Awaited<ReturnType<typeof repo.notCarriedChecked>>;

/**
 * Every invoice in scope checked, a chunk at a time (at most `maxChunks` chunks): true when none is left unchecked.
 * False when the customer's list could not be asked, or a chunk made no progress (it did not answer for those
 * invoices), or more are left after `maxChunks`: the caller then says which are not checked, never reads them as owed
 * without saying so.
 */
export async function carryOverAll(
  companyId: string,
  scope: InvoiceScope,
  stateRows: (invoice: InvoiceRecord) => NewInvoiceFollowupOutboxRecord[],
  maxChunks: number,
): Promise<boolean> {
  let before = "";
  for (let k = 0; k < maxChunks; k++) {
    const pending = await repo.notCarriedChecked(companyId, scope, CARRY_OVER_CHUNK);
    if (!pending.length) return true;
    const ids = pending.map((p) => p.invoiceId).join(",");
    if (ids === before) return false;
    before = ids;
    if (!(await carryOverPending(companyId, pending, stateRows))) return false;
  }
  return (await repo.notCarriedChecked(companyId, scope, 1)).length === 0;
}

async function carryOverPending(companyId: string, pending: Pending, stateRows: (invoice: InvoiceRecord) => NewInvoiceFollowupOutboxRecord[]): Promise<boolean> {
  if (!pending.length) return true;
  await repo.markCarriedChecked(companyId, pending.filter((x) => x.status !== "issued").map((x) => x.invoiceId));
  const ask = pending.filter((x) => x.status === "issued");
  if (!ask.length) return true;
  let answer: { items: { invoiceId: string; status: string | null }[] };
  try {
    // For the company named, also with nobody signed in: the receivable_state follow-up runs this from the cron.
    answer = await customers._internalCustomerInvoiceStatuses(
      { items: ask.map((x) => ({ invoiceId: x.invoiceId, number: x.number, customerId: x.customerId })) },
      asCompany(companyId),
    );
  } catch (err) {
    log.warn(err, "the customer's list could not be asked which invoices it says are paid: asked again next time", { invoices: ask.length });
    return false;
  }
  const asked = new Set(ask.map((x) => x.invoiceId));
  const answered = answer.items.filter((i) => asked.has(i.invoiceId));
  if (answered.length) {
    await repo.carryOver(
      companyId,
      answered.map((i) => ({ invoiceId: i.invoiceId, paid: i.status === "Paid" })),
      stateRows,
    );
  }
  return true;
}

/**
 * Before the customer's list is told what is left to pay on an invoice: its old Paid carried over first, if it was not
 * yet (the same rules and locks as the list's carry-over). Throws a retryable error (unavailable, not a permanent one)
 * when the customer's list can't be asked or the invoice is still not checked, so the follow-up is sent again later
 * instead of overwriting the old Paid. No follow-up is written: the caller sends the state right after.
 */
export async function carryOverBeforeTelling(companyId: string, invoiceId: string): Promise<void> {
  await repo.ensureRows(companyId, { invoiceIds: [invoiceId] });
  if (!(await carryOverChunk(companyId, { invoiceIds: [invoiceId] }, () => []))) throw APIError.unavailable(NOT_CHECKED);
}
