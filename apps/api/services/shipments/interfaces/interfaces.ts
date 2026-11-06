import type { MaxLen } from "encore.dev/validate";

// The detail lines' MaxLens are bounds, not format rules: the columns are text and older rows
// were never checked, so each sits well above any real value a client echoes back.

/** Customs priority of a shipment. */
export type CustomsPriority = "Standard" | "Urgent";
/** Manual override of a Customs "received" tick: "" follows the uploads. */
export type CustomsReceivedOverride = "" | "yes" | "no";
/** Customs review of a document: "" while pending. */
export type AttachmentCustomsStatus = "" | "approved" | "declined";

export interface ContainerLine {
  // Stable row id. Present on reads; clients echo it back on updates so cargo
  // lines keep pointing at the same container. A brand-new row either has none or
  // brings a UUID the client made for it, which the stored row keeps.
  id?: string & MaxLen<100>;
  containerNumber: string & MaxLen<200>;
  sealNumber: string & MaxLen<500>;
  type: string & MaxLen<200>;
  // Derived from type on the server (20' → 1, 40' → 2); client values are ignored.
  teu: string & MaxLen<200>;
  packages: string & MaxLen<200>;
  packageType: string & MaxLen<200>;
  grossWeight: string & MaxLen<200>;
  volume: string & MaxLen<200>;
}

// A goods line of the Cargo Description card. No volume by design — volume only
// exists on dimension lines. containerId is null for containerless cargo (LCL/air).
export interface CargoItemLine {
  containerId?: (string & MaxLen<100>) | null;
  cargoDescription: string & MaxLen<10000>;
  hsCode: string & MaxLen<200>;
  pieces: string & MaxLen<200>;
  packageType: string & MaxLen<200>;
  grossWeight: string & MaxLen<200>;
  commercialInvoiceValue: string & MaxLen<200>;
  currency: string & MaxLen<200>;
}

// A dimension line of the Cargo Dimensions card: `pieces` identical pieces of
// L×W×H (cm) and weightPerPcKg each. Volume per piece is derived, never stored.
export interface CargoDimensionLine {
  containerId?: (string & MaxLen<100>) | null;
  pieces: string & MaxLen<200>;
  lengthCm: string & MaxLen<200>;
  widthCm: string & MaxLen<200>;
  heightCm: string & MaxLen<200>;
  /** The unit the sizes were typed in. lengthCm / widthCm / heightCm are always cm; this
   * only says how to show and edit them. Absent means "cm". */
  dimensionUnit?: DimensionUnit;
  weightPerPcKg: string & MaxLen<200>;
  /** m³ of one piece as typed, for a line whose length, width and height are not all known;
   * with all three the volume is worked out from them and this is "". Absent on a write means "". */
  volumePerPcM3?: string & MaxLen<200>;
  packageType: string & MaxLen<200>;
  stackable: string & MaxLen<200>;
  // Road freight. Optional on writes: a line sent without them is stored without them.
  palletType?: PalletType | null;
  /** ADR: UN number, four digits ("UN 1203" is stored as "1203"). */
  adrUn?: (string & MaxLen<200>) | null;
  /** ADR class, e.g. "3" or "2.1". */
  adrClass?: (string & MaxLen<200>) | null;
  adrPackingGroup?: AdrPackingGroup | null;
  adrLimitedQuantity?: boolean;
}

export type DimensionUnit = "cm" | "in";

export type PalletType = "EUR" | "INDUSTRIAL" | "HALF" | "QUARTER" | "OTHER";
export type AdrPackingGroup = "I" | "II" | "III";

// One commercial invoice of the shipment (the Commercial Invoice pop-up).
export interface CommercialInvoiceLine {
  invoiceNumber: string & MaxLen<200>;
  value: string & MaxLen<200>;
  currency: string & MaxLen<200>;
}

