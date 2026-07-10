import type { ShipmentItem } from "@/hooks/useShipments";
import { getFieldValue } from "@/hooks/useShipments";

export const COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection / Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
] as const;

export interface CostRow {
  category: string;
  label: string;
  estAmount: string;
  estCurrency: string;
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
  vendor: string;
}

export interface ChargeRow {
  id: string;
  description: string;
  estAmount: string;
  estCurrency: string;
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
  vendor: string;
  sortOrder: number;
}

export function parseNum(v: string | null | undefined): number {
  const n = parseFloat(v ?? "");
  return isNaN(n) ? 0 : n;
}

export function fmt(n: number): string {
  return n.toFixed(2);
}

// Formats a number, returning "" for zero so empty cells stay blank.
export function fmtNonEmpty(n: number): string {
  return n ? n.toFixed(2) : "";
}

// The override key for a cost row is its category; for an additional charge it's
// `additional-<id>`. These must match what's persisted in billing_override.rowKey.
export function overrideKeyForCategory(category: string): string {
  return category;
}
export function overrideKeyForCharge(id: string): string {
  return `additional-${id}`;
}

// Billing amount: a manual override wins; otherwise realAmount × ROE.
export function billingAmount(override: string | undefined, realAmount: string, roe: number): number {
  if (override !== undefined && override !== "") return parseNum(override);
  return parseNum(realAmount) * roe;
}

export function billingDisplay(override: string | undefined, realAmount: string, roe: number): string {
  if (override !== undefined && override !== "") return override;
  return fmtNonEmpty(parseNum(realAmount) * roe);
}

// Bill-to party: Shipper for exports, otherwise Consignee (matches the poc).
export function resolveBilledParty(shipment: ShipmentItem | undefined): string {
  if (!shipment) return "";
  const isExport = getFieldValue(shipment, "tradeDirection").toLowerCase().includes("exp");
  return getFieldValue(shipment, isExport ? "shipper" : "consignee");
}
