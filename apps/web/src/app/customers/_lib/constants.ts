export const CUSTOMER_STATUSES = ["Active", "Prospect", "Inactive"] as const;

export const CUSTOMER_LABELS = ["KEY ACCOUNT", "STANDARD", "TARGET CUSTOMER", "PROSPECT", "RISK"] as const;

export const PAYMENT_TERMS = ["PREPAYMENT", "7 days", "14 days", "30 days", "45 days", "60 days"] as const;

export const CONTACT_ROLES = ["Sales", "Operations", "Finance"] as const;

export const DOCUMENT_TYPES = ["Contract", "NDA", "Power of attorney", "Customs", "Other"] as const;

export const NOTE_TYPES = ["Note", "Email", "Call", "Follow-up", "Visit"] as const;

export const CURRENCIES = ["EUR", "USD", "CZK", "GBP", "CHF"] as const;

export interface CustomerTab {
  key: string;
  label: string;
}

// The one tab strip of the customer detail (?tab=); every list about a customer lives in exactly one of them.
export const CUSTOMER_DETAIL_TABS: CustomerTab[] = [
  { key: "overview", label: "Overview" },
  { key: "contacts", label: "Contacts" },
  { key: "shipments", label: "Shipments" },
  { key: "quotes", label: "Quotes" },
  { key: "finance", label: "Finance" },
  { key: "documents", label: "Documents" },
  { key: "communication", label: "Communication" },
];

// Keys of the former standalone section pages, so an old ?tab= value lands on the tab that absorbed it.
export const CUSTOMER_TAB_ALIASES: Record<string, string> = {
  financial: "finance",
  credit: "finance",
  // Payment terms are edited in the CRM card on the Overview tab.
  payment: "overview",
};

// Account type (label) badge colours, as Tailwind background + text classes.
const LABEL_CLASSES: Record<string, string> = {
  "KEY ACCOUNT": "bg-yellow-100 text-yellow-700",
  STANDARD: "bg-slate-100 text-slate-500",
  "TARGET CUSTOMER": "bg-purple-100 text-purple-700",
  PROSPECT: "bg-blue-100 text-blue-700",
  RISK: "bg-red-100 text-red-600",
};

export function labelClass(label: string): string {
  return LABEL_CLASSES[label] ?? "bg-slate-100 text-slate-500";
}

const STATUS_DOT: Record<string, string> = {
  Active: "bg-green-600",
  Prospect: "bg-blue-600",
  Inactive: "bg-slate-400",
};

export function statusDotClass(status: string): string {
  return STATUS_DOT[status] ?? "bg-slate-400";
}

// antd Tag colours for the categorical values of the section; unknown values fall back to "default".
export const CONTACT_ROLE_COLORS: Record<string, string> = {
  Sales: "blue",
  Operations: "green",
  Finance: "gold",
};

export const DOCUMENT_TYPE_COLORS: Record<string, string> = {
  Contract: "blue",
  NDA: "purple",
  "Power of attorney": "gold",
  Customs: "green",
};

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  Open: "blue",
  Overdue: "red",
  Paid: "green",
};

export const NOTE_TYPE_COLORS: Record<string, string> = {
  Email: "blue",
  Call: "green",
  "Follow-up": "gold",
  Visit: "purple",
};

// Recharts palette of the customer finance charts.
export const CHART_COLORS = {
  revenue: "#6366f1",
  cost: "#f97316",
  profit: "#16a34a",
  red: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
};
