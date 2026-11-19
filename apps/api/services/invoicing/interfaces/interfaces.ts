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
  /** The supplier invoice (Finance → Accounts Payable) the line is on; null for a line with no invoice number yet. Its payment is noted there. */
  supplierInvoiceId: string | null;
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
  /** VAT code on the invoice; null = the default by the customer's country and the trade direction (defaultVatCode) */
  vatCode: SellingVatCode | null;
  sortOrder: number;
  /** The Trucking consignment the row was pushed from ("trucking:consignment:<id>"); null otherwise. Read-only then. */
  sourceTruckingRef: string | null;
  /** The master job's line the row sells on at cost ("master:<masterJobId>:<lineId>"); null otherwise. Read-only then. */
  sourceMasterJobRef: string | null;
  /** The partial credit note that put this negative row on the shipment (lib/partialCredit); null otherwise */
  sourceCreditNoteId: string | null;
  /** When the row was added: on a billed shipment, before or after its first invoice */
  createdAt: string;
}

/** A request about a cost a shipment sells on at cost: to sell it for less, or to take it off the selling. */
export interface SellingAmountRequestItem {
  id: string;
  shipmentId: string;
  jobNumber: string;
  sellingCostId: string;
  /** "amount": sell it for requestedAmount. "remove": take the row off the shipment's selling. */
  kind: "amount" | "remove";
  category: string;
  currency: string;
  /** What the shipment's share cost when asked */
  costAmount: string;
  /** What the row sold at when asked */
  currentAmount: string | null;
  requestedAmount: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  requestedById: string;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string;
  decidedAt: string | null;
  comment: string;
  /** The manager who answered is the one who asked */
  selfDecision: boolean;
  /** When the one who asked opened the answer in the bell */
  answerSeenAt: string | null;
}

/** What changing the number did: written at once, or asked of a manager. */
export interface SellingAmountChangeResult {
  outcome: "saved" | "asked";
  request: SellingAmountRequestItem | null;
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
  /** the supplier picked from the Customer Database: every part links it, and is booked Received (Accounts Payable D6, D13) */
  supplierCustomerId?: string;
  /** refuse the post without a supplier picked (Document Reading's new invoices) */
  requireSupplier?: boolean;
  /** as read from the document as a whole (yyyy-mm-dd; a decimal string), kept on its Accounts Payable record */
  issueDate?: string;
  dueDate?: string;
  totalGross?: string;
}

/** One line of an invoice read line by line. */
export interface InvoiceLinePost {
  /** the charge code it is posted under */
  category: string & MaxLen<200>;
  /** a decimal string ("399.60"); a credit is negative */
  amount: string & MaxLen<20>;
  currency: string & MaxLen<10>;
  /** the charge as the invoice prints it */
  item?: string & MaxLen<300>;
  /** the B/L the line names, as read; on a master job a line placed by it must name its shipment's House B/L */
  bl?: string & MaxLen<100>;
  /** the shipment its B/L names, or the one a person chose */
  shipmentId?: string & MaxLen<64>;
  /** shipmentId was chosen by a person, not by the line's B/L: it need only be a shipment of the master job */
  chosen?: boolean;
  /** otherwise: the shipments it is shared out over, by weight (on a master job, by splitMethod) */
  split?: CostSplitLine[] & MaxLen<500>;
}

/** How an invoice line going to the split is shared out over a master job's shipments. */
export type InvoiceLinesSplitMethod = "wm" | "shipment";

/** An invoice's lines to post as buying rows of the shipments they belong to. */
export interface InvoiceLinesInput {
  invoiceNumber: string & MaxLen<100>;
  vendor?: string & MaxLen<200>;
  /**
   * the master job the invoice is for: every shipment a line goes to must be one of its shipments, not
   * cancelled. Left out for one shipment's invoice, whose lines all name their shipment
   */
  masterJobId?: string & MaxLen<64>;
  /** on a master job: a line going to the split is shared by each shipment's W/M as the master job has it, or equally */
  splitMethod?: InvoiceLinesSplitMethod;
  lines: InvoiceLinePost[] & MaxLen<500>;
  /** it credits money: its amounts are minus, and its rows say so */
  creditNote?: boolean;
  /** post it although a row of this invoice number and charge is already on the shipment */
  allowRepeat?: boolean;
  /** only answer what it comes to, write nothing */
  dryRun?: boolean;
  /** the supplier picked from the Customer Database: every row links it (Accounts Payable D13) */
  supplierCustomerId?: string & MaxLen<64>;
  /** refuse the post without a supplier picked (Document Reading's new invoices) */
  requireSupplier?: boolean;
  /** as read from the document as a whole (yyyy-mm-dd; decimal strings), kept on its Accounts Payable record */
  issueDate?: string & MaxLen<20>;
  dueDate?: string & MaxLen<20>;
  totalNet?: string & MaxLen<20>;
  vatAmount?: string & MaxLen<20>;
  totalGross?: string & MaxLen<20>;
  currency?: string & MaxLen<10>;
}

