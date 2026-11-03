import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";

interface ShipmentReferenceFinalRequest {
  shipmentId: string;
}

interface ShipmentReferenceFinalResponse {
  /** The shipment's Internal Reference as it is now, final from here on. */
  jobNumber: string;
}

/**
 * Internal API of the invoicing service, called right before it numbers an invoice of the job
 * (INV2026CZFCL00000023-001): the reference is marked final under the shipment's write turn - its
 * letters no longer follow the Freight Mode and Load Type - and given back for the number.
 */
export const _internalShipmentReferenceFinal = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/reference-final" },
  async ({ shipmentId }: ShipmentReferenceFinalRequest): Promise<ShipmentReferenceFinalResponse> => ({
    jobNumber: await shipmentService.finalizeReference(shipmentId, getAuthData()!.companyID),
  }),
);
