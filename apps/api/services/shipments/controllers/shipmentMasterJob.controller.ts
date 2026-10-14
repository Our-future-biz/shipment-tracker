import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import { masterJobService } from "../services/masterJob.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface LinkMasterJobRequest {
  shipmentId: string;
  mczNumber: string & MinLen<1>;
}

interface LinkMasterJobResponse {
  shipment: ShipmentItem;
}

// A shipment joining a master job takes over its MBL details.
export const shipmentLinkMasterJob = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/master-job" },
  async (req: LinkMasterJobRequest): Promise<LinkMasterJobResponse> => {
    const auth = getAuthData()!;
    await masterJobService.attachShipment(req.shipmentId, auth.companyID, req.mczNumber, auth.userID);
    return { shipment: await shipmentService.get(req.shipmentId, auth.companyID) };
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
    return { shipment: await shipmentService.get(req.shipmentId, companyId) };
  },
);
