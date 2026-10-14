export interface InvoiceCostItem {
  id: string;
  shipmentId: string;
  category: string;
  estQty: string | null;
  estAmount: string | null;
  estCurrency: string;
  realQty: string | null;
  realAmount: string | null;
  realCurrency: string;
  invoiceNumber: string;
  received: boolean;
  vendor: string;
  sortOrder: number;
}

/** Selling cost line of the Costs Breakdown (mockup: #sellTable) */
export interface SellingCostItem {
  id: string;
  shipmentId: string;
  category: string;
  customer: string;
  qty: string | null;
  amount: string | null;
  currency: string;
  invoice: boolean;
  sourceBuyId: string | null;
  sortOrder: number;
}

export interface AdditionalChargeItem {
  id: string;
  shipmentId: string;
  invoiceNumber: string;
  vendor: string;
  description: string;
  estAmount: string | null;
  estCurrency: string;
  realAmount: string | null;
  realCurrency: string;
  sortOrder: number;
}

export interface BillingSettingsItem {
  id: string;
  shipmentId: string;
  billingCurrency: string;
  roe: string;
  quoteRef: string;
}

export interface BillingOverrideItem {
  id: string;
  shipmentId: string;
  rowKey: string;
  billingAmount: string | null;
}

export interface GeneratedInvoiceItem {
  id: string;
  shipmentId: string;
  invoiceNumber: string;
  invoiceType: string;
  billingCurrency: string;
  totalAmount: string;
  createdAt: string;
}

/** Weekly exchange rates (Exchange page); CZK per 1 unit */
export interface ExchangeRateItem {
  id: string;
  week: string;
  validFrom: string;
  validTo: string;
  rateEur: string | null;
  rateUsd: string | null;
  note: string;
}

/** Everything the Costs / Invoicing views of one shipment show */
export interface InvoicingData {
  costs: InvoiceCostItem[];
  sellingCosts: SellingCostItem[];
  additionalCharges: AdditionalChargeItem[];
  billingSettings: BillingSettingsItem | null;
  billingOverrides: BillingOverrideItem[];
  generatedInvoices: GeneratedInvoiceItem[];
}

/** A generated invoice lists the cost lines ("breakdown") or only the total ("total"). */
export type InvoiceType = "breakdown" | "total";

// Write inputs. Amounts are decimal strings ("1250.50"); "" clears an amount.

export interface BuyingCostInput {
  category?: string;
  vendor?: string;
  estQty?: string;
  estAmount?: string;
  estCurrency?: string;
  realQty?: string;
  realAmount?: string;
  realCurrency?: string;
  invoiceNumber?: string;
  received?: boolean;
  sortOrder?: number;
}

/** The older per-category buying cost (one row per category of a shipment). */
export interface CategoryCostInput {
  estAmount?: string;
  estCurrency?: string;
  realAmount?: string;
  realCurrency?: string;
  invoiceNumber?: string;
  vendor?: string;
}

export interface SellingCostInput {
  category?: string;
  customer?: string;
  qty?: string;
  amount?: string;
  currency?: string;
  invoice?: boolean;
  sourceBuyId?: string;
  sortOrder?: number;
}

export interface AdditionalChargeInput {
  invoiceNumber?: string;
  vendor?: string;
  description?: string;
  estAmount?: string;
  estCurrency?: string;
  realAmount?: string;
  realCurrency?: string;
  sortOrder?: number;
}

export interface BillingSettingsInput {
  billingCurrency?: string;
  /** rate of exchange, decimal string */
  roe?: string;
  quoteRef?: string;
}

export interface ExchangeRateInput {
  /** ISO week, e.g. "2026-W36" */
  week: string;
  /** yyyy-mm-dd, Monday of the week */
  validFrom: string;
  /** yyyy-mm-dd, Sunday of the week */
  validTo: string;
  rateEur?: string;
  rateUsd?: string;
  note?: string;
}

export interface ExchangeRatePatch {
  rateEur?: string;
  rateUsd?: string;
  note?: string;
}

/** Line of the Invoicing tab in Customs */
export interface CustomsInvoiceLineItem {
  id: string;
  shipmentId: string;
  category: string;
  currency: string;
  value: string | null;
  sortOrder: number;
}

/** Invoicing tab in Customs: its lines and the one Issued Invoice Number of the shipment */
export interface CustomsInvoicingItem {
  lines: CustomsInvoiceLineItem[];
  issuedInvoiceNumber: string;
}

export interface CustomsInvoiceLineInput {
  category?: string;
  currency?: string;
  value?: string;
  sortOrder?: number;
}
