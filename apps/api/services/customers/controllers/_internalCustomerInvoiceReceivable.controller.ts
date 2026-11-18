import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoiceService } from "../services/invoice.service";

interface InvoiceReceivableRequest {
  customerId: string;
  /** The invoice (never a credit note) in Invoicing. */
  invoiceId: string;
  invoiceNumber: string & MinLen<1> & MaxLen<100>;
  /** The invoice less its credit notes and live payments, in its currency; below 0 when there is something to refund. */
  leftToPay: number;
  /** yyyy-mm-dd of the last live payment; null when none (or the day is not known). */
  lastPaidOn: string | null;
  /** Nothing is left to pay. */
  settled: boolean;
  /** The invoice's own status in Invoicing: a credited or cancelled one is never Paid in the list (absent: issued). */
  invoiceStatus?: "issued" | "credited" | "cancelled";
  /** The invoice's partial credit notes: netted into it. */
  creditNoteNumbers: (string & MaxLen<100>)[] & MaxLen<500>;
}

interface InvoiceReceivableResponse {
  /** False when the customer's list has no live entry of the invoice: nothing was written. */
  ok: boolean;
}

// Internal: Finance → Accounts Receivable's word on an invoice (the receivable_state follow-up, after a payment, a
// take-back or a credit note), on its entry in the customer's list. Sent with the state as it is then, so safe to
// send again. Company from the caller's auth.
export const _internalCustomerInvoiceReceivable = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/invoice-receivable" },
  async (req: InvoiceReceivableRequest): Promise<InvoiceReceivableResponse> => {
    return { ok: await invoiceService.applyReceivable(getAuthData()!.companyID, req) };
  },
);
