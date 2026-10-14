// A "sales quote" is stored in the shared `quote` table: quoteNumber = reference (QCZ…),
// and all rich fields live in the `data` jsonb blob shaped like SalesQuoteData.

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

export interface CostLine {
  type: string;
  description: string;
  supplier?: string;
  currency: string;
  amount: number;
  value?: number;
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
  kind?: "status" | "validity" | "owner" | "follow_up" | "shipment" | "deleted";
  status?: string;
  at: string;
  // Display name of who made the change. Entries written before names were recorded say "You".
  user?: string;
  userId?: string;
  // On a validity or owner line the whole sentence: "Valid until 2026-10-25 (was 2026-10-20)".
  comment?: string;
  lostReason?: string;
  // The status before: on a Won the system made, and on a line by which a quote left a status
  // that proves it was sent while no sent date says so.
  from?: string;
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
] as const satisfies readonly (keyof SalesQuoteData)[];

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
  pickup?: string;
  delivery?: string;
  // Cargo
  commodity?: string;
  stackable?: boolean;
  dangerous?: boolean;
  packages?: PackageLine[];
  weight?: number;
  cbm?: number;
  // Pricing
  buyingLines?: CostLine[];
  sellingLines?: CostLine[];
  // The currency the quote is presented in (EUR when empty); each line keeps its own.
  currency?: string;
  // The quote's own snapshot of the rates its lines are converted with, by currency, so a quote
  // that was sent does not change when next week's Exchange sheet is entered.
  rates?: Record<string, QuoteRate>;
  // Shipping terms
  shippingTerms?: string; // name of a terms_condition template
  shippingIncludes?: string;
  shippingExcludes?: string;
  // The former "Additional conditions / notes" box: no longer entered, shown or printed. Text
  // typed before stays stored.
  shippingTermsNotes?: string;
  // Lifecycle - written by the server only (PROTECTED_KEYS). These keys mirror the facts the
  // server keeps, for whoever reads the document: lists, the printed quotation.
  quoteStatus?: string; // draft / ready_to_send / quoted / feedback / revised / won / lost / expired
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

export interface QuoteStatusDef {
  key: string;
  label: string;
  winProbability: number;
  color: { bg: string; text: string };
}

// How each status is shown. Which status may follow which is the server's rule: every quote
// comes with the statuses it may be set to (allowedTransitions).
export const QUOTE_STATUSES: QuoteStatusDef[] = [
  { key: "draft", label: "Draft", winProbability: 10, color: { bg: "#f1f5f9", text: "#64748b" } },
  { key: "ready_to_send", label: "Ready to Send", winProbability: 20, color: { bg: "#e0e7ff", text: "#4f46e5" } },
  { key: "quoted", label: "Quoted", winProbability: 30, color: { bg: "#dbeafe", text: "#1d4ed8" } },
  { key: "feedback", label: "Feedback", winProbability: 60, color: { bg: "#fef3c7", text: "#d97706" } },
  { key: "revised", label: "Revised", winProbability: 50, color: { bg: "#ede9fe", text: "#7c3aed" } },
  { key: "won", label: "Won", winProbability: 100, color: { bg: "#dcfce7", text: "#16a34a" } },
  { key: "lost", label: "Lost", winProbability: 0, color: { bg: "#fee2e2", text: "#dc2626" } },
  { key: "expired", label: "Expired", winProbability: 0, color: { bg: "#f1f5f9", text: "#64748b" } },
];

export const QUOTE_STATUS_MAP: Record<string, QuoteStatusDef> = Object.fromEntries(
  QUOTE_STATUSES.map((s) => [s.key, s]),
);

// The statuses a quote can be set to. Expired is not one of them: a quote expires by itself when
// its validity date has passed.
export const SETTABLE_QUOTE_STATUSES = ["draft", "ready_to_send", "quoted", "feedback", "revised", "won", "lost"] as const;
export type SettableQuoteStatus = (typeof SETTABLE_QUOTE_STATUSES)[number];

// A quote is open while it is still in play: neither decided (won / lost) nor expired.
export const OPEN_QUOTE_STATUSES = ["draft", "ready_to_send", "quoted", "feedback", "revised"];

// In these statuses the quote is with the customer and an answer is awaited: the ones a follow-up
// can be recorded on. A quote whose validity has passed is shown as Expired and is not among them.
export const AWAITING_QUOTE_STATUSES = ["quoted", "feedback"];

// In these statuses the quotation as it stands has not gone to the customer: it was never sent, or
// it was revised or reopened since. Sending it makes the quote Quoted; in any other status it either
// went out already or is closed.
export const UNSENT_QUOTE_STATUSES = ["draft", "ready_to_send", "revised"];

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

export const COST_LINE_TYPES = [
  "Ocean freight",
  "Air freight",
  "Rail freight",
  "Road freight",
  "Documentation",
  "THC Origin",
  "THC Destination",
  "Customs clearance",
  "Handling",
  "Delivery",
  "Pickup",
  "Insurance",
  "Inspection",
  "Storage",
  "Demurrage",
  "Other",
] as const;

export function winProbColor(p: number): string {
  if (p >= 80) return "#16a34a";
  if (p >= 50) return "#d97706";
  if (p >= 20) return "#2563eb";
  return "#dc2626";
}

/** Statuses before a quote goes to the customer: priced with today's rates, never stored ones. */
export const FX_DRAFT_STATUSES: ReadonlySet<string> = new Set(UNSENT_QUOTE_STATUSES);

/** A quote's rates follow its status: a draft (or one reopened for revision) carries none. */
export function withFxRule(data: SalesQuoteData): SalesQuoteData {
  return data.fx && FX_DRAFT_STATUSES.has(data.quoteStatus ?? "draft") ? { ...data, fx: undefined } : data;
}
