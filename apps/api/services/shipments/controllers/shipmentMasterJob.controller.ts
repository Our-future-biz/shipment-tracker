import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import { masterJobService } from "../services/masterJob.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface LinkMasterJobRequest {
  shipmentId: string;
  mczNumber: string;
}

interface LinkMasterJobResponse {
  shipment: ShipmentItem;
}

// A shipment joining a master job takes over its MBL details.
export const shipmentLinkMasterJob = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/master-job" },
  async (req: LinkMasterJobRequest): Promise<LinkMasterJobResponse> => {
    if (!req.mczNumber) {
      throw APIError.invalidArgument("mczNumber is required");
    }
    const auth = getAuthData()!;
    await masterJobService.attachShipment(req.shipmentId, auth.companyID, req.mczNumber, auth.userID);
    const shipment = await shipmentService.getById(req.shipmentId, auth.companyID);
    return { shipment: shipment as unknown as ShipmentItem };
  },
);

interface UnlinkMasterJobRequest {
  shipmentId: string;
}

interface UnlinkMasterJobResponse {
  shipment: ShipmentItem;
}

export const shipmentUnlinkMasterJob = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId/master-job" },
  async (req: UnlinkMasterJobRequest): Promise<UnlinkMasterJobResponse> => {
    const companyId = getAuthData()!.companyID;
    await masterJobService.detachShipment(req.shipmentId, companyId);
    const shipment = await shipmentService.getById(req.shipmentId, companyId);
    return { shipment: shipment as unknown as ShipmentItem };
  },
);
