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
  payment: "finance",
};

// Account type (label) badge colours.
const LABEL_STYLES: Record<string, { bg: string; text: string }> = {
  "KEY ACCOUNT": { bg: "#fef9c3", text: "#a16207" },
  STANDARD: { bg: "#f1f5f9", text: "#64748b" },
  "TARGET CUSTOMER": { bg: "#f3e8ff", text: "#7e22ce" },
  PROSPECT: { bg: "#dbeafe", text: "#1d4ed8" },
  RISK: { bg: "#fee2e2", text: "#dc2626" },
};

const DEFAULT_LABEL_STYLE = { bg: "#f1f5f9", text: "#64748b" };

export function labelStyle(label: string): { bg: string; text: string } {
  return LABEL_STYLES[label] ?? DEFAULT_LABEL_STYLE;
}

const STATUS_DOT: Record<string, string> = {
  Active: "#16a34a",
  Prospect: "#2563eb",
  Inactive: "#94a3b8",
};

export function statusDotColor(status: string): string {
  return STATUS_DOT[status] ?? "#94a3b8";
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
