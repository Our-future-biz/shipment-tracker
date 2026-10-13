import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobContainerLine, MasterJobItem, MasterJobShipmentItem } from "../interfaces/interfaces";

interface MasterJobContainersUpdateRequest {
  masterJobId: string;
  containers: MasterJobContainerLine[];
}

interface MasterJobContainersUpdateResponse {
  masterJob: MasterJobItem;
  containers: MasterJobContainerLine[];
  shipments: MasterJobShipmentItem[];
}

// Replaces the master BL's containers and their house assignments, then copies
// each house's assigned containers onto it.
export const masterJobContainersUpdate = api(
  { expose: true, auth: true, method: "PUT", path: "/master-jobs/:masterJobId/containers" },
  async (req: MasterJobContainersUpdateRequest): Promise<MasterJobContainersUpdateResponse> => {
    const auth = getAuthData()!;
    return masterJobService.setContainers(req.masterJobId, auth.companyID, req.containers, auth.userID);
  },
);
