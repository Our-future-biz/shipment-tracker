import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";

interface StartShipmentBillingRequest {
  shipmentId: string;
}

interface StartShipmentBillingResponse {
  ok: boolean;
}

/**
 * Internal API of the shipments service: a shipment got its customer (created with one, or linked
 * to one), so its billing starts in the customer's default currency - unless it has billing
 * settings or an invoice already.
 */
export const _internalShipmentBillingStart = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/shipments/:shipmentId/billing-start" },
  async ({ shipmentId }: StartShipmentBillingRequest): Promise<StartShipmentBillingResponse> => {
    await invoicingService.startBilling(getAuthData()!.companyID, shipmentId);
    return { ok: true };
  },
);
