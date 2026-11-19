import { qtyOrOne } from "./invoiceCalc";

/**
 * How issuing and crediting move the shipment's statuses (owner's decisions, 2026-10-14 and 2026-11-17):
 *  - Shipment Status "Billing" (set by operations) means the job is ready to bill
 *  - a job is Invoiced only once all its charges are: every selling line with a value, ticked for
 *    Invoice or not, is on an issued, not credited invoice (chargesInvoiced). Nobody may mark it
 *    Invoiced by hand before that, a manager neither
 *  - issuing the invoice that bills the last charge: Invoicing Status -> Invoiced, Shipment Status
 *    Billing -> Billed. An invoice that leaves a charge to bill changes neither
 *  - a credit note that leaves a charge not invoiced: Invoicing Status -> Not Invoiced, Shipment
 *    Status Billed -> Billing, so the job is back in the queue
 *  - a charge added after invoicing (a valued selling line, or a line given a value: allowed, it
 *    goes on the next invoice) does the same as a credit note: the job no longer has all its
 *    charges invoiced (mock test council X1 / K14). Taking such a line away again (deleted, or its
 *    value set to nothing) is looked at as an issue is: Invoiced again when the rest is
 * Statuses are stored with their direction ("Billing [IMP]"); any other status is left alone.
 */

export const INVOICED = "Invoiced";
export const NOT_INVOICED = "Not Invoiced";

/** A job's selling lines with a value: how many are on an open invoice, of all of them (countInvoicedLines). */
export interface ChargeCount {
  invoiced: number;
  total: number;
}

/** Whether every charge of the job is invoiced: it has at least one, and none is left to bill. */
export const chargesInvoiced = (c: ChargeCount): boolean => c.total > 0 && c.invoiced >= c.total;

export interface StatusPatch {
  status?: string;
  invoicingStatus?: string;
}

const swap = (status: string, from: string, to: string): string | undefined => {
  const m = new RegExp(`^${from} (\\[(?:IMP|EXP|DOM)\\])$`).exec(status.trim());
  return m ? `${to} ${m[1]}` : undefined;
};

/** Is the Shipment Status "Billing" (either direction)? */
export function isBillingStatus(status: string | null | undefined): boolean {
  return swap(status ?? "", "Billing", "Billing") !== undefined;
}

/** The fields to change after an invoice was issued; empty when nothing changes, or a charge is left to bill. */
export function statusesAfterIssue(current: { status: string; invoicingStatus: string }, charges: ChargeCount): StatusPatch {
  if (!chargesInvoiced(charges)) return {};
  const patch: StatusPatch = {};
  if (current.invoicingStatus !== INVOICED) patch.invoicingStatus = INVOICED;
  const billed = swap(current.status ?? "", "Billing", "Billed");
  if (billed) patch.status = billed;
  return patch;
}

/** The fields to change after a credit note; nothing while all charges are still invoiced (on another open invoice). */
export function statusesAfterCredit(current: { status: string; invoicingStatus: string }, charges: ChargeCount): StatusPatch {
  if (chargesInvoiced(charges)) return {};
  const patch: StatusPatch = {};
  if (current.invoicingStatus !== NOT_INVOICED) patch.invoicingStatus = NOT_INVOICED;
  const billing = swap(current.status ?? "", "Billed", "Billing");
  if (billing) patch.status = billing;
  return patch;
}

/** A selling line's value as it counts among the job's charges: qty (blank = 1) times amount; 0 = not a charge. */
type LineValue = { qty: string | number | null; amount: string | number | null };

const valueOf = (line: LineValue | null | undefined): number => (line ? Number(line.amount ?? 0) * qtyOrOne(line.qty) : 0);

/**
 * What a write of one selling line does to the job's charges (countInvoicedLines), as the shipment's
 * statuses follow them:
 *  - "added": the line is a charge after the write and was not one with this value before - a new
 *    valued line, a value given to a line of none, or a valued line's value changed. It is on no
 *    invoice (a line on an issued invoice is refused any change), so the job no longer has all its
 *    charges invoiced: looked at as after a credit note (statusesAfterCredit)
 *  - "removed": the line was a charge and is none any more - deleted, or its value set to nothing:
 *    looked at as after an issue (statusesAfterIssue), as the rest may all be invoiced now
 *  - null: the job's charges are as they were (text, VAT code, the tick, the place in the list)
 * `before` null: the line is new; `after` null: it was deleted.
 */
export function chargeChangeOf(before: LineValue | null, after: LineValue | null): "added" | "removed" | null {
  const was = valueOf(before);
  const now = valueOf(after);
  if (now !== 0 && (was === 0 || Math.round(was * 100) !== Math.round(now * 100))) return "added";
  if (was !== 0 && now === 0) return "removed";
  return null;
}
