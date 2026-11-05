import type { interfaces } from "@/lib/api/client";
import type { Tone } from "@/components/Badge";

// Kept in step with the API's unions: `satisfies` fails the build when a value is not one of them.
export const CUSTOMER_STATUSES = ["Active", "Prospect", "Inactive"] as const satisfies readonly interfaces.CustomerStatus[];

export const CUSTOMER_LABELS = ["KEY ACCOUNT", "STANDARD", "TARGET CUSTOMER", "RISK"] as const satisfies readonly interfaces.CustomerLabel[];

export const PAYMENT_TERMS = ["PREPAYMENT", "7 days", "14 days", "30 days", "45 days", "60 days"] as const;

export const CONTACT_ROLES = [
  "Purchasing / Procurement",
  "Customer Service",
  "Logistics Manager",
  "Warehouse",
  "Finance / Accounting",
  "Sales",
  "Management",
  "Owner",
  // A supplier's people.
  "Dispatch / Operations",
  "Claims",
  "Pricing / Tariffs",
  "Accounts payable",
] as const satisfies readonly interfaces.ContactRole[];

export const DOCUMENT_TYPES = [
  "Contract",
  "NDA",
  "Power of attorney",
  "Customs",
  "Carrier liability insurance",
  "Transport licence",
  "Framework agreement",
  "Certificate",
  "Other",
] as const satisfies readonly interfaces.DocumentType[];

/** A supplier's papers: each is valid to a date, asked for when it is filed. */
export const DATED_DOCUMENT_TYPES: readonly interfaces.DocumentType[] = ["Carrier liability insurance", "Transport licence", "Framework agreement", "Certificate"];

export const ADDRESS_TYPES = ["Registered", "Billing", "Paperwork", "Pickup", "Delivery", "Warehouse"] as const satisfies readonly interfaces.AddressType[];

export const NOTE_TYPES = ["Note", "Email", "Call", "Follow-up", "Visit"] as const satisfies readonly interfaces.NoteType[];

// What a company is to us; one company can have several roles. A haulier is a trucking subcontractor, a rail
// operator a supplier whose rail tariffs are kept under Tariffs, a first / last mile haulier a supplier that trucks
// containers between a port or terminal and the customer, a shipping line a supplier of ocean freight, a co-loader a
// consolidator we hand LCL (groupage) cargo to.
const CUSTOMER_ROLES = ["customer", "haulier", "rail_operator", "first_last_mile_haulier", "shipping_line", "co_loader"] as const satisfies readonly interfaces.CustomerRole[];

export const CUSTOMER_ROLE_LABELS: Record<interfaces.CustomerRole, string> = {
  customer: "Customer",
  haulier: "Haulier",
  rail_operator: "Rail operator",
  first_last_mile_haulier: "First / last mile haulier",
  shipping_line: "Shipping line",
  co_loader: "Co-loader",
};

const CUSTOMER_ROLE_OPTIONS = CUSTOMER_ROLES.map((role) => ({ value: role, label: CUSTOMER_ROLE_LABELS[role] }));

/** The roles a user can see and pick: the Haulier role belongs to the Trucking Concept, shown to those who see the concepts. */
export const customerRoleOptions = (canSeeConcepts: boolean) =>
  canSeeConcepts ? CUSTOMER_ROLE_OPTIONS : CUSTOMER_ROLE_OPTIONS.filter((o) => o.value !== "haulier");

export const CUSTOMER_SITE_KINDS = ["loading", "delivery", "both"] as const satisfies readonly interfaces.CustomerSiteKind[];

export const CUSTOMER_SITE_KIND_LABELS: Record<interfaces.CustomerSiteKind, string> = {
  loading: "Loading",
  delivery: "Delivery",
  both: "Loading & delivery",
};



export interface CustomerTab {
  key: string;
  label: string;
}

// The one tab strip of the customer detail (?tab=); every list about a customer lives in exactly one of them.
export const CUSTOMER_DETAIL_TABS: CustomerTab[] = [
  { key: "overview", label: "Overview" },
  { key: "contacts", label: "Contacts" },
  { key: "sites", label: "Sites" },
  { key: "addresses", label: "Addresses" },
  { key: "shipments", label: "Shipments" },
  { key: "quotes", label: "Quotes" },
  { key: "trucking", label: "Trucking" },
  { key: "finance", label: "Finance" },
  { key: "documents", label: "Documents" },
  { key: "communication", label: "Communication" },
];

// Keys of the former standalone section pages, so an old ?tab= value lands on the tab that absorbed it.
export const CUSTOMER_TAB_ALIASES: Record<string, string> = {
  financial: "finance",
  credit: "finance",
  // Payment terms are edited in the Payment terms card on the Finance tab.
  payment: "finance",
};

// A map keyed by an API union, read with a stored string (an older value may be outside the union).
const lookup = <V>(map: Partial<Record<string, V>>, key: string): V | undefined => map[key];

// Account type (label) badge tones (components/Badge.tsx).
const LABEL_TONES: Record<interfaces.CustomerLabel, Tone> = {
  "KEY ACCOUNT": "a",
  STANDARD: "",
  "TARGET CUSTOMER": "i",
  RISK: "r",
};

export function labelTone(label: string): Tone {
  return lookup(LABEL_TONES, label) ?? "";
}

const STATUS_DOT: Record<interfaces.CustomerStatus, string> = {
  Active: "bg-emerald-600",
  Prospect: "bg-indigo-500",
  Inactive: "bg-red-500",
};

// A supplier only shows whether we use it (supplierStatus.ts), in the colours of Active and Inactive.
const SUPPLIER_STATUS_DOT: Record<string, string> = { "In use": "bg-emerald-600", "Not in use": "bg-red-500", "Waiting for approval": "bg-amber-500" };

export function statusDotClass(status: string): string {
  return lookup(STATUS_DOT, status) ?? SUPPLIER_STATUS_DOT[status] ?? "bg-slate-400";
}

// A contact's role, an address's type, a document's type and a site's kind are drawn as one neutral pill
// (Pill tone "slate"); only statuses are coloured.

// Invoice status badge tones (components/Badge.tsx): open in the app's indigo, then red, green and grey.
export const INVOICE_STATUS_TONES: Record<interfaces.InvoiceStatus, Tone> = {
  Open: "i",
  Overdue: "r",
  Paid: "g",
  Credited: "",
};

// antd Tag colours of a note's type, for the Sales follow-up tasks (sales/_components/FollowUpTasksCard.tsx).
const NOTE_TYPE_COLORS: Partial<Record<interfaces.NoteType, string>> = {
  Email: "blue",
  Call: "green",
  "Follow-up": "gold",
  Visit: "purple",
};

export const noteTypeColor = (type: string) => lookup(NOTE_TYPE_COLORS, type) ?? "default";

// Recharts palette of the customer finance charts (theme tokens in styles/globals.css).
export const CHART_COLORS = {
  revenue: "var(--color-chart-revenue)",
  cost: "var(--color-chart-cost)",
  profit: "var(--color-chart-profit)",
  red: "var(--color-chart-red)",
  amber: "var(--color-chart-amber)",
  green: "var(--color-chart-profit)",
  grid: "var(--color-chart-grid)",
  baseline: "var(--color-chart-baseline)",
  axis: "var(--color-chart-axis)",
  label: "var(--color-chart-label)",
  ink: "var(--color-chart-ink)",
  cursor: "var(--color-chart-cursor)",
  cursorLine: "var(--color-chart-cursor-line)",
  dotRing: "var(--color-chart-dot-ring)",
};