/** A buying row an invoice comes to. */
export interface InvoiceLinesRow {
  shipmentId: string;
  category: string;
  amount: string;
  currency: string;
  /** the shipment already has a row of this invoice number and charge: posting would count it twice */
  repeated: boolean;
  /** the real cost goes onto the shipment's estimate of the charge (one with no real cost or invoice yet), not a new row */
  ontoEstimate: boolean;
  /** the same supplier's invoice of this number is booked already on other jobs: posting it needs allowRepeat */
  bookedElsewhere: boolean;
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
  /** the shipment is billed: a real cost it has stays, Replace or not (lib/billedLock) */
  billed: boolean;
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
/** cancelled: withdrawn on its issue day with a manager's approval, to be corrected and issued again under the next number */
export type InvoiceDocStatus = "issued" | "credited" | "cancelled";

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
  /** VAT code on the invoice; "" = the default by the customer's country and the trade direction (defaultVatCode) */
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
  /** The stored line's id (absent on a preview) */
  id?: string;
  /** On a credit note: the invoice line it corrects */
  correctsLineId?: string | null;
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
  /** The customer as the invoice addresses it: at its Billing address when it has one, else at its seat. */
  customer: InvoicePartyItem | null;
  /** The address above is the customer's Billing address, not its seat. */
  billingAddress: boolean;
  /**
   * The currencies the customer is billed in, as the Customer Database has them: its default, and up
   * to two others (never the default) that billing in asks to confirm. null without a customer, or when
   * it could not be read.
   */
  customerCurrencies: { currency: string; secondaryCurrencies: string[] } | null;
  /** Who issues the invoice (Settings → Organization); null until it is filled in. */
  issuer: InvoicePartyItem | null;
  /** The issuer's account in the invoice currency, printed for the payment; null when there is none. */
  bankAccount: { currency: string; bankName: string; accountNumber: string; iban: string; swift: string } | null;
  /** The sales quote the invoice names; "" when the job has none. */
  quoteNumber: string;
  /** From where to where, as the invoice prints it: port of loading (else origin) → port of discharge (else destination). */
  routeFrom: string;
  routeTo: string;
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
  /** The supplier invoice the line is billed on (Finance → Accounts Payable); null without an invoice number */
  supplierInvoiceId: string | null;
  /** The day that invoice was marked paid (yyyy-mm-dd): its real cost, number and vendor then stay as paid; null while unpaid */
  invoicePaidOn: string | null;
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
  /** Selling rows of the split that differ from it but stay as they are, being on an issued invoice */
  sellingOnInvoices: number;
  /**
   * The billed shipments (an issued invoice not credited) whose rows differ from the split: processing
   * leaves them as they are, buying and selling, until the invoice is credited
   */
  billedKept: string[];
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

// ── Main search (the app-wide search in the top bar) ──────────────────────────

/** GET /search/invoices: the typed text and how many rows to give. */
export interface SearchInvoicesRequest {
  /** What was typed; fewer than 2 characters (trimmed) give no rows. */
  q: string & MaxLen<200>;
  /** Rows to give: 5 when left out, 1 to 50. */
  limit?: number;
}

/** An issued tax document (invoice or credit note) found by the main search. */
export interface SearchInvoiceItem {
  id: string;
  number: string;
  /** invoice | credit_note */
  kind: string;
  /** issued | credited */
  status: string;
  /** The customer as printed on the document. */
  customerName: string;
  /** The shipment's job number as printed on the document. */
  jobNumber: string;
  shipmentId: string;
  /** YYYY-MM-DD */
  issueDate: string;
  /** Total with VAT, in the document's currency. */
  gross: number;
  currency: string;
}

export interface SearchInvoicesResponse {
  /** The matching documents, newest issue date first, at most `limit`. */
  items: SearchInvoiceItem[];
  /** How many documents match in all. */
  total: number;
}

/** One line of an invoice in the credit dialog: what it was, and what is left of it to credit. */
export interface CreditableLineItem {
  lineId: string;
  description: string;
  qty: number;
  unitPrice: number;
  /** The line's own currency: what to credit is asked in it */
  unitCurrency: string;
  /** qty × unit price, in the line's own currency */
  amount: number;
  /** What is left of it to credit, in the line's own currency */
  remainingAmount: number;
  /** Invoice-currency units per 1 unit of the line's currency */
  fxRate: number;
  /** The line's total and what is left of it, in the invoice currency */
  net: number;
  remainingNet: number;
  vatCode: VatCode;
  vatRate: number;
}

/** What the credit dialog shows of an invoice. */
export interface CreditOptionsItem {
  invoiceId: string;
  number: string;
  currency: string;
  gross: string;
  /** What partial credit notes took off it so far (gross, negative), and their numbers */
  creditedGross: string;
  creditNoteNumbers: string[];
  lines: CreditableLineItem[];
  /** A partial credit note waiting for a manager, if any */
  pendingRequest: CreditNoteRequestItem | null;
}

export interface CreditNoteRequestLineItem {
  lineId: string;
  description: string;
  unitCurrency: string;
  /** What to credit, in the line's own currency */
  amount: string;
  /** The same in the invoice currency, when asked */
  net: string;
}

/** A request to credit an invoice in part, and its answer (Sales → Managers → Billing approvals). */
export interface CreditNoteRequestItem {
  id: string;
  shipmentId: string;
  jobNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  currency: string;
  lines: CreditNoteRequestLineItem[];
  net: string;
  vat: string;
  gross: string;
  invoiceGross: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  requestedById: string;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string;
  decidedAt: string | null;
  comment: string;
  selfDecision: boolean;
  answerSeenAt: string | null;
  creditNoteId: string | null;
  creditNoteNumber: string;
}

/** What is wrong with an invoice, as the one asking to change it ticks it */
export type InvoiceFixItem = "lines" | "customer" | "duzp" | "currency" | "text" | "other";

/** A request to change an invoice on its issue day, and its answer (Sales → Managers → Billing approvals). */
export interface InvoiceChangeRequestItem {
  id: string;
  shipmentId: string;
  jobNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  currency: string;
  gross: string;
  /** The invoice's issue date: the request can be answered only on it */
  issueDate: string;
  fixes: InvoiceFixItem[];
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn" | "expired";
  requestedById: string;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string;
  decidedAt: string | null;
  comment: string;
  selfDecision: boolean;
  answerSeenAt: string | null;
}

// ── Accounts Payable (Council Outlay 9, 17 Nov 2026) ──

export type PayableStatus = "booked" | "approved" | "refused";
export type PayableMarkItem =
  | "not_linked"
  | "vat_unreliable"
  | "account_not_published"
  | "bank_changed"
  | "supplier_pending"
  | "supplier_declined"
  | "low_rating"
  | "no_terms"
  | "same_number_other_supplier";

/** One line of a supplier invoice: a cost on a job, or on a master job. */
export interface PayableLineItem {
  lineId: string;
  /** "job" = a shipment's Costs Breakdown line; "master_job" = a master job's line (shared out to its jobs) */
  kind: "job" | "master_job";
  shipmentId: string | null;
  masterJobId: string | null;
  /** The job's or master job's number */
  jobNumber: string;
  customer: string;
  category: string;
  description: string;
  /** What the line was estimated at, in its estimate currency (null: no estimate) */
  estimate: number | null;
  estCurrency: string;
  /** What the invoice bills on the line */
  amount: number | null;
  currency: string;
  /** amount − estimate, when both are in one currency */
  difference: number | null;
  /** The job's Invoicing Status (Invoiced: its customer was billed) */
  jobInvoicingStatus: string;
}

export interface PayableClaimItem {
  id: string;
  shipmentId: string;
  /** open | accepted | rejected | withdrawn */
  status: string;
  reason: string;
  claimAmount: string | null;
  claimCurrency: string;
  /** The amount as it was typed before claims had a number */
  amountText: string;
  /** Tied to this invoice (false: matched by the job and the number typed) */
  linked: boolean;
}

/** A supplier invoice as Accounts Payable lists it. */
export interface PayableInvoiceItem {
  id: string;
  supplierCustomerId: string | null;
  haulierId: string | null;
  /** The supplier's name: the Customer Database's, else as written on the lines */
  supplier: string;
  vendor: string;
  invoiceNumber: string;
  kind: "invoice" | "credit_note";
  issueDate: string | null;
  /** The due day: the invoice's own, else the booked day plus the supplier's payment days */
  due: string | null;
  dueSource: "invoice" | "terms" | "none";
  daysOverdue: number;
  /** The day it was booked (yyyy-mm-dd) */
  bookedOn: string;
  /**
   * The earliest day it may be noted paid (yyyy-mm-dd): the day it was received. Null when it never was stamped
   * (gathered from older lines, a master job's): paid before Accounts Payable existed, any past day may be noted.
   */
  paidNotBefore: string | null;
  /** What its lines bill, per currency, without VAT */
  amounts: { currency: string; amount: number }[];
  /** As read from the document (null: not read) */
  totalNet: string | null;
  vatAmount: string | null;
  totalGross: string | null;
  currency: string;
  status: PayableStatus;
  paidOn: string | null;
  paidBy: string;
  decidedBy: string;
  decidedAt: string | null;
  decisionReason: string;
  selfDecision: boolean;
  source: "reading" | "typed" | "master_job" | "backfill";
  enteredBy: string;
  document: { shipmentId: string; attachmentId: string; name: string } | null;
  lines: PayableLineItem[];
  /** The job numbers it bills, in order */
  jobs: string[];
  marks: PayableMarkItem[];
  claims: PayableClaimItem[];
  /** An open claim disputes it (its payment is held) */
  claimed: boolean;
  /** The signed-in user is the Person in Charge or Holiday Cover of one of its jobs */
  mine: boolean;
  /** One of its lines bills more than estimated */
  aboveEstimate: boolean;
  /** One of its jobs is invoiced to the customer already */
  jobBilled: boolean;
  /** It was booked on or after the day one of its jobs was first invoiced to the customer: a cost that came after billing */
  arrivedAfterBilling: boolean;
  version: number;
}

/** An estimated cost no invoice has come for yet (the Expected tab: what to accrue at month-end). */
export interface PayableExpectedItem {
  lineId: string;
  shipmentId: string;
  jobNumber: string;
  customer: string;
  category: string;
  description: string;
  vendor: string;
  supplierCustomerId: string | null;
  estimate: number;
  currency: string;
  jobStatus: string;
  /** The job's ETD (export) or ETA (import) month is not known here: the job's created day is the closest */
  createdOn: string;
  mine: boolean;
  jobBilled: boolean;
}

/** A haulier invoice from Trucking, as Accounts Payable shows it (read-only; acted on in Trucking). */
export interface PayableHaulierItem {
  id: string;
  haulierCustomerId: string;
  haulierName: string;
  invoiceNumber: string;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  net: number;
  vat: number;
  gross: number;
  /** Trucking's own status (DRAFT, NEEDS_APPROVAL, BLOCKED, APPROVED, REJECTED…) */
  status: string;
  paidOn: string | null;
  claimed: number;
  refs: string[];
  daysOverdue: number;
}

export interface PayableCounts {
  all: number;
  toPay: number;
  overdue: number;
  toApprove: number;
  refused: number;
  claimed: number;
  paid: number;
  expected: number;
}

export interface PayablesResponse {
  invoices: PayableInvoiceItem[];
  expected: PayableExpectedItem[];
  /** More invoices than the list holds: the oldest are left out */
  truncated: boolean;
  haulier: { status: "included" | "hidden" | "unavailable"; invoices: PayableHaulierItem[]; truncated: boolean };
  counts: PayableCounts;
  /** Per currency, without VAT: what is still to pay, what of it is overdue, and what is expected */
  totals: { toPay: { currency: string; amount: number }[]; overdue: { currency: string; amount: number }[]; expected: { currency: string; amount: number }[] };
  dueThisWeek: number;
  /** Whether the signed-in user may approve, refuse and mark paid (a manager) */
  canDecide: boolean;
  today: string;
}

export interface PayableEventItem {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  by: string;
  reason: string;
  payload: Record<string, unknown>;
  at: string;
}

export interface PayableDetailResponse {
  invoice: PayableInvoiceItem;
  events: PayableEventItem[];
  /** The lines as they were when it was refused */
  refusedLines: { kind: "job" | "master_job"; ownerId: string; category: string; description: string; amount: number | null; currency: string }[];
  canDecide: boolean;
  /** The read document's file with a signed link (it lasts an hour); null when there is none, it is gone or it could not be looked up just now */
  documentFile: PayableDocumentFile | null;
  /** The document the invoice names is no longer among the shipment's documents */
  documentGone: boolean;
}

/** A supplier invoice's read document, as the shipment keeps it. */
export interface PayableDocumentFile {
  fileName: string;
  fileType: string;
  contentUrl: string;
}

/** What the bell shows of Accounts Payable. */
export interface PayableNoticeItem {
  invoiceId: string;
  supplier: string;
  invoiceNumber: string;
  jobs: string[];
  amounts: { currency: string; amount: number }[];
  aboveEstimate: boolean;
  jobBilled: boolean;
  bookedAt: string;
}

export interface PayablesForMeResponse {
  /** Invoices waiting for a manager's approval (0 for anyone else) */
  toApprove: number;
  /** Invoices booked in the last 7 days on jobs the user is Person in Charge or Holiday Cover of, not yet opened */
  booked: PayableNoticeItem[];
}

// ── Accounts Receivable (Council Outlay 10, 18 Nov 2026) ──
// One row per issued invoice, its credit notes folded in (D1); amounts with VAT in the invoice's currency, never
// converted (D6). Statuses and marks are the words of D3 (the web turns them into text).

/** written_off (step 7): nothing is left to pay, closed by confirmed write-offs or bank charges, no money paid */
export type ReceivableStatus = "unpaid" | "part_paid" | "paid" | "written_off" | "credited" | "cancelled";
export type ReceivableMark =
  | "overdue"
  | "part_credited"
  | "to_refund"
  | "prepayment"
  | "promised"
  | "promise_broken"
  | "disputed"
  | "reminded"
  | "not_in_customer_list"
  /** A write-off or bank charge waits for a second manager (step 7, D13) */
  | "write_off_waiting"
  /** A confirmed write-off counts on an invoice that also has money paid */
  | "part_written_off"
  /** A confirmed bank charge counts on it */
  | "bank_charge";

/** A line on an invoice's receivable: money paid, carried over, or (step 7) a write-off or bank charge. */
export type ReceivableLineKind = "payment" | "carried_over" | "write_off" | "bank_charge";
export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface ReceivableAmount {
  currency: string;
  amount: number;
}

/** An issued invoice as Accounts Receivable lists it. */
/** A credit note as the list row carries it: its number, day and amount (with VAT, negative, the invoice's currency), and who issued it. */
export interface ReceivableRowCreditNote {
  number: string;
  issueDate: string;
  gross: number;
  /** Who issued it (e-mail); "" when unknown */
  issuedBy: string;
  /** Their display name (the e-mail when they have none); "" when unknown */
  issuedByName: string;
}

export interface ReceivableItem {
  /** The invoice id */
  id: string;
  number: string;
  customerId: string;
  /** The customer's name as on the invoice */
  customer: string;
  shipmentId: string;
  jobNumber: string;
  issueDate: string;
  duzp: string;
  dueDate: string;
  currency: string;
  net: number;
  vat: number;
  gross: number;
  grossCzk: number;
  /** What its credit notes took off (a positive number) */
  credited: number;
  /** What live payments paid (money: payments and carried over) */
  paid: number;
  /** Confirmed, live write-offs (step 7) */
  writtenOff: number;
  /** Confirmed, live bank charges (step 7) */
  bankCharges: number;
  /** gross − credited − paid − writtenOff − bankCharges; below 0 = to refund */
  leftToPay: number;
  status: ReceivableStatus;
  marks: ReceivableMark[];
  daysOverdue: number;
  agingBucket: AgingBucket | null;
  paymentTerms: string;
  promisedOn: string | null;
  disputed: boolean;
  reminderLevel: number;
  lastRemindedOn: string | null;
  lastPaidOn: string | null;
  creditNoteNumbers: string[];
  /** The credit notes on it, oldest first: the CSV gives each its own line, as accounting books them (D1) */
  creditNotes: ReceivableRowCreditNote[];
  /** E-mails; "" when unknown */
  personInCharge: string;
  holidayCover: string;
  salesOwner: string;
  /** The user is the job's Person in Charge or Holiday Cover (the Accounts Payable rule) */
  mine: boolean;
  /** The user is the customer's Sales Owner */
  myCustomer: boolean;
  /** Who issued it (e-mail); "" when unknown */
  issuedBy: string;
  /** The receivable's version (1 before any write) */
  version: number;
}

/** What one customer owes in one currency, by age. */
export interface ReceivableCustomerRow {
  customerId: string;
  customer: string;
  salesOwner: string;
  currency: string;
  unpaid: number;
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
  oldestDue: string | null;
  invoices: number;
  /** From the Customer Database (0 = none); the web converts */
  creditLimit: number;
  creditCurrency: string;
}

export type ReceivablePeriod = "90d" | "12m" | "all";

export interface ReceivablesResponse {
  /** Every unpaid / part-paid invoice (and one to refund) + the others issued in the period */
  rows: ReceivableItem[];
  /** More than 2000 rows: the page says so */
  truncated: boolean;
  period: ReceivablePeriod;
  counts: {
    unpaid: number;
    overdue: number;
    paid: number;
    /** Status Written off (step 7) */
    writtenOff: number;
    creditedCancelled: number;
    all: number;
    promised: number;
    disputed: number;
    byCustomer: number;
  };
  totals: { toCollect: ReceivableAmount[]; overdue: ReceivableAmount[] };
  dueThisWeek: number;
  over60: number;
  customersOwing: number;
  /** One per customer and currency with something left to pay */
  byCustomer: ReceivableCustomerRow[];
  /** A manager: notes payments and takes them back */
  canAct: boolean;
  /** The job and customer facts could be read (else names and owners are blank) */
  factsRead: boolean;
  today: string;
}

export interface ReceivableLineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  /** The unit price's currency; net, VAT and gross are in the invoice's */
  currency: string;
  net: number;
  vatRate: number;
  vat: number;
  gross: number;
}

