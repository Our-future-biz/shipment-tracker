import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";

interface MasterJobHousesRequest {
  masterJobId: string;
}

interface MasterJobHouse {
  shipmentId: string;
  jobNumber: string;
  /** W/M: the greater of tons and cbm */
  freightTon: number;
}

interface MasterJobHousesResponse {
  houses: MasterJobHouse[];
}

// The master job's live shipments with their freight tons: what the invoicing service splits the
// master job's costs over. Refuses a master job that is not the company's.
export const masterJobHouses = api(
  { expose: false, auth: true, method: "GET", path: "/internal/shipments/master-jobs/:masterJobId/houses" },
  async ({ masterJobId }: MasterJobHousesRequest): Promise<MasterJobHousesResponse> => ({
    houses: await masterJobService.houses(masterJobId, getAuthData()!.companyID),
  }),
);
