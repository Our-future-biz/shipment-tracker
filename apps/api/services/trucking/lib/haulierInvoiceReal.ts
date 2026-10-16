import type { PriceSnapshot, TripKind } from "../interfaces/interfaces";
import type { HaulierInvoiceAllocation } from "../schemas/haulierInvoice.schema";
import { legSourceRef, priceLineDescription, tripJobSourceRef, tripSourceRef } from "./truckingLinks";
import { splitLike } from "./haulierInvoiceRules";

// Where the real cost of an approved haulier invoice line goes (Phase 6 B). Road Department jobs
// get it on the Costs Breakdown rows the estimate was pushed to (same sourceRef): an FTL trip /
// partner delivery over its price lines, an LTL trip over its jobs - each split like the
// estimate, largest remainder, exact to the cent. A job owned by another department (internal
// billing) gets no line: its part stays in Trucking's own ledger (the line's allocations). Pure.

/** A real amount for one Costs Breakdown row, in row order (invoicing _internalInvoicingTruckingReal). */
export interface RealLine {
  /** The row's description as the estimate pushed it (Invoicing matches it first, else by position) */
  description?: string;
  amount: number;
  currency: "CZK" | "EUR";
  invoiceNumber: string;
}

/** The payload of a "real_costs" outbox row. */
export interface RealCostsPayload {
  sourceRef: string;
  realLines: RealLine[];
}

/** One job the target's cost is shared by; weight = its part of the estimate (LTL: Σ the legs' cost shares). */
export interface TargetJob {
  shipmentId: string;
  consignmentId: string;
  weight: number;
}

export interface RealTarget {
  kind: "TRIP" | "PARTNER_LEG";
  id: string;
  /** The trip's kind (null for a partner leg) */
  tripKind: TripKind | null;
  /** What its estimate rows are named after: the trip's ref, or partnerLegRef(consignment ref) for a partner leg */
  ref: string;
  buy: PriceSnapshot;
  /** FTL trip / partner leg: the one job; LTL trip: every job on it */
  jobs: TargetJob[];
}

export interface RealPush {
  shipmentId: string;
  consignmentId: string;
  payload: RealCostsPayload;
}

/**
 * The allocations of a line's invoiced amount and the pushes owed to Road Department jobs.
 * `internal(shipmentId)` says whether a job is billed internally; `known(shipmentId)` whether
 * the job still exists (a deleted job gets nothing pushed).
 */
export function realCosts(
  target: RealTarget,
  invoiced: number,
  currency: "CZK" | "EUR",
  invoiceNumber: string,
  internal: (shipmentId: string) => boolean,
  known: (shipmentId: string) => boolean = () => true,
): { allocations: HaulierInvoiceAllocation[]; pushes: RealPush[] } {
  const allocations: HaulierInvoiceAllocation[] = [];
  const pushes: RealPush[] = [];
  const real = (amount: number): RealLine => ({ amount, currency, invoiceNumber });
  const add = (job: TargetJob, sourceRef: string, amount: number, realLines: RealLine[]) => {
    const isInternal = internal(job.shipmentId);
    allocations.push({ shipmentId: job.shipmentId, sourceRef, amount, currency, internal: isInternal });
    if (!isInternal && known(job.shipmentId)) pushes.push({ shipmentId: job.shipmentId, consignmentId: job.consignmentId, payload: { sourceRef, realLines } });
  };

  const ltlTrip = target.kind === "TRIP" && target.tripKind !== null && target.tripKind !== "FTL";
  if (ltlTrip) {
    // One row per job (trucking:trip:<id>:job:<shipmentId>), split like the estimate's job shares.
    const parts = splitLike(invoiced, target.jobs.map((j) => j.weight));
    target.jobs.forEach((job, n) => add(job, tripJobSourceRef(target.id, job.shipmentId), parts[n]!, [real(parts[n]!)]));
    return { allocations, pushes };
  }
  const job = target.jobs[0];
  if (!job) return { allocations, pushes };
  // The rows of the price lines (trucking:trip:<id> / trucking:leg:<id>), split like their amounts.
  const sourceRef = target.kind === "TRIP" ? tripSourceRef(target.id) : legSourceRef(target.id);
  const priced = target.buy.lines;
  const parts = priced.length ? splitLike(invoiced, priced.map((l) => l.amount)) : [invoiced];
  // Each part named like the price line's row, so a row kept or reordered in Costs still gets its own.
  const named = parts.map((amount, n): RealLine => (priced[n] ? { description: priceLineDescription(target.ref, priced[n]!.label), ...real(amount) } : real(amount)));
  add(job, sourceRef, invoiced, named);
  return { allocations, pushes };
}