export interface ReceivableCreditNoteItem {
  id: string;
  number: string;
  issueDate: string;
  /** Negative */
  gross: number;
  reason: string;
  /** The credit note of the whole invoice (or of what partial ones left of it) */
  full: boolean;
  /** Who issued it (e-mail); "" when unknown (D25) */
  issuedBy: string;
  /** Their display name (the e-mail when they have none); "" when unknown */
  issuedByName: string;
}

export interface ReceivablePaymentItem {
  id: string;
  kind: ReceivableLineKind;
  /** null: carried over, the day not known; a write-off's or bank charge's day is the day it was written */
  paidOn: string | null;
  amount: number;
  note: string;
  /** Why a write-off or bank charge closes what is left ("" for a payment) */
  reason: string;
  /** One bank payment over several invoices: the same reference on each of its lines ("" when none) */
  bankRef: string;
  by: string;
  at: string;
  /** A write-off or bank charge counts once confirmed: by whom, when, and whether by the manager who wrote it (no other manager) */
  confirmed: { by: string; at: string; self: boolean } | null;
  /** A write-off or bank charge waiting for a second manager (not confirmed, not taken back) */
  waiting: boolean;
  /** The signed-in user may confirm this waiting line */
  canConfirm: boolean;
  takenBack: { by: string; at: string; reason: string } | null;
}