/** A request to replace a document customs has approved, as the screens show it. */
export interface DocumentChangeRequestItem {
  id: string;
  shipmentId: string;
  jobNumber: string;
  customer: string;
  attachmentId: string;
  /** The approved document as it was when asked. */
  fileName: string;
  documentType: string;
  fileUrl: string;
  newFileName: string;
  newFileSize: number;
  /** The new file's link, only while the request waits. */
  newFileUrl: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedById: string;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string;
  decidedAt: string | null;
  comment: string;
  answerSeenAt: string | null;
}

/** Customs' verdict on a document, as the bell of the shipment's people shows it. */
export interface CustomsVerdictNotice {
  /** The document's. */
  id: string;
  shipmentId: string;
  jobNumber: string;
  fileName: string;
  documentType: string;
  status: "approved" | "declined";
  /** Declined: the reason. */
  note: string;
  reviewedAt: string;
  reviewedByName: string;
  /** Given since this user last opened the shipment's Alerts. */
  unread: boolean;
}

/** A request to change a shipment's chosen Customs Office, as the screens show it. */
export interface CustomsOfficeRequestItem {
  id: string;
  shipmentId: string;
  jobNumber: string;
  customer: string;
  fromOffice: string;
  toOffice: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedById: string;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string;
  decidedAt: string | null;
  comment: string;
  answerSeenAt: string | null;
}

export interface ShipmentItem {
  id: string;
  jobNumber: string;
  shipper: string;
  consignee: string;
  personalReference: string;
  containerNumber: string;
  sealNumber: string;
  typeOfPackages: string;
  serviceName: string;
  invoicingStatus: string;
  bookingNumber: string;
  loadType: string;
  shippingLine: string;
  pol: string;
  pod: string;
  destination: string;
  hsCode: string;
  cargoDescription: string;
  dangerous: string;
  outOfGauge: string;
  temperatureControlled: string;
  houseBolNumber: string;
  masterBolNumber: string;
  houseBolType: string;
  houseBolRelease: string;
  masterBolType: string;
  vessel: string;
  voyage: string;
  pcs: string;
  totalWeightTons: string | null;
  totalVolumeCbm: string | null;
  cargoOrigin: string;
  countryCode: string;
  origin: string;
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  tradeDirection: string;
  agent: string;
  incotermOrigin: string;
  incotermDestination: string;
  commercialInvoiceValue: string | null;
  status: string;
  customsStatus: string;
  masterJobId: string | null;
  masterJobMczNumber: string | null;

  // Meta
  shipmentsDate: string | null;
  department: string;
  personInCharge: string;
  holidayCover: string;

  // Customer
  customerId: string | null;
  shipperId: string | null;
  consigneeId: string | null;
  /** The party customs clears the shipment for. */
  principalPartyId: string | null;
  principalParty: string;
  customer: string;
  customerPic: string;
  /** The Customer Database contact the Customer's PIC is; null for none (or an old name not linked yet). */
  customerPicContactId: string | null;
  customerReference: string;

  // Commercial parties
  pickupAddress: string;
  deliveryAddress: string;
  /** Customer Database site the cargo is picked up from. */
  pickupSiteId: string | null;
  /** Normalised: five digits for CZ. */
  pickupPostcode: string | null;
  /** ISO 3166 alpha-2, e.g. "CZ". */
  pickupCountry: string | null;
  /** Customer Database site the cargo is delivered to. */
  deliverySiteId: string | null;
  deliveryPostcode: string | null;
  deliveryCountry: string | null;
  shipperContact: string;
  consigneeContact: string;
  /** The contact of the shipper's customer the Contact is; null for a typed name of somebody else. */
  shipperContactId: string | null;
  /** The contact of the consignee's customer the Contact is; null for a typed name of somebody else. */
  consigneeContactId: string | null;
  shipperOpeningFrom: string;
  shipperOpeningTo: string;
  consigneeOpeningFrom: string;
  consigneeOpeningTo: string;

  // Status / mode
  freeComments: string;
  freightPayableAt: string;
  hub: string;
  cfs: string;
  freightMode: string;

