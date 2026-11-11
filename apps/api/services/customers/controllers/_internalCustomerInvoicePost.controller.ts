import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoiceService } from "../services/invoice.service";
import type { InvoiceItem, InvoiceStatus } from "../interfaces/interfaces";

interface CustomerInvoicePostRequest {
  customerId: string;
  invoiceNumber: string & MinLen<1> & MaxLen<100>;
  amount: number;
  currency: string & MinLen<3> & MaxLen<3>;
  /** yyyy-mm-dd, or "" */
  dueDate: string;
  status: InvoiceStatus;
  /** yyyy-mm-dd, or "" */
  issuedAt: string;
}

interface CustomerInvoicePostResponse {
  invoice: InvoiceItem;
}

// Internal only (Invoicing's outbox, after issuing an invoice or a credit note): the document in the
// customer's invoice list. Safe to send again - the same number updates the entry it made. Company
// from the caller's auth.
export const _internalCustomerInvoicePost = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/:customerId/invoices/issued" },
  async ({ customerId, ...input }: CustomerInvoicePostRequest): Promise<CustomerInvoicePostResponse> => ({
    invoice: await invoiceService.postIssued(getAuthData()!.companyID, customerId, input),
  }),
);