export interface ReceivableNoteItem {
  id: string;
  kind: "note" | "promise" | "dispute" | "dispute_closed" | "reminder";
  text: string;
  promisedOn: string | null;
  reminderLevel: number | null;
  recipient: string;
  by: string;
  at: string;
}

export interface ReceivableEventItem {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  by: string;
  at: string;
  reason: string;
  payload: Record<string, unknown>;
}

export interface ReceivableCustomerFacts {
  paymentTerms: string;
  creditLimit: number;
  creditCurrency: string;
  salesOwner: string;
  /** What the customer owes on its invoices, per currency */
  unpaid: ReceivableAmount[];
  overdueCount: number;
  /** Who a reminder goes to (by contact role); null when no contact has an e-mail */
  reminderTo: { name: string; email: string; role: string } | null;
}

export interface ReceivableDetailResponse {
  row: ReceivableItem;
  lines: ReceivableLineItem[];
  creditNotes: ReceivableCreditNoteItem[];
  payments: ReceivablePaymentItem[];
  notes: ReceivableNoteItem[];
  events: ReceivableEventItem[];
  /** null when the Customer Database could not be read */
  customerFacts: ReceivableCustomerFacts | null;
  canAct: boolean;
  today: string;
  /** A hand-over to the customer's list failed: a manager may send it again */
  sendAgain: boolean;
  /**
   * A payment that may be for this invoice waits on a bank statement for a manager to confirm it (mock test council X5);
   * null when none, or when the statements could not be read just now
   */
  paymentWaiting: ReceivablePaymentWaiting | null;
  /**
   * The reminder as the app's own e-mail writes it (lib/reminderTexts: the customer's language, the bank account and
   * the variable symbol), for each level the user may record, for the user's own mail program (mock test council m3);
   * empty when the invoice is not owed
   */
  reminderDrafts: ReceivableReminderDraft[];
}

