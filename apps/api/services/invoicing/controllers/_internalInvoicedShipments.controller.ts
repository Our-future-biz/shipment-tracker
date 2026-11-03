import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { isUuid } from "../../../lib/uuid";
import { invoiceRepository } from "../repositories/invoice.repository";

interface InvoicedShipmentsRequest {
  shipmentIds: string[] & MaxLen<500>;
}

interface InvoicedShipmentsResponse {
  /** Of the shipments asked about, those an invoice was ever issued for (credited ones too). */
  shipmentIds: string[];
}

// Internal API of the shipments service: once a job has had an invoice its Internal Reference is
// final, because the invoice numbers carry it (INV2026CZFCL00000023-001).
export const _internalInvoicedShipments = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/invoiced-shipments" },
  async ({ shipmentIds }: InvoicedShipmentsRequest): Promise<InvoicedShipmentsResponse> => ({
    shipmentIds: await invoiceRepository.shipmentIdsWithInvoices(shipmentIds.filter(isUuid), getAuthData()!.companyID),
  }),
);
