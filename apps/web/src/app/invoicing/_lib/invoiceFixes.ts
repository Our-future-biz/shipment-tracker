import type { interfaces } from "@/lib/api";

// What can be wrong with an invoice on its issue day, when a user asks a manager to change it:
// ticked in the invoice's change dialog and shown on Sales → Managers → Billing approvals.

export type InvoiceFix = interfaces.InvoiceFixItem;

/** In the order they are offered and shown. */
export const INVOICE_FIXES: readonly InvoiceFix[] = ["lines", "customer", "duzp", "currency", "text", "other"];

export const INVOICE_FIX_LABELS: Record<InvoiceFix, string> = {
  lines: "Charges / amounts",
  customer: "Customer / address",
  duzp: "Tax date (DUZP)",
  currency: "Currency",
  text: "Line texts / note",
  other: "Something else",
};
