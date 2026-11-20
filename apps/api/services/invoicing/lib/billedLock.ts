import { APIError } from "encore.dev/api";
import type { BuyingCostInput } from "../interfaces/interfaces";
import { invoiceRepository } from "../repositories/invoice.repository";

// A shipment with an issued invoice is billed (owner's decision): what is invoiced stays as it was
// invoiced until the invoice is credited, not the whole shipment.
//  - Selling: a row on an issued invoice is part of a tax document and is refused any change
//    (sellingCostRepository.writeUnlessInvoiced, sellingAmountRequestRepository); every other row -
//    one added after the billing (a late demurrage, storage) or one left off the invoice - is edited
//    and deleted as on any shipment, and goes on the next invoice.
//  - Buying, its estimates above all, stays as it was billed: no row is added, changed or deleted by
//    hand, nor copied from a quote. What goes on regardless is not a change of a cost by hand: a
//    supplier's invoice posted through document reading or a master job (upsertCost, splitCost,
//    postInvoiceLines) - as a new row where the shipment's row of the charge has a real cost
//    already, never over it - a Trucking push, noting that a received invoice was paid, and linking a
//    cost to the supplier who sent it, and a supplier's invoice typed by hand on the line it bills: its
//    number, and its real cost while the line has none (billedBuyingProblem). A master job's split leaves a billed shipment as it is.

export const BILLED = "This shipment is billed: its buying costs can't be changed. Credit the invoice first";

// The supplier links change no amount: a supplier invoice posted after the billing is still linked
// to its supplier, so it counts in what the company owes them (lib/supplierCosts). Its invoice number
// changes no amount either: a supplier's invoice that comes after the billing is booked on the line it
// bills, which then counts in Accounts Payable (Council Outlay 9, D6) - with its real cost (below).
const BUYING_STILL_OPEN = new Set(["sortOrder", "received", "paidOn", "supplierCustomerId", "haulierId", "invoiceNumber"]);

// A supplier's invoice that comes after the billing and is typed by hand brings its amount: the real cost
// (quantity, amount, currency) goes in together with its number, on a line that has one, so the invoice
// reaches Accounts Payable with what is owed (owner's answer to the User Council, Q1). Only on a line that has
// no real cost yet: one that has stays as billed (the owner's rule), as nothing kept tells whether it was in
// before the billing or came after it. A mistyped late amount is put right on Finance → Accounts Payable:
// refusing that supplier invoice takes it off the job (an estimate's line keeps its estimate), and it is booked
// again. The estimate stays as it was billed, and no row is added or deleted by hand.
const REAL_COST = ["realQty", "realAmount", "realCurrency"];
const BUYING_OPEN_WITH_NUMBER = new Set([...BUYING_STILL_OPEN, ...REAL_COST]);

export const BILLED_NUMBER_FIRST =
  "This shipment is billed: a real cost goes in only with the supplier's invoice number. Fill in the invoice number first";
export const BILLED_REAL_COST_IN =
  "This shipment is billed: a real cost already on the line stays as billed. Credit the invoice first";

const only = (input: object, open: Set<string>) => Object.entries(input).every(([key, value]) => value === undefined || open.has(key));

/** Whether a buying row's change leaves its cost alone: its place in the list, that it was received or paid, or its supplier link. */
export const leavesBuyingCostAlone = (input: object) => only(input, BUYING_STILL_OPEN);

/** Whether a change touches a buying row's real cost (quantity, amount or currency). */
const touchesRealCost = (input: object) => Object.entries(input).some(([key, value]) => value !== undefined && REAL_COST.includes(key));

/** Whether a billed shipment's buying row refuses the change whatever invoice number the line has. */
export const billedRefusesOutright = (input: object) =>
  !leavesBuyingCostAlone(input) && (!only(input, BUYING_OPEN_WITH_NUMBER) || !touchesRealCost(input));

/**
 * Why a billed shipment's buying row refuses a change, or null when it goes on: what leaves the cost alone
 * always does; its real cost does on a line that has none yet (no real amount) and carries a supplier's invoice
 * number - the one sent with the change, else the one it has - when nothing else of the row changes with it.
 */
export function billedBuyingProblem(
  input: BuyingCostInput,
  current: { invoiceNumber?: string | null; realAmount?: string | null } | null,
): string | null {
  if (leavesBuyingCostAlone(input)) return null;
  if (billedRefusesOutright(input)) return BILLED;
  if (current?.realAmount != null) return BILLED_REAL_COST_IN;
  const number = input.invoiceNumber !== undefined ? input.invoiceNumber : (current?.invoiceNumber ?? "");
  return number.trim() ? null : BILLED_NUMBER_FIRST;
}

/** Whether the shipment has an issued invoice that was not credited. */
export async function isBilled(shipmentId: string, companyId: string): Promise<boolean> {
  return (await invoiceRepository.countOpenInvoices(shipmentId, companyId)) > 0;
}

/** Refuses a change of a shipment's buying costs once it has an issued invoice that was not credited. */
export async function assertNotBilled(shipmentId: string, companyId: string): Promise<void> {
  if (await isBilled(shipmentId, companyId)) throw APIError.failedPrecondition(BILLED);
}
