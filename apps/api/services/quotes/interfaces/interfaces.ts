import type { StoredFx } from "../lib/quoteFx";
import type { ServiceLevelCode } from "../../trucking/interfaces/interfaces";
// Plain interfaces for controllers. Never import Drizzle table types here.

/**
 * A sales quote as the Sales screens get it: the document, and the lifecycle facts the server
 * owns, as typed fields. Times are ISO strings, days are YYYY-MM-DD.
 */
export interface SalesQuoteItem {
  id: string;
  quoteNumber: string;
  /**
   * The quote's fields. Two shapes share this column: sales quotes (QCZ…, keyed by field name
   * like `quoteStatus`, `buyingLines`) and older quotes keyed by column label ("POL", …), so it
   * stays an open object here; each client reads the shape it wrote.
   */
  data: unknown;
  terms: string;
  createdAt: string;
  updatedAt: string;
  /** The version of the document. A save names the one it is based on. */
  dataVersion: number;
  /** The status as stored. */
  status: string;
  /** The status to show: "expired" for a Quoted or Feedback quote whose validity has passed. */
  effectiveStatus: string;
  /** The statuses the quote may be set to now, in menu order. */
  allowedTransitions: string[];
  substatus: string | null;
  lostReason: string | null;
  lostComment: string | null;
  customerId: string | null;
  /** The last sending. */
  sentAt: string | null;
  firstSentAt: string | null;
  decidedAt: string | null;
  validUntil: string | null;
  /** When the customer last heard from us: the last recorded contact, else the last sending. */
  lastContactAt: string | null;
  followUpDue: boolean;
  ownerUserId: string | null;
  /** The owner's current display name; the stored label when the owner is not linked to a user. */
  ownerName: string;
  /** The owner as text, as stored: what old quotes had instead of a user. */
  ownerLabel: string;
  shipmentId: string | null;
  shipmentJobNumber: string | null;
  /**
   * What the quote earns on road transport and whether that is enough: worked out on every read
   * for a quote whose serviceType is "Road" or that has a line priced from a trucking tariff;
   * null for any other quote.
   */
  roadMargin: RoadMargin | null;
  /** What the signed-in user may do with this quote. */
  permissions: {
    /** any: reassign freely. own: hand over or give up. claim: take for themselves. none: nothing. */
    canChangeOwner: "any" | "own" | "claim" | "none";
    /** Whether the user may delete the quote as it stands. */
    canDelete: boolean;
    /**
     * Why not, when they may not - the sentence to show: a shipment is linked to the quote (then
     * nobody may, and shipmentId is set), or the user would have to be a manager.
     */
    deleteBlockedReason?: string;
    /** Whether the user may approve a margin below the Trucking margin floor (a manager). */
    canApproveMargin: boolean;
  };
}

/** The road transport of a quote as the Sales editor enters it (data.road; the editor's key). */
export interface QuoteRoadInput {
  /** CZ PSČ as typed ("110 00"); the server normalises it for pricing. */
  fromSiteId: string | null;
  fromPostcode: string;
  toSiteId: string | null;
  toPostcode: string;
  /** null date = "today" when pricing. */
  pickupDate: string | null;
  pickupTime: string | null;
  scope: "LTL" | "FTL" | "LINEHAUL";
  pieces: number;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  cbm: number;
  extras: {
    adr: boolean;
    tailLift: boolean;
    avizace: boolean;
    timeWindow: boolean;
    b2c: boolean;
    nonStackable: boolean;
    waitingHours: number;
    declaredValueCzk: number | null;
  };
}

/** What the last pricing from the trucking tariffs gave (data.roadPricing; the server's key). */
export interface QuoteRoadPricing {
  ratedAt: string;
  serviceLevel: ServiceLevelCode;
  serviceLabel: string;
  promisedDate: string | null;
  promisedTime: string | null;
  promiseNote: string;
  sell: { tariffId: string; tariffName: string; tariffVersionId: string; versionNo: number; currency: "CZK" | "EUR"; total: number; totalCzk: number };
  buy: {
    haulierCustomerId: string;
    haulierName: string;
    tariffVersionId: string;
    versionNo: number;
    currency: "CZK" | "EUR";
    total: number;
    totalCzk: number;
    preferred: boolean;
  } | null;
}

