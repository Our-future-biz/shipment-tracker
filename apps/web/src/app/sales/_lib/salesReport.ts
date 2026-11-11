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
