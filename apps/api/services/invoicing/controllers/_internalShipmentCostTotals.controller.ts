import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { jobCostTotalsService } from "../services/jobCostTotals.service";
import type { JobCostInput, ShipmentCostTotals } from "../interfaces/interfaces";

interface ShipmentCostTotalsRequest {
  /** The jobs with the ČNB rates each is valued at (from the fx service). */
  jobs: JobCostInput[] & MaxLen<200>;
  /** The currency the totals are also shown in, e.g. the customer's. */
  currency: string & MinLen<3> & MaxLen<3>;
}

interface ShipmentCostTotalsResponse {
  items: ShipmentCostTotals[];
}

/**
 * Internal API of the customers service: revenue, cost and profit of jobs as Costs Breakdown
 * works them out, for the customer's Shipments tab - one call for all of them.
 */
export const _internalShipmentCostTotals = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/cost-totals" },
  async (req: ShipmentCostTotalsRequest): Promise<ShipmentCostTotalsResponse> => {
    return { items: await jobCostTotalsService.forJobs(getAuthData()!.companyID, req.jobs, req.currency.toUpperCase()) };
  },
);
