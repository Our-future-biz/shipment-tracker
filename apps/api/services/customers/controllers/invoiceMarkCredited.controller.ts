import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoiceService } from "../services/invoice.service";

interface InvoiceMarkCreditedRequest {
  /** The credited invoice's number and its credit note's number */
  invoiceNumbers: (string & MinLen<1> & MaxLen<100>)[] & MaxLen<10>;
}

interface InvoiceMarkCreditedResponse {
  updated: number;
}

// Internal only (Invoicing, after issuing a credit note): the credited invoice and its credit
// note stop counting as owed in the customer's invoice list. Company from the caller's auth.
export const invoiceMarkCredited = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customer-invoices/credited" },
  async (req: InvoiceMarkCreditedRequest): Promise<InvoiceMarkCreditedResponse> => ({
    updated: await invoiceService.markCredited(getAuthData()!.companyID, req.invoiceNumbers),
  }),
);
