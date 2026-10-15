import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { CostSplitLine, CostSplitResultLine } from "../interfaces/interfaces";

interface SplitCostRequest {
  /** the charge code the parts are posted under */
  category: string & MinLen<1> & MaxLen<200>;
  /** the invoice total, a decimal string ("1250.50") */
  total: string & MinLen<1> & MaxLen<20>;
  currency: string & MinLen<1> & MaxLen<10>;
  invoiceNumber: string & MinLen<1> & MaxLen<100>;
  lines: CostSplitLine[];
  /** shipments whose real cost of the code is replaced; the others keep theirs */
  overwriteShipmentIds?: string[];
  /** only answer the split, write nothing */
  dryRun?: boolean;
}

interface SplitCostResponse {
  lines: CostSplitResultLine[];
}

/**
 * Splits one vendor invoice over shipments by weight - a master job's invoice by each
 * shipment's freight tons - so the parts add up to the total to the cent, and posts each part
 * as the real cost of the shipment's line of the charge code. With `dryRun` it only answers the
 * split and the real cost each shipment already has, for the review before posting.
 */
export const invoicingSplitCost = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/cost-split" },
  async (req: SplitCostRequest): Promise<SplitCostResponse> => {
    return { lines: await invoicingService.splitCost(getAuthData()!.companyID, req) };
  },
);
