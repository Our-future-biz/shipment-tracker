import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { loadingPlanService } from "../services/loadingPlan.service";

interface PlansMoveQuoteRequest {
  /** Id of the quote that was revised. */
  fromQuoteId: string & MaxLen<40>;
  /** Id of its revision, which the plans are linked to from now on. */
  toQuoteId: string & MaxLen<40>;
  /** The revision's reference, as the plans show it. */
  toReference: string & MinLen<1> & MaxLen<60>;
}

interface PlansMoveQuoteResponse {
  /** How many plans moved; none when no plan was linked to the quote. */
  moved: number;
}

/**
 * Internal API of the quotes service: a quote was revised, and its revision takes over the quote's
 * loading plans - every live plan of the caller's company linked to the quote is linked to the
 * revision instead. Company and user from the caller's auth.
 */
export const _internalPlansMoveQuote = api(
  { expose: false, auth: true, method: "POST", path: "/internal/loading-planner/move-quote" },
  async (req: PlansMoveQuoteRequest): Promise<PlansMoveQuoteResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { moved: await loadingPlanService.moveQuote(companyID, userID, req.fromQuoteId, { id: req.toQuoteId, reference: req.toReference }) };
  },
);
