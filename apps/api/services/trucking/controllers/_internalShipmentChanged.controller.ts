import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { ShipmentChanges } from "../../../lib/shipmentPush";
import { shipmentChangesService } from "../services/shipmentChanges.service";

interface ShipmentChangedRequest {
  shipmentId: string;
  /** The job's fields a person changed in Shipments, each from what to what. */
  changes: ShipmentChanges;
}

interface ShipmentChangedResponse {
  /** What was not taken, and why (a consignment's own value, or one that may not change any more). */
  kept: string[];
}

// Shipments' push outbox only (expose: false), as the user who changed the job: its consignments
// take the change by Trucking's own rules. The caller's company scopes it; a repeat changes nothing.
export const _internalShipmentChanged = api(
  { expose: false, auth: true, method: "POST", path: "/internal/trucking/shipment-changed" },
  async ({ shipmentId, changes }: ShipmentChangedRequest): Promise<ShipmentChangedResponse> => {
    const { userID, companyID, role } = getAuthData()!;
    return shipmentChangesService.follow({ userID, companyID, role }, shipmentId, changes);
  },
);