/** A manager's approval of a margin below the floor (data.marginApproval; the server's key). */
export interface QuoteMarginApproval {
  byUserId: string;
  byName: string;
  at: string;
  reason: string;
  /** The margin that was approved. */
  marginCzk: number;
  marginPercent: number | null;
}

/** The margin of a road quote against the Trucking margin floor. Amounts in CZK. */
export interface RoadMargin {
  sellingCzk: number;
  buyingCzk: number;
  /** null when a line could not be converted to CZK (see problem). */
  marginCzk: number | null;
  /** null when nothing is sold. */
  marginPercent: number | null;
  floorPercent: number;
  floorMinCzk: number;
  belowFloor: boolean;
  approval: QuoteMarginApproval | null;
  /** The approval covers the margin as it is now: it is the same or better than the one approved. */
  approvalValid: boolean;
  /** belowFloor && !approvalValid: the quote is not sent until a manager approves. */
  needsApproval: boolean;
  /** Why the margin cannot be worked out, e.g. "No ČNB rate for EUR on 2026-10-15". */
  problem: string | null;
}

/** What the shipments service knows about one quote reference. */
export interface QuoteShipmentsItem {
  quoteNumber: string;
  /** EVERY live shipment whose Sales Number is this reference, oldest first; none = no shipment names the quote any more. */
  shipments: { id: string; jobNumber: string }[];
  /** One of them that was created from the quote: it makes an open quote Won. */
  wonByShipmentId?: string;
}

/** A quote after it was brought in step with its shipments. */
export interface QuoteShipmentsResult {
  quoteNumber: string;
  /** False when the reference is not a live sales quote: nothing was written and the fields below are empty. */
  found: boolean;
  /** The shipment the quote is linked to now: the oldest that names it. */
  shipmentId: string | null;
  shipmentJobNumber: string | null;
  /** The status the quote shows now ("expired" for a Quoted or Feedback quote whose validity has passed). */
  status: string | null;
  /** This call made the quote Won. */
  becameWon: boolean;
  /** The status the quote returned to because the last shipment of a Won that a shipment had made is gone. */
  revertedTo: string | null;
  /** Why the shipment created from the quote did not make it Won. */
  note: string | null;
}

/** What the company's sales quotes say about one customer, for the pipeline of the sales service. */
export interface CustomerQuoteFacts {
  customerId: string;
  /** A quote for this customer went out: it has a sent date, or a status that proves it (quoted, feedback, revised, won, a stored expired). */
  hasSentQuote: boolean;
  /** How many did. */
  sentQuotes: number;
  /** When the first of them went out - for a quote without a sent date, when it was created. Null when none went out. */
  firstSentAt: string | null;
  /** Whether firstSentAt is a recorded sending, not a creation date standing in for one. */
  firstSentAtKnown: boolean;
  /** How many of the sent quotes have no sent date. */
  sentQuotesWithoutDate: number;
  /** The last write of any quote for this customer. */
  lastActivityAt: string;
}

/** An open quote of a customer: not decided and not expired. Its value is worked out by the web, from these parts of its document. */
export interface CustomerOpenQuote {
  customerId: string;
  quoteNumber: string;
  status: string;
  validUntil: string | null;
  /** The quote's currency as stored; "" when it stores none. */
  currency: string;
  /** ČNB rates and ROE % stored when the quote was sent (data.fx); null for a draft. */
  fx: StoredFx | null;
  /** Rates older quotes stored from the retired weekly sheet (data.rates), as stored. */
  rates: unknown;
  /** The selling lines (data.sellingLines), as stored. */
  sellingLines: unknown;
}

/** A status a sales quote can be set to. */
export type SettableQuoteStatus = "draft" | "ready_to_send" | "quoted" | "feedback" | "revised" | "won" | "lost";

/** A status a sales quote can show: one it can be set to, or Expired (its validity has passed). */
export type ShownQuoteStatus = SettableQuoteStatus | "expired";
