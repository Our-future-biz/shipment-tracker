import type { QuoteHeavyPieces } from "./heavyPieces";
import type { interfaces } from "@/lib/api/client";

// A "sales quote" is stored in the shared `quote` table: quoteNumber = reference (QCZ…),
// and all rich fields live in the `data` jsonb blob shaped like SalesQuoteData.

type ServiceLevelCode = interfaces.ServiceLevelCode;

export interface PackageLine {
  qty: number;
  type: string;
  // Dimensions (cm) and weight per piece (kg) are absent until somebody enters them.
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  stackable?: boolean;
}

// A container line of a full-container quote (Sea FCL): so many boxes of one type, named as the
// shipment's Container Details name them ("40' HC"). The weight is the cargo in one such box
// (kg), absent until somebody enters it.
export interface QuoteContainerLine {
  qty: number;
  type: string;
  weight?: number;
}

// What a reefer box of a quote has to be run at, and the papers and power the cold chain needs -
// asked as soon as a container line is a reefer (hasReefer). Only the set-point is required; the
// rest is said where the cargo or the shipper needs it.
export interface QuoteReefer {
  // 1. Cargo and set-point: °C, with a tolerance (± °C) where one is required (pharma ±2 °C).
  setPoint?: number;
  toleranceRequired?: boolean;
  tolerance?: number;
  // 2. Atmosphere and airflow: the fresh-air vent closed, or open at m³/h or at a % of opening;
  // a target humidity only where the unit controls it.
  ventMode?: "closed" | "m3h" | "percent";
  ventValue?: number;
  humidityControl?: boolean;
  humidity?: number;
  // 3. Drain holes.
  drains?: "open" | "closed";
  // 4. Monitoring and documentation.
  dataLogger?: boolean;
  recorderCertificate?: boolean;
  genset?: boolean;
  plugIn?: boolean;
  shorePower?: "available" | "check" | "none";
  phytosanitary?: boolean;
  sanitary?: boolean;
  veterinary?: boolean;
}

// The cargo of a quote with an open top or flat rack among its containers (hasOogEquipment):
// whether it stays within the box, and if not its overall length (all pieces together), the widest
// and the highest piece, in cm - what the out-of-gauge check (checkOog) goes by.
export interface QuoteOog {
  inGauge?: boolean;
  length?: number;
  width?: number;
  height?: number;
}

export interface CostLine {
  // The label of the charge ("Road freight"); quotes saved before the catalogue hold only this.
  type: string;
  // The charge code (@/lib/chargeCodes), kept beside the label; copied as the cost line's category.
  chargeCode?: string;
  description: string;
  supplier?: string;
  // The haulier (a customer) a line priced from a trucking tariff is bought from.
  supplierCustomerId?: string;
  currency: string;
  // The whole line; with qty and unitPrice it is their product.
  amount: number;
  value?: number;
  // A line priced per unit (e.g. by a tariff): copied to Costs Breakdown as qty × unit price.
  qty?: number;
  unit?: string;
  unitPrice?: number;
  // The tariff the line was priced from.
  tariffRef?: string;
  // Shared by a buying line and the selling line made from it (_lib/costPairs.ts).
  pairId?: string;
}

// One exchange rate an older quote kept for itself (the weekly Exchange sheet's, or typed). Read
// only: today a sent quote's rates are its ČNB snapshot (`fx`), stored by the server.
export interface QuoteRate {
  // CZK per 1 unit of the currency.
  rate: number;
  // The Exchange week the rate was taken from ("2026-W41"); absent when it was typed on the quote.
  week?: string;
}

// The ČNB rates (CZK per 1 unit) and company ROE % a quote is priced with. Live (today's)
// until the quote is sent; the server stores them on the quote when it is sent and never
// changes them after (a protected key: a save never writes it).
export interface QuoteFx {
  date: string; // the date the rates are for
  fixingDate: string | null; // the ČNB fixing used
  roePct: number; // 100 = pure ČNB
  rates: Record<string, number>;
  lockedAt?: string; // set when the quote was sent
}

