import type { MaxLen } from "encore.dev/validate";

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
  /** when Received was ticked (ISO), null while not received */
  receivedAt: string | null;
  /** the day the received invoice was paid (yyyy-mm-dd), "" while unpaid */
  paidOn: string;
  /** who noted it paid (e-mail) and when (ISO); "" / null while unpaid or for a payment noted before they were kept */
  paidBy: string;
  paidAt: string | null;
  vendor: string;
  /** the haulier the cost is owed to (a Customer Database company), or null */
  haulierId: string | null;
  /** the supplier `vendor` names when it was picked from the Customer Database; null for a vendor only typed */
  supplierCustomerId: string | null;
  sortOrder: number;
  /** The Trucking consignment / trip the row was pushed from ("trucking:trip:<id>"); null otherwise. Read-only then. */
  sourceTruckingRef: string | null;
  /** The master job's line this row is the shipment's share of ("master:<id>:<line>"); null for others. Read-only. */
  sourceMasterJobRef: string | null;
  /** The sales quote the row was copied from; "" for a row entered by hand. Its category, description and estimate are the quote's then, and it is not deleted. */
  sourceQuoteNumber: string;
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

/** The sales quote the costs were copied from (the billing settings' quoteRef), as the Quote card of Shipment Details shows it. */
export interface CostsQuoteItem {
  quoteNumber: string;
  validUntil: string | null;
  /** The quote's owner, who sold the shipment: their e-mail (as SalesQuoteItem.ownerName). */
  ownerName: string;
}

/** Everything the Costs / Invoicing views of one shipment show */
export interface InvoicingData {
  costs: InvoiceCostItem[];
  sellingCosts: SellingCostItem[];
  additionalCharges: AdditionalChargeItem[];
  billingSettings: BillingSettingsItem | null;
  billingOverrides: BillingOverrideItem[];
  generatedInvoices: GeneratedInvoiceItem[];
  /** Null when the costs were copied from no sales quote, or it could not be read. */
  costsQuote: CostsQuoteItem | null;
}

/** A generated invoice lists the cost lines ("breakdown") or only the total ("total"). */
export type InvoiceType = "breakdown" | "total";

// Write inputs. Amounts are decimal strings ("1250.50"); "" clears an amount.

export interface BuyingCostInput {
  /** the charge code (apps/api/lib/chargeCodes.ts); a label is stored as its code */
  category?: string;
  /** what is charged, in words (from the quote) */
  description?: string;
  vendor?: string & MaxLen<300>;
  /** the Customer Database supplier the vendor names; "" clears it (a vendor typed by hand) */
  supplierCustomerId?: string;
  /** the day the received invoice was paid, yyyy-mm-dd; "" takes it back */
  paidOn?: string;
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
  /** who issued the invoice, recorded on each part; left as it is when not given */
  vendor?: string;
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
  vendor?: string & MaxLen<300>;
}

/** VAT code a selling line can be set to; "NP" is only ever derived, never chosen. */
export type SellingVatCode = "S21" | "Z69" | "RC" | "OUT";

/** VAT code of an invoice line: the ones a line can be set to, or NP (issuer not a VAT payer). */
export type VatCode = SellingVatCode | "NP";

/** A tax document is an invoice or a credit note that reverses one. */
export type InvoiceDocKind = "invoice" | "credit_note";

/** issued; an invoice reversed by a credit note becomes credited */
export type InvoiceDocStatus = "issued" | "credited";

/** Views of the Invoicing queue: all (released for billing or invoiced, not cancelled) | to_bill (Shipment Status Billing, not invoiced yet) | not_invoiced | invoiced (Invoicing Status) */
export type QueueView = "all" | "to_bill" | "not_invoiced" | "invoiced" | "unbilled_arrivals";

/** Where a shipment stands with its ticked selling rows */
export type BillingState = "to_bill" | "partly_invoiced" | "invoiced" | "none";

export interface SellingCostInput {
  category?: string;
  /** what is charged, in words (from the quote), shown as "Invoice text": the printed line text unless `customer` holds a text of its own set in Issue invoice */
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
  /** What the user should know before issuing, without blocking it (e.g. no bank account in the currency) */
  warnings: string[];
}

/** One shipment in the Invoicing queue */
export interface BillingQueueItem {
  shipmentId: string;
  jobNumber: string;
  customer: string;
  shipper: string;
  consignee: string;
  /** The customer's record in the Customer Database; null when the name was only typed */
  customerId: string | null;
  /** Owning department ("Operation Department", …): colours the Internal Reference as on Shipments */
  department: string;
  /** House / Master BoL type: an OBL shows the whole row in red, as on Shipments */
  houseBolType: string;
  masterBolType: string;
  tradeDirection: string;
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  /**
   * DUZP as the job detail shows it: that of the newest open invoice, else the default the next
   * invoice would get (ATA / ETA for imports, ATD / ETD for exports, delivery for road jobs, else today).
   */
  duzp: string;
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
  /** Selling lines of the job (with a value), and how many of them are on an open invoice */
  sellingLines: number;
  invoicedLines: number;
}

