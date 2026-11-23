import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { LoadingPlanItem, PlanCargoLine, PlanLinkKind } from "../interfaces/interfaces";
import { loadingPlanService } from "../services/loadingPlan.service";

interface LoadingPlanCreateRequest {
  name: string & MaxLen<200>;
  /** What the plan is linked to; null for a what-if plan. */
  linkKind: PlanLinkKind | null;
  linkId: string | null;
  /** The job number or quote reference, as shown to the user. */
  linkRef: string & MaxLen<200>;
  lines: PlanCargoLine[] & MaxLen<200>;
  /** Ids of the nominated container types; null lets the planner choose. */
  nominated: string[] | null;
}

interface LoadingPlanCreateResponse {
  plan: LoadingPlanItem;
}

// Saves a new plan. Its author is the signed-in user.
export const loadingPlanCreate = api(
  { expose: true, auth: true, method: "POST", path: "/loading-plans" },
  async (req: LoadingPlanCreateRequest): Promise<LoadingPlanCreateResponse> => {
    const auth = getAuthData()!;
    return { plan: await loadingPlanService.create(auth.companyID, auth.userID, req) };
  },
);
