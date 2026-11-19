import { releaseStopOf } from "@/lib/paymentWarnings";

// The Gate Log's bulk stamps (GateLogView STAMP_ACTIONS) take no reason. A WH release of a job on prepayment that is
// not paid is stopped by the server (api warehouseConcept services/releasePayment), and its sentence then asks a
// manager for a reason the bulk bar has no field for - so such a row is skipped, and the job is to be opened: its
// own WH release asks a manager for the reason (GateJobView), offers a user "Ask a manager to release", and goes
// through on an approval a manager gave.

/** Why the prepayment stop held a row: not paid, or whether it is paid could not be checked. */
export type SkipWhy = "unpaid" | "unchecked";

/**
 * A bulk stamp that skips the rows the prepayment stop holds: `run` stamps one row (for the bulk runner), and
 * `split` then tells the rows done, failed with their reason, and skipped (with why each was, `whyOf`). Only the WH
 * release is ever skipped: any other refusal, of any stamp, is a failure as before.
 */
export function skippingPaymentStops<T>(kind: string, stamp: (row: T) => Promise<unknown>) {
  const skipped: T[] = [];
  const why = new Map<T, SkipWhy>();
  const run = async (row: T): Promise<void> => {
    try {
      await stamp(row);
    } catch (err) {
      const stop = kind === "impRelease" ? releaseStopOf(err) : null;
      if (stop) {
        skipped.push(row);
        why.set(row, stop.kind);
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
  return { run, split, whyOf: (row: T): SkipWhy => why.get(row) ?? "unpaid" };
}

const WHY_WORDS: Record<SkipWhy, string> = { unpaid: "on prepayment and not paid", unchecked: "whether they are paid could not be checked" };

/**
 * The lines that name the skipped rows, by why they were held and what the one stamping can do (n29):
 * "WCZ1, WCZ2: on prepayment and not paid - open the job to release it with a reason" for a manager, "… - open
 * the job to ask a manager" for a user.
 */
export function skippedText<T>(skipped: readonly T[], label: (row: T) => string, whyOf: (row: T) => SkipWhy = () => "unpaid", manager = true): string {
  const next = manager ? "open the job to release it with a reason" : "open the job to ask a manager";
  return (["unpaid", "unchecked"] as const)
    .map((why) => {
      const rows = skipped.filter((r) => whyOf(r) === why);
      if (rows.length === 0) return "";
      const names = rows.slice(0, 5).map((r) => label(r) || "—");
      if (rows.length > names.length) names.push(`… and ${rows.length - names.length} more`);
      return `${names.join(", ")}: ${WHY_WORDS[why]} - ${next}`;
    })
    .filter(Boolean)
    .join(". ");
}
