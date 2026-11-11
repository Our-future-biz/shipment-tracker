import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { fxJobRatesService } from "../services/fxJobRates.service";
import type { JobRates } from "../interfaces/interfaces";

interface JobRatesBatchRequest {
  shipmentIds: string[] & MaxLen<200>;
}

interface JobRatesBatchResponse {
  /** The rates of each job that could be read, as fxJobRates answers them (and locks them). */
  jobs: JobRates[];
  /** The jobs asked about that could not be read (gone, another company's, a service not answering). */
  unreadable: string[];
}

// Internal API of the customers service: fxJobRates for several jobs in one call (a customer's
// Shipments tab), read together instead of one call - with its own shipment and invoice reads - per job.
export const _internalFxJobRatesBatch = api(
  { expose: false, auth: true, method: "POST", path: "/internal/fx/job-rates" },
  async ({ shipmentIds }: JobRatesBatchRequest): Promise<JobRatesBatchResponse> => fxJobRatesService.forShipments(getAuthData()!.companyID, shipmentIds),
);
