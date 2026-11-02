import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobCostService } from "../services/masterJobCost.service";

interface ResplitMasterJobCostsRequest {
  masterJobId: string;
}

interface ResplitMasterJobCostsResponse {
  ok: boolean;
}

/**
 * Internal API of the shipments service: shares a master job's costs out again over its
 * shipments when they, or a linked shipment's weight or volume, change.
 */
export const _internalMasterJobResplit = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/master-jobs/:masterJobId/resplit" },
  async ({ masterJobId }: ResplitMasterJobCostsRequest): Promise<ResplitMasterJobCostsResponse> => {
    await masterJobCostService.resplit(getAuthData()!.companyID, masterJobId);
    return { ok: true };
  },
);
