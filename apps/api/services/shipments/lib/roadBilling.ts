import { CANCELLED_STATUS } from "./fieldDefaults";

// The Billing rule of road jobs (owner decision): when every consignment of a job has its POD,
// Trucking moves the job's Shipment Status to "Billing" - unless it is already Billing or Billed
// (either direction) or the job is cancelled. Statuses carry their direction ("Billing [IMP]"):
// the status's own suffix wins, then the Trade Direction; a domestic road job (neither) is
// billed as [EXP]. Pure.

const DONE = /^(Billing|Billed) \[(IMP|EXP)\]$/;

/** The status to set, or null when the job stays as it is. */
export function billingStatusFor(status: string | null | undefined, tradeDirection: string | null | undefined): string | null {
  const current = (status ?? "").trim();
  if (DONE.test(current) || current === CANCELLED_STATUS) return null;
  const suffix = /\[(IMP|EXP)\]$/.exec(current)?.[1];
  const direction = (tradeDirection ?? "").trim().toLowerCase();
  const tag = suffix ?? (direction === "import" ? "IMP" : "EXP");
  return `Billing [${tag}]`;
}
