import type { JobRates } from "./interfaces";

// The rates of jobs read WITHOUT fixing them (Shipments → Managers, the Money tab: Council Outlay 11,
// step 4). fxJobRates and its batch fix a job's rates as they are read; a page that only looks at
// hundreds of jobs must not. The answer is what Costs Breakdown would show for each job.

/** A job's dates as Shipments holds them (YYYY-MM-DD, null for none): what chooses its rates. */
export interface JobRatesReadDates {
  tradeDirection: string;
  estimatedArrival: string | null;
  estimatedDeparture: string | null;
  actualArrival: string | null;
  actualDeparture: string | null;
}

export interface JobRatesReadJob {
  shipmentId: string;
  /**
   * The job's dates. Left out (the caller does not know them), only rates already fixed are
   * answered, as they are stored; a job with none fixed is listed in `notFixed`.
   */
  dates?: JobRatesReadDates | null;
  /** Whether the job has an open invoice, which holds its fixed rates where they are; null = the caller could not tell. */
  invoiced: boolean | null;
}

export interface JobRatesReadResponse {
  /**
   * The rates each job would be shown at. "locked": the rates fixed for it, as stored. "provisional":
   * none fixed that hold - the rates of the date its dates call for, which nothing here has fixed.
   */
  jobs: JobRates[];
  /** Jobs with no rates fixed whose dates were not given: what they would be shown at is not known here. */
  notFixed: string[];
  /** Jobs that could not be valued: no id, a date that is no date, a fixing too old to read here, or fixed rates that may move while it is not known whether the job is invoiced. */
  unreadable: string[];
}