/** A payment read from a bank statement, not confirmed yet, that may be for the invoice. */
export interface ReceivablePaymentWaiting {
  statementId: string;
  fileName: string;
  bookingDate: string | null;
  amount: number;
  currency: string;
  /** "A payment that may be for this invoice is waiting on bank statement …" */
  text: string;
}

/** A reminder's subject and text as the user's mail program opens them. */
export interface ReceivableReminderDraft {
  level: 1 | 2 | 3;
  /** cs | en: the customer's language */
  language: string;
  subject: string;
  body: string;
}

export type ReceivableMilestone = "overdue_1" | "overdue_14" | "overdue_30" | "paid";

/** What the bell shows of Accounts Receivable (D18). */
export interface ReceivableNoticeItem {
  /** `${invoiceId}:${milestone}` */
  key: string;
  invoiceId: string;
  milestone: ReceivableMilestone;
  number: string;
  customer: string;
  jobNumber: string;
  leftToPay: number;
  currency: string;
  daysOverdue: number;
  why: "sales_owner" | "person_in_charge";
  /** An overdue notice: a payment that may be for it waits on a bank statement (mock test council X5) */
  paymentWaiting: boolean;
}

export interface ReceivablesForMeResponse {
  notices: ReceivableNoticeItem[];
}

/** Whether releasing a job's cargo or documents should warn about payment (D20): never a stop. */
export interface ReleaseCheckResponse {
  warn: boolean;
  customer: string;
  prepayment: boolean;
  customerOverdueCount: number;
  unpaid: { invoiceId: string; number: string; leftToPay: number; currency: string; daysOverdue: number }[];
}

