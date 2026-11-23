import { APIError } from "encore.dev/api";
import { userEmailOf } from "../../../lib/companyUsers";
import { iso } from "../../../lib/db/serialize";
import type { LoadingPlanItem, LoadingPlanSummary, PlanInput, PlanLinkKind } from "../interfaces/interfaces";
import { cleanPlan, summaryOf, type CleanPlan } from "../lib/planInput";
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
    const plan = cleaned(input);
    const author = await userEmailOf(userId);
    return toItem(await loadingPlanRepository.createForCompany(companyId, { ...plan, createdBy: author, updatedBy: author }));
  }

  async update(id: string, companyId: string, userId: string, input: PlanInput): Promise<LoadingPlanItem> {
    const plan = cleaned(input);
    const row = await loadingPlanRepository.updateForCompany(id, companyId, { ...plan, updatedBy: await userEmailOf(userId) });
    if (!row) throw APIError.notFound("Loading plan not found");
    return toItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await loadingPlanRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Loading plan not found");
  }
}

export const loadingPlanService = new LoadingPlanService();
