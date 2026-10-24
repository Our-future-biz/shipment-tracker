import type { CostLine, SalesQuoteData } from "./types";
import { computeCargo, quoteCurrency } from "./salesQuote";

// Overweight on a Sea LCL quote: a shipment of over 2 t whose cargo is dense - under 2.2 cbm per
// ton - is charged an Overweight surcharge. The selling line is put to Pricing at 0 for Sales to
// price; leaving Pricing with it still at 0, or removing it, asks why, and the reason is kept on
// the quote. It is selling only: nobody bills it to us.

/** The weight over which a Sea LCL shipment can be overweight, in kg. */
export const OVERWEIGHT_KG = 2000;
/** The weight ratio under which it is: cbm per ton of cargo. */
export const OVERWEIGHT_RATIO = 2.2;
/** The selling line of the surcharge carries this pair id (it has no buying line). */
export const OVERWEIGHT_PAIR_ID = "overweight-surcharge";
export const OVERWEIGHT_DESCRIPTION = "Overweight surcharge";

/** Whether the quote is charged an Overweight surcharge: Sea LCL, over 2 t, under 2.2 cbm/t. */
export function isOverweight(data: SalesQuoteData): boolean {
  if (data.serviceType !== "Sea LCL") return false;
  const cargo = computeCargo(data);
  return cargo.grossWeight > OVERWEIGHT_KG && cargo.weightRatio !== null && cargo.weightRatio < OVERWEIGHT_RATIO;
}

const isSurcharge = (l: CostLine) => l.pairId === OVERWEIGHT_PAIR_ID;
const unpriced = (l: CostLine) => !(Number(l.amount) > 0);

/** The surcharge's selling line as it is put to Pricing: at 0, in the quote's currency. */
export function overweightLine(data: SalesQuoteData): CostLine {
  return {
    type: "Handling",
    chargeCode: "handling",
    description: OVERWEIGHT_DESCRIPTION,
    currency: quoteCurrency(data),
    amount: 0,
    value: 1,
    basis: "lumpsum",
    pairId: OVERWEIGHT_PAIR_ID,
  };
}

/**
 * The selling lines and the reason as the cargo has them: an overweight quote gets the surcharge
 * line at 0 - unless it has one, or it was removed with a reason; a priced surcharge needs no
 * reason. A quote no longer overweight loses the line while it is still at 0 (a priced one is
 * Sales' own to keep or remove) and the reason. Null when nothing changes.
 */
export function withOverweight(data: SalesQuoteData): Pick<SalesQuoteData, "sellingLines" | "overweightReason"> | null {
  const selling = data.sellingLines ?? [];
  const line = selling.find(isSurcharge);
  if (isOverweight(data)) {
    if (!line) return data.overweightReason ? null : { sellingLines: [...selling, overweightLine(data)] };
    return data.overweightReason && !unpriced(line) ? { overweightReason: undefined } : null;
  }
  const keep = line && unpriced(line) ? selling.filter((l) => !isSurcharge(l)) : null;
  if (!keep && !data.overweightReason) return null;
  return { ...(keep ? { sellingLines: keep } : {}), overweightReason: undefined };
}

/** Whether leaving Pricing asks why there is no surcharge: overweight, its line still at 0, and no reason given. */
export function overweightUnexplained(data: SalesQuoteData): boolean {
  if (!isOverweight(data) || data.overweightReason) return false;
  const line = (data.sellingLines ?? []).find(isSurcharge);
  return !!line && unpriced(line);
}

/** Whether a selling line is the surcharge still at 0: the customer's quotation leaves it out. */
export const unpricedOverweight = (line: CostLine): boolean => isSurcharge(line) && unpriced(line);
