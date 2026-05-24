// Shared enums and constants — used by both backend and frontend
// Copy to apps/web/src/lib/enums.ts at build time or import from shared package

export const ROLES = ["admin", "user"] as const;
export type Role = (typeof ROLES)[number];

export const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CHF", "CNY", "JPY"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const TRADE_DIRECTIONS = ["Import", "Export"] as const;
export type TradeDirection = (typeof TRADE_DIRECTIONS)[number];

export const SHIPMENT_STATUSES = [
  "Billed [IMP]",
  "Billed [EXP]",
  "Delivery Date Pending From Customer [IMP]",
  "Pre-Alert Received - Further Transport To Be Booked [IMP]",
  "Booked For Further Transport [IMP]",
  "All Done - Waiting To Be Shipped [IMP]",
  "All Done - Waiting To Be Shipped [EXP]",
  "Booking Confirmation Pending [IMP]",
  "Booking Confirmation Pending [EXP]",
  "Pick Up Date Pending From Customer [EXP]",
  "Billing [IMP]",
  "Billing [EXP]",
  "Arrival Notice Sent - Waiting For Instructions [IMP]",
  "Customs Clearance Pending [IMP]",
  "Loaded - Customs Clearance In Progress [EXP]",
  "Pre-Alert Sent [EXP]",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const CUSTOMS_STATUSES = [
  "Customs Cleared/Released",
  "Paperwork Verified",
  "Paperwork Verification Pending",
  "Waiting For Commercial Paperwork",
] as const;
export type CustomsStatus = (typeof CUSTOMS_STATUSES)[number];

export const DEPARTMENTS = [
  "Operation Department",
  "Custom Department",
  "Administration Department",
  "Road Department",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const LOAD_TYPES = ["Full Load", "Consolidation", "Customs Clearance"] as const;
export type LoadType = (typeof LOAD_TYPES)[number];

export const BOL_TYPES = ["OBL", "SWB", "TLX", "Express"] as const;
export type BolType = (typeof BOL_TYPES)[number];

export const INVOICE_COST_CATEGORIES = [
  "freight",
  "collection",
  "locals",
  "others",
  "insurance",
  "customs",
] as const;
export type InvoiceCostCategory = (typeof INVOICE_COST_CATEGORIES)[number];

// Status badge colors for the UI
export const STATUS_COLORS: Record<string, string> = {
  "Billed [IMP]": "#4CAF50",
  "Billed [EXP]": "#4CAF50",
  "Delivery Date Pending From Customer [IMP]": "#FFC107",
  "Pre-Alert Received - Further Transport To Be Booked [IMP]": "#FF9800",
  "Booked For Further Transport [IMP]": "#FFD54F",
  "All Done - Waiting To Be Shipped [IMP]": "#2196F3",
  "All Done - Waiting To Be Shipped [EXP]": "#2196F3",
  "Booking Confirmation Pending [IMP]": "#F44336",
  "Booking Confirmation Pending [EXP]": "#F44336",
  "Pick Up Date Pending From Customer [EXP]": "#CE93D8",
  "Billing [IMP]": "#66BB6A",
  "Billing [EXP]": "#66BB6A",
  "Arrival Notice Sent - Waiting For Instructions [IMP]": "#9E9E9E",
  "Customs Clearance Pending [IMP]": "#F48FB1",
  "Loaded - Customs Clearance In Progress [EXP]": "#F48FB1",
  "Pre-Alert Sent [EXP]": "#9CCC65",
};

export const CUSTOMS_STATUS_COLORS: Record<string, string> = {
  "Customs Cleared/Released": "#E8F5E9",
  "Paperwork Verified": "#E8F5E9",
  "Paperwork Verification Pending": "#FFF9C4",
  "Waiting For Commercial Paperwork": "#FFFFFF",
};

export function isCompletedStatus(status: string): boolean {
  return status === "Billed [IMP]" || status === "Billed [EXP]";
}

export function isActiveStatus(status: string): boolean {
  return !isCompletedStatus(status);
}