  // Agent
  agentPic: string;
  serviceType: string;

  // Insurance
  insurance: string;

  // Dates
  cargoReadinessDate: string | null;
  pickupDate: string | null;
  pickupTime: string;
  closingDate: string | null;
  vgmClosing: string | null;
  siClosing: string | null;
  /** Times of the closings and deadlines, "HH:MM"; "" = the date only */
  closingTime: string;
  vgmClosingTime: string;
  siClosingTime: string;
  /** AMS / ISF filing deadlines as the carrier gives them (null: 4 days before ETD counts) */
  amsDeadline: string | null;
  amsDeadlineTime: string;
  isfDeadline: string | null;
  isfDeadlineTime: string;
  etaWarehouse: string | null;
  warehouseReceivedDate: string | null;
  warehouseReleasedDate: string | null;
  warehouseReference: string;
  warehouseTruck: string;
  plateNumber: string;
  /** The License Plates entered in the Pick-up tab (kept by the warehouse service), comma-separated; read-only here. */
  licensePlate: string;
  plannedDeliveryDate: string | null;
  /** When a road job was delivered (written by Trucking when the delivery is stamped). */
  actualDeliveryDate: string | null;
  plannedDeliveryTime: string;

  // Commercial
  commercialInvoice: string;
  creditCheck: string;
  approvedBy: string;
  bookingConfirmation: string;
  customsProcedure: string;
  /** The office of a T1 procedure, its code and name as one text; "" under any other procedure. */
  customsOffice: string;
  customsPriority: CustomsPriority;
  /** Deadline of an Urgent shipment, "YYYY-MM-DD HH:mm"; "" for Standard. */
  customsDeadline: string;
  /** Customs Movement Reference Number. */
  mrn: string;
  /** Manual override of the Customs "received" ticks. */
  csRecvInvoice: CustomsReceivedOverride;
  csRecvPacking: CustomsReceivedOverride;
  /** Business document types present on the shipment (Invoice, Packing list, …). */
  documentTypes: string[];
  equipmentDelivery: string;
  releaseReference: string;
  releaseDepot: string;
  redeliveryReference: string;
  redeliveryDepot: string;
  equipmentDeliveryDate: string | null;
  /** "HH:MM"; "" = the date only */
  equipmentDeliveryTime: string;
  supplierPic: string;

  // Compliance
  vgm: string;
  shippingInstructions: string;
  ams: string;
  isf: string;
  bolDraft: string;

  // Switch BoL
  switchBol: string;
  switchBolApprovedBy: string;
  switchBolNumber: string;

  // Containers (4 sets)
  containerCount1: string;
  containerLength1: string;
  containerType1: string;
  containerCount2: string;
  containerLength2: string;
  containerType2: string;
  containerCount3: string;
  containerLength3: string;
  containerType3: string;
  containerCount4: string;
  containerLength4: string;
  containerType4: string;

  // Container / cargo detail rows (own tables, ordered by position)
  containers: ContainerLine[] | null;
  cargoItems: CargoItemLine[] | null;
  cargoDimensions: CargoDimensionLine[] | null;
  commercialInvoices: CommercialInvoiceLine[] | null;

  // Read-only projections computed from the rows above (never stored).
  // containerNumber/sealNumber/pcs/typeOfPackages/hsCode/cargoDescription are
  // also overridden with computed values when detail rows exist.
  containerTypeSummary: string; // e.g. "2× 40' HC, 1× 20' GP"
  totalTeu: string;
  totalGrossWeightKg: string;
  totalVolumeM3: string;
  civByCurrency: string; // the commercial invoices' values per currency, e.g. "12 500 USD, 3 000 EUR"

  // Quote
  salesNumber: string;
  selling: string;
  buying: string;
  quoteValidity: string;
  validityStatus: string;
  salesPerson: string;

  // Claim
  /** Yes | No — derived from the shipment's claims. */
  claim: string;

  // Other
  createdBy: string;

