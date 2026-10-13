import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { GeneratedInvoiceItem } from "../interfaces/interfaces";

interface GenerateInvoiceRequest {
  shipmentId: string;
  /** Ignored - the job number is read from the shipment on the server. Kept for older clients. */
  jobNumber?: string;
  invoiceType: string;
  billingCurrency: string;
  totalAmount: string;
}

interface GenerateInvoiceResponse {
  invoice: GeneratedInvoiceItem;
}

export const invoicingGenerate = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/generate" },
  async (req: GenerateInvoiceRequest): Promise<GenerateInvoiceResponse> => {
    if (!req.invoiceType || !req.billingCurrency || !req.totalAmount) {
      throw APIError.invalidArgument("invoiceType, billingCurrency, and totalAmount are required");
    }
    const invoice = await invoicingService.generateInvoice(req.shipmentId, getAuthData()!.companyID, req.invoiceType, req.billingCurrency, req.totalAmount);
    return { invoice: invoice as unknown as GeneratedInvoiceItem };
  },
);
