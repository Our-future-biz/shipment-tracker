import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { LoadingPlanItem, PlanCargoLine, PlanLinkKind } from "../interfaces/interfaces";
import { loadingPlanService } from "../services/loadingPlan.service";

interface LoadingPlanUpdateRequest {
  id: string;
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

interface LoadingPlanUpdateResponse {
  plan: LoadingPlanItem;
}

// Saves a plan again, whole: the request replaces its name, link, cargo and equipment.
export const loadingPlanUpdate = api(
  { expose: true, auth: true, method: "PUT", path: "/loading-plans/:id" },
  async ({ id, ...input }: LoadingPlanUpdateRequest): Promise<LoadingPlanUpdateResponse> => {
    const auth = getAuthData()!;
    return { plan: await loadingPlanService.update(id, auth.companyID, auth.userID, input) };
  },
);
