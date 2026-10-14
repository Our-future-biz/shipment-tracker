import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoiceService } from "../services/invoice.service";
import type { InvoiceItem, InvoiceStatus } from "../interfaces/interfaces";

interface InvoiceUpdateRequest {
  id: string;
  invoiceNumber?: string & MinLen<1> & MaxLen<100>;
  amount?: number;
  /** yyyy-mm-dd, or "" to clear */
  dueDate?: string;
  status?: InvoiceStatus;
  /** yyyy-mm-dd, or "" to clear */
  issuedAt?: string;
}

interface InvoiceUpdateResponse {
  invoice: InvoiceItem;
}

export const invoiceUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/customer-invoices/:id" },
  async ({ id, ...input }: InvoiceUpdateRequest): Promise<InvoiceUpdateResponse> => {
    return { invoice: await invoiceService.update(id, getAuthData()!.companyID, input) };
  },
);
