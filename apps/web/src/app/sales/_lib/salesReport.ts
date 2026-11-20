import { businessDayOf } from "@/lib/date";
import type { SalesQuote } from "./salesQuote";

/**
 * The month (YYYY-MM) whose ČNB average converts a quote in the Sales Report: when it was sent, or
 * created if never sent, on the company's calendar (Prague). The times are stored in UTC, whose
 * month ends an hour or two before Prague's: a quote sent just after midnight on 1 November in
 * Prague is a November quote.
 */
export function reportMonthOf(q: Pick<SalesQuote, "data" | "createdAt">): string {
  return businessDayOf(q.data.sentAt || q.createdAt).slice(0, 7);
}

/** A quote's figures in CZK, or null when its month has no ČNB average for its currency. */
export type CzkFigures = { selling: number; profit: number } | null;

/**
 * The margin of a set of quotes, weighted by money: their profit over their selling, in CZK, as a
 * whole percentage (user council S6, owner's answer Q11). A plain mean of each quote's margin let a
 * small quote at 60 % count as much as a large one at 5 %. Quotes without CZK figures are left out,
 * as they are from the sums beside it. Null when nothing is sold - no margin rather than 0 %.
 */
export function weightedMargin(figures: CzkFigures[]): number | null {
  let selling = 0;
  let profit = 0;
  for (const f of figures) {
    if (!f) continue;
    selling += f.selling;
    profit += f.profit;
  }
  return selling > 0 ? Math.round((profit / selling) * 100) : null;
}

/**
 * Won over the quotes decided either way (won + lost), as a whole percentage, as the Managers page
 * counts its hit rate. Open, expired and replaced quotes are not in it, and nothing becomes Lost by
 * itself (Sales council D19), so the counts are shown beside it. Null when none is decided yet.
 */
export function hitRate(won: number, lost: number): number | null {
  const decided = won + lost;
  return decided ? Math.round((won / decided) * 100) : null;
}

/** A percentage in the report, or a dash when there is none. */
export const percentText = (v: number | null) => (v === null ? "—" : `${v}%`);

/** Whether a report month (YYYY-MM) is within a range of months, both ends included. */
export function inMonthRange(month: string, [from, to]: [string, string]): boolean {
  return month !== "" && month >= from && month <= to;
}
