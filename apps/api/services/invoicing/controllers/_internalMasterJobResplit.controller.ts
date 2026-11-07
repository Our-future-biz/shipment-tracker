import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobCostService } from "../services/masterJobCost.service";

interface MasterJobShipmentLeftRequest {
  masterJobId: string;
}

interface MasterJobShipmentLeftResponse {
  ok: boolean;
}

/**
 * Internal API of the shipments service: a shipment left this master job or was deleted, so it
 * gives up its shares of the costs. The other shipments keep theirs until the split is processed.
 */
export const _internalMasterJobShipmentLeft = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/master-jobs/:masterJobId/shipment-left" },
  async ({ masterJobId }: MasterJobShipmentLeftRequest): Promise<MasterJobShipmentLeftResponse> => {
    await masterJobCostService.dropSharesOfLeftShipments(getAuthData()!.companyID, masterJobId);
    return { ok: true };
  },
);
