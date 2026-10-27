import { OPEN_QUOTE_STATUSES, QUOTE_STATUS_MAP, type QuoteStatus } from "./types";

// The statuses (as shown) a shipment may be created from: an open or expired quote, which the
// shipment makes Won as it is created, and a Won one. A Lost or Replaced quote would stay as it
// is, so none is made from it. The server's rule (shipmentFromQuoteRefusal); the screens only
// spare a request it would refuse.
export const SHIPMENT_SOURCE_STATUSES: readonly QuoteStatus[] = [...OPEN_QUOTE_STATUSES, "expired", "won"];

/**
 * What a shipment-making control says about a quote no shipment may be created from, by the
 * status it is shown with (so an expired quote reads Expired, as its pill does); null when one may.
 */
export function shipmentFromQuoteBlockedText(status: QuoteStatus): string | null {
  if (SHIPMENT_SOURCE_STATUSES.includes(status)) return null;
  return `This quote is ${QUOTE_STATUS_MAP[status]?.label ?? status} - no shipment can be created from it`;
}

/** What "Create shipment" says it does: a quote not yet Won becomes Won. */
export function createShipmentHint(status: QuoteStatus): string {
  return shipmentFromQuoteBlockedText(status) ?? (status === "won" ? "Create a shipment from this quote" : "Create a shipment from this quote - the quote becomes Won");
}
