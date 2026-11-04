import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
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
    return { cost: await invoicingService.addBuyingCost(shipmentId, getAuthData()!.companyID, input, getAuthData()!.userID) };
  },
);

interface UpdateBuyingRequest {
  shipmentId: string;
  costId: string;
  category?: string;
  description?: string;
  vendor?: string & MaxLen<300>;
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
  /** the day the received invoice was paid, yyyy-mm-dd; "" takes it back */
  paidOn?: string;
  /** a Customer Database company id; "" clears it */
  haulierId?: string;
  /** the Customer Database supplier the vendor names; "" clears it (a vendor typed by hand) */
  supplierCustomerId?: string;
  /** position in the list (undo / re-insert keeps a line where it was) */
  sortOrder?: number;
}

export const invoicingUpdateBuyingCost = api(
  { expose: true, auth: true, method: "PATCH", path: "/invoicing/:shipmentId/buying/:costId" },
  async ({ shipmentId, costId, ...input }: UpdateBuyingRequest): Promise<BuyingResponse> => {
    return { cost: await invoicingService.updateBuyingCost(costId, getAuthData()!.companyID, shipmentId, input, getAuthData()!.userID) };
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

interface RestoreBuyingRequest {
  shipmentId: string;
  costId: string;
  /** position in the list it comes back at (undo keeps a line where it was) */
  sortOrder?: number;
}

// Undo of a delete: the line comes back as it was (when its invoice was received, its payment), not as a new one.
export const invoicingRestoreBuyingCost = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/buying/:costId/restore" },
  async ({ shipmentId, costId, sortOrder }: RestoreBuyingRequest): Promise<BuyingResponse> => {
    return { cost: await invoicingService.restoreBuyingCost(costId, getAuthData()!.companyID, shipmentId, sortOrder) };
  },
);