// One line of a quote's history. The server writes them; the browser only shows them.
export interface TimelineEntry {
  // What the line records. A line written before kinds existed has none and is a status change;
  // only status changes carry a status.
  kind?: "status" | "validity" | "owner" | "follow_up" | "shipment" | "deleted" | "road_price" | "margin_approval";
  status?: QuoteStatus;
  at: string;
  // Display name of who made the change. Entries written before names were recorded say "You".
  user?: string;
  userId?: string;
  // On a validity or owner line the whole sentence: "Valid until 2026-10-25 (was 2026-10-20)".
  comment?: string;
  lostReason?: string;
  // The status before: on a Won the system made, and on a line by which a quote left a status
  // that proves it was sent while no sent date says so.
  from?: QuoteStatus;
  shipmentId?: string;
  jobNumber?: string;
  action?: "linked" | "removed";
  auto?: boolean;
}

// The keys of a quote's document only the server writes: the reference, the lifecycle (status,
// dates, validity, owner, history) and what the lifecycle keeps aside. They are changed with
// their own actions; a save of the document never changes them, whatever it sends. The twin of
// PROTECTED_KEYS in apps/api/services/quotes/utils/quoteDocument.utils.ts - an API test compares
// the two.
export const PROTECTED_KEYS = [
  "reference",
  "quoteStatus",
  "substatus",
  "lostReason",
  "lostComment",
  "sentAt",
  "decidedAt",
  "validUntil",
  "validityDays",
  "winProbability",
  "timeline",
  "salesOwner",
  "lifecycleUnreadable",
  "timelineUnreadable",
  "fx",
  "rates",
  "roadPricing",
  "marginApproval",
  "replacedBy",
] as const satisfies readonly (keyof SalesQuoteData)[];

// The road transport of a quote as the Sales editor enters it; the trucking tariffs price it.
export type QuoteRoadInput = interfaces.QuoteRoadInput;

// What the last pricing from the trucking tariffs gave. Written by the server only.
export interface QuoteRoadPricing {
  ratedAt: string; serviceLevel: ServiceLevelCode; serviceLabel: string;
  promisedDate: string | null; promisedTime: string | null; promiseNote: string;
  sell: { tariffId: string; tariffName: string; tariffVersionId: string; versionNo: number; currency: "CZK" | "EUR"; total: number; totalCzk: number };
  buy: { haulierCustomerId: string; haulierName: string; tariffVersionId: string; versionNo: number; currency: "CZK" | "EUR"; total: number; totalCzk: number; preferred: boolean } | null;
}

// A manager's approval of a road margin below the Trucking floor. Written by the server only.
export type QuoteMarginApproval = interfaces.QuoteMarginApproval;

// Every other key is one the Sales editor writes. The server stores those as a save sends them
// and keeps no list of them, so a field added here needs no change in the API to be saved.
export interface SalesQuoteData {
  reference?: string;
  method?: string;
  // Customer
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerContact?: string;
  customerLabel?: string;
  salesOwner?: string;
  // Shipment details
  direction?: string; // Export / Import
  serviceType?: string; // Air / Sea (FCL/LCL) / Rail / Road
  incoterm?: string;
  readyDate?: string;
  // Routing
  origin?: string;
  destination?: string;
  pol?: string; // port of loading
  pod?: string; // port of discharge
  pickup?: string;
  delivery?: string;
  // Cargo
  commodity?: string;
  stackable?: boolean;
  dangerous?: boolean;
  packages?: PackageLine[];
  // The equipment of a full-container quote (isContainerQuote), in place of package lines.
  containers?: QuoteContainerLine[];
  // The reefer requirements of a quote with a reefer container among its lines.
  reefer?: QuoteReefer;
  // The out-of-gauge details of a quote with an open top or flat rack among its lines.
  oog?: QuoteOog;
  // A Sea LCL quote of over 2 t: whether any piece is over 2 t, and the warehouse's extra handling
  // for them (heavyPieces.ts), posted to Pricing as a buying and a selling line.
  heavyPieces?: QuoteHeavyPieces;
  weight?: number;
  cbm?: number;
  // Pricing
  buyingLines?: CostLine[];
  sellingLines?: CostLine[];
  // Quoted as an all-in rate: the customer's document shows the selling total as one price, without
  // the lines it is made of. The lines stay on the quote as they are.
  allIn?: boolean;
  // The revision that replaced this quote (QCZ…-R1): written by the server when it is revised.
  replacedBy?: string;
  // The currency the quote is presented in (EUR when empty); each line keeps its own.
  currency?: string;
  // The quote's own snapshot of the rates its lines are converted with, by currency, so a quote
  // that was sent does not change when next week's Exchange sheet is entered.
  rates?: Record<string, QuoteRate>;
  // Road transport: what the Road transport card prices, and (server only) what pricing wrote and
  // a manager's approval of a margin below the floor.
  road?: QuoteRoadInput;
  roadPricing?: QuoteRoadPricing;
  marginApproval?: QuoteMarginApproval;
  // Shipping terms
  shippingTerms?: string; // name of a terms_condition template
  shippingIncludes?: string;
  shippingExcludes?: string;
  // The former "Additional conditions / notes" box: no longer entered, shown or printed. Text
  // typed before stays stored.
  shippingTermsNotes?: string;
  // Lifecycle - written by the server only (PROTECTED_KEYS). These keys mirror the facts the
  // server keeps, for whoever reads the document: lists, the printed quotation.
  quoteStatus?: QuoteStatus;
  // No longer written or shown; kept as a protected key so that nothing can bring it back in.
  substatus?: string;
  lostReason?: string;
  lostComment?: string;
  // "Valid N days" from sentAt: how quotes sent before the validity became a date carry it. No
  // longer written; read only for a quote that has no validUntil.
  validityDays?: number;
  // The last day the quote is valid (YYYY-MM-DD): picked under Shipping terms, or today + N
  // written when the quote is sent as "valid N days".
  validUntil?: string;
  winProbability?: number;
  sentAt?: string;
  // When the quote was marked Won or Lost.
  decidedAt?: string;
  // ČNB rates + ROE % stored by the server when the quote was sent; see QuoteFx.
  fx?: QuoteFx;
  timeline?: TimelineEntry[];
  // Old values of the lifecycle keys the server could not read, kept as they were.
  lifecycleUnreadable?: Record<string, unknown>;
  timelineUnreadable?: unknown;
}

