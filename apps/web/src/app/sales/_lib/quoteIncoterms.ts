import type { SalesQuoteData } from "./types";

// A sea quote, as salesQuote isSeaQuote tells it (not imported: the quote list's state reads this list too).
const isSeaQuote = (data: Pick<SalesQuoteData, "serviceType">) => /^sea/i.test(data.serviceType ?? "");

// The Incoterms® 2020 rules in the order the rules give them: the seven for any mode of transport
// (DAP before DPU), then the four for sea and inland waterway only (User Council S18: DPU stood
// before DAP).
const ANY_MODE = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;
const SEA_ONLY = ["FAS", "FOB", "CFR", "CIF"] as const;

/** Every Incoterms® 2020 code, in the rules' order. */
export const INCOTERMS_2020: readonly string[] = [...ANY_MODE, ...SEA_ONLY];

/**
 * The Incoterms a quote's picker offers: on a sea quote all of them, on any other (air, rail,
 * road) only those for any mode - FAS, FOB, CFR and CIF are terms of a ship. A quote with no
 * freight mode yet is offered all. A code the quote already has stays offered, so it shows as it
 * is until another is picked.
 */
export function quoteIncoterms(data: Pick<SalesQuoteData, "serviceType" | "incoterm">): string[] {
  const offered: string[] = !data.serviceType || isSeaQuote(data) ? [...INCOTERMS_2020] : [...ANY_MODE];
  const current = data.incoterm?.trim();
  return current && !offered.includes(current) ? [...offered, current] : offered;
}
