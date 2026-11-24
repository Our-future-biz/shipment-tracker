import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentJobNumberOf } from "../services/shipmentJobRef.service";

interface ShipmentJobRefRequest {
  shipmentId: string;
}

interface ShipmentJobRefResponse {
  /** The shipment's Internal Reference as it is now; null when the caller's company has no such live shipment. */
  jobNumber: string | null;
}

// Internal only (the Loading Planner, before it saves a plan linked to a shipment): whether the
// shipment exists in the caller's company, and what it is called now. Company from the caller's auth.
export const _internalShipmentJobRef = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/job-ref" },
  async ({ shipmentId }: ShipmentJobRefRequest): Promise<ShipmentJobRefResponse> => {
    return { jobNumber: await shipmentJobNumberOf(shipmentId, getAuthData()!.companyID) };
  },
);
