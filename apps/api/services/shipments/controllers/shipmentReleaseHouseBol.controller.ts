import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface ReleaseHouseBolRequest {
  shipmentId: string;
}

interface ReleaseHouseBolResponse {
  shipment: ShipmentItem;
}

// Releasing the house BoL is its own action rather than a field edit: the
// record of who released it is written from the authenticated user, so it
// cannot be typed in by hand.
export const shipmentReleaseHouseBol = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/house-bol-release" },
  async (req: ReleaseHouseBolRequest): Promise<ReleaseHouseBolResponse> => {
    const auth = getAuthData()!;
    const shipment = await shipmentService.releaseHouseBol(req.shipmentId, auth.companyID, auth.userID);
    if (!shipment) {
      throw APIError.notFound("Shipment not found");
    }
    return { shipment: shipment as unknown as ShipmentItem };
  },
);
