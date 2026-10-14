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
  /** VAT code on the invoice; null = default by trade direction */
  vatCode: string | null;
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

/** VAT code a selling line can be set to; "NP" is only ever derived, never chosen. */
export type SellingVatCode = "S21" | "Z69" | "RC" | "OUT";

export interface SellingCostInput {
  category?: string;
  customer?: string;
  qty?: string;
  amount?: string;
  currency?: string;
  invoice?: boolean;
  sourceBuyId?: string;
  sortOrder?: number;
  /** VAT code on the invoice; "" = default by trade direction */
  vatCode?: SellingVatCode | "";
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

/** Issuer details printed on invoices (Settings → Organization → Invoicing details) */
export interface InvoiceProfileItem {
  companyName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  ico: string;
  dic: string;
  vatPayer: boolean;
  registerEntry: string;
  email: string;
  phone: string;
  web: string;
  logoData: string;
  bankAccounts: {
    currency: string;
    bankName: string;
    accountNumber: string;
    iban: string;
    swift: string;
  }[];
  defaultDueDays: number;
  footerNote: string;
  /** What must still be filled in before an invoice can be issued; empty = ready. */
  missingForIssue: string[];
}

/** One line of an issued invoice / credit note, or of a preview */
export interface InvoiceDocLineItem {
  description: string;
  qty: string;
  unitPrice: string;
  unitCurrency: string;
  /** Line total in the invoice currency */
  net: string;
  vatCode: string;
  vatRate: string;
  sourceSellingCostId: string | null;
}

export interface InvoiceVatSummaryItem {
  vatCode: string;
  vatRate: number;
  base: number;
  vat: number;
  baseCzk: number;
  vatCzk: number;
}

/** Party details printed on the invoice (snapshot taken when it was issued) */
export interface InvoicePartyItem {
  companyName: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  ico: string;
  dic: string;
}

/** An issued invoice or credit note (immutable) */
export interface InvoiceDocItem {
  id: string;
  shipmentId: string;
  /** invoice | credit_note */
  kind: string;
  /** issued | credited */
  status: string;
  number: string;
  correctsInvoiceId: string | null;
  creditReason: string;
  customerId: string;
  issueDate: string;
  duzp: string;
  dueDate: string;
  currency: string;
  /** Statutory ČNB rate on the DUZP, CZK per 1 unit of the invoice currency */
  fxRate: string;
  /** Older invoices: the weekly-sheet week; "" for ČNB-rated ones */
  fxWeek: string;
  /** The ČNB fixing the rate came from (null on older invoices) */
  fxFixingDate: string | null;
  /** Company ROE % applied to lines in another currency (null on older invoices) */
  roePct: string | null;
  net: string;
  vat: string;
  gross: string;
  netCzk: string;
  vatCzk: string;
  grossCzk: string;
  vatSummary: InvoiceVatSummaryItem[];
  supplier: InvoicePartyItem;
  customer: InvoicePartyItem;
  jobNumber: string;
  note: string;
  hasPdf: boolean;
  createdAt: string;
  lines: InvoiceDocLineItem[];
}

/** What issuing would produce right now - no number yet, nothing stored */
export interface InvoicePreviewItem {
  customerId: string | null;
  customer: InvoicePartyItem | null;
  issueDate: string;
  duzp: string;
  dueDate: string;
  currency: string;
  fxRate: number;
  /** The ČNB fixing valid on the DUZP (null when there is none yet) */
  fxFixingDate: string | null;
  /** Company ROE % on the DUZP, applied to lines in another currency */
  roePct: number;
  net: number;
  vat: number;
  gross: number;
  netCzk: number;
  vatCzk: number;
  grossCzk: number;
  vatSummary: InvoiceVatSummaryItem[];
  lines: InvoiceDocLineItem[];
  /** Everything that blocks issuing; empty = ready to issue */
  problems: string[];
}

/** One shipment in the Invoicing queue */
export interface BillingQueueItem {
  shipmentId: string;
  jobNumber: string;
  customer: string;
  shipper: string;
  consignee: string;
  tradeDirection: string;
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  /** Shipment Status, e.g. "Billing [IMP]" (set by operations) */
  shipmentStatus: string;
  /** Invoiced | Not Invoiced */
  invoicingStatus: string;
  /** From the selling lines: to_bill | partly_invoiced | invoiced | none (no selling lines ticked) */
  billingState: string;
  billingCurrency: string;
  /** Ticked selling rows not on an open invoice, at today's rates (an estimate until issued) */
  amountToBill: number;
  rowsToBill: number;
  missingCurrencies: string[];
  invoiceNumbers: string[];
  invoiced: { currency: string; gross: number }[];
}

/** Number of shipments in each queue view */
export interface BillingQueueCounts {
  toBill: number;
  notInvoiced: number;
  invoiced: number;
}
