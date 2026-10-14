import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { CategoryCostInput, InvoiceCostItem } from "../interfaces/interfaces";

interface UpsertCostRequest extends CategoryCostInput {
  shipmentId: string;
  category: string & MinLen<1> & MaxLen<200>;
}

interface UpsertCostResponse {
  cost: InvoiceCostItem;
}

// The older per-category buying cost (one line per category); the Costs Breakdown uses free lines.
export const invoicingUpsertCost = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/costs" },
  async ({ shipmentId, category, ...input }: UpsertCostRequest): Promise<UpsertCostResponse> => {
    return { cost: await invoicingService.upsertCost(shipmentId, getAuthData()!.companyID, category, input) };
  },
);
