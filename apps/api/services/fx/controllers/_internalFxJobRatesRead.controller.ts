import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { fxJobRatesReadService } from "../services/fxJobRatesRead.service";
import type { JobRatesReadJob, JobRatesReadResponse } from "../interfaces/jobRatesRead";

interface JobRatesReadRequest {
  jobs: JobRatesReadJob[] & MaxLen<2000>;
  /** The only currencies to answer (EUR, USD); left out, every one ČNB publishes. */
  currencies?: string[] & MaxLen<200>;
}

// Internal API of the invoicing service (Shipments → Managers, the Money tab): the rates many jobs
// would be shown at in Costs Breakdown, READ ONLY. _internalFxJobRatesBatch fixes a job's rates as it
// reads them; this one never does - a job due to be fixed stays so until its Costs tab is opened.
export const _internalFxJobRatesRead = api(
  { expose: false, auth: true, method: "POST", path: "/internal/fx/job-rates-read" },
  async ({ jobs, currencies }: JobRatesReadRequest): Promise<JobRatesReadResponse> => fxJobRatesReadService.forJobs(getAuthData()!.companyID, jobs, currencies ?? []),
);