  createdAt: string;
  updatedAt: string;
}

export interface MasterJobItem {
  id: string;
  mczNumber: string;

  // Master job only.
  freightMode: string;
  tradeDirection: string;
  incotermOrigin: string;
  incotermDestination: string;
  bookingNumber: string;
  closingDate: string | null;
  destination: string;
  shipper: string;
  shipperId: string | null;
  consignee: string;
  consigneeId: string | null;
  /** Cargo totals of the whole MBL. */
  pcs: string;
  typeOfPackages: string;
  totalWeightTons: string;
  totalVolumeCbm: string;

  // Copied onto the linked shipments.
  loadType: string;
  serviceName: string;
  shippingLine: string;
  pol: string;
  pod: string;
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  etaWarehouse: string | null;
  warehouseReceivedDate: string | null;
  /** Booked equipment, e.g. "2 x 40' HC, 1 x 20' GP" (master job only). */
  equipment: string;
  vgmClosing: string | null;
  siClosing: string | null;
  /** Times of the closings and deadlines, "HH:MM"; "" = the date only */
  closingTime: string;
  vgmClosingTime: string;
  siClosingTime: string;
  /** AMS / ISF filing deadlines as the carrier gives them (null: 4 days before ETD counts) */
  amsDeadline: string | null;
  amsDeadlineTime: string;
  isfDeadline: string | null;
  isfDeadlineTime: string;
  releaseReference: string;
  releaseDepot: string;
  redeliveryReference: string;
  redeliveryDepot: string;
  supplierPic: string;
  masterBolNumber: string;
  masterBolType: string;
  vessel: string;
  voyage: string;

  /** Number of live shipments linked to this master job. */
  shipmentCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A container on the master BL and the house shipments it is assigned to. */
export interface MasterJobContainerLine {
  id?: string & MaxLen<100>;
  containerNumber: string & MaxLen<200>;
  sealNumber: string & MaxLen<500>;
  /** Same dictionary as a shipment container's type, e.g. "40' HC". */
  type: string & MaxLen<200>;
  shipmentIds: string[] & MaxLen<500>;
}

/** A master job with its containers and house shipments. */
export interface MasterJobDetail {
  masterJob: MasterJobItem;
  containers: MasterJobContainerLine[];
  shipments: MasterJobShipmentItem[];
}

/** A house shipment as the invoicing service splits its master job's costs over it. */
export interface MasterJobHouseItem {
  shipmentId: string;
  jobNumber: string;
  /** W/M: the greater of tons and cbm */
  freightTon: number;
}

/** A house shipment as listed on its master job. */
export interface MasterJobShipmentItem {
  id: string;
  jobNumber: string;
  customer: string;
  shipper: string;
  consignee: string;
  tradeDirection: string;
  status: string;
  /** The house's own container numbers, comma separated. */
  containerNumber: string;
}

/** A chat message that tags the reader and that they have not opened yet. */
export interface CommentMentionItem {
  /** Id of the message. */
  id: string;
  shipmentId: string;
  jobNumber: string;
  /** Who wrote it: the user's e-mail; "" when the user is unknown. */
  authorName: string;
  message: string;
  createdAt: string;
  /** Not read yet (the shipment's chat not opened since); read ones stay 7 days from when they were written. */
  unread: boolean;
}

/** A file sent with a chat message. */
export interface CommentAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  /** Where to open the file: an API path with a short-lived token (append "&download=1" to save it). */
  contentUrl: string;
}

export interface CommentItem {
  id: string;
  shipmentId: string;
  authorId: string;
  /** Who wrote it: the user's e-mail, as every person is shown; "" when the user is unknown. */
  authorName: string;
  message: string;
  createdAt: string;
  attachments: CommentAttachment[];
  /** On the reader's own messages: a colleague has opened the chat since it was sent. */
  readByOthers: boolean;
  /** When its writer crossed it out; null while it stands. */
  struckAt: string | null;
}

