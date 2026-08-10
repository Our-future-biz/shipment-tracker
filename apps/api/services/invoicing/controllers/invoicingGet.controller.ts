import { api } from "encore.dev/api";
import { invoicingService } from "../services/invoicing.service";
import type { InvoiceCostItem, AdditionalChargeItem, BillingSettingsItem, BillingOverrideItem, GeneratedInvoiceItem } from "../interfaces/interfaces";

interface InvoicingGetRequest {
  shipmentId: string;
}

interface InvoicingGetResponse {
  costs: InvoiceCostItem[];
  additionalCharges: AdditionalChargeItem[];
  billingSettings: BillingSettingsItem | null;
  billingOverrides: BillingOverrideItem[];
  generatedInvoices: GeneratedInvoiceItem[];
}

export const invoicingGet = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/:shipmentId" },
  async (req: InvoicingGetRequest): Promise<InvoicingGetResponse> => {
    return invoicingService.getInvoicingData(req.shipmentId) as unknown as Promise<InvoicingGetResponse>;
  },
);
