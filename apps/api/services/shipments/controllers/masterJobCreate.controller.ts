import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobItem } from "../interfaces/interfaces";

interface MasterJobCreateResponse {
  masterJob: MasterJobItem;
}

// Creates an empty master job under the next free MCZ number.
export const masterJobCreate = api(
  { expose: true, auth: true, method: "POST", path: "/master-jobs" },
  async (): Promise<MasterJobCreateResponse> => {
    return { masterJob: await masterJobService.create(getAuthData()!.companyID) };
  },
);
