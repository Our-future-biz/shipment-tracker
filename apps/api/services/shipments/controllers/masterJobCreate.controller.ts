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
  /**
   * The shipments the new master job is made for (linked to it right after): it starts with each
   * field they all have filled in alike - Freight Mode, Trade Direction and the fields it writes onto
   * its houses, but never their Master B/L - and its number with the letters of that Load Type. Not
   * read with a Master B/L.
   */
  fromShipmentIds?: string[] & MaxLen<500>;
}

interface MasterJobCreateResponse {
  masterJob: MasterJobItem;
  /** The master job had the Master B/L already: nothing was created. */
  reused: boolean;
}

// Creates a master job under the next free MCZ number - empty, or with what the shipments it is made
// for agree on - or, for a Master B/L, finds its own.
export const masterJobCreate = api(
  { expose: true, auth: true, method: "POST", path: "/master-jobs" },
  async (req: MasterJobCreateRequest): Promise<MasterJobCreateResponse> => {
    const auth = getAuthData()!;
    return masterJobService.createForMasterBol(auth.companyID, req.masterBolNumber ?? "", auth.userID, req.fromShipmentIds ?? []);
  },
);
