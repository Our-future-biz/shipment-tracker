import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { LoadingPlanItem, PlanCargoLine, PlanLinkKind, PlanResult } from "../interfaces/interfaces";
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
  /** What the plan came to, as the browser worked it out: for the lists. Left out by a screen from before it was kept. */
  result?: PlanResult | null;
  /** A free note for the stuffing gang, printed on the plan; left out, the stored one stays. */
  note?: string & MaxLen<2000>;
  /**
   * The plan's `updatedAt` as the server gave it when the plan was opened or last saved. When
   * someone else saved the plan since, the save is refused (aborted) and the plan must be reloaded.
   */
  updatedAt: string & MaxLen<40>;
}

interface LoadingPlanUpdateResponse {
  plan: LoadingPlanItem;
}

// Saves a plan again, whole: the request replaces its name, link, cargo and equipment. Refused
// when the plan was saved by someone else since this editor opened it.
export const loadingPlanUpdate = api(
  { expose: true, auth: true, method: "PUT", path: "/loading-plans/:id" },
  async ({ id, updatedAt, ...input }: LoadingPlanUpdateRequest): Promise<LoadingPlanUpdateResponse> => {
    const auth = getAuthData()!;
    return { plan: await loadingPlanService.update(id, auth.companyID, auth.userID, input, updatedAt) };
  },
);