/** cargo = claim on the shipment · cost = claim on a supplier's invoice */
export type ClaimKind = "cargo" | "cost";

/** One claim of a shipment. */
export interface ClaimItem {
  id: string;
  shipmentId: string;
  kind: ClaimKind;
  /** Damaged | Incomplete | Undamaged | Lost (cargo claims) */
  cargoState: string;
  note: string;
  supplier: string;
  invoiceNumber: string;
  reason: string;
  /** Disputed amount, with currency. */
  amount: string;
  createdAt: string;
}

export interface ClaimInput {
  cargoState?: string;
  note?: string;
  supplier?: string;
  invoiceNumber?: string;
  reason?: string;
  amount?: string;
}

/** Unread chat messages of one shipment, for the user asking. */
export interface CommentUnreadItem {
  shipmentId: string;
  unread: number;
}

/** Pieces, gross kg and CBM, as the warehouse's remeasurement notice states them. */
export interface RemeasureFigures {
  colli: number;
  weightKg: number;
  volumeCbm: number;
}

/** The warehouse's "Cargo has been remeasured" notice, as posted to a shipment's chat. */
export interface RemeasureNoticeResult {
  commentId: string;
  /** E-mails of the people tagged (Person in Charge, Holiday Cover); empty when nobody is set. */
  tagged: string[];
}

export interface TaskItem {
  id: string;
  shipmentId: string;
  taskKey: string;
  completed: boolean;
  completedAt: string | null;
  completedById: string | null;
}

export interface AttachmentItem {
  id: string;
  shipmentId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  /** Where to open the file: an API path with a short-lived token (append "&download=1" to save it). */
  contentUrl: string;
  createdAt: string;
  /** Business document type (Invoice, Packing list, …); "" until classified. */
  documentType: string;
  customsStatus: AttachmentCustomsStatus;
  customsNote: string;
  customsReviewedAt: string | null;
  /** The uploader's e-mail; "Unknown" when it cannot be resolved. */
  uploadedByName: string;
  /** The customs reviewer's e-mail; "" while the document is unreviewed. */
  customsReviewedByName: string;
}

/** A shipment date on the dashboard's deadline list. */
export interface DeadlineItem {
  id: string;
  jobNumber: string;
  shipper: string;
  consignee: string;
  status: string;
  /** ETD | ETA | Closing | CRD | Pickup */
  field: string;
  date: string;
}

export type DeadlinePeriod = "OVERDUE" | "TODAY" | "THIS_WEEK" | "NEXT_WEEK" | "LATER";

export interface DeadlineGroup {
  period: DeadlinePeriod;
  items: DeadlineItem[];
}

export interface DashboardKpis {
  totalActive: number;
  waitingUnload: number;
  sailedNotOrdered: number;
  sailedOrdered: number;
  waitingDeparture: number;
  missingSailing: number;
}

/** The operations dashboard: status KPIs and upcoming shipment dates. */
export interface ShipmentDashboard {
  kpis: DashboardKpis;
  deadlines: DeadlineGroup[];
}

/** Counts behind the Shipments overview tiles, over the whole company dataset. */
export interface ShipmentTileCounts {
  active: number;
  attention: number;
  import: number;
  export: number;
  week: number;
  nextWeek: number;
}

/** One date a shipment has to be ready for, falling within the next two days. */
export interface ShipmentDeadline {
  /** What is due: a shipment date field ("closingDate", "vgmClosing") or "amsDeadline" / "isfDeadline". */
  field: string;
  /** ISO date, "YYYY-MM-DD". */
  date: string;
  /** Whole days from today: 0 today, 1 tomorrow, 2 the day after; negative when overdue. */
  daysLeft: number;
}

/** A shipment on a "Needs Attention" list: something on it is due within the list's window. */
export interface ShipmentDueItem {
  id: string;
  jobNumber: string;
  /** The linked customer record, so a customer page can pick its own shipments from the list. */
  customerId: string | null;
  customer: string;
  tradeDirection: string;
  status: string;
  /** The dates that are due in that window, soonest first. */
  deadlines: ShipmentDeadline[];
}

