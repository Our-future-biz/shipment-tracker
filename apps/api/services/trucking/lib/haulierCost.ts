import { roundToStep } from "./rateEngine";

// The haulier cost (buy) of one consignment, worked out the way the Reports count it (the `cost`
// CTE of reports.repository): per priced part - an FTL trip, an LTL leg's share of its trip, a
// partner delivery - the real amount of the approved haulier invoice line where one covers it,
// else the estimate; with no priced part the estimate from pricing. The real amounts come from
// the same SQL as the Reports' (repositories/legCost.sql.ts). Pure.

/** The real cost of a leg: the approved haulier invoice line covering it (CZK). */
export interface LegRealCost {
  legId: string;
  consignmentId: string;
  tripId: string | null;
  realCzk: number;
  invoiceNumber: string;
}

/** One part of a consignment's haulier cost: its estimate and, once invoiced and approved, its real cost. */
export interface CostPart {
  estCzk: number | null;
  real: LegRealCost | null;
}

export interface HaulierCostOf {
  buyCzk: number | null;
  /** Every priced part has an approved haulier invoice (false for an estimate) */
  buyReal: boolean;
  /** The approved haulier invoices behind the real parts */
  buyInvoiceNumbers: string[];
}

export function haulierCostOf(parts: CostPart[], estBuyCzk: number | null): HaulierCostOf {
  const priced = parts
    .map((p) => ({ czk: p.real?.realCzk ?? p.estCzk, real: p.real }))
    .filter((p): p is { czk: number; real: LegRealCost | null } => p.czk !== null);
  if (!priced.length) return { buyCzk: estBuyCzk, buyReal: false, buyInvoiceNumbers: [] };
  return {
    buyCzk: roundToStep(
      priced.reduce((a, p) => a + p.czk, 0),
      0.01,
    ),
    buyReal: priced.every((p) => p.real !== null),
    buyInvoiceNumbers: [...new Set(priced.flatMap((p) => (p.real ? [p.real.invoiceNumber] : [])))],
  };
}
