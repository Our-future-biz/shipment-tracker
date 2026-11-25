import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { LoadingPlanItem } from "../interfaces/interfaces";
import { loadingPlanService } from "../services/loadingPlan.service";

interface LoadingPlanGetRequest {
  id: string;
}

interface LoadingPlanGetResponse {
  plan: LoadingPlanItem;
}

// One plan, with what its linked shipment, quote or sailing is called now - or that the job is gone - and
// the job's cargo as it is now, for the "cargo differs" mark (asked of the service that owns the job).
export const loadingPlanGet = api(
  { expose: true, auth: true, method: "GET", path: "/loading-plans/:id" },
  async (req: LoadingPlanGetRequest): Promise<LoadingPlanGetResponse> => {
    return { plan: await loadingPlanService.get(req.id, getAuthData()!.companyID) };
  },
);
