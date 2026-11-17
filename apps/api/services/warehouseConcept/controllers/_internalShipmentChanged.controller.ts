import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { ShipmentChanges } from "../../../lib/shipmentPush";
import { shipmentChangesService } from "../services/shipmentChanges.service";

interface ShipmentChangedRequest {
  shipmentId: string;
  /** The shipment's fields a person changed in Shipments, each from what to what. */
  changes: ShipmentChanges;
}

interface ShipmentChangedResponse {
  /** What was not taken, and why (a record's own value, or a vehicle the gate stamped already). */
  kept: string[];
}

// Shipments' push outbox only (expose: false), as the user who changed the shipment: its live gate
// records take the change by their own rules. The caller's company scopes it; a repeat changes nothing.
export const _internalShipmentChanged = api(
  { expose: false, auth: true, method: "POST", path: "/internal/warehouse-concept/shipment-changed" },
  async ({ shipmentId, changes }: ShipmentChangedRequest): Promise<ShipmentChangedResponse> => {
    const { userID, companyID } = getAuthData()!;
    return shipmentChangesService.follow(companyID, userID, shipmentId, changes);
  },
);
