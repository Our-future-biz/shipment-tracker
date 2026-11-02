import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobCostService } from "../services/masterJobCost.service";
import type { MasterJobCostInput, MasterJobCostsView } from "../interfaces/interfaces";

// A master job's Costs Breakdown: buying lines shared out over its shipments. Every write answers
// with the whole view, the shares as they now stand in the shipments.

interface ViewRequest {
  masterJobId: string;
}

export const invoicingMasterJobCosts = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/master-jobs/:masterJobId/costs" },
  async ({ masterJobId }: ViewRequest): Promise<MasterJobCostsView> => masterJobCostService.view(getAuthData()!.companyID, masterJobId),
);

interface AddRequest extends MasterJobCostInput {
  masterJobId: string;
}

export const invoicingMasterJobCostAdd = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/master-jobs/:masterJobId/costs" },
  async ({ masterJobId, ...input }: AddRequest): Promise<MasterJobCostsView> =>
    masterJobCostService.add(getAuthData()!.companyID, masterJobId, input),
);

interface UpdateRequest extends MasterJobCostInput {
  masterJobId: string;
  costId: string;
}

export const invoicingMasterJobCostUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/invoicing/master-jobs/:masterJobId/costs/:costId" },
  async ({ masterJobId, costId, ...input }: UpdateRequest): Promise<MasterJobCostsView> =>
    masterJobCostService.update(getAuthData()!.companyID, masterJobId, costId, input),
);

interface DeleteRequest {
  masterJobId: string;
  costId: string;
}

export const invoicingMasterJobCostDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/invoicing/master-jobs/:masterJobId/costs/:costId" },
  async ({ masterJobId, costId }: DeleteRequest): Promise<MasterJobCostsView> =>
    masterJobCostService.remove(getAuthData()!.companyID, masterJobId, costId),
);

interface ResplitRequest {
  masterJobId: string;
}

interface ResplitResponse {
  ok: boolean;
}

// The shipments service calls this when a master job's shipments, or a linked shipment's weight, change.
export const invoicingMasterJobResplit = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/master-jobs/:masterJobId/resplit" },
  async ({ masterJobId }: ResplitRequest): Promise<ResplitResponse> => {
    await masterJobCostService.resplit(getAuthData()!.companyID, masterJobId);
    return { ok: true };
  },
);
