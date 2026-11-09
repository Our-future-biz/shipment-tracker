import { APIError } from "encore.dev/api";
import { invoiceRepository } from "../repositories/invoice.repository";

// A shipment with an issued invoice is billed: its costs stay as they are until the invoice is
// credited. What goes on regardless is not a change of a cost by hand: a supplier's invoice posted
// through document reading or a master job (upsertCost, splitCost, postInvoiceLines) - as a new row
// where the shipment's row of the charge has a real cost already, never over it - a Trucking push,
// noting that a received invoice was paid, linking a cost to the supplier who sent it, and what the
// billing of the remaining rows needs. A master job's split leaves a billed shipment as it is.

export const BILLED = "This shipment is billed: its costs can't be changed. Credit the invoice first";

// The supplier links change no amount: a supplier invoice posted after the billing is still linked
// to its supplier, so it counts in what the company owes them (lib/supplierCosts).
const BUYING_STILL_OPEN = new Set(["sortOrder", "received", "paidOn", "supplierCustomerId", "haulierId"]);
const SELLING_STILL_OPEN = new Set(["sortOrder", "invoice", "vatCode", "customer"]);

const only = (input: object, open: Set<string>) => Object.entries(input).every(([key, value]) => value === undefined || open.has(key));

/** Whether a buying row's change leaves its cost alone: its place in the list, that it was received or paid, or its supplier link. */
export const leavesBuyingCostAlone = (input: object) => only(input, BUYING_STILL_OPEN);

/** Whether a selling row's change leaves its price alone: its place in the list, or how it is billed. */
export const leavesSellingCostAlone = (input: object) => only(input, SELLING_STILL_OPEN);

/** Whether the shipment has an issued invoice that was not credited. */
export async function isBilled(shipmentId: string, companyId: string): Promise<boolean> {
  return (await invoiceRepository.countOpenInvoices(shipmentId, companyId)) > 0;
}

/** Refuses a change of a shipment's costs once it has an issued invoice that was not credited. */
export async function assertNotBilled(shipmentId: string, companyId: string): Promise<void> {
  if (await isBilled(shipmentId, companyId)) throw APIError.failedPrecondition(BILLED);
}