export interface ReceivableRowsResponse {
  rows: ReceivableItem[];
}

export interface ReceivableCustomerRowsResponse {
  rows: ReceivableItem[];
  truncated: boolean;
  canAct: boolean;
  today: string;
}

// ── Accounts Receivable, step 7 (18 Nov 2026) ──

/** The release check as the shipments service asks it: the warning, and whether the prepayment stop applies (D20's later yes). */
export interface ReleaseCheckInternalResponse extends ReleaseCheckResponse {
  /** The job has an invoice on prepayment with something left to pay (unpaid or part paid): the release is refused for a user */
  prepaymentUnpaid: boolean;
  /** The owed invoices on prepayment: those the stop names and a manager's override records */
  prepaymentInvoices: { invoiceId: string; number: string; leftToPay: number; currency: string }[];
  /**
   * The job's customer is on prepayment and the job has selling with a value not yet invoiced (mock test council L3):
   * the amounts per currency, net as priced; empty when not. Then prepaymentUnpaid is true too: a release waits until
   * it is invoiced and paid, or a manager releases it with a reason. Always sent; optional for older callers.
   */
  prepaymentUninvoiced?: ReceivableAmount[];
  /**
   * True when the job has selling not yet invoiced but its customer's terms could not be read (Shipments or Customers
   * did not answer): the stop before any invoice (L3) was left out of this answer, and prepaymentUnpaid is as the
   * invoices say. Absent when it was checked.
   */
  prepaymentUninvoicedUnchecked?: boolean;
}

/** What a customer owes per Invoicing's own figures (the credit warning, mock test council m5). */
export interface ReceivableCustomerOwedResponse {
  /** Left to pay on the invoices still owed, per currency, never converted */
  unpaid: ReceivableAmount[];
  /** How many of them are overdue */
  overdueCount: number;
  /** The oldest due day among the overdue ones */
  oldestOverdueDue: string | null;
}

