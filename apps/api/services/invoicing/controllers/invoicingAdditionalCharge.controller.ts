import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { AdditionalChargeItem } from "../interfaces/interfaces";

interface AddChargeRequest {
  shipmentId: string;
  invoiceNumber?: string;
  vendor?: string;
  description?: string;
  estAmount?: string;
  estCurrency?: string;
  realAmount?: string;
  realCurrency?: string;
  sortOrder?: number;
}

interface AddChargeResponse {
  charge: AdditionalChargeItem;
}

export const invoicingAddCharge = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/additional" },
  async (req: AddChargeRequest): Promise<AddChargeResponse> => {
    const { shipmentId, ...data } = req;
    const charge = await invoicingService.addAdditionalCharge(shipmentId, getAuthData()!.companyID, data);
    return { charge: charge as unknown as AdditionalChargeItem };
  },
);

interface UpdateChargeRequest {
  shipmentId: string;
  chargeId: string;
  invoiceNumber?: string;
  vendor?: string;
  description?: string;
  estAmount?: string;
  estCurrency?: string;
  realAmount?: string;
  realCurrency?: string;
}

interface UpdateChargeResponse {
  charge: AdditionalChargeItem;
}

export const invoicingUpdateCharge = api(
  { expose: true, auth: true, method: "PATCH", path: "/invoicing/:shipmentId/additional/:chargeId" },
  async (req: UpdateChargeRequest): Promise<UpdateChargeResponse> => {
    const { shipmentId, chargeId, ...data } = req;
    void shipmentId;
    const charge = await invoicingService.updateAdditionalCharge(chargeId, getAuthData()!.companyID, data);
    if (!charge) throw APIError.notFound("Charge not found");
    return { charge: charge as unknown as AdditionalChargeItem };
  },
);

interface DeleteChargeRequest {
  shipmentId: string;
  chargeId: string;
}

interface DeleteChargeResponse {
  ok: boolean;
}

export const invoicingDeleteCharge = api(
  { expose: true, auth: true, method: "DELETE", path: "/invoicing/:shipmentId/additional/:chargeId" },
  async (req: DeleteChargeRequest): Promise<DeleteChargeResponse> => {
    await invoicingService.deleteAdditionalCharge(req.chargeId, getAuthData()!.companyID);
    return { ok: true };
  },
);
