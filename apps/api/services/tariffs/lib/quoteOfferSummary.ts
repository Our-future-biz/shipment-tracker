// An offer in short, for the overnight check of quotes (services/quotes lib/tariffOvernight): which
// tariff and rate it is, its totals, and the buying lines the web makes of it when it is picked, in
// their order - the rates per container of each type, then the surcharges (web sales/_lib
// oceanQuote.ts oceanOfferLines, railQuote.ts railOfferLines, collectionQuote.ts collectionOfferLine).
// The check compares them line by line with the quote's, so a new rate split differently between
// the lines is not taken for the old one. Pure.

import type { CollectionOffer, OceanOffer, RailOffer } from "../interfaces/interfaces";

export interface QuoteOfferLine {
  /** The container type of a rate per container; null for any other line */
  containerType: string | null;
  currency: string;
  amount: number;
}

export interface QuoteOfferSummary {
  versionId: string;
  /** Null for a collections offer, which is priced by the whole version */
  rateId: string | null;
  tariffId: string;
  supplierName: string;
  via: string;
  totals: { currency: string; amount: number }[];
  lines: QuoteOfferLine[];
}

// A rate per container as the web writes its line: the rate times the containers, rounded to the cent
// the way the web's withRate rounds it (Math.round, no nudge), so the two read the same cents.
const boxLine = (type: string, price: number, qty: number, currency: string): QuoteOfferLine => ({ containerType: type, currency, amount: Math.round(price * qty * 100) / 100 });

export function oceanOfferSummary(o: OceanOffer): QuoteOfferSummary {
  return {
    versionId: o.versionId,
    rateId: o.rateId,
    tariffId: o.tariffId,
    supplierName: o.supplierName,
    via: o.via,
    totals: o.totals,
    lines: [...o.lines.map((l) => boxLine(l.type, l.price, l.qty, o.currency)), ...o.surcharges.map((s) => ({ containerType: null, currency: s.currency, amount: s.total }))],
  };
}

export function railOfferSummary(o: RailOffer): QuoteOfferSummary {
  return {
    versionId: o.versionId,
    rateId: o.rateId,
    tariffId: o.tariffId,
    supplierName: o.supplierName,
    via: o.via,
    totals: [{ currency: o.currency, amount: o.total }],
    lines: o.lines.map((l) => boxLine(l.type, l.price, l.qty, o.currency)),
  };
}

export function collectionOfferSummary(o: CollectionOffer): QuoteOfferSummary {
  return {
    versionId: o.versionId,
    rateId: null,
    tariffId: o.tariffId,
    supplierName: o.supplierName,
    via: "",
    totals: [{ currency: o.currency, amount: o.total }],
    lines: [{ containerType: null, currency: o.currency, amount: o.total }],
  };
}