/** One line of the month-end list: an invoice as it stood at the end of the day asked. */
export interface ReceivableAsAtRow {
  invoiceId: string;
  number: string;
  customerId: string;
  /** The name on the invoice */
  customer: string;
  shipmentId: string;
  /** The job number printed on the invoice */
  jobNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  gross: number;
  /** Credit notes issued on or before the day */
  credited: number;
  /** Payments paid on or before the day, and those carried over */
  paid: number;
  /** Write-offs and bank charges confirmed on or before the day */
  writtenOff: number;
  /** What was left to pay at the end of the day, in the invoice's currency (above 0: it is listed) */
  leftToPay: number;
  /** The invoice's own rate: CZK per 1 unit (ČNB on its tax date) */
  fxRate: number;
  /** leftToPay × fxRate, rounded to 2 decimals */
  leftToPayCzk: number;
  /** Days overdue on the day (0 when not) */
  daysOverdue: number;
  agingBucket: AgingBucket | null;
  /** A payment carried over from the customer's list counts: paid before Accounts Receivable, day not known */
  carriedOver: boolean;
}

export interface ReceivablesAsAtResponse {
  day: string;
  rows: ReceivableAsAtRow[];
  /** Per currency, in the invoices' own currencies */
  totals: ReceivableAmount[];
  /** The one grand total: every row's CZK, at each invoice's own ČNB rate */
  totalCzk: number;
  /** "at each invoice's own ČNB rate" - the words the page shows beside the CZK total */
  czkRate: string;
  /** More invoices than are read at once: the list is not complete */
  truncated: boolean;
  today: string;
  /**
   * Listed invoices whose old "Paid" in the Customer Database could not be checked just now (it could not be asked):
   * they may already be paid. Absent when every listed invoice was checked.
   */
  unchecked?: number;
  /** The words the page shows when `unchecked` is given */
  uncheckedNote?: string;
}

/** Work done on the customer's open jobs not yet invoiced: shown beside the credit limit, never added to "used". */
export interface ReceivableUnbilledResponse {
  /** The selling lines' values (net, as priced), per currency, never converted */
  amounts: ReceivableAmount[];
  /** Open jobs with something not yet invoiced */
  jobs: number;
  /** The customer has more open jobs than are read (5000): the amounts are at least these */
  capped: boolean;
}

export interface ReceivableSettingsResponse {
  /** Reminders 1 and 2 sent by the app each day (only while e-mail from the app is switched on) */
  autoReminders: boolean;
  /** Reminder 1 at so many days overdue */
  reminder1Days: number;
  /** Reminder 2 at so many days overdue (more than reminder 1) */
  reminder2Days: number;
  /** Where a customer's answer goes; "" = the sender's own address */
  replyTo: string;
  /** The day automatic reminders were switched on (yyyy-mm-dd), null while off: only invoices due on or after it are reminded by the app */
  autoRemindersSince: string | null;
  /** Whether e-mail from the app is switched on (else nothing is sent: "E-mail from the app is switched off") */
  emailOn: boolean;
  /** A manager: may change the settings */
  canEdit: boolean;
  /** Who changed them last (e-mail), "" when never */
  updatedBy: string;
  updatedAt: string | null;
}

/** A write-off or bank charge waiting for a second manager (the Billing approvals count). */
export interface ReceivableWaitingLine {
  lineId: string;
  invoiceId: string;
  number: string;
  customerId: string;
  customer: string;
  jobNumber: string;
  currency: string;
  kind: "write_off" | "bank_charge";
  amount: number;
  reason: string;
  /** Who wrote it (e-mail) and when */
  by: string;
  at: string;
  /** The receivable's version now (what a confirm sends back) */
  version: number;
  /** The signed-in user may confirm it */
  canConfirm: boolean;
}

export interface ReceivableWaitingResponse {
  lines: ReceivableWaitingLine[];
}

// ─── Shipments → Managers, the Money tab (Council Outlay 11, step 4) ────────────────────────────
// The money facts of many jobs in one read (POST /internal/invoicing/operations-money). Read only: nothing
// here gathers a supplier invoice or fixes a job's rates. Money is never added across currencies.

export interface MoneyAmount {
  currency: string;
  amount: number;
}

/** A job's dates as Shipments holds them (YYYY-MM-DD or null): what chooses the ČNB rates of a job whose rates are not fixed yet. */
export interface OperationsMoneyJobDates {
  shipmentId: string;
  tradeDirection: string;
  estimatedArrival: string | null;
  estimatedDeparture: string | null;
  actualArrival: string | null;
  actualDeparture: string | null;
}

/**
 * Why the currencies in `missingCurrencies` have no rate: "" - none is missing; "missing" - the job's rates are
 * known and ČNB has none for them; "not_fixed" - the job's rates are not fixed yet and its dates were not handed
 * in; "unreadable" - the job's rates could not be read (fx did not answer, or could not value the job).
 */
export type OperationsMoneyRatesNote = "" | "missing" | "not_fixed" | "unreadable";

