import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";

interface EnsureRefsRequest {
  /** Shipments shown in a warehouse section; each gets its WHCZ reference. */
  shipmentIds: string[];
}

interface EnsureRefsResponse {
  refs: { shipmentId: string; reference: string }[];
}

// A shipment gets its warehouse reference the moment it shows up in the warehouse;
// calling this again returns the reference it already has.
export const warehouseEnsureRefs = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-refs" },
  async (req: EnsureRefsRequest): Promise<EnsureRefsResponse> => ({
    refs: await warehouseService.ensureForShipments(getAuthData()!.companyID, req.shipmentIds ?? []),
  }),
);
