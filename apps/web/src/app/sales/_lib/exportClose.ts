import { PRICING_CLOSED_STATUSES, type QuoteStatus } from "./types";

// Export PDF closes a quote that has not gone out yet: it is marked as sent (Quoted) and its
// buying and selling can no longer be changed - new prices are a revision of it. A quote that
// went out, or is decided, is printed again as it is. The same wherever a PDF is exported: the
// quote's page, its preview and the Quotes list.

/** Whether exporting the PDF of a quote in this status (as stored) closes it first. */
export function exportClosesQuote(status: QuoteStatus): boolean {
  return !PRICING_CLOSED_STATUSES.includes(status);
}

export const EXPORT_CLOSE_TITLE = "Export and close the quote";
export const EXPORT_CLOSE_LABEL = "Export & close";

export function exportCloseDescription(quoteNumber: string): string {
  return `Exporting the PDF closes ${quoteNumber}: it is marked as sent (Quoted) and its buying and selling can no longer be changed. New prices will need a revision. Export and close it?`;
}

/** Said when the print window could not be opened on the click; nothing is closed then. */
export const PRINT_WINDOW_BLOCKED = "The browser blocked the print window. Allow pop-ups for this site and try again.";