/** The live shipments that name one quote as their Sales Number, the oldest first. */
export interface QuoteShipments {
  reference: string;
  shipments: { id: string; jobNumber: string; status: string }[];
}

/** What the sales quote a Sales Number names made of its shipments, as the quotes service answers. */
export interface QuoteSyncResult {
  quoteNumber: string;
  /** False when the reference is not a live sales quote: nothing was linked. */
  found: boolean;
  /** The shipment the quote is linked to now: the oldest live one that names it. */
  shipmentId: string | null;
  shipmentJobNumber: string | null;
  /** The status the quote shows now. */
  status: string | null;
  /** This call made the quote Won. */
  becameWon: boolean;
  /** The status the quote returned to because its last shipment is gone. */
  revertedTo: string | null;
  /** Why the shipment did not make the quote Won. */
  note: string | null;
}

/** How telling the quote went when a shipment was created from it. */
export interface QuoteLinkOutcome {
  /** The quote knows the shipment. */
  linked: boolean;
  becameWon: boolean;
  /** The status the quote shows now; null when it could not be told. */
  quoteStatus: string | null;
  /** Why the quote did not become Won although it was told. */
  note?: string;
  /** Why the quote could not be told; POST /shipments/:shipmentId/quote-link tries again. */
  error?: string;
}

/** How copying the quote's cost lines went when a shipment was created from it. */
export interface CostImportOutcome {
  buying: number;
  selling: number;
  /** Why nothing was copied; "Copy from quote" on the Costs tab does it later. */
  error?: string;
}

/** What comparing the quotes' links with the shipments did. */
export interface QuoteLinksSyncResult {
  /** Quotes that got a link, or another one. */
  linked: number;
  /** Quotes whose link was taken away. */
  unlinked: number;
  /** References whose quote already had the right link. */
  unchanged: number;
  /** References that name no live sales quote. */
  quoteNotFound: number;
  /** References the run did not get to: it stops at a limit, and the next run goes on. */
  remaining: number;
}

/** What the company's shipments say about one customer, for the pipeline of the sales service. */
export interface CustomerShipmentFacts {
  customerId: string;
  /** When the customer's first shipment was created in the app - the oldest live one - and which it is. */
  firstShipmentAt: string;
  firstShipmentId: string;
  firstJobNumber: string;
  /** When the newest one was created. */
  lastShipmentAt: string;
  shipmentCount: number;
}

/** A Road / Domestic job Trucking asks for when a consignment has no job yet. */
export interface RoadJobInput {
  customerId: string;
  customerName: string;
  /** The pick-up and delivery place names, as the job's shipper and consignee */
  shipper: string;
  consignee: string;
  pickupAddress: string;
  pickupSiteId: string | null;
  pickupPostcode: string;
  pickupCountry: string;
  deliveryAddress: string;
  deliverySiteId: string | null;
  deliveryPostcode: string;
  deliveryCountry: string;
  /** YYYY-MM-DD */
  pickupDate: string;
  /** "HH:MM" or "" */
  pickupTime: string;
  plannedDeliveryDate: string | null;
  cargoDescription: string;
  customerReference: string;
  /** A sales quote the order comes from: linked as the job's Sales Number */
  quoteNumber: string | null;
  /** Who created it, as Trucking writes it ("Trucking · Jana Nováková"). Stored is "Trucking · <e-mail>" of the user the call acts for; without one, this text only when it names no person ("Trucking", its service identity), else "Trucking" */
  createdBy: string;
  /** "Consolidation" for an LTL consignment (our warehouse consolidates it); default "Full Load" */
  loadType?: "Full Load" | "Consolidation";
}

/** What Trucking shows of a job. */
export interface RoadJobBasics {
  id: string;
  jobNumber: string;
  customerId: string | null;
  customer: string;
  status: string;
  tradeDirection: string;
  freightMode: string;
  pickupDate: string | null;
  plannedDeliveryDate: string | null;
  /** The owning department ("Road Department", …); Trucking bills other departments internally */
  department: string;
}

