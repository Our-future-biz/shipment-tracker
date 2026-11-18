import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoiceService } from "../services/invoice.service";
import type { InvoiceItem, InvoiceStatus } from "../interfaces/interfaces";

interface InvoiceCreateRequest {
  customerId: string;
  invoiceNumber: string & MinLen<1> & MaxLen<100>;
  amount?: number;
  /** Currency the customer pays in; defaults to the customer's own currency */
  currency?: string & MinLen<3> & MaxLen<3>;
  /** yyyy-mm-dd, or "" */
  dueDate?: string;
  status?: InvoiceStatus;
  /** yyyy-mm-dd, or "" */
  issuedAt?: string;
}

interface InvoiceCreateResponse {
  invoice: InvoiceItem;
}

// An invoice typed into the customer's list: managers only (Council Outlay 10 D9) - invoices are issued in Invoicing.
export const invoiceCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:customerId/invoices" },
  async ({ customerId, ...input }: InvoiceCreateRequest): Promise<InvoiceCreateResponse> => {
    return { invoice: await invoiceService.create(getAuthData()!, customerId, input) };
  },
);