/** Number of shipments in each queue view */
export interface BillingQueueCounts {
  all: number;
  toBill: number;
  notInvoiced: number;
  invoiced: number;
  /** Their tax date has passed, not released for billing yet, not invoiced. */
  unbilledArrivals: number;
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

/** A side of Costs Breakdown. */
export type CostSide = "buying" | "selling";

/** How many rows a copy from a quote added to each side. */
export interface QuoteImportResult {
  buying: number;
  selling: number;
  /** The sides left as they were because they hold rows of the quote already (not copied again). */
  alreadyCopied?: CostSide[];
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

/** A job and the ČNB rates it is valued at (CZK per 1 unit). */
export interface JobCostInput {
  shipmentId: string;
  rates: { currency: string; rate: number }[];
}

/** A job's revenue, cost and profit as Costs Breakdown works them out (lib/jobCostTotals). */
export interface ShipmentCostTotals {
  shipmentId: string;
  /** In CZK; null when an amount (or the billing currency) has no rate. */
  revenueCzk: number | null;
  costCzk: number | null;
  profitCzk: number | null;
  /** In the asked currency at the job's rate; null also when that currency has no rate. */
  revenue: number | null;
  cost: number | null;
  profit: number | null;
  /** Currencies without a rate that made the totals unknown. */
  missingCurrencies: string[];
}

// ─── Master job costs ──────────────────────────────────────────────

export type MasterJobSplitMethod = "wm" | "shipment";

/** A buying cost of a whole master job, shared out over its shipments. */
export interface MasterJobCostItem {
  id: string;
  masterJobId: string;
  category: string;
  description: string;
  vendor: string;
  estQty: string | null;
  estAmount: string | null;
  estCurrency: string;
  realQty: string | null;
  realAmount: string | null;
  realCurrency: string;
  invoiceNumber: string;
  received: boolean;
  /** "wm": by each shipment's freight tons; "shipment": the same part for each */
  splitMethod: MasterJobSplitMethod;
  /** Whether the line is shared out: without it the cost stays on the master job and no shipment carries a part */
  inSplit: boolean;
  /** The shipments taken out of this line's split: the line is shared out over the others */
  excludedShipmentIds: string[];
  sortOrder: number;
}

/** A shipment of the master job as the split sees it. */
export interface MasterJobHouseItem {
  shipmentId: string;
  jobNumber: string;
  /** W/M: the greater of tons and cbm (cargo dimensions, else the typed totals) */
  freightTon: number;
}

/** One shipment's part of a line: totals in the line's currencies; null where the line has no amount. */
export interface MasterJobShareItem {
  lineId: string;
  shipmentId: string;
  est: string | null;
  real: string | null;
}

/** Real − estimated buying cost: above 0 the cost came out higher than estimated (Profit Burning). */
export interface MasterJobVsEstimateItem {
  delta: number;
  /** The line's currency, or CZK (at today's ČNB rate) when its estimate and real cost differ in it */
  currency: string;
}

/** How the shipments stand against the split as it is now. */
export interface MasterJobSplitState {
  /** How many share rows the shipments' Costs Breakdowns carry */
  written: number;
  /** Whether those rows are exactly the split below: when not, processing it would change them */
  inSync: boolean;
}

/** The master job's Costs Breakdown: its lines, its shipments and the split as it stands now. */
export interface MasterJobCostsView {
  lines: MasterJobCostItem[];
  houses: MasterJobHouseItem[];
  /** What each shipment gets when the split is processed; `split` says whether they carry it yet */
  shares: MasterJobShareItem[];
  split: MasterJobSplitState;
  /** Each line against its estimate, by line id; a line without both (or without a rate) is left out */
  vsEstimate: Record<string, MasterJobVsEstimateItem>;
  /** The whole master job against its estimates; null without a comparison */
  totalVsEstimate: MasterJobVsEstimateItem | null;
}

export interface MasterJobCostInput {
  category?: string;
  description?: string;
  vendor?: string;
  estQty?: string;
  estAmount?: string;
  estCurrency?: string;
  realQty?: string;
  realAmount?: string;
  realCurrency?: string;
  invoiceNumber?: string;
  received?: boolean;
  splitMethod?: MasterJobSplitMethod;
  inSplit?: boolean;
  sortOrder?: number;
}

export interface MasterJobCostUpdate extends MasterJobCostInput {
  /** The shipments to leave out of this line's split, all of them: at least one shipment stays in */
  excludedShipmentIds?: string[];
}

/**
 * A buying cost line of a shipment's Costs Breakdown owed to a supplier and not yet paid (Council Outlay 7,
 * step 6b "What we owe"): linked to the supplier's company, entered here (Trucking's and a master job's rows
 * are left out: Trucking's money is in its haulier invoices). Amounts are as typed in Costs Breakdown.
 */
export interface SupplierCostLine {
  id: string;
  shipmentId: string;
  jobNumber: string;
  category: string;
  description: string;
  invoiceNumber: string;
  /**
   * owed: received, and since when is known. expected: not received yet. untracked: ticked Received before
   * that day was kept (before payments were noted here), so it may have been paid already: listed, not counted (K2).
   */
  kind: "owed" | "expected" | "untracked";
  /** when Received was ticked (ISO); null when not received, or received before it was kept */
  receivedAt: string | null;
  /** its due day (received day + the supplier's payment days), yyyy-mm-dd; "" when not known */
  dueOn: string;
  /** days past the due day; 0 when not overdue or not known */
  overdueDays: number;
  /** owed: the real cost (null when not entered). Expected: the real cost once entered, else the estimate */
  amount: number | null;
  currency: string;
}

/** What we owe a supplier in one currency, over every open line (not only those listed). */
export interface SupplierCostTotal {
  currency: string;
  owed: number;
  overdue: number;
  expected: number;
  untracked: number;
}

/** Cost lines whose vendor only names the supplier as typed text: not counted, only named (E10). */
export interface SupplierTypedName {
  vendor: string;
  lines: number;
}

/** How a supplier is used on the shipments (Council Review 5, m21): its open jobs, and when it was last put on one. */
export interface SupplierUsageResponse {
  /** jobs with a cost line linked to it that are neither billed nor cancelled */
  openJobs: number;
  /** more jobs than are read: openJobs counts only the newest */
  capped: boolean;
  /** when a cost line linked to it was last entered (ISO); null when never */
  lastUsedAt: string | null;
}

/** An approved Trucking invoice of a haulier not yet paid, in What we owe (Council Review 5, C-1). */
export interface SupplierHaulierInvoiceLine {
  id: string;
  invoiceNumber: string;
  /** owed: approved and its payment noted here. untracked: approved before payments were noted here, so it may have been paid already: listed, not counted (K2) */
  kind: "owed" | "untracked";
  /** yyyy-mm-dd */
  issueDate: string;
  /** its due day in Trucking, yyyy-mm-dd; "" when it has none */
  dueOn: string;
  /** days past the due day; 0 when not overdue, not known or untracked */
  overdueDays: number;
  /** the invoice's total, with VAT */
  amount: number;
  currency: string;
}

/** What we owe a haulier on its Trucking invoices in one currency, with VAT, over all of them (not only those listed). */
export interface SupplierHaulierInvoiceTotal {
  currency: string;
  owed: number;
  overdue: number;
  untracked: number;
}

/**
 * Whether a haulier's Trucking invoices are in What we owe. included: they are; hidden: the caller does not see the
 * Trucking Concept (superadmins only), so they are left out; unavailable: Trucking could not be read; none: the
 * supplier is no haulier.
 */
export type SupplierHaulierInvoicesStatus = "included" | "hidden" | "unavailable" | "none";

export interface SupplierHaulierInvoices {
  status: SupplierHaulierInvoicesStatus;
  /** most overdue first, then by due day (none last) (at most 300) */
  owed: SupplierHaulierInvoiceLine[];
  /** the newest issued first (at most 200) */
  untracked: SupplierHaulierInvoiceLine[];
  /** with VAT, never added to the shipment costs' totals (without VAT) */
  totals: SupplierHaulierInvoiceTotal[];
  /** how many there are of each, and of the owed: with no due day */
  counts: { owed: number; untracked: number; dueUnknown: number };
  /** more unpaid invoices than Trucking hands at once (10,000): the totals leave the latest due out */
  truncated: boolean;
}

export interface SupplierCostsResponse {
  /** most overdue first, then oldest received (at most 300) */
  owed: SupplierCostLine[];
  /** of the lines entered last (at most 200), the newest job first */
  expected: SupplierCostLine[];
  /** of the lines entered last (at most 200), the newest job first */
  untracked: SupplierCostLine[];
  /** each currency over every open line, without VAT (as typed) */
  totals: SupplierCostTotal[];
  /** how many there are of each, and of the owed: without a real cost, with no known due day */
  counts: { owed: number; expected: number; untracked: number; withoutAmount: number; dueUnknown: number };
  /** the supplier's payment days the due days were worked out with; null when not set */
  paymentDays: number | null;
  typedNames: SupplierTypedName[];
  /** a haulier's approved Trucking invoices not yet paid, apart: their totals are with VAT */
  haulierInvoices: SupplierHaulierInvoices;
}