/** A name the people backfill could not turn into a user's e-mail: it fits no user, or more than one. */
export interface UnmatchedPerson {
  /** The shipment field it is in ("personInCharge", "createdBy", …). */
  field: string;
  /** The name as stored (of a stamp, the name part). */
  value: string;
  /** How many shipments hold it there. */
  count: number;
}

/** What the reference backfill (the letters of the Freight Mode and Load Type) did to the company's live shipments. */
export interface ReferenceNormalizeResult {
  /** Live shipments looked at. */
  checked: number;
  /** References that took the letters of their Freight Mode and Load Type. */
  renamed: number;
  /**
   * References kept as they are because they are final (they would need letters): the shipment has
   * had an invoice, Invoicing is numbering one, or it is marked Invoiced.
   */
  keptInvoiced: string[];
}

/** What the people backfill did to the company's live shipments. */
export interface PeopleNormalizeResult {
  /** Values that name a person (one field of one shipment each), looked at. */
  checked: number;
  /** Values rewritten to the user's e-mail. */
  changed: number;
  /** The names left as they are, most frequent first: to be fixed by hand. */
  unmatched: UnmatchedPerson[];
}

/** A copied name the links backfill could not link to the Customer Database. */
export interface UnmatchedLink {
  /** Where it is: "customerPic", "shipperContact", "consigneeContact", or a party ("customer", "masterJob.shipper", …) whose customer is gone. */
  field: string;
  /** The name as stored. */
  value: string;
  /** How many shipments (or master jobs) hold it there. */
  count: number;
}

/** What the links backfill did to the company's live shipments and master jobs. */
export interface LinksNormalizeResult {
  /** Values looked at: party names with a customer id, and contact names or ids. */
  checked: number;
  /** Values changed: names brought up to date and contacts linked. */
  changed: number;
  /** The names left as they are, most frequent first: to be linked by hand. */
  unmatched: UnmatchedLink[];
}

// — Tracking: the shipment's dated facts, read from its dates, its audit log and its ticks —

/** Who put a value there and when, from the audit log. No person is named for a system write or a user who left. */
export interface TrackingRecorded {
  at: string;
  by: string;
  /** The department or module that keeps this field ("Trucking", "Warehouse", "Customs"); "" when any person may. */
  source: string;
}

export type TrackingLeg = "origin" | "main" | "destination";

export interface TrackingProposal {
  eventId: string;
  day: string;
  /** Who reports it ("Carrier", "Document read"). */
  source: string;
}

/**
 * done: it happened. next: the first step still to happen. late: its planned date passed and it
 * was not recorded. open: still to come. planned: a date we only plan by, with no actual to record.
 */
export type TrackingMilestoneState = "done" | "next" | "late" | "open" | "planned";

export interface TrackingMilestone {
  key: string;
  label: string;
  /** Which dates the row shows ("ETA / ATA"); "" when it speaks for itself. */
  basis: string;
  leg: TrackingLeg;
  place: string;
  planned: string | null;
  /** "HH:MM" of the planned date when known; "" otherwise. */
  plannedTime: string;
  /** The planned date before its last change; null when it never moved. */
  wasPlanned: string | null;
  /** How far the last change moved it, in days (later is positive); null when it never moved. */
  movedDays: number | null;
  actual: string | null;
  /** "HH:MM" of the actual date in Prague when known; "" otherwise. */
  actualTime: string;
  /** A date a source reports and a person hasn't confirmed yet; null when there is none. */
  proposed: TrackingProposal | null;
  /** What stands in for a date ("Under Customs Clearance", the MRN); "" when nothing does. */
  detail: string;
  state: TrackingMilestoneState;
  /** Days past the planned date with nothing recorded; 0 when not late. */
  lateDays: number;
  /** This row's actual date is the job's tax date. */
  taxDate: boolean;
  recorded: TrackingRecorded | null;
}

