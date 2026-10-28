import type { interfaces } from "@/lib/api/client";

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
] as const satisfies readonly interfaces.ContactRole[];

export const DOCUMENT_TYPES = ["Contract", "NDA", "Power of attorney", "Customs", "Other"] as const satisfies readonly interfaces.DocumentType[];

export const ADDRESS_TYPES = ["Registered", "Billing", "Paperwork", "Pickup", "Delivery", "Warehouse"] as const satisfies readonly interfaces.AddressType[];

export const NOTE_TYPES = ["Note", "Email", "Call", "Follow-up", "Visit"] as const satisfies readonly interfaces.NoteType[];

// What a company is to us; one company can have several roles. A haulier is a trucking subcontractor, a rail
// operator a supplier whose rail tariffs are kept under Tariffs, a first / last mile haulier a supplier that trucks
// containers between a port or terminal and the customer.
export const CUSTOMER_ROLES = ["customer", "haulier", "rail_operator", "first_last_mile_haulier"] as const satisfies readonly interfaces.CustomerRole[];

export const CUSTOMER_ROLE_LABELS: Record<interfaces.CustomerRole, string> = {
  customer: "Customer",
  haulier: "Haulier",
  rail_operator: "Rail operator",
  first_last_mile_haulier: "First / last mile haulier",
};

export const CUSTOMER_ROLE_OPTIONS = CUSTOMER_ROLES.map((role) => ({ value: role, label: CUSTOMER_ROLE_LABELS[role] }));

/** The roles a user can see and pick: the Haulier role belongs to the Trucking Concept, shown to those who see the concepts. */
export const customerRoleOptions = (canSeeConcepts: boolean) =>
  canSeeConcepts ? CUSTOMER_ROLE_OPTIONS : CUSTOMER_ROLE_OPTIONS.filter((o) => o.value !== "haulier");

export const CUSTOMER_SITE_KINDS = ["loading", "delivery", "both"] as const satisfies readonly interfaces.CustomerSiteKind[];

export const CUSTOMER_SITE_KIND_LABELS: Record<interfaces.CustomerSiteKind, string> = {
  loading: "Loading",
  delivery: "Delivery",
  both: "Loading & delivery",
};

export const CUSTOMER_SITE_KIND_COLORS: Record<interfaces.CustomerSiteKind, string> = {
  loading: "blue",
  delivery: "green",
  both: "purple",
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

// Account type (label) badge colours, as Tailwind background + text classes.
const LABEL_CLASSES: Record<interfaces.CustomerLabel, string> = {
  "KEY ACCOUNT": "bg-yellow-100 text-yellow-700",
  STANDARD: "bg-slate-100 text-slate-500",
  "TARGET CUSTOMER": "bg-purple-100 text-purple-700",
  RISK: "bg-red-100 text-red-600",
};

export function labelClass(label: string): string {
  return lookup(LABEL_CLASSES, label) ?? "bg-slate-100 text-slate-500";
}

const STATUS_DOT: Record<interfaces.CustomerStatus, string> = {
  Active: "bg-green-600",
  Prospect: "bg-blue-600",
  Inactive: "bg-red-500",
};

export function statusDotClass(status: string): string {
  return lookup(STATUS_DOT, status) ?? "bg-slate-400";
}

// antd Tag colours for the categorical values of the section; unknown values fall back to "default".
const CONTACT_ROLE_COLORS: Record<interfaces.ContactRole, string> = {
  "Purchasing / Procurement": "purple",
  "Customer Service": "cyan",
  "Logistics Manager": "green",
  Warehouse: "orange",
  "Finance / Accounting": "gold",
  Sales: "blue",
  Management: "magenta",
  Owner: "volcano",
};

const ADDRESS_TYPE_COLORS: Record<interfaces.AddressType, string> = {
  Registered: "blue",
  Billing: "gold",
  Paperwork: "cyan",
  Pickup: "green",
  Delivery: "purple",
  Warehouse: "orange",
};

const DOCUMENT_TYPE_COLORS: Partial<Record<interfaces.DocumentType, string>> = {
  Contract: "blue",
  NDA: "purple",
  "Power of attorney": "gold",
  Customs: "green",
};

export const INVOICE_STATUS_COLORS: Record<interfaces.InvoiceStatus, string> = {
  Open: "blue",
  Overdue: "red",
  Paid: "green",
  Credited: "default",
};

const NOTE_TYPE_COLORS: Partial<Record<interfaces.NoteType, string>> = {
  Email: "blue",
  Call: "green",
  "Follow-up": "gold",
  Visit: "purple",
};

export const contactRoleColor = (role: string) => lookup(CONTACT_ROLE_COLORS, role) ?? "default";
export const addressTypeColor = (type: string) => lookup(ADDRESS_TYPE_COLORS, type) ?? "default";
export const documentTypeColor = (type: string) => lookup(DOCUMENT_TYPE_COLORS, type) ?? "default";
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
