import { releaseStopOf, type ReleaseStop } from "@/lib/paymentWarnings";

// What a move of several ticked shipments came to, per shipment: each one is written on its own, so some can go
// through while others are refused. A release from Stock that the server stops for a prepayment customer (Accounts
// Receivable step 7) is told apart from other refusals: a manager may send those again with a reason.

export interface MoveOutcome {
  /** Every shipment moved. */
  done: boolean;
  moved: string[];
  /** Stopped for prepayment (or because the payment could not be checked): the server's own sentence. */
  stopped: { shipmentId: string; stop: ReleaseStop }[];
  /** Refused for another reason, or not answered. */
  failed: { shipmentId: string; message: string }[];
}

/** The outcome of writing `ids`, from each write's settled result (in the same order). */
export function moveOutcome(ids: readonly string[], results: readonly PromiseSettledResult<unknown>[], messageOf: (err: unknown) => string): MoveOutcome {
  const out: MoveOutcome = { done: false, moved: [], stopped: [], failed: [] };
  ids.forEach((shipmentId, i) => {
    const r = results[i];
    if (r?.status === "fulfilled") {
      out.moved.push(shipmentId);
      return;
    }
    const reason: unknown = r ? r.reason : new Error("not sent");
    const stop = releaseStopOf(reason);
    if (stop) out.stopped.push({ shipmentId, stop });
    else out.failed.push({ shipmentId, message: messageOf(reason) });
  });
  out.done = out.moved.length === ids.length;
  return out;
}

/** Nothing moved: every shipment failed with the same error (e.g. the references could not be given). */
export const noneMoved = (ids: readonly string[], message: string): MoveOutcome => ({
  done: false,
  moved: [],
  stopped: [],
  failed: ids.map((shipmentId) => ({ shipmentId, message })),
});

const shipmentsWord = (n: number) => `${n} shipment${n === 1 ? "" : "s"}`;

/**
 * Why shipments were not moved, one per job: "CZ001: <reason>; CZ002: <reason>". The stopped ones are left out when
 * the dialog shows them itself (`withStops` false). Null when there is nothing to say.
 */
export function notMovedText(o: MoveOutcome, jobOf: (shipmentId: string) => string, withStops = true): string | null {
  const reasons = [
    ...o.failed.map((f) => ({ id: f.shipmentId, message: f.message })),
    ...(withStops ? o.stopped.map((s) => ({ id: s.shipmentId, message: s.stop.message })) : []),
  ];
  if (reasons.length === 0) return null;
  const total = o.moved.length + o.failed.length + o.stopped.length;
  // One shipment: its reason alone. Several: how many of how many, then each one's reason by its job.
  if (total === 1) return reasons[0]!.message;
  const each = reasons.map((r) => `${jobOf(r.id) || "a shipment"}: ${r.message}`).join("; ");
  return `${reasons.length} of ${shipmentsWord(total)} not moved - ${each}`;
}
