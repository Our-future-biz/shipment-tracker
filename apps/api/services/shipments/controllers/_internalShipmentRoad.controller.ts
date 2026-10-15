import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { roadJobService } from "../services/roadJob.service";
import type { RoadJobBasics, RoadJobInput } from "../interfaces/interfaces";

interface RoadJobCreateResponse {
  shipmentId: string;
  jobNumber: string;
}

/** Internal API of the trucking service: a Road / Domestic job for a consignment that has none. */
export const _internalShipmentCreateRoad = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/road" },
  async (req: RoadJobInput): Promise<RoadJobCreateResponse> => {
    return roadJobService.create(getAuthData()!.companyID, req);
  },
);

interface RoadJobBasicsRequest {
  ids: string[];
}

interface RoadJobBasicsResponse {
  /** The live jobs among the ids (deleted or unknown ones are left out). */
  shipments: RoadJobBasics[];
}

/** Internal API of the trucking service: job number, customer and status of its jobs. */
export const _internalShipmentBasics = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/basics" },
  async ({ ids }: RoadJobBasicsRequest): Promise<RoadJobBasicsResponse> => {
    return { shipments: await roadJobService.basics(getAuthData()!.companyID, ids) };
  },
);

interface RoadJobBillingRequest {
  shipmentId: string;
}

interface RoadJobBillingResponse {
  /** The Shipment Status now */
  status: string;
  /** False when the job was already Billing / Billed or is cancelled */
  changed: boolean;
}

/**
 * Internal API of the trucking service: every consignment of the job has its POD - the job's
 * Shipment Status becomes "Billing" (unless it is already Billing or Billed). Audited as the user.
 */
export const _internalShipmentMarkBilling = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/billing" },
  async ({ shipmentId }: RoadJobBillingRequest): Promise<RoadJobBillingResponse> => {
    const auth = getAuthData()!;
    return roadJobService.markBilling(auth.companyID, shipmentId, auth.userID);
  },
);
