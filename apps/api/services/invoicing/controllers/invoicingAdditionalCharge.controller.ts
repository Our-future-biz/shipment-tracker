import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { AdditionalChargeInput, AdditionalChargeItem } from "../interfaces/interfaces";

interface AddChargeRequest extends AdditionalChargeInput {
  shipmentId: string;
}

interface ChargeResponse {
  charge: AdditionalChargeItem;
}

export const invoicingAddCharge = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/additional" },
  async ({ shipmentId, ...input }: AddChargeRequest): Promise<ChargeResponse> => {
    return { charge: await invoicingService.addAdditionalCharge(shipmentId, getAuthData()!.companyID, input) };
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

export const invoicingUpdateCharge = api(
  { expose: true, auth: true, method: "PATCH", path: "/invoicing/:shipmentId/additional/:chargeId" },
  async ({ shipmentId, chargeId, ...input }: UpdateChargeRequest): Promise<ChargeResponse> => {
    return { charge: await invoicingService.updateAdditionalCharge(chargeId, getAuthData()!.companyID, shipmentId, input) };
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
    await invoicingService.deleteAdditionalCharge(req.chargeId, getAuthData()!.companyID, req.shipmentId);
    return { ok: true };
  },
);
