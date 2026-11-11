import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoiceDocumentService } from "../services/invoiceDocument.service";

interface OpenInvoiceShipmentsRequest {
  shipmentIds: string[] & MaxLen<200>;
}

interface OpenInvoiceShipmentsResponse {
  /** Of the shipments asked about, those with an issued, not credited invoice in the caller's company. */
  shipmentIds: string[];
}

// Internal only: openInvoiceCount for several jobs in one call (fx values a customer's shipments
// together). A job with one has a final tax date: its exchange-rate lock can no longer move.
export const _internalOpenInvoiceShipments = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/open-invoice-shipments" },
  async ({ shipmentIds }: OpenInvoiceShipmentsRequest): Promise<OpenInvoiceShipmentsResponse> => ({
    shipmentIds: await invoiceDocumentService.shipmentsWithOpenInvoices(shipmentIds, getAuthData()!.companyID),
  }),
);
