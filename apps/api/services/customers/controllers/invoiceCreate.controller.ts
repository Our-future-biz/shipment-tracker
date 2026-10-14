import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoiceService } from "../services/invoice.service";
import type { InvoiceItem, InvoiceStatus } from "../interfaces/interfaces";

interface InvoiceCreateRequest {
  customerId: string;
  invoiceNumber: string & MinLen<1> & MaxLen<100>;
  amount?: number;
  /** yyyy-mm-dd, or "" */
  dueDate?: string;
  status?: InvoiceStatus;
  /** yyyy-mm-dd, or "" */
  issuedAt?: string;
}

interface InvoiceCreateResponse {
  invoice: InvoiceItem;
}

export const invoiceCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:customerId/invoices" },
  async ({ customerId, ...input }: InvoiceCreateRequest): Promise<InvoiceCreateResponse> => {
    return { invoice: await invoiceService.create(getAuthData()!.companyID, customerId, input) };
  },
);
