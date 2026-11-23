import { api, APIError, type Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { LoadingPlanSummary, PlanLinkKind } from "../interfaces/interfaces";
import { loadingPlanService } from "../services/loadingPlan.service";

const LINK_KINDS: PlanLinkKind[] = ["shipment", "quote"];

interface LoadingPlanListRequest {
  /** "shipment" or "quote"; with linkId: only the plans linked to that job. */
  linkKind?: Query<string>;
  linkId?: Query<string>;
}

interface LoadingPlanListResponse {
  plans: LoadingPlanSummary[];
}

// The company's saved loading plans, last saved first. Open to every user.
export const loadingPlanList = api(
  { expose: true, auth: true, method: "GET", path: "/loading-plans" },
  async (req: LoadingPlanListRequest): Promise<LoadingPlanListResponse> => {
    const kind = LINK_KINDS.find((k) => k === req.linkKind);
    if (req.linkKind && !kind) throw APIError.invalidArgument("The kind of the linked job is shipment or quote");
    if (!kind !== !req.linkId) throw APIError.invalidArgument("Give both the kind and the id of the linked job, or neither");
    const link = kind && req.linkId ? { kind, id: req.linkId } : undefined;
    return { plans: await loadingPlanService.list(getAuthData()!.companyID, link) };
  },
);
