import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { CustomerInvoiceStatusItem } from "../interfaces/interfaces";
import { invoiceService } from "../services/invoice.service";

interface InvoiceStatusesRequest {
  /** Issued documents of Invoicing: the id, the number and the customer billed. */
  items: { invoiceId: string; number: string; customerId: string }[] & MaxLen<2000>;
}

interface InvoiceStatusesResponse {
  items: CustomerInvoiceStatusItem[];
}

// Internal: Finance → Accounts Receivable (the invoicing service) reads how the customer's invoice list has its
// invoices (an old Paid mark is carried over once; none is "Not in the customer's list"). Each entry found is marked
// as posted by Invoicing, with the document's id. Company from the caller's auth.
export const _internalCustomerInvoiceStatuses = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/invoice-statuses" },
  async ({ items }: InvoiceStatusesRequest): Promise<InvoiceStatusesResponse> => {
    return { items: await invoiceService.statusesOfIssued(getAuthData()!.companyID, items) };
  },
);
