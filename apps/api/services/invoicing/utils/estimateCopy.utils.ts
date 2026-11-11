// What "Copy estimated costs" of the New Shipment wizard takes of another shipment's Costs
// Breakdown: its estimated buying costs, one row per row, in its order. Pure, so the mapping has
// its test.

import type { InvoiceCostRecord } from "../schemas/invoiceCost.schema";

/** A buying row of the new shipment, as another shipment's estimate fills it. */
export interface EstimateCopyRow {
  category: string;
  description: string;
  vendor: string;
  /** the supplier the vendor names when it was picked from the Customer Database, or null */
  supplierCustomerId: string | null;
  estQty: string | null;
  estAmount: string;
  estCurrency: string;
  realQty: string | null;
  realCurrency: string;
  unit: string;
  sortOrder: number;
}

type SourceRow = Pick<
  InvoiceCostRecord,
  | "category"
  | "description"
  | "vendor"
  | "supplierCustomerId"
  | "estQty"
  | "estAmount"
  | "estCurrency"
  | "unit"
  | "sourceTruckingRef"
  | "sourceMasterJobRef"
>;

/**
 * The estimates of a shipment's live buying rows (as listed, in their order) as rows of another
 * shipment: each row with an estimate becomes a row of its own - two THC rows stay two, "2 × 1,200"
 * stays a quantity of 2 at 1,200 - with its category, words, vendor and unit. The real cost belongs
 * to the source's own supplier invoices and is not copied; the copy waits for its invoice in the
 * estimate's quantity and currency, as a row copied from a quote does. Trucking's rows and a master
 * job's shares are kept by Trucking and by the master job, so they are left out, and the copy is
 * a row entered by hand: no quote, no Trucking, no master job behind it.
 */
export function estimateCopies(rows: readonly SourceRow[]): EstimateCopyRow[] {
  return rows
    .filter((r) => r.sourceTruckingRef === null && r.sourceMasterJobRef === null && r.estAmount !== null)
    .map((r, i) => ({
      category: r.category,
      description: r.description,
      vendor: r.vendor,
      supplierCustomerId: r.supplierCustomerId,
      estQty: r.estQty,
      estAmount: r.estAmount!,
      estCurrency: r.estCurrency,
      realQty: r.estQty,
      realCurrency: r.estCurrency,
      unit: r.unit,
      sortOrder: i,
    }));
}
