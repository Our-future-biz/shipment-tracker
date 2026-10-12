import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobContainerLine, MasterJobItem, MasterJobShipmentItem } from "../interfaces/interfaces";

interface MasterJobShipmentsResponse {
  masterJob: MasterJobItem;
  containers: MasterJobContainerLine[];
  shipments: MasterJobShipmentItem[];
}

interface MasterJobShipmentsLinkRequest {
  masterJobId: string;
  shipmentIds: string[] & MinLen<1>;
}

// Links shipments to the master job and copies its MBL details onto them.
export const masterJobShipmentsLink = api(
  { expose: true, auth: true, method: "POST", path: "/master-jobs/:masterJobId/shipments" },
  async (req: MasterJobShipmentsLinkRequest): Promise<MasterJobShipmentsResponse> => {
    const auth = getAuthData()!;
    return masterJobService.linkShipments(req.masterJobId, auth.companyID, req.shipmentIds, auth.userID);
  },
);

interface MasterJobShipmentUnlinkRequest {
  masterJobId: string;
  shipmentId: string;
}

// Takes a shipment off the master job; the shipment keeps the values it got.
export const masterJobShipmentUnlink = api(
  { expose: true, auth: true, method: "DELETE", path: "/master-jobs/:masterJobId/shipments/:shipmentId" },
  async (req: MasterJobShipmentUnlinkRequest): Promise<MasterJobShipmentsResponse> => {
    return masterJobService.unlinkShipment(req.masterJobId, getAuthData()!.companyID, req.shipmentId);
  },
);
