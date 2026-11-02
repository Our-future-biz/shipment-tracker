import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobHouseItem } from "../interfaces/interfaces";

interface MasterJobHousesRequest {
  masterJobId: string;
}

interface MasterJobHousesResponse {
  houses: MasterJobHouseItem[];
}

// The master job's live shipments with their freight tons: what the invoicing service splits the
// master job's costs over. Refuses a master job that is not the company's.
export const _internalMasterJobHouses = api(
  { expose: false, auth: true, method: "GET", path: "/internal/shipments/master-jobs/:masterJobId/houses" },
  async ({ masterJobId }: MasterJobHousesRequest): Promise<MasterJobHousesResponse> => ({
    houses: await masterJobService.houses(masterJobId, getAuthData()!.companyID),
  }),
);