/** A quote's lifecycle status as the server names it. */
export type KnownQuoteStatus = "draft" | "ready_to_send" | "quoted" | "feedback" | "revised" | "won" | "lost" | "expired" | "replaced";
/** A status as stored: one of the known ones, or one a newer version wrote that this one can't name. */
export type QuoteStatus = KnownQuoteStatus | (string & {});

/** Tailwind classes a status is drawn with: the pill, its dot, and its text on white. */
export interface QuoteStatusTone {
  pill: string;
  dot: string;
  text: string;
}

export interface QuoteStatusDef {
  key: KnownQuoteStatus;
  label: string;
  winProbability: number;
  tone: QuoteStatusTone;
}

/** What a status this version has no name for is drawn in. */
export const NEUTRAL_STATUS_TONE: QuoteStatusTone = { pill: "bg-slate-100 text-slate-500", dot: "bg-slate-500", text: "text-slate-500" };

// How each status is shown. Which status may follow which is the server's rule: every quote
// comes with the statuses it may be set to (allowedTransitions).
export const QUOTE_STATUSES: QuoteStatusDef[] = [
  { key: "draft", label: "Draft", winProbability: 10, tone: NEUTRAL_STATUS_TONE },
  { key: "ready_to_send", label: "Ready to Send", winProbability: 20, tone: { pill: "bg-indigo-100 text-indigo-600", dot: "bg-indigo-600", text: "text-indigo-600" } },
  { key: "quoted", label: "Quoted", winProbability: 30, tone: { pill: "bg-blue-100 text-blue-700", dot: "bg-blue-700", text: "text-blue-700" } },
  { key: "feedback", label: "Feedback", winProbability: 60, tone: { pill: "bg-amber-100 text-amber-600", dot: "bg-amber-600", text: "text-amber-600" } },
  { key: "revised", label: "Revised", winProbability: 50, tone: { pill: "bg-violet-100 text-violet-600", dot: "bg-violet-600", text: "text-violet-600" } },
  { key: "won", label: "Won", winProbability: 100, tone: { pill: "bg-green-100 text-green-600", dot: "bg-green-600", text: "text-green-600" } },
  { key: "lost", label: "Lost", winProbability: 0, tone: { pill: "bg-red-100 text-red-600", dot: "bg-red-600", text: "text-red-600" } },
  { key: "expired", label: "Expired", winProbability: 0, tone: NEUTRAL_STATUS_TONE },
  // Revised as a new quote (QCZ…-R1), which took its place.
  { key: "replaced", label: "Replaced", winProbability: 0, tone: { pill: "bg-slate-200 text-slate-600", dot: "bg-slate-400", text: "text-slate-600" } },
];

