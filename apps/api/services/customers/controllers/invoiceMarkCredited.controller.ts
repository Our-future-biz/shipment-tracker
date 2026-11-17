import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoiceService } from "../services/invoice.service";

interface InvoiceMarkCreditedRequest {
  /**
   * The credited invoice's number and those of its partial credit notes (a full credit note after many partial ones
   * names them all), or the cancelled invoice's
   */
  invoiceNumbers: (string & MinLen<1> & MaxLen<100>)[] & MaxLen<500>;
  /** Cancelled for an invoice withdrawn on its issue day; Credited when left out */
  status?: "Credited" | "Cancelled";
}

interface InvoiceMarkCreditedResponse {
  updated: number;
}

// Internal only (Invoicing, after issuing a credit note, or cancelling an invoice on its issue day):
// the credited invoice and its credit notes, or the cancelled invoice, stop counting as owed in the
// customer's invoice list. Company from the caller's auth.
export const invoiceMarkCredited = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customer-invoices/credited" },
  async (req: InvoiceMarkCreditedRequest): Promise<InvoiceMarkCreditedResponse> => ({
    updated: await invoiceService.markCredited(getAuthData()!.companyID, req.invoiceNumbers, req.status ?? "Credited"),
  }),
);
