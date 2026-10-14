import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoiceDocumentService } from "../services/invoiceDocument.service";

interface OpenInvoiceCountRequest {
  shipmentId: string;
}

interface OpenInvoiceCountResponse {
  count: number;
}

// Internal only: issued, not credited invoices of a job in the caller's company (the caller's
// auth is passed along on service calls). Once there is one, the job's tax date (ATA / ATD)
// is final — its exchange-rate lock (fx) and its ATA / ATD (shipments) can no longer move
// until the invoice is credited.
export const openInvoiceCount = api(
  { expose: false, auth: true, method: "GET", path: "/internal/open-invoice-count/:shipmentId" },
  async (req: OpenInvoiceCountRequest): Promise<OpenInvoiceCountResponse> => ({
    count: await invoiceDocumentService.openInvoiceCount(req.shipmentId, getAuthData()!.companyID),
  }),
);
