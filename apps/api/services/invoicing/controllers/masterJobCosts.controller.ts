import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobCostService } from "../services/masterJobCost.service";
import type { MasterJobCostInput, MasterJobCostsView } from "../interfaces/interfaces";

// A master job's Costs Breakdown: buying lines shared out over its shipments. Every write answers
// with the whole view, the shares as they now stand in the shipments.

interface GetMasterJobCostsRequest {
  masterJobId: string;
}

export const invoicingMasterJobCosts = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/master-jobs/:masterJobId/costs" },
  async ({ masterJobId }: GetMasterJobCostsRequest): Promise<MasterJobCostsView> => masterJobCostService.view(getAuthData()!.companyID, masterJobId),
);

interface CreateMasterJobCostRequest extends MasterJobCostInput {
  masterJobId: string;
}

export const invoicingMasterJobCostAdd = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/master-jobs/:masterJobId/costs" },
  async ({ masterJobId, ...input }: CreateMasterJobCostRequest): Promise<MasterJobCostsView> =>
    masterJobCostService.add(getAuthData()!.companyID, masterJobId, input),
);

interface UpdateMasterJobCostRequest extends MasterJobCostInput {
  masterJobId: string;
  costId: string;
}

export const invoicingMasterJobCostUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/invoicing/master-jobs/:masterJobId/costs/:costId" },
  async ({ masterJobId, costId, ...input }: UpdateMasterJobCostRequest): Promise<MasterJobCostsView> =>
    masterJobCostService.update(getAuthData()!.companyID, masterJobId, costId, input),
);

interface DeleteMasterJobCostRequest {
  masterJobId: string;
  costId: string;
}

export const invoicingMasterJobCostDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/invoicing/master-jobs/:masterJobId/costs/:costId" },
  async ({ masterJobId, costId }: DeleteMasterJobCostRequest): Promise<MasterJobCostsView> =>
    masterJobCostService.remove(getAuthData()!.companyID, masterJobId, costId),
);
