/**
 * How issuing and crediting move the shipment's statuses (owner's decision, 2026-10-14):
 *  - Shipment Status "Billing" (set by operations) means the job is ready to bill
 *  - issuing an invoice: Invoicing Status -> Invoiced, Shipment Status Billing -> Billed
 *  - a credit note that leaves the job without an open invoice: Invoicing Status ->
 *    Not Invoiced, Shipment Status Billed -> Billing, so the job is back in the queue
 * Statuses are stored with their direction ("Billing [IMP]"); any other status is left alone.
 */

export const INVOICED = "Invoiced";
export const NOT_INVOICED = "Not Invoiced";

export interface StatusPatch {
  status?: string;
  invoicingStatus?: string;
}

const swap = (status: string, from: string, to: string): string | undefined => {
  const m = new RegExp(`^${from} (\\[(?:IMP|EXP)\\])$`).exec(status.trim());
  return m ? `${to} ${m[1]}` : undefined;
};

/** Is the Shipment Status "Billing" (either direction)? */
export function isBillingStatus(status: string | null | undefined): boolean {
  return swap(status ?? "", "Billing", "Billing") !== undefined;
}

/** The fields to change after an invoice was issued; empty when nothing changes. */
export function statusesAfterIssue(current: { status: string; invoicingStatus: string }): StatusPatch {
  const patch: StatusPatch = {};
  if (current.invoicingStatus !== INVOICED) patch.invoicingStatus = INVOICED;
  const billed = swap(current.status ?? "", "Billing", "Billed");
  if (billed) patch.status = billed;
  return patch;
}

/** The fields to change after a credit note; nothing while another invoice is still open. */
export function statusesAfterCredit(current: { status: string; invoicingStatus: string }, openInvoicesLeft: number): StatusPatch {
  if (openInvoicesLeft > 0) return {};
  const patch: StatusPatch = {};
  if (current.invoicingStatus !== NOT_INVOICED) patch.invoicingStatus = NOT_INVOICED;
  const billing = swap(current.status ?? "", "Billed", "Billing");
  if (billing) patch.status = billing;
  return patch;
}