export const QUOTE_STATUS_MAP: Record<string, QuoteStatusDef> = Object.fromEntries(
  QUOTE_STATUSES.map((s) => [s.key, s]),
);

// The statuses a quote can be set to. Expired is not one of them: a quote expires by itself when
// its validity date has passed.
export const SETTABLE_QUOTE_STATUSES = ["draft", "ready_to_send", "quoted", "feedback", "revised", "won", "lost"] as const;
export type SettableQuoteStatus = (typeof SETTABLE_QUOTE_STATUSES)[number];

// A quote is open while it is still in play: neither decided (won / lost) nor expired.
export const OPEN_QUOTE_STATUSES: readonly QuoteStatus[] = ["draft", "ready_to_send", "quoted", "feedback", "revised"];

// In these statuses the quote is with the customer and an answer is awaited: the ones a follow-up
// can be recorded on. A quote whose validity has passed is shown as Expired and is not among them.
export const AWAITING_QUOTE_STATUSES: readonly QuoteStatus[] = ["quoted", "feedback"];

// In these statuses the quotation as it stands has not gone to the customer: it was never sent, or
// it was revised or reopened since. Sending it makes the quote Quoted; in any other status it either
// went out already or is closed.
export const UNSENT_QUOTE_STATUSES: readonly QuoteStatus[] = ["draft", "ready_to_send", "revised"];

// In these statuses (as shown) the quote went out to the customer: sent and awaiting an answer, or
// answered (won / lost), or left without one (expired - only a sent quote expires), or revised as a
// new quote after it went out (replaced). The Sales Report counts these: drafts, quotes ready to
// send and revisions not sent yet are not quotes the customer has seen.
export const SENT_QUOTE_STATUSES: readonly QuoteStatus[] = ["quoted", "feedback", "won", "lost", "expired", "replaced"];

export const isSentQuote = (status: string) => (SENT_QUOTE_STATUSES as readonly string[]).includes(status);

// In these statuses (as stored) the quote went out as it stands, or is decided: its buying and
// selling are closed - the server keeps them as they are. New prices for a sent quote are its
// revision, a new quote (QCZ…-R1).
export const PRICING_CLOSED_STATUSES: readonly QuoteStatus[] = ["quoted", "feedback", "won", "lost", "expired", "replaced"];

// The keys of the document that hold a quote's prices: what the server keeps as stored once the
// quote is in one of the statuses above (its PRICING_KEYS).
export const PRICING_KEYS = ["buyingLines", "sellingLines", "currency", "allIn", "road"] as const satisfies readonly (keyof SalesQuoteData)[];

export const LOST_REASONS: Record<string, string[]> = {
  Pricing: ["Price too high", "Competitor cheaper", "Margin too low"],
  Operational: ["Transit time too long", "No suitable schedule", "Capacity unavailable"],
  Customer: ["Shipment canceled", "Customer postponed shipment", "Customer inactive", "No response"],
  Internal: ["Quote sent too late", "Missing follow-up", "Incorrect quotation"],
  Commercial: ["Existing supplier retained", "Lost tender", "Customer chose direct carrier"],
};

export const PACKING_TYPES = ["Pallets", "Colli", "Cartons", "Boxes", "Wooden boxes", "Crates", "Drums"] as const;
export { INCOTERMS } from "@/lib/incoterms";
export const SERVICE_TYPES = ["Air", "Sea FCL", "Sea LCL", "Rail", "Road"] as const;
export const DIRECTIONS = ["Export", "Import"] as const;
export const VALIDITY_OPTIONS = [7, 10, 15, 21, 30] as const;

/** Background class of the win-probability bar. */
export function winProbClass(p: number): string {
  if (p >= 80) return "bg-green-600";
  if (p >= 50) return "bg-amber-600";
  if (p >= 20) return "bg-blue-600";
  return "bg-red-600";
}

/** Statuses before a quote goes to the customer: priced with today's rates, never stored ones. */
export const FX_DRAFT_STATUSES: ReadonlySet<QuoteStatus> = new Set(UNSENT_QUOTE_STATUSES);

/** A quote's rates follow its status: a draft (or one reopened for revision) carries none. */
export function withFxRule(data: SalesQuoteData): SalesQuoteData {
  return data.fx && FX_DRAFT_STATUSES.has(data.quoteStatus ?? "draft") ? { ...data, fx: undefined } : data;
}
