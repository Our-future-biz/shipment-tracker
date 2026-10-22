import { QUOTE_STATUS_MAP, type QuoteStatus } from "./types";

// Only a Won quote is linked to a shipment - made from it or named as its Sales Reference. The
// server's rule (shipmentLinkRefusal); the screens only spare a request it would refuse. What a
// shipment-making control says about any other quote, by the status it is shown with (so an
// expired quote reads Expired, as its pill does); null for a Won one.
export function notWonQuoteText(status: QuoteStatus): string | null {
  if (status === "won") return null;
  return `This quote is ${QUOTE_STATUS_MAP[status]?.label ?? status} - mark it Won before a shipment is made from it`;
}
