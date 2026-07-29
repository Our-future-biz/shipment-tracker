// A "sales quote" is stored in the shared `quote` table: quoteNumber = reference (QCZ…),
// and all rich fields live in the `data` jsonb blob shaped like SalesQuoteData.

export interface PackageLine {
  qty: number;
  type: string;
  length: number;
  width: number;
  height: number;
  weight: number;
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

export interface TimelineEntry {
  status: string;
  substatus?: string;
  at: string;
  user?: string;
  comment?: string;
  lostReason?: string;
}

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
  currency?: string;
  // Shipping terms
  shippingTerms?: string; // name of a terms_condition template
  shippingIncludes?: string;
  shippingExcludes?: string;
  shippingTermsNotes?: string;
  // Lifecycle
  quoteStatus?: string; // draft / ready_to_send / quoted / feedback / revised / won / lost / expired
  substatus?: string;
  lostReason?: string;
  lostComment?: string;
  validityDays?: number;
  validUntil?: string; // explicit expiry date (YYYY-MM-DD) picked from the calendar
  winProbability?: number;
  sentAt?: string;
  timeline?: TimelineEntry[];
}

export interface QuoteStatusDef {
  key: string;
  label: string;
  winProbability: number;
  color: { bg: string; text: string };
  next: string[];
}

export const QUOTE_STATUSES: QuoteStatusDef[] = [
  { key: "draft", label: "Draft", winProbability: 10, color: { bg: "#f1f5f9", text: "#64748b" }, next: ["ready_to_send", "lost"] },
  { key: "ready_to_send", label: "Ready to Send", winProbability: 20, color: { bg: "#e0e7ff", text: "#4f46e5" }, next: ["quoted", "draft", "lost"] },
  { key: "quoted", label: "Quoted", winProbability: 30, color: { bg: "#dbeafe", text: "#1d4ed8" }, next: ["feedback", "revised", "won", "lost"] },
  { key: "feedback", label: "Feedback", winProbability: 60, color: { bg: "#fef3c7", text: "#d97706" }, next: ["revised", "won", "lost", "quoted"] },
  { key: "revised", label: "Revised", winProbability: 50, color: { bg: "#ede9fe", text: "#7c3aed" }, next: ["quoted", "won", "lost"] },
  { key: "won", label: "Won", winProbability: 100, color: { bg: "#dcfce7", text: "#16a34a" }, next: [] },
  { key: "lost", label: "Lost", winProbability: 0, color: { bg: "#fee2e2", text: "#dc2626" }, next: ["draft"] },
  { key: "expired", label: "Expired", winProbability: 0, color: { bg: "#f1f5f9", text: "#64748b" }, next: ["draft", "revised"] },
];

export const QUOTE_STATUS_MAP: Record<string, QuoteStatusDef> = Object.fromEntries(
  QUOTE_STATUSES.map((s) => [s.key, s]),
);

export const FEEDBACK_SUBSTATUSES = [
  "Under Review",
  "Negotiation",
  "Waiting for Customer",
  "Rate Revision Requested",
] as const;

export const LOST_REASONS: Record<string, string[]> = {
  Pricing: ["Price too high", "Competitor cheaper", "Margin too low"],
  Operational: ["Transit time too long", "No suitable schedule", "Capacity unavailable"],
  Customer: ["Shipment canceled", "Customer postponed shipment", "Customer inactive", "No response"],
  Internal: ["Quote sent too late", "Missing follow-up", "Incorrect quotation"],
  Commercial: ["Existing supplier retained", "Lost tender", "Customer chose direct carrier"],
};

export const PACKING_TYPES = ["Pallets", "Colli", "Cartons", "Boxes", "Wooden boxes", "Crates", "Drums"] as const;
export const INCOTERMS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"] as const;
export const SERVICE_TYPES = ["Air", "Sea FCL", "Sea LCL", "Rail", "Road"] as const;
export const DIRECTIONS = ["Export", "Import"] as const;
export const CURRENCIES = ["EUR", "USD", "CZK", "GBP", "CHF"] as const;
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
