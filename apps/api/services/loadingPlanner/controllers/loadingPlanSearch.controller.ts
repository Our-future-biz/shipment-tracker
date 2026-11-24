import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { mainSearchInput } from "../../../lib/mainSearch";
import type { LoadingPlanSummary } from "../interfaces/interfaces";
import { loadingPlanService } from "../services/loadingPlan.service";

interface SearchLoadingPlansRequest {
  /** What was typed; fewer than 2 characters (trimmed) give no rows. */
  q: string & MaxLen<200>;
  /** Rows to give: 5 when left out, 1 to 50. */
  limit?: number;
}

/**
 * The main search (the top bar) in loading plans: the company's saved plans that have every word
 * typed in their name or in the reference of the job they are linked to, the last saved first, and
 * how many match in all. Open to every user, as the plans are. Fewer than 2 characters give nothing.
 */
export const searchLoadingPlans = api(
  { expose: true, auth: true, method: "GET", path: "/search/loading-plans" },
  async (req: SearchLoadingPlansRequest): Promise<{ items: LoadingPlanSummary[]; total: number }> => {
    const input = mainSearchInput(req.q, req.limit);
    if (!input) return { items: [], total: 0 };
    return loadingPlanService.searchMain(getAuthData()!.companyID, input.q, input.limit);
  },
);
