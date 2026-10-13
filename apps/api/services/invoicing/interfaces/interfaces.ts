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
  fxRate: string;
  fxWeek: string;
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
  fxWeek: string;
  /** exact | older | newest | none */
  fxSource: string;
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

/** One shipment in the "Ready to bill" queue */
export interface BillingQueueItem {
  shipmentId: string;
  /** to_bill | partly_invoiced | invoiced */
  status: string;
  billingCurrency: string;
  /** Ticked selling rows not on an open invoice, at today's rates (an estimate until issued) */
  amountToBill: number;
  rowsToBill: number;
  missingCurrencies: string[];
  invoiceNumbers: string[];
  invoiced: { currency: string; gross: number }[];
}
