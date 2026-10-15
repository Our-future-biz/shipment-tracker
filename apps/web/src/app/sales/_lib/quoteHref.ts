// Where a quote was opened from, when that is not the Quotes list. It travels in the quote's
// address, so the quote page can lead back there (useQuoteOrigin) also after a reload or in a new
// tab. A quote opened from the list, from a shipment or by a typed address has no origin: its
// page leads back to Quotes.
export type QuoteOrigin = { from: "followup" } | { from: "customer"; customerId: string };

// The address of a quote's page: /sales/quote/QCZ…, with ?from=followup or
// ?from=customer&customer=<id> when the link is on one of those screens.
export function quoteHref(quoteNumber: string, origin?: QuoteOrigin | null): string {
  const path = `/sales/quote/${quoteNumber}`;
  if (!origin) return path;
  const query = new URLSearchParams({ from: origin.from });
  if (origin.from === "customer") query.set("customer", origin.customerId);
  return `${path}?${query}`;
}

// The origin an address carries. Anything else than the two known ones is no origin.
export function quoteOriginOf(query: Pick<URLSearchParams, "get">): QuoteOrigin | null {
  const from = query.get("from");
  const customerId = query.get("customer");
  if (from === "followup") return { from };
  if (from === "customer" && customerId) return { from, customerId };
  return null;
}
