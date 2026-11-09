import { APIError } from "encore.dev/api";
import { invoiceRepository } from "../repositories/invoice.repository";

// A shipment with an issued invoice is billed: its costs stay as they are until the invoice is
// credited. What goes on regardless is not a change of a cost by hand: a supplier's invoice posted
// through document reading or a master job (upsertCost, postInvoiceLines), a Trucking push, noting
// that a received invoice was paid, and what the billing of the remaining rows needs.

const BILLED = "This shipment is billed: its costs can't be changed. Credit the invoice first";

const BUYING_STILL_OPEN = new Set(["sortOrder", "received", "paidOn"]);
const SELLING_STILL_OPEN = new Set(["sortOrder", "invoice", "vatCode", "customer"]);

const only = (input: object, open: Set<string>) => Object.entries(input).every(([key, value]) => value === undefined || open.has(key));

/** Whether a buying row's change leaves its cost alone: its place in the list, or that it was received or paid. */
export const leavesBuyingCostAlone = (input: object) => only(input, BUYING_STILL_OPEN);

/** Whether a selling row's change leaves its price alone: its place in the list, or how it is billed. */
export const leavesSellingCostAlone = (input: object) => only(input, SELLING_STILL_OPEN);

/** Refuses a change of a shipment's costs once it has an issued invoice that was not credited. */
export async function assertNotBilled(shipmentId: string, companyId: string): Promise<void> {
  if ((await invoiceRepository.countOpenInvoices(shipmentId, companyId)) > 0) throw APIError.failedPrecondition(BILLED);
}
