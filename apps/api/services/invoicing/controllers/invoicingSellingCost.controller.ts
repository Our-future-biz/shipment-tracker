import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { SellingCostItem } from "../interfaces/interfaces";

interface AddSellingRequest {
  shipmentId: string;
  category?: string;
  customer?: string;
  qty?: string;
  amount?: string;
  currency?: string;
  invoice?: boolean;
  sourceBuyId?: string;
  sortOrder?: number;
}

interface AddSellingResponse {
  sellingCost: SellingCostItem;
}

export const invoicingAddSellingCost = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/selling" },
  async (req: AddSellingRequest): Promise<AddSellingResponse> => {
    const { shipmentId, ...data } = req;
    const row = await invoicingService.addSellingCost(shipmentId, getAuthData()!.companyID, data);
    return { sellingCost: row as unknown as SellingCostItem };
  },
);

interface UpdateSellingRequest {
  shipmentId: string;
  sellingId: string;
  category?: string;
  customer?: string;
  qty?: string;
  amount?: string;
  currency?: string;
  invoice?: boolean;
}

interface UpdateSellingResponse {
  sellingCost: SellingCostItem;
}

export const invoicingUpdateSellingCost = api(
  { expose: true, auth: true, method: "PATCH", path: "/invoicing/:shipmentId/selling/:sellingId" },
  async (req: UpdateSellingRequest): Promise<UpdateSellingResponse> => {
    const { shipmentId, sellingId, ...data } = req;
    const row = await invoicingService.updateSellingCost(sellingId, getAuthData()!.companyID, shipmentId, data);
    if (!row) throw APIError.notFound("Selling cost not found");
    return { sellingCost: row as unknown as SellingCostItem };
  },
);

interface DeleteSellingRequest {
  shipmentId: string;
  sellingId: string;
}

interface DeleteSellingResponse {
  ok: boolean;
}

export const invoicingDeleteSellingCost = api(
  { expose: true, auth: true, method: "DELETE", path: "/invoicing/:shipmentId/selling/:sellingId" },
  async (req: DeleteSellingRequest): Promise<DeleteSellingResponse> => {
    const deleted = await invoicingService.deleteSellingCost(req.sellingId, getAuthData()!.companyID, req.shipmentId);
    if (!deleted) throw APIError.notFound("Selling cost not found");
    return { ok: true };
  },
);
