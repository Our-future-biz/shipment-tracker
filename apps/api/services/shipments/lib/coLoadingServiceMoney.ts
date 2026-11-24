// A Co-Loading Concept service's own money settings and its trend (Council Outlay 14, B4 and B5).
// B4: the box costs a new sailing of the service starts with, and the least a shipment should earn
// per W/M before the box - a mark on the rows below it, never a refusal (D14). B5: the last sailings
// that left, with how full each was, what it made and whether it covered its box. For managers only,
// as every figure of Earnings. Pure.

import type { EarningsRow, SailingEarnings, ServiceMoney, ServiceTrend, TrendSailing } from "../interfaces/interfaces";
import { checkBoxCosts, type BoxCostLineInput } from "./coLoadingBoxCosts";
import type { BoxCostKind } from "../interfaces/interfaces";
import { stageHasLeft } from "./coLoadingSailing";

const MAX_FLOOR = 99_999.99;

export interface ServiceMoneyInput {
  /** One container's Origin Costs, Ocean Freight and Destination Costs; null or all without an amount for none. */
  defaultBoxCosts: BoxCostLineInput[] | null;
  /** In EUR per W/M; null for none. */
  minEarningPerWm: number | null;
}

export interface ServiceMoneyClean {
  defaultBoxCosts: (BoxCostLineInput & { kind: BoxCostKind })[] | null;
  minEarningPerWm: number | null;
}

/** A stored service's money settings as they are read. */
export const moneyOfRow = (r: { defaultBoxCosts?: { kind: string; amount: number | null; currency: string; note: string }[] | null; minEarningPerWm?: string | null }): ServiceMoney => ({
  defaultBoxCosts: r.defaultBoxCosts && r.defaultBoxCosts.length > 0 ? (r.defaultBoxCosts as ServiceMoney["defaultBoxCosts"]) : null,
  minEarningPerWm: r.minEarningPerWm == null ? null : Number(r.minEarningPerWm),
});

/** The settings as they are stored, or what is wrong with them in words. Defaults with no amount at all are stored as none. */
export function cleanServiceMoney(input: ServiceMoneyInput): { money: ServiceMoneyClean } | { error: string } {
  let defaults: ServiceMoneyClean["defaultBoxCosts"] = null;
  if (input.defaultBoxCosts && input.defaultBoxCosts.length > 0) {
    const checked = checkBoxCosts(1, 1, input.defaultBoxCosts);
    if ("error" in checked) return { error: checked.error };
    defaults = checked.lines.some((l) => l.amount !== null) ? checked.lines : null;
  }
  const floor = input.minEarningPerWm;
  if (floor !== null) {
    if (typeof floor !== "number" || !Number.isFinite(floor) || floor <= 0) return { error: "The minimum earning per W/M must be more than 0, or left empty for none." };
    if (floor > MAX_FLOOR) return { error: "The minimum earning per W/M is too large." };
    if (Math.abs(floor * 100 - Math.round(floor * 100)) > 1e-6) return { error: "Give the minimum earning per W/M with at most two decimals." };
  }
  return { money: { defaultBoxCosts: defaults, minEarningPerWm: floor === null ? null : Math.round(floor * 100) / 100 } };
}

/**
 * What a row earns per W/M before the box, in EUR; null where that cannot be said: it is not
 * counted, its money or its EUR value is not known, or it has no W/M.
 */
export function earnedPerWmEur(row: Pick<EarningsRow, "counted" | "moneyKnown" | "freightTons" | "beforeBox">): number | null {
  if (!row.counted || !row.moneyKnown || !(row.freightTons > 0) || row.beforeBox.eur === null) return null;
  return Math.round((row.beforeBox.eur / row.freightTons) * 100) / 100;
}

/** The sailing's earnings with the service's minimum on them: each row that earns less per W/M is marked. Without a minimum, as they are. */
export function withFloor(earnings: SailingEarnings, minEarningPerWm: number | null): SailingEarnings {
  if (minEarningPerWm === null) return { ...earnings, minEarningPerWm: null, belowFloor: 0 };
  const rows = earnings.rows.map((row) => {
    const perWm = earnedPerWmEur(row);
    return perWm !== null && perWm < minEarningPerWm ? { ...row, belowFloor: true } : row;
  });
  return { ...earnings, rows, minEarningPerWm, belowFloor: rows.filter((r) => r.belowFloor).length };
}

/** The most sailings a trend looks back over. */
export const TREND_SAILINGS = 8;

export interface TrendInput {
  sailingId: string;
  name: string;
  departureDate: string | null;
  stage: string;
  createdAt: Date;
  /** How full the box is, in %; null where it has no capacity. */
  fullPct: number | null;
  earnings: SailingEarnings;
}

const average = (values: number[], decimals: number): number | null => (values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10 ** decimals) / 10 ** decimals);

/**
 * The service's trend: its last sailings that have left - by their stage, or a departure date
 * before `today` - the oldest first, each with how it stands against the one before, and what they
 * come to together. A figure that is not known (no box costs, money not read, no EUR rate) is left
 * out of its average and counted as not known, never as 0.
 */
export function serviceTrend(sailings: readonly TrendInput[], today: string): ServiceTrend {
  const left = sailings
    .filter((s) => stageHasLeft(s.stage) || (s.departureDate !== null && s.departureDate < today))
    .sort((a, b) => (b.departureDate ?? "").localeCompare(a.departureDate ?? "") || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, TREND_SAILINGS)
    .reverse();
  const rows: TrendSailing[] = left.map((s) => {
    const e = s.earnings;
    const profit = e.moneyKnown ? e.totals.profit : null;
    return {
      sailingId: s.sailingId,
      name: s.name,
      departureDate: s.departureDate,
      fullPct: s.fullPct,
      profitEur: profit ? profit.eur : null,
      marginPct: e.moneyKnown ? e.totals.marginPct : null,
      belowBreakEven: e.breakEven ? !e.breakEven.reached : null,
    };
  });
  const profits = rows.flatMap((r) => (r.profitEur === null ? [] : [r.profitEur]));
  const judged = rows.filter((r) => r.belowBreakEven !== null);
  return {
    sailings: rows,
    averageFillPct: average(rows.flatMap((r) => (r.fullPct === null ? [] : [r.fullPct])), 0),
    averageProfitEur: average(profits, 2),
    profitKnown: profits.length,
    belowBreakEven: judged.filter((r) => r.belowBreakEven).length,
    breakEvenKnown: judged.length,
  };
}
