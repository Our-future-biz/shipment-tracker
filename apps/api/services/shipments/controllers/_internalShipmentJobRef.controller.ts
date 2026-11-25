import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { CargoDimensionLine } from "../interfaces/interfaces";
import { shipmentJobRefOf } from "../services/shipmentJobRef.service";

interface ShipmentJobRefRequest {
  shipmentId: string;
  /** Also the shipment's cargo: the Loading Planner opening a plan linked to it judges the plan's cargo by it. */
  withCargo?: boolean;
}

interface ShipmentJobRefResponse {
  /** The shipment's Internal Reference as it is now; null when the caller's company has no such live shipment. */
  jobNumber: string | null;
  /** Asked withCargo, for a live shipment: its Dimensions rows (Cargo Details) and the dimensions booked with its quote. */
  cargo?: { cargoDimensions: CargoDimensionLine[]; bookedDimensions: CargoDimensionLine[] };
}

// Internal only (the Loading Planner, before it saves a plan linked to a shipment and when it opens
// one): whether the shipment exists in the caller's company, what it is called now, and if asked its
// cargo. Company from the caller's auth.
export const _internalShipmentJobRef = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/job-ref" },
  async ({ shipmentId, withCargo }: ShipmentJobRefRequest): Promise<ShipmentJobRefResponse> => {
    return shipmentJobRefOf(shipmentId, getAuthData()!.companyID, withCargo === true);
  },
);
