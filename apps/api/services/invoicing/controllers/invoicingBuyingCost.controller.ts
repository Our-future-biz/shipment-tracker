import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { InvoiceCostItem } from "../interfaces/interfaces";

/**
 * Buying costs jako volne pridavatelne radky (mockup: "Add buying cost").
 * Puvodni invoicingUpsertCost klicovany kategorii zustava zachovan.
 */
interface AddBuyingRequest {
  shipmentId: string;
  category?: string;
  vendor?: string;
  estQty?: string;
  estAmount?: string;
  estCurrency?: string;
  realQty?: string;
  realAmount?: string;
  realCurrency?: string;
  invoiceNumber?: string;
  received?: boolean;
  sortOrder?: number;
}

interface AddBuyingResponse {
  cost: InvoiceCostItem;
}

export const invoicingAddBuyingCost = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/buying" },
  async (req: AddBuyingRequest): Promise<AddBuyingResponse> => {
    const { shipmentId, ...data } = req;
    const row = await invoicingService.addBuyingCost(shipmentId, getAuthData()!.companyID, data);
    return { cost: row as unknown as InvoiceCostItem };
  },
);

interface UpdateBuyingRequest {
  shipmentId: string;
  costId: string;
  category?: string;
  vendor?: string;
  estQty?: string;
  estAmount?: string;
  estCurrency?: string;
  realQty?: string;
  realAmount?: string;
  realCurrency?: string;
  invoiceNumber?: string;
  received?: boolean;
}

interface UpdateBuyingResponse {
  cost: InvoiceCostItem;
}

export const invoicingUpdateBuyingCost = api(
  { expose: true, auth: true, method: "PATCH", path: "/invoicing/:shipmentId/buying/:costId" },
  async (req: UpdateBuyingRequest): Promise<UpdateBuyingResponse> => {
    const { shipmentId, costId, ...data } = req;
    void shipmentId;
    const row = await invoicingService.updateBuyingCost(costId, getAuthData()!.companyID, data);
    if (!row) throw APIError.notFound("Buying cost not found");
    return { cost: row as unknown as InvoiceCostItem };
  },
);

interface DeleteBuyingRequest {
  shipmentId: string;
  costId: string;
}

interface DeleteBuyingResponse {
  ok: boolean;
}

export const invoicingDeleteBuyingCost = api(
  { expose: true, auth: true, method: "DELETE", path: "/invoicing/:shipmentId/buying/:costId" },
  async (req: DeleteBuyingRequest): Promise<DeleteBuyingResponse> => {
    await invoicingService.deleteBuyingCost(req.costId, getAuthData()!.companyID);
    return { ok: true };
  },
);
