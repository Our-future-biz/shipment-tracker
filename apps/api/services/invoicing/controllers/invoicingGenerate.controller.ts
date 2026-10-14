import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { GeneratedInvoiceItem, InvoiceType } from "../interfaces/interfaces";

interface GenerateInvoiceRequest {
  shipmentId: string;
  invoiceType: InvoiceType;
  billingCurrency: string & MinLen<3> & MaxLen<3>;
  /** decimal string, e.g. "1250.50" */
  totalAmount: string & MinLen<1>;
}

interface GenerateInvoiceResponse {
  invoice: GeneratedInvoiceItem;
}

export const invoicingGenerate = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/generate" },
  async (req: GenerateInvoiceRequest): Promise<GenerateInvoiceResponse> => {
    const invoice = await invoicingService.generateInvoice(
      req.shipmentId,
      getAuthData()!.companyID,
      req.invoiceType,
      req.billingCurrency,
      req.totalAmount,
    );
    return { invoice };
  },
);
