import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobContainerLine, MasterJobItem, MasterJobShipmentItem } from "../interfaces/interfaces";

interface MasterJobGetRequest {
  masterJobId: string;
}

interface MasterJobGetResponse {
  masterJob: MasterJobItem;
  containers: MasterJobContainerLine[];
  shipments: MasterJobShipmentItem[];
}

export const masterJobGet = api(
  { expose: true, auth: true, method: "GET", path: "/master-jobs/:masterJobId" },
  async (req: MasterJobGetRequest): Promise<MasterJobGetResponse> => {
    return masterJobService.get(req.masterJobId, getAuthData()!.companyID);
  },
);
