import type { controllers } from "@/lib/api/client";
import type { WeekRates } from "@/lib/exchangeRates";
import type { SettableQuoteStatus } from "./types";

/** What the user chose when changing a quote's status. */
export interface StatusChange {
  status: SettableQuoteStatus;
  comment?: string;
  /** To Quoted: "valid N days" from today. Chosen only when the quote has no validity that still holds. */
  validityDays?: number;
  /** To Lost: "Category: reason". */
  lostReason?: string;
}

// A change of status as the server is asked for it. The lifecycle bar on the quote page, the bulk
// "Set status" in the Quotes list and "Mark as sent" in the email dialog all ask with this, and the
// server does the rest - whether the move is allowed, who made it and when, the sent and decision
// dates, the validity and the history line - so a status change leaves the same trace wherever it
// is made. `exchange` is the Exchange sheet the user sees: a quote that is sent keeps the rates
// its totals were shown with.
export function transitionRequest(
  change: StatusChange,
  exchange: Pick<WeekRates, "rates" | "usedWeek">,
): controllers.SalesQuoteTransitionRequest {
  const { status } = change;
  return {
    to: status,
    comment: change.comment?.trim() || undefined,
    validityDays: status === "quoted" ? change.validityDays : undefined,
    lostReason: status === "lost" ? change.lostReason : undefined,
    exchange: status === "quoted" ? { rates: exchange.rates, week: exchange.usedWeek || undefined } : undefined,
  };
}
