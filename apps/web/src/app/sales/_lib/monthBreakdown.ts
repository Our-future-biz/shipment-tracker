import { roundCents } from "@/lib/money";
import type { interfaces } from "@/lib/api/client";

type Row = interfaces.JobProfitRow;

export interface BreakdownTotals {
  jobs: number;
  revenueCzk: number;
  costCzk: number;
  profitCzk: number;
  /** Profit in % of the revenue, whole; 0 without revenue. */
  margin: number;
}

export interface BreakdownGroup extends BreakdownTotals {
  label: string;
}

export interface MonthBreakdown {
  totals: BreakdownTotals;
  byFreightMode: BreakdownGroup[];
  byCustomer: BreakdownGroup[];
  /** The month's jobs, by the day they are dated. */
  rows: Row[];
}

function totalsOf(rows: readonly Row[]): BreakdownTotals {
  const revenueCzk = roundCents(rows.reduce((sum, r) => sum + r.revenueCzk, 0));
  const profitCzk = roundCents(rows.reduce((sum, r) => sum + r.profitCzk, 0));
  return {
    jobs: rows.length,
    revenueCzk,
    costCzk: roundCents(rows.reduce((sum, r) => sum + r.costCzk, 0)),
    profitCzk,
    margin: revenueCzk ? Math.round((profitCzk / revenueCzk) * 100) : 0,
  };
}

// The groups from the highest revenue down; a job without a value goes under "—".
function groupsOf(rows: readonly Row[], labelOf: (r: Row) => string): BreakdownGroup[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const label = labelOf(r).trim() || "—";
    groups.set(label, [...(groups.get(label) ?? []), r]);
  }
  return [...groups].map(([label, own]) => ({ label, ...totalsOf(own) })).sort((a, b) => b.revenueCzk - a.revenueCzk || a.label.localeCompare(b.label));
}

/** One month of the job-profit report in full: its totals, by freight mode, by customer and job by job. */
export function monthBreakdown(allRows: readonly Row[], month: string): MonthBreakdown {
  const rows = allRows.filter((r) => r.month === month).sort((a, b) => a.date.localeCompare(b.date) || a.jobNumber.localeCompare(b.jobNumber));
  return {
    totals: totalsOf(rows),
    byFreightMode: groupsOf(rows, (r) => r.freightMode),
    byCustomer: groupsOf(rows, (r) => r.customer),
    rows,
  };
}
