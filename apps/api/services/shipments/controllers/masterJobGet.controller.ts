import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobDetail } from "../interfaces/interfaces";

interface MasterJobGetRequest {
  masterJobId: string;
}

export const masterJobGet = api(
  { expose: true, auth: true, method: "GET", path: "/master-jobs/:masterJobId" },
  async (req: MasterJobGetRequest): Promise<MasterJobDetail> => {
    return masterJobService.get(req.masterJobId, getAuthData()!.companyID);
  },
);
