import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobItem } from "../interfaces/interfaces";

interface MasterJobListResponse {
  data: MasterJobItem[];
}

// Every live master job of the company, newest first, with its shipment count.
export const masterJobList = api(
  { expose: true, auth: true, method: "GET", path: "/master-jobs" },
  async (): Promise<MasterJobListResponse> => {
    return { data: await masterJobService.list(getAuthData()!.companyID) };
  },
);
