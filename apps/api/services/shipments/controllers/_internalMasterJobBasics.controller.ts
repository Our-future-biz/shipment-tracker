import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobBasics } from "../interfaces/interfaces";

interface MasterJobBasicsRequest {
  ids: string[] & MaxLen<500>;
}

interface MasterJobBasicsResponse {
  /** The live master jobs among the ids (deleted or unknown ones are left out). */
  masterJobs: MasterJobBasics[];
}

/** Internal API of the invoicing service: the number and Person in Charge of master jobs a supplier invoice is booked to. */
export const _internalMasterJobBasics = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/master-jobs/basics" },
  async ({ ids }: MasterJobBasicsRequest): Promise<MasterJobBasicsResponse> => ({
    masterJobs: await masterJobService.basics(getAuthData()!.companyID, ids),
  }),
);
