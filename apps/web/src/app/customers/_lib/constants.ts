export const CUSTOMER_STATUSES = ["Active", "Prospect", "Inactive"] as const;

export const CUSTOMER_LABELS = ["KEY ACCOUNT", "STANDARD", "TARGET CUSTOMER", "PROSPECT", "RISK"] as const;

export const PAYMENT_TERMS = ["PREPAYMENT", "7 days", "14 days", "30 days", "45 days", "60 days"] as const;

export const CONTACT_ROLES = ["Sales", "Operations", "Finance"] as const;

export const DOCUMENT_TYPES = ["Contract", "NDA", "Power of attorney", "Customs", "Other"] as const;

export const NOTE_TYPES = ["Note", "Email", "Call", "Follow-up", "Visit"] as const;

export const INVOICE_STATUSES = ["Open", "Overdue", "Paid"] as const;

export const TRANSPORT_MODES = ["AIR", "SEA", "ROAD", "RAIL"] as const;
export const SHIPMENT_DIRECTIONS = ["IMPORT", "EXPORT"] as const;

export interface CustomerTab {
  key: string;
  label: string;
}

// The POC's Customer-database sidebar becomes per-route tabs.
export const CUSTOMER_LIST_TABS: CustomerTab[] = [
  { key: "all", label: "All Customers" },
  { key: "active", label: "Active" },
  { key: "prospects", label: "Prospects" },
  { key: "key", label: "Key Accounts" },
  { key: "risk", label: "At Risk" },
];

export const CUSTOMER_DETAIL_TABS: CustomerTab[] = [
  { key: "overview", label: "Overview" },
  { key: "contacts", label: "Contacts" },
  { key: "shipments", label: "Shipments" },
  { key: "quotes", label: "Quotes" },
  { key: "finance", label: "Finance" },
  { key: "documents", label: "Documents" },
  { key: "communication", label: "Communication" },
];

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

export function fmtMoney(n: number | null | undefined, currency = "CZK"): string {
  const v = typeof n === "number" ? n : 0;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`;
}

export function marginPct(revenue: number, profit: number): number {
  if (!revenue) return 0;
  return Math.round((profit / revenue) * 100);
}
