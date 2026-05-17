import { api, APIError } from "encore.dev/api";
import { invoicingService } from "../services/invoicing.service";
import type { GeneratedInvoiceItem } from "../interfaces/interfaces";

interface GenerateInvoiceRequest {
  shipmentId: string;
  jobNumber: string;
  invoiceType: string;
  billingCurrency: string;
  totalAmount: string;
}

interface GenerateInvoiceResponse {
  invoice: GeneratedInvoiceItem;
}

export const invoicingGenerate = api(
  { expose: true, auth: false, method: "POST", path: "/invoicing/:shipmentId/generate" },
  async (req: GenerateInvoiceRequest): Promise<GenerateInvoiceResponse> => {
    if (!req.jobNumber || !req.invoiceType || !req.billingCurrency || !req.totalAmount) {
      throw APIError.invalidArgument("jobNumber, invoiceType, billingCurrency, and totalAmount are required");
    }
    const invoice = await invoicingService.generateInvoice(req.shipmentId, req.jobNumber, req.invoiceType, req.billingCurrency, req.totalAmount);
    return { invoice: invoice as unknown as GeneratedInvoiceItem };
  },
);
