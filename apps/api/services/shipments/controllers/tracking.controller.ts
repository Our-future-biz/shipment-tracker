import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { ShipmentTracking } from "../interfaces/interfaces";
import { trackingService } from "../services/tracking.service";

// A shipment's Tracking tab: its milestones, the logged changes of its dates, what needs a look,
// its ticks and its tax date.
export const shipmentTracking = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/tracking" },
  async ({ shipmentId }: { shipmentId: string }): Promise<ShipmentTracking> => {
    return trackingService.get(shipmentId, getAuthData()!.companyID);
  },
);
