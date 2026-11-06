import { api } from "encore.dev/api";
import { warehouseService } from "../services/warehouse.service";

interface PickupPlatesRequest {
  /** The company, as a shipment can also be read without a login (a subscription, a cron). */
  companyId: string;
  shipmentIds: string[];
}

interface PickupPlatesResponse {
  /** Only the shipments that have a plate. */
  plates: { shipmentId: string; licensePlate: string }[];
}

/**
 * Internal API of the shipments service: the License Plates entered in the Pick-up tab, for the
 * License Plate column of the shipment grids - one call for a page of shipments.
 */
export const _internalPickupPlates = api(
  { expose: false, auth: false, method: "POST", path: "/internal/warehouse/pickup-plates" },
  async (req: PickupPlatesRequest): Promise<PickupPlatesResponse> => {
    return { plates: await warehouseService.pickupPlates(req.shipmentIds, req.companyId) };
  },
);
