import { round2, sumRounded } from "@/lib/money";
import type { CostsTotals, SellingRow } from "@/app/shipments/[jobNumber]/tabs/costsCalc";

/**
 * The invoice is built from the shipment's selling rows that are ticked for Invoice
 * (Costs section). Each line is converted into the billing currency by its own currency
 * and rounded to 2 decimals, so the total always equals the sum of the printed lines.
 */

export interface InvoiceLine {
  id: string;
  label: string;
  qty: string;
  amount: string;
  currency: string;
  /** Line total in the billing currency, rounded to 2 decimals. */
  total: number;
}

export interface InvoiceDraft {
  lines: InvoiceLine[];
  /** Ticked rows left out because their currency has no exchange rate. */
  unconvertible: SellingRow[];
  total: number;
  /** Buying costs in the billing currency (Real, falling back to Est.). */
  cost: number;
  profit: number;
  /** Profit as % of the invoice total; null when there is nothing to invoice. */
  marginPct: number | null;
}

export function buildInvoiceDraft(sellRows: SellingRow[], totals: CostsTotals): InvoiceDraft {
  const lines: InvoiceLine[] = [];
  const unconvertible: SellingRow[] = [];

  for (const r of sellRows) {
    if (!r.invoice) continue;
    const converted = totals.sellRowTotals[r.id];
    if (converted === null || converted === undefined) {
      unconvertible.push(r);
      continue;
    }
    if (round2(converted) === 0) continue;
    lines.push({
      id: r.id,
      label: r.category || "Service",
      qty: r.qty || "1",
      amount: r.amount,
      currency: r.currency,
      total: round2(converted),
    });
  }

  const total = sumRounded(lines.map((l) => l.total));
  const cost = round2(totals.buyTotal);
  const profit = round2(total - cost);
  return {
    lines,
    unconvertible,
    total,
    cost,
    profit,
    marginPct: total ? round2((profit / total) * 100) : null,
  };
}