/** One logged change of a date or of the routing. */
export interface TrackingChange {
  id: string;
  field: string;
  label: string;
  isDate: boolean;
  oldValue: string | null;
  newValue: string | null;
  /** Between two dates, in days (later is positive); null otherwise. */
  movedDays: number | null;
  by: string;
  at: string;
}

/** What needs a look on this shipment, worked out from its dates. */
export interface TrackingAttention {
  /** moved and late come from the dates; exception is one somebody reported, open until closed; not_told is a date the customer was told that moved. */
  kind: "moved" | "late" | "exception" | "not_told";
  /** The reported exception, which can be closed; null for what the dates show. */
  eventId: string | null;
  /** Its reason; "" otherwise. */
  note: string;
  milestoneKey: string;
  /** "ETA", "ETD", … */
  what: string;
  days: number;
  from: string | null;
  to: string | null;
  at: string | null;
  by: string;
}

/** A ticked checklist task: the time is the click, not the event. */
export interface TrackingTick {
  taskKey: string;
  completedAt: string;
  by: string;
}

export interface TrackingTaxDate {
  /** Which date the job is taxed by now: an actual one is firm, an estimated one provisional. */
  basis: "ata" | "atd" | "eta" | "etd" | "delivery" | "plannedDelivery" | "none";
  date: string | null;
  actual: boolean;
  recorded: TrackingRecorded | null;
  /** Whether an issued, not credited invoice makes the date final; null when Invoicing could not be asked. */
  invoiced: boolean | null;
}

/** A stored fact about the shipment, as the tab lists it. */
export interface TrackingEventItem {
  id: string;
  kind: string;
  label: string;
  occurredOn: string;
  /** "HH:MM" in Prague when known; "" otherwise. */
  occurredTime: string;
  place: string;
  containerNumber: string;
  note: string;
  /** Where it came from in words ("Trucking"); "" for a person. */
  source: string;
  by: string;
  recordedAt: string;
  effect: "none" | "proposed" | "applied" | "dismissed";
  /** The day it would set or set; null when it sets none. */
  effectValue: string | null;
  /** The shipment field it would set or set, in words ("ATA"); "" when none. */
  sets: string;
  /** Only what a person recorded can be struck: the rest is changed where it comes from. */
  strikeable: boolean;
  resolvedAt: string | null;
}

/** A kind of event this person may record on this shipment. */
export interface TrackingRecordableKind {
  kind: string;
  label: string;
  group: "milestone" | "exception" | "note";
  reasonRequired: boolean;
  sets: string;
  taxDate: boolean;
}

/** What the customer was told, as the tab lists it. */
export interface TrackingCustomerNotice {
  id: string;
  kind: string;
  label: string;
  channel: string;
  toldTo: string;
  subject: string;
  note: string;
  etaPod: string | null;
  etaWarehouse: string | null;
  plannedDelivery: string | null;
  by: string;
  at: string;
}

/** A line under the bell about a shipment's dates. */
export interface TrackingBellNotice {
  key: string;
  kind: "date_moved" | "to_confirm" | "not_told";
  shipmentId: string;
  jobNumber: string;
  title: string;
  text: string;
  by: string;
  at: string;
  unread: boolean;
}

export interface ShipmentTracking {
  customerNotices: TrackingCustomerNotice[];
  events: TrackingEventItem[];
  /** Empty when nothing can be recorded here: a road job's stamps are set in Trucking. */
  recordable: TrackingRecordableKind[];
  /** Whether this person may change the shipment's details, which confirming a date and striking an event take. */
  mayChangeDetails: boolean;
  milestones: TrackingMilestone[];
  changes: TrackingChange[];
  /** The log holds more than the newest rows read. */
  changesCapped: boolean;
  attention: TrackingAttention[];
  ticks: TrackingTick[];
  taxDate: TrackingTaxDate;
}
