import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface LinkMasterJobRequest {
  shipmentId: string;
  mczNumber: string;
}

interface LinkMasterJobResponse {
  shipment: ShipmentItem;
}

export const shipmentLinkMasterJob = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/master-job" },
  async (req: LinkMasterJobRequest): Promise<LinkMasterJobResponse> => {
    if (!req.mczNumber) {
      throw APIError.invalidArgument("mczNumber is required");
    }
    const shipment = await shipmentService.linkMasterJob(req.shipmentId, getAuthData()!.companyID, req.mczNumber);
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
    const shipment = await shipmentService.unlinkMasterJob(req.shipmentId, getAuthData()!.companyID);
    return { shipment: shipment as unknown as ShipmentItem };
  },
);