/** Costs Breakdown's own totals in CZK at the job's rates (lib/jobCostTotals); a figure is null when a rate it needs is missing. */
export interface OperationsMoneyTotals {
  /** Selling lines ticked for Invoice */
  sellingCzk: number | null;
  /** Every estimate (the footer of the Est. column) */
  estimateCzk: number | null;
  /** The real costs filled in so far (the footer of the Real column) - not what profit counts: see costCzk */
  realCzk: number | null;
  /**
   * Like for like, over ONLY the buy lines with both an estimate and a real cost: their estimates, and their real
   * costs. 0 and 0 when no line has both; both null when one of those lines has a currency with no rate. (A real
   * cost with no estimate is in neither: it is no overrun of an estimate.)
   */
  estimateOfRealCzk: number | null;
  realOfEstimatedCzk: number | null;
  /** What profit counts as cost: a line's real cost once it is filled in, its estimate until then */
  costCzk: number | null;
  /** sellingCzk - costCzk */
  profitCzk: number | null;
  /** Profit as a percentage of selling; null also when nothing is sold */
  marginPct: number | null;
  /** The currencies with no rate known that left a figure out */
  missingCurrencies: string[];
  /** Why they have none; "" exactly when `missingCurrencies` is empty */
  ratesNote: OperationsMoneyRatesNote;
  /**
   * The job's rates are of an older ČNB fixing: the one of its date should be stored and is not (the import
   * failed - fx's ratesMissing), so its figures use the last old rate and are stale. Absent from an older answer
   */
  ratesStale?: boolean;
}

/** A supplier invoice not yet paid, booked after the day the job was first invoiced: what it bills on this job, per currency. */
export interface OperationsMoneyLateInvoice {
  id: string;
  number: string;
  supplier: string;
  /** The day it was booked (YYYY-MM-DD), as Accounts Payable shows it: its first line's Received stamp, else when the record was made */
  bookedOn: string;
  currency: string;
  amount: number;
  /** A line of it on this job is above its estimate (as Accounts Payable marks a line) */
  aboveEstimate: boolean;
}

/** The supplier invoices on a job, counted as Accounts Payable counts them. */
export interface OperationsMoneySupplierInvoices {
  /** Booked, waiting for a manager */
  toApprove: number;
  /**
   * The ids of the invoices counted in `toApprove`. An invoice with lines on several jobs is in the list of each, so
   * a count over several jobs counts these ids, each once - adding up the jobs' `toApprove` would count it per job
   */
  waitingIds: string[];
  /** Every refused invoice the job ever had: see `refusedOn` for when each was refused */
  refused: number;
  /** The day of the newest refusal among the job's refused invoices; null when none is refused (a refusal always stamps its moment) */
  lastRefusedOn: string | null;
  /**
   * The day each refused invoice was refused, oldest first (one with no moment stamped is left out), so a reader
   * counts those of its own window. Absent from an older answer
   */
  refusedOn?: string[];
  /** With an open cost claim that holds the payment; null when the cost claims could not be read */
  claimed: number | null;
  /**
   * Approved, not paid, past the due day. When the suppliers' payment days could not be read, the invoices overdue
   * by the due day stored on them are still counted (then "at least"); null only when none is and one of the
   * job's approved invoices has its due day hanging on the payment days - not known, never a 0 that isn't.
   */
  approvedOverdue: number | null;
  /** The day the oldest invoice still to approve was booked */
  oldestWaitingSince: string | null;
  /** Booked after the day the job was first invoiced (the same day is not "after"), and not paid (a paid one is history); refused ones are not among them */
  afterBilling: OperationsMoneyLateInvoice[];
}

/** A delay charge bought on a job and not sold on, in one currency. */
export interface OperationsMoneyNotRecharged extends MoneyAmount {
  /** The charge code (lib/chargeCodes) and what it reads as */
  code: string;
  label: string;
}

/** A job's estimates with no supplier invoice yet. */
export interface OperationsMoneyEstimates {
  lines: number;
  /** The day the oldest of them was entered */
  oldestSince: string | null;
  amounts: MoneyAmount[];
}

export interface OperationsMoneyJob {
  shipmentId: string;
  /** Valued selling lines NOT on an open invoice - the "work not yet invoiced" rule (lib/receivables unbilledOf: ticked or not) */
  notYetInvoiced: MoneyAmount[];
  /** Of those, the lines not ticked for Invoice - they keep the job from reading Invoiced while profit ignores them */
  untickedSelling: MoneyAmount[];
  /** Selling / cost lines with a value; null when the lines could not be read */
  sellingLines: number | null;
  costLines: number | null;
  totals: OperationsMoneyTotals;
  /** The first open customer invoice's issue day, null when none - "billed" for the rules of the Money tab */
  invoicedOn: string | null;
  /** Buy lines of the demurrage / detention / storage / waiting kinds that no selling line sells on, per charge code and currency */
  notRecharged: OperationsMoneyNotRecharged[];
  /** Supplier invoices on this job; null when they could not be read */
  supplierInvoices: OperationsMoneySupplierInvoices | null;
  /** Estimated buy lines with no supplier invoice yet (Accounts Payable's Expected); null when they could not be read */
  estimatesOpen: OperationsMoneyEstimates | null;
}

export interface OperationsMoney {
  jobs: OperationsMoneyJob[];
  /**
   * Whether the customer invoices were read: true, a job's `invoicedOn: null` and empty `notYetInvoiced` mean "none";
   * false, they mean "not known" (and no supplier invoice is said to have come after billing).
   */
  invoicesRead: boolean;
  /** Ids asked about that could not be read (no id of a job) */
  unreadable: string[];
  /** The parts that could not be read: their figures are null or empty for every job, never 0 */
  notKnown: string[];
}
