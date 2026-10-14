import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { SellingCostInput, SellingCostItem, SellingVatCode } from "../interfaces/interfaces";

interface AddSellingRequest extends SellingCostInput {
  shipmentId: string;
}

interface SellingResponse {
  sellingCost: SellingCostItem;
}

export const invoicingAddSellingCost = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/selling" },
  async ({ shipmentId, ...input }: AddSellingRequest): Promise<SellingResponse> => {
    return { sellingCost: await invoicingService.addSellingCost(shipmentId, getAuthData()!.companyID, input) };
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
  /** position in the list (undo / re-insert keeps a line where it was) */
  sortOrder?: number;
  /** VAT code on the invoice: S21 | Z69 | RC | OUT; "" = default by trade direction */
  vatCode?: SellingVatCode | "";
}

export const invoicingUpdateSellingCost = api(
  { expose: true, auth: true, method: "PATCH", path: "/invoicing/:shipmentId/selling/:sellingId" },
  async ({ shipmentId, sellingId, ...input }: UpdateSellingRequest): Promise<SellingResponse> => {
    return { sellingCost: await invoicingService.updateSellingCost(sellingId, getAuthData()!.companyID, shipmentId, input) };
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
    await invoicingService.deleteSellingCost(req.sellingId, getAuthData()!.companyID, req.shipmentId);
    return { ok: true };
  },
);
