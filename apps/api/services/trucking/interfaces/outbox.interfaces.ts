/** A job update Trucking owes and has not delivered: failed for good, or still being retried. */
export interface TruckingUnsentUpdate {
  id: string;
  consignmentId: string;
  /** The consignment's reference (e.g. "FTL2026-0042") */
  consignmentRef: string;
  shipmentId: string;
  jobNumber: string;
  /** What it owes the job, in words (e.g. "Trucking lines in Costs Breakdown") */
  what: string;
  state: "failed" | "pending";
  attempts: number;
  /** Our own wording of the last error ("" when none) */
  lastError: string;
  /** When the update was written (ISO) */
  since: string;
}
