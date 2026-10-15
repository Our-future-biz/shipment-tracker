import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { BuyingCostInput, InvoiceCostItem } from "../interfaces/interfaces";

// Buying costs as free lines of the Costs Breakdown (mockup: "Add buying cost"). The older
// per-category invoicingUpsertCost stays for the shipment wizard.

interface AddBuyingRequest extends BuyingCostInput {
  shipmentId: string;
}

interface BuyingResponse {
  cost: InvoiceCostItem;
}

export const invoicingAddBuyingCost = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/buying" },
  async ({ shipmentId, ...input }: AddBuyingRequest): Promise<BuyingResponse> => {
    return { cost: await invoicingService.addBuyingCost(shipmentId, getAuthData()!.companyID, input) };
  },
);

interface UpdateBuyingRequest {
  shipmentId: string;
  costId: string;
  category?: string;
  description?: string;
  vendor?: string;
  estQty?: string;
  estAmount?: string;
  estCurrency?: string;
  realQty?: string;
  realAmount?: string;
  realCurrency?: string;
  /** what the quantity counts ("km", "pallet") */
  unit?: string;
  invoiceNumber?: string;
  received?: boolean;
  /** a Customer Database company id; "" clears it */
  haulierId?: string;
  /** position in the list (undo / re-insert keeps a line where it was) */
  sortOrder?: number;
}

export const invoicingUpdateBuyingCost = api(
  { expose: true, auth: true, method: "PATCH", path: "/invoicing/:shipmentId/buying/:costId" },
  async ({ shipmentId, costId, ...input }: UpdateBuyingRequest): Promise<BuyingResponse> => {
    return { cost: await invoicingService.updateBuyingCost(costId, getAuthData()!.companyID, shipmentId, input) };
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
    await invoicingService.deleteBuyingCost(req.costId, getAuthData()!.companyID, req.shipmentId);
    return { ok: true };
  },
);
