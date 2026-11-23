import { APIError } from "encore.dev/api";
import { quotes, shipments } from "~encore/clients";
import { userEmailOf } from "../../../lib/companyUsers";
import { iso } from "../../../lib/db/serialize";
import type { LoadingPlanItem, LoadingPlanSummary, PlanInput, PlanLinkKind } from "../interfaces/interfaces";
import { cleanPlan, linkNeedsCheck, summaryOf, type CleanPlan } from "../lib/planInput";
import { loadingPlanRepository } from "../repositories/loadingPlan.repository";
import type { LoadingPlanRecord } from "../schemas/loadingPlan.schema";

const toItem = (r: LoadingPlanRecord): LoadingPlanItem => ({
  id: r.id,
  name: r.name,
  linkKind: r.linkKind,
  linkId: r.linkId,
  linkRef: r.linkRef,
  lines: r.lines,
  nominated: r.nominated,
  createdBy: r.createdBy,
  updatedBy: r.updatedBy,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

const cleaned = (input: PlanInput): CleanPlan => {
  const result = cleanPlan(input);
  if ("problem" in result) throw APIError.invalidArgument(result.problem);
  return result.plan;
};

/**
 * The plan's link as the server vouches for it: the shipment or quote exists in the caller's
 * company, and the reference is what the job is called now, not what the browser sent. A plan
 * without a link passes as it is. The call carries the user's login, so the company is theirs.
 */
async function withCheckedLink(plan: CleanPlan): Promise<CleanPlan> {
  if (!plan.linkKind || !plan.linkId) return plan;
  if (plan.linkKind === "shipment") {
    const { jobNumber } = await shipments._internalShipmentJobRef({ shipmentId: plan.linkId });
    if (jobNumber === null) throw APIError.invalidArgument("The shipment this plan is linked to was not found. Link the plan again, or unlink it.");
    return { ...plan, linkRef: jobNumber };
  }
  const { quoteNumber } = await quotes._internalQuoteLinkRef({ quoteId: plan.linkId, reference: plan.linkRef });
  if (quoteNumber === null) throw APIError.invalidArgument("The quote this plan is linked to was not found. Link the plan again, or unlink it.");
  return { ...plan, linkRef: quoteNumber };
}

// Saved loading plans. Every user of the company may see and change all of its plans.
class LoadingPlanService {
  async list(companyId: string, link?: { kind: PlanLinkKind; id: string }): Promise<LoadingPlanSummary[]> {
    const rows = await loadingPlanRepository.listLatest(companyId, link);
    return rows.map((row) => summaryOf(toItem(row)));
  }

  async get(id: string, companyId: string): Promise<LoadingPlanItem> {
    const row = await loadingPlanRepository.getByIdForCompany(id, companyId);
    if (!row) throw APIError.notFound("Loading plan not found");
    return toItem(row);
  }

  async create(companyId: string, userId: string, input: PlanInput): Promise<LoadingPlanItem> {
    const plan = await withCheckedLink(cleaned(input));
    const author = await userEmailOf(userId);
    return toItem(await loadingPlanRepository.createForCompany(companyId, { ...plan, createdBy: author, updatedBy: author }));
  }

  async update(id: string, companyId: string, userId: string, input: PlanInput): Promise<LoadingPlanItem> {
    const stored = await loadingPlanRepository.getByIdForCompany(id, companyId);
    if (!stored) throw APIError.notFound("Loading plan not found");
    // A new or changed link is checked (linkNeedsCheck); a kept one keeps the reference the server gave it.
    const sent = cleaned(input);
    const plan = linkNeedsCheck(sent, stored) ? await withCheckedLink(sent) : { ...sent, linkRef: sent.linkKind ? stored.linkRef : "" };
    const row = await loadingPlanRepository.updateForCompany(id, companyId, { ...plan, updatedBy: await userEmailOf(userId) });
    if (!row) throw APIError.notFound("Loading plan not found");
    return toItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await loadingPlanRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Loading plan not found");
  }
}

export const loadingPlanService = new LoadingPlanService();
