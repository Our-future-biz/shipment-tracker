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

/** Selling costs z Costs Breakdownu (mockup: #sellTable) */
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

/** Kurzovni listek s tydenni platnosti (stranka Exchange) */
export interface ExchangeRateItem {
  id: string;
  week: string;
  validFrom: string;
  validTo: string;
  rateEur: string | null;
  rateUsd: string | null;
  note: string;
}
