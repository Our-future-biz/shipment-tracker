import { releaseStopOf } from "@/lib/paymentWarnings";

// The Gate Log's bulk stamps (GateLogView STAMP_ACTIONS) take no reason. A WH release of a job on prepayment that is
// not paid is stopped by the server (api warehouseConcept services/releasePayment), and its sentence then asks a
// manager for a reason the bulk bar has no field for - so such a row is skipped, and the job is to be opened: its
// own WH release asks a manager for the reason (GateJobView), and goes through on an approval a manager gave.

/**
 * A bulk stamp that skips the rows the prepayment stop holds: `run` stamps one row (for the bulk runner), and
 * `split` then tells the rows done, failed with their reason, and skipped. Only the WH release is ever skipped: any
 * other refusal, of any stamp, is a failure as before.
 */
export function skippingPaymentStops<T>(kind: string, stamp: (row: T) => Promise<unknown>) {
  const skipped: T[] = [];
  const run = async (row: T): Promise<void> => {
    try {
      await stamp(row);
    } catch (err) {
      if (kind === "impRelease" && releaseStopOf(err)) {
        skipped.push(row);
        return;
      }
      throw err;
    }
  };
  const split = (result: { done: T[]; failed: { row: T; reason: string }[] }) => ({
    done: result.done.filter((row) => !skipped.includes(row)),
    failed: result.failed,
    skipped: [...skipped],
  });
  return { run, split };
}

/** The line that names the skipped rows: "WCZ1, WCZ2: held for payment - open the job to release it with a reason". */
export function skippedText<T>(skipped: readonly T[], label: (row: T) => string): string {
  const names = skipped.slice(0, 5).map((r) => label(r) || "—");
  if (skipped.length > names.length) names.push(`… and ${skipped.length - names.length} more`);
  return `${names.join(", ")}: held for payment - open the job to release it with a reason`;
}
