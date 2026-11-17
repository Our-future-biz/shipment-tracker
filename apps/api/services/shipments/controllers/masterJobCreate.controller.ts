import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobItem } from "../interfaces/interfaces";

interface MasterJobCreateRequest {
  /**
   * The Master B/L the master job is for (a pre-alert's reading): when a live master job of the
   * company has it already (letters and digits compared, any case), that one is answered instead of
   * a new one (reused: true); otherwise the new one holds it. Without it an empty master job is made.
   */
  masterBolNumber?: string & MaxLen<100>;
}

interface MasterJobCreateResponse {
  masterJob: MasterJobItem;
  /** The master job had the Master B/L already: nothing was created. */
  reused: boolean;
}

// Creates an empty master job under the next free MCZ number - or, for a Master B/L, finds its own.
export const masterJobCreate = api(
  { expose: true, auth: true, method: "POST", path: "/master-jobs" },
  async (req: MasterJobCreateRequest): Promise<MasterJobCreateResponse> => {
    const auth = getAuthData()!;
    return masterJobService.createForMasterBol(auth.companyID, req.masterBolNumber ?? "", auth.userID);
  },
);
