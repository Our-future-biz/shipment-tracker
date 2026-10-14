// Which date a job's exchange rates follow, and whether they are locked (owner decision,
// 14 Oct 2026): imports by ATA, exports by ATD — the tax date. Before that date is known
// the job is valued provisionally by ETA / ETD. A blank trade direction counts as import,
// as Costs Breakdown always did.

export interface JobDates {
  tradeDirection: string;
  estimatedArrival: string | null;
  estimatedDeparture: string | null;
  actualArrival: string | null;
  actualDeparture: string | null;
}

export interface ExistingLock {
  rateDate: string;
}

export type JobRatePlan =
  | { action: "use_lock"; basis: "ata" | "atd" } // locked at the current ATA/ATD (or frozen by an invoice)
  | { action: "lock"; basis: "ata" | "atd"; date: string } // lock now (first time, or ATA/ATD moved)
  | { action: "provisional"; basis: "ata" | "atd" | "eta" | "etd" | "today"; date: string };

export function directionOf(tradeDirection: string): { direction: "import" | "export"; assumed: boolean } {
  const d = tradeDirection.trim().toLowerCase();
  return { direction: d === "export" ? "export" : "import", assumed: d !== "export" && d !== "import" };
}

/**
 * `fixingFinal(date)` says whether ČNB's fixing for that date is published and final —
 * an ATA of today before the 15:00 pull is not, so the job stays provisional until it is.
 */
export function planJobRates(
  job: JobDates,
  today: string,
  lock: ExistingLock | null,
  invoiced: boolean,
  fixingFinal: (date: string) => boolean,
): JobRatePlan {
  const { direction } = directionOf(job.tradeDirection);
  const actualBasis = direction === "export" ? "atd" : "ata";
  const actual = (direction === "export" ? job.actualDeparture : job.actualArrival) || null;
  const estimate = (direction === "export" ? job.estimatedDeparture : job.estimatedArrival) || null;

  // Once invoiced, the tax date is final: the lock stands whatever the dates say now.
  if (lock && invoiced) return { action: "use_lock", basis: actualBasis };

  if (actual && actual <= today) {
    if (lock && lock.rateDate === actual) return { action: "use_lock", basis: actualBasis };
    if (fixingFinal(actual)) return { action: "lock", basis: actualBasis, date: actual };
    return { action: "provisional", basis: actualBasis, date: actual };
  }
  if (estimate) return { action: "provisional", basis: direction === "export" ? "etd" : "eta", date: estimate };
  return { action: "provisional", basis: "today", date: today };
}
