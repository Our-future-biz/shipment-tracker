import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { InvoiceCostItem } from "../interfaces/interfaces";

interface UpsertCostRequest {
  shipmentId: string;
  category: string;
  estAmount?: string;
  estCurrency?: string;
  realAmount?: string;
  realCurrency?: string;
  invoiceNumber?: string;
  vendor?: string;
}

interface UpsertCostResponse {
  cost: InvoiceCostItem;
}

export const invoicingUpsertCost = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/costs" },
  async (req: UpsertCostRequest): Promise<UpsertCostResponse> => {
    if (!req.category) {
      throw APIError.invalidArgument("category is required");
    }
    const { shipmentId, category, ...data } = req;
    const cost = await invoicingService.upsertCost(shipmentId, getAuthData()!.companyID, category, data as Record<string, string>);
    return { cost: cost as unknown as InvoiceCostItem };
  },
);
