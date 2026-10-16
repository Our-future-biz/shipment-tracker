export interface InvoiceCostItem {
  id: string;
  shipmentId: string;
  category: string;
  description: string;
  estQty: string | null;
  estAmount: string | null;
  estCurrency: string;
  realQty: string | null;
  realAmount: string | null;
  realCurrency: string;
  /** what the quantity counts ("km", "pallet"); "" = a charge counted as a whole */
  unit: string;
  invoiceNumber: string;
  received: boolean;
  vendor: string;
  /** the haulier the cost is owed to (a Customer Database company), or null */
  haulierId: string | null;
  sortOrder: number;
  /** The Trucking consignment / trip the row was pushed from ("trucking:trip:<id>"); null otherwise. Read-only then. */
  sourceTruckingRef: string | null;
}

/** Selling cost line of the Costs Breakdown (mockup: #sellTable) */
export interface SellingCostItem {
  id: string;
  shipmentId: string;
  category: string;
  description: string;
  customer: string;
  qty: string | null;
  amount: string | null;
  currency: string;
  invoice: boolean;
  sourceBuyId: string | null;
  /** VAT code on the invoice; null = default by trade direction */
  vatCode: SellingVatCode | null;
  sortOrder: number;
  /** The Trucking consignment the row was pushed from ("trucking:consignment:<id>"); null otherwise. Read-only then. */
  sourceTruckingRef: string | null;
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
  /** the charge code (apps/api/lib/chargeCodes.ts); a label is stored as its code */
  category?: string;
  /** what is charged, in words (from the quote) */
  description?: string;
  vendor?: string;
  estQty?: string;
  estAmount?: string;
  estCurrency?: string;
  realQty?: string;
  realAmount?: string;
  realCurrency?: string;
  /** what the quantity counts ("km", "pallet") */
  unit?: string;
  invoiceNumber?: string;
  received?: boolean;
  /** a Customer Database company id; "" clears it */
  haulierId?: string;
  sortOrder?: number;
}

/** A shipment and its weight in a split (freight tons, or any measure the split goes by). */
export interface CostSplitLine {
  shipmentId: string;
  weight: number;
}

/** A shipment's real cost that a split would replace. */
export interface CostSplitExisting {
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
}

/** One vendor invoice to split over shipments by weight (e.g. a master job's freight tons). */
export interface CostSplitInput {
  /** the charge code the parts are posted under */
  category: string;
  /** the invoice total, a decimal string ("1250.50") */
  total: string;
  currency: string;
  invoiceNumber: string;
  lines: CostSplitLine[];
  /** shipments whose real cost of the code is replaced; the others keep theirs */
  overwriteShipmentIds?: string[];
  /** only answer the split, write nothing */
  dryRun?: boolean;
}

/** A shipment's part of a split cost. */
export interface CostSplitResultLine {
  shipmentId: string;
  /** its part ("33.34"); null for a shipment of weight 0, which gets nothing */
  amount: string | null;
  /** the real cost the shipment already has under the code */
  existing: CostSplitExisting | null;
  /** the part was posted to the shipment */
  written: boolean;
}

/** A buying cost posted by its charge code (one line per code of a shipment). */
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

/** VAT code of an invoice line: the ones a line can be set to, or NP (issuer not a VAT payer). */
export type VatCode = SellingVatCode | "NP";

/** A tax document is an invoice or a credit note that reverses one. */
export type InvoiceDocKind = "invoice" | "credit_note";

/** issued; an invoice reversed by a credit note becomes credited */
export type InvoiceDocStatus = "issued" | "credited";

/** Views of the Invoicing queue: to_bill (Shipment Status Billing) | not_invoiced | invoiced (Invoicing Status) */
export type QueueView = "to_bill" | "not_invoiced" | "invoiced";

/** Where a shipment stands with its ticked selling rows */
export type BillingState = "to_bill" | "partly_invoiced" | "invoiced" | "none";

export interface SellingCostInput {
  category?: string;
  /** what is charged, in words (from the quote); the printed line text is `customer` ("Invoice text") */
  description?: string;
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
  vatCode: VatCode;
  vatRate: string;
  sourceSellingCostId: string | null;
}

export interface InvoiceVatSummaryItem {
  vatCode: VatCode;
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
  kind: InvoiceDocKind;
  status: InvoiceDocStatus;
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
  /** From the selling lines; none = no selling lines ticked */
  billingState: BillingState;
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

/** One job in the job-profit report (CZK at the month's fixed ČNB average) */
export interface JobProfitRow {
  shipmentId: string;
  jobNumber: string;
  customer: string;
  freightMode: string;
  status: string;
  direction: "import" | "export";
  basis: "ata" | "atd" | "eta" | "etd" | "delivery" | "planned delivery";
  date: string;
  month: string;
  provisional: boolean; // dated by ETA / ETD, not yet by the tax date
  revenueCzk: number;
  costCzk: number;
  profitCzk: number;
  unconverted: string[]; // currencies left out (no average for that month)
}

/** A month of the job-profit report */
export interface MonthSummary {
  month: string;
  jobs: number;
  revenueCzk: number;
  costCzk: number;
  profitCzk: number;
  /** The month's average is final (month ended); else provisional */
  final: boolean;
  /** EUR and USD averages, for reference */
  averages: { currency: string; average: number }[];
}

/** Job revenue, cost and profit in CZK per month (Shipment Reports) */
export interface JobProfitReport {
  from: string;
  to: string;
  rows: JobProfitRow[];
  months: MonthSummary[];
  /** Jobs with neither ATA/ATD nor ETA/ETD — not in any period */
  undated: number;
}

/** Which side of the Costs Breakdown gets a quote's lines. */
export type QuoteImportTarget = "buy" | "sell" | "both";

/** How many rows a copy from a quote added to each side. */
export interface QuoteImportResult {
  buying: number;
  selling: number;
}

/** A cost line pushed by Trucking (a price line of a consignment or a trip). */
export interface TruckingCostLine {
  /** Charge code, "road_freight" (surcharges too, told apart by the description) */
  chargeCode: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  /** qty × unitPrice as Trucking priced it */
  amount: number;
  currency: string;
  /** Buying lines: the haulier's name and Customer Database id */
  vendor: string;
  haulierId: string | null;
  /**
   * Buying lines whose real cost is known when pushed (Trucking's internal line): the real amount
   * per unit and the document number (the internal statement); left out = the real side stays open.
   */
  realAmount?: number;
  invoiceNumber?: string;
}

/** What a Trucking push did to Costs Breakdown. */
/** A difference line of a kept selling set: "Price change after invoice" (decision 9). */
export interface TruckingSellingDifference {
  /** "trucking:consignment:<id>:diff:<n>" */
  sourceRef: string;
  currency: string;
  /** Signed: negative when the price went down (a credit is owed) */
  amount: number;
}

export interface TruckingLinesResult {
  buying: number;
  selling: number;
  /** Selling rows of the sourceRef left as they were because one of them is on an issued invoice */
  sellingKept: number;
  /** When kept: every live difference line of the set (those this push added included); [] otherwise */
  differences: TruckingSellingDifference[];
}

/** The real cost of one Trucking buying row, from an approved haulier invoice (rows in their order). */
export interface TruckingRealLine {
  /** The row's description, when Trucking names it (matched first; else by position) */
  description?: string;
  amount: number;
  currency: string;
  /** The haulier's invoice number */
  invoiceNumber: string;
}

/** What a real-cost push did: the number of rows whose real side was set (or cleared). */
export interface TruckingRealResult {
  updated: number;
}
