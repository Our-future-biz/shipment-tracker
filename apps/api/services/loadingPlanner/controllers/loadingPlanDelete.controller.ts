import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { loadingPlanService } from "../services/loadingPlan.service";

interface LoadingPlanDeleteRequest {
  id: string;
}

interface LoadingPlanDeleteResponse {
  ok: boolean;
}

// Hides the plan (soft delete: the row stays in the database).
export const loadingPlanDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/loading-plans/:id" },
  async (req: LoadingPlanDeleteRequest): Promise<LoadingPlanDeleteResponse> => {
    await loadingPlanService.softDelete(req.id, getAuthData()!.companyID);
    return { ok: true };
  },
);
