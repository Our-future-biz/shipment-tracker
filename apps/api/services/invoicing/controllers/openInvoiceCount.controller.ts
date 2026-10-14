import { api, Query } from "encore.dev/api";
import { invoiceRepository } from "../repositories/invoice.repository";

interface OpenInvoiceCountRequest {
  shipmentId: string;
  companyId: Query<string>;
}

interface OpenInvoiceCountResponse {
  count: number;
}

// Internal only: issued, not credited invoices of a job. Once there is one, the job's tax
// date (ATA / ATD) is final — its exchange-rate lock (fx) and its ATA / ATD (shipments)
// can no longer move until the invoice is credited.
export const openInvoiceCount = api(
  { expose: false, method: "GET", path: "/internal/open-invoice-count/:shipmentId" },
  async (req: OpenInvoiceCountRequest): Promise<OpenInvoiceCountResponse> => ({
    count: await invoiceRepository.countOpenInvoices(req.shipmentId, req.companyId),
  }),
);
