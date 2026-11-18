import type { MaxLen } from "encore.dev/validate";
import type { CockpitTag } from "../../../lib/cockpit";

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
  /** The SCAC of the carrier shippingLine names; "" when it names none we know. */
  carrierCode: string;
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
  /** What happened last ("Arrived 20.10.2026 · Warehouse"); "" when nothing has yet. */
  lastEvent: string;

  // Meta
  shipmentsDate: string | null;
  department: string;
  personInCharge: string;
  holidayCover: string;

  // Customer
  customerId: string | null;
  shipperId: string | null;
  consigneeId: string | null;
  /** The Agent as picked from the Customer Database; null for a typed name. */
  agentId: string | null;
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
  /** The contact of the Agent the Agent's Contact is; null for a typed name of somebody else. */
  agentPicContactId: string | null;
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
  /** The HUB after the POD, a place as on a shipment. */
  hub: string;
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
  /** The master job's own people, by e-mail; not copied onto the houses. */
  personInCharge: string;
  holidayCover: string;
  /** Who created it, by e-mail; "" for one made before this was kept. */
  createdBy: string;

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

/** A house shipment as an invoice read line by line is checked against: its B/L says which lines are its. */
export interface MasterJobInvoiceHouseItem extends MasterJobHouseItem {
  /** As typed on the shipment; may hold more than one number ("A1, B2") */
  houseBolNumber: string;
  /** Cancelled Shipment: nothing is posted to it */
  cancelled: boolean;
}

/** What Accounts Payable shows of a master job a supplier invoice is booked to. */
export interface MasterJobBasics {
  id: string;
  /** The master job's own number, as the app shows it ("MCZ00000006") */
  mczNumber: string;
  /** The Person in Charge's e-mail as stored; "" when none */
  personInCharge: string;
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
  /** Who may take it off the master job besides a manager (lib/shipmentEditRule): its Person in Charge and Holiday Cover. */
  personInCharge: string;
  holidayCover: string;
  /** Its cargo as its own page shows it (lib/cargoProjection houseCargo); "" is no data. COLLI. */
  pieces: string;
  /** Type of packages. */
  packages: string;
  /** Gross weight in kg, formatted ("1,234.5"). */
  weightKg: string;
  /** Volume in m³, formatted. */
  volumeM3: string;
  /** "Stackable / Overstowable", "Not stackable / Not overstowable" or "". */
  cargoStackability: string;
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

/**
 * Where a claim on costs stands: open = disputed with the supplier (it holds the supplier
 * invoice's payment) · accepted = the supplier agreed, a credit note is expected · rejected = the
 * supplier refused it · withdrawn = we dropped it.
 */
export type ClaimStatus = "open" | "accepted" | "rejected" | "withdrawn";

/** One note of a shipment's notepad. */
export interface ShipmentNoteItem {
  id: string;
  shipmentId: string;
  /** The title: one short line. */
  text: string;
  /** More about it; empty when the title says it all. */
  details: string;
  /** The day it has to be done by (YYYY-MM-DD); null for no deadline. */
  dueDate: string | null;
  /** Who wrote it, by e-mail; empty when unknown. */
  authorName: string;
  createdAt: string;
  done: boolean;
  /** When it was ticked off; null while open. */
  doneAt: string | null;
  /** Who ticked it off, by e-mail; empty while open. */
  doneByName: string;
  /** Starred: kept at the top of the list. */
  pinned: boolean;
  /** When it was starred; the latest starred is the top one. Null when not starred. */
  pinnedAt: string | null;
}

/** A change of a note: its text, ticked off (true) / back to open (false), starred or not. */
export interface ShipmentNoteChangeInput {
  /** The title. */
  text?: string;
  details?: string;
  /** YYYY-MM-DD; "" takes the deadline away. */
  dueDate?: string;
  done?: boolean;
  pinned?: boolean;
}

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
  /** Disputed amount, with currency, as typed (free text). */
  amount: string;
  /** The day the carrier or supplier was given notice; null when not yet. */
  noticeDate: string | null;
  createdAt: string;
  /** Of a claim on costs: the supplier invoice (invoicing's supplier_invoice id) it is raised against; null when none. */
  supplierInvoiceId: string | null;
  /** The claimed amount as a decimal ("120.50"); null when not given. */
  claimAmount: string | null;
  /** 3-letter currency of claimAmount; "" when not given. */
  claimCurrency: string;
  status: ClaimStatus;
  /** When it was accepted, rejected or withdrawn; null while open. */
  closedAt: string | null;
  /** Who closed it, by e-mail; "" while open. */
  closedBy: string;
}

export interface ClaimInput {
  cargoState?: string;
  note?: string;
  supplier?: string;
  invoiceNumber?: string;
  reason?: string;
  amount?: string;
  /** yyyy-mm-dd; "" takes it back */
  noticeDate?: string;
  /** Claims on costs only: the supplier invoice's id; "" unties it. */
  supplierInvoiceId?: string;
  /** Claims on costs only: a decimal with at most 2 places ("120.50"); "" clears it. */
  claimAmount?: string;
  /** Claims on costs only: a 3-letter code ("EUR"); "" clears it. */
  claimCurrency?: string;
  /** Claims on costs only. Accepted, rejected or withdrawn closes it (stamped when and by whom); open reopens it. */
  status?: string;
}

/** A live claim on costs, as Accounts Payable (the invoicing service) reads it. */
export interface CostClaimFact {
  id: string;
  shipmentId: string;
  /** The supplier invoice it is raised against; null when it is not tied to one yet. */
  supplierInvoiceId: string | null;
  supplier: string;
  invoiceNumber: string;
  reason: string;
  /** The disputed amount as typed (free text, from before claimAmount). */
  amount: string;
  /** The claimed amount as a decimal ("120.50"); null when not given. */
  claimAmount: string | null;
  claimCurrency: string;
  /** open | accepted | rejected | withdrawn: an open claim holds the invoice's payment. */
  status: string;
  /** YYYY-MM-DD; null when no notice was given yet. */
  noticeDate: string | null;
  createdAt: string;
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

/**
 * A shipment's last accepted remeasurement (Cargo Details → Accept remeasurement): the figures the
 * shipment held before and took over, when and by whom, and Costs Breakdown's check after it.
 */
export interface RemeasureAcceptance {
  acceptedAt: string;
  /** The name of the user who accepted, "" when not known. */
  acceptedBy: string;
  before: RemeasureFigures;
  after: RemeasureFigures;
  /** The shipment's Freight Mode now: air jobs are charged by chargeable weight, the others by W/M. */
  freightMode: string;
  /** The job has an issued invoice not credited: a change of charges needs another invoice or a credit note. */
  invoiced: boolean;
  /** When Costs Breakdown's quantities were marked checked after this acceptance; null when not yet. */
  costsCheckedAt: string | null;
  costsCheckedBy: string | null;
}

/**
 * One Inform Operations on a shipment (the warehouse's remeasurement told to its chat): the
 * shipment's figures it was compared with, the remeasured ones and how they stand. One that differs
 * is an Alert on the shipment's Alerts tab; one that matches is only its chat message (Notifications).
 */
export interface RemeasureInformedItem {
  id: string;
  informedAt: string;
  /** The name of the user who clicked Inform Operations, "" when not known. */
  informedBy: string;
  shipment: RemeasureFigures;
  remeasured: RemeasureFigures;
  /** "dimensions": the shipment's cargo dimension lines (Shipments → Warehouse); "declared": its Pcs, weight and volume (Warehouse Concept). */
  comparedWith: string;
  verdict: "differs" | "matches" | "unknown";
  /** "weight +200.0 kg · volume +5.332 CBM"; "" when nothing differs. */
  difference: string;
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

/**
 * A master job's linked shipments' documents of some types in one ZIP, from its Documents tab:
 * "Download House BLs" (their Bills of Lading) or "Download all commercial paperwork" (their
 * Commercial Invoices and packing lists).
 */
export interface MasterJobDocumentsZip {
  /** The ZIP; null when none of the linked shipments has such a file. */
  file: { fileName: string; contentType: string; fileBase64: string } | null;
  /** How many files are in it. */
  fileCount: number;
  /** The linked shipments without any such file, by job number. */
  withoutFiles: string[];
  /** Files listed but no longer in storage, left out ("<job number> - <file name>"). */
  unreadable: string[];
}

/** A file on a master job's Documents tab (a store of its own, apart from the shipments' documents). */
export interface MasterJobDocumentItem {
  id: string;
  masterJobId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  /** Where to open the file: an API path with a short-lived token (append "&download=1" to save it). */
  contentUrl: string;
  createdAt: string;
  /** Business document type (Bill of Lading, Booking confirmation, …). */
  documentType: string;
  /** The uploader's e-mail; "Unknown" when it cannot be resolved. */
  uploadedByName: string;
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
  /** The jobs on Needs Attention's URGENT list: due today or the next working day, or a cut-off missed or overdue. */
  attention: number;
  /** Active shipments whose ETD or ETA moved lately. */
  etaMoved: number;
  import: number;
  export: number;
  week: number;
  nextWeek: number;
}

/** One date a shipment has to be ready for, in one of the two Needs Attention windows - or a cut-off that was missed. */
export interface ShipmentDeadline {
  /** What is due: a shipment date field ("closingDate", "pickupDate", "vgmClosing") or "amsDeadline" / "isfDeadline". */
  field: string;
  /** ISO date, "YYYY-MM-DD". */
  date: string;
  /**
   * Whole calendar days from today: 0 today, 1 tomorrow; negative when overdue. The windows are
   * working days, so a date on the URGENT list may be 3 or more days off (Monday, seen on Friday).
   */
  daysLeft: number;
  /**
   * A cut-off (Closing, VGM, SI, AMS, ISF) whose day has passed, or whose time today has. It
   * stays URGENT while the job has not left and its ETD is today or later (with no ETD: for 7
   * days) - a Closing only until the cargo is in. False for a date that is still ahead.
   */
  missed: boolean;
  /** A cut-off's time of day, "HH:mm" on Prague's clock; "" for a date with no time, and for the plain dates. */
  time: string;
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

/**
 * The Shipments page's two Needs Attention lists, on the deadline rules of Shipments → Managers
 * (lib/needsAttention): the windows are working days of Prague time.
 */
export interface ShipmentsNeedingAttention {
  /** URGENT: due today or by the next working day, or a cut-off missed or overdue. (The key is older than the working-day windows.) */
  within24h: ShipmentDueItem[];
  /** ATTENTION: due in the two working days after. */
  within48h: ShipmentDueItem[];
  /** The company has more jobs with dates around today than were read: the lists and the tile's count may miss some. */
  capped: boolean;
  /** False when the company's own holidays could not be read: working days then skip only weekends and the statutory holidays. */
  holidaysKnown: boolean;
  /** What could not be read, in the words the page shows; such a part gives no deadline. */
  notKnown: string[];
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
  /** The Person in Charge's e-mail as stored; "" when none */
  personInCharge: string;
  /** The Holiday Cover's e-mail as stored; "" when none */
  holidayCover: string;
  /** The Invoicing Status as stored */
  invoicingStatus: string;
  /** Taken into the warehouse, YYYY-MM-DD; null while not (the Warehouse pages move it by this and the next) */
  warehouseReceivedDate: string | null;
  /** Released from the warehouse, YYYY-MM-DD; null while not */
  warehouseReleasedDate: string | null;
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
  /** The container its event is about; "" for the shipment as a whole. */
  containerNumber: string;
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
  /** Vessel and voyage it names; "" when none. */
  vessel: string;
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

/**
 * A shipment somebody else made the user the Handled By or Holiday Cover of, with the to-dos still
 * open on it (the bell's "To-dos on shipments you now cover", lib/coverBell).
 */
export interface CoverNotesNotice {
  shipmentId: string;
  jobNumber: string;
  /** What the user was made. */
  role: "Handled By" | "Holiday Cover";
  /** Who made them so, by e-mail; empty when unknown. */
  by: string;
  at: string;
  /** How many of its to-dos are open. */
  openCount: number;
  /** The first open to-dos' titles, in the Notes To-Do tab's order (starred first, then newest). */
  titles: string[];
}

/** Something a shipment's dates say needs doing, as Needs Attention lists it. */
export interface TrackingAttentionFlag {
  kind: "to_confirm" | "eta_passed" | "etd_passed" | "no_onward" | "no_event" | "not_told" | "not_released" | "tax_date" | "delivered_not_billed" | "free_time";
  /** urgent is red, attention amber. */
  severity: "urgent" | "attention";
  /** Whose desk it is. */
  area: "tracking" | "finance";
  label: string;
  detail: string;
}

export interface TrackingAttentionItem {
  id: string;
  jobNumber: string;
  customerId: string | null;
  customer: string;
  tradeDirection: string;
  status: string;
  flags: TrackingAttentionFlag[];
}

// ── Shipments → Managers (the operations managers' cockpit, Council Outlay 11) ──────────────

/** Which jobs the cockpit counts: all, or those travelling one way (lib/trackingEvents freightKindOf). */
export type OpsCockpitMode = "all" | "sea" | "air" | "rail" | "road";
/** Which jobs the cockpit counts by their Trade Direction. */
export type OpsCockpitDirection = "all" | "import" | "export" | "domestic";

/** A row of a cockpit card: one active job - or a Master Job with no house yet - with everything that asks for a manager's look. */
export interface OpsCockpitRow {
  /** "job": a shipment. "masterJob": a Master Job with no shipment linked; then `id` is the Master Job's id, `jobNumber` its MCZ number, `status` is "", and the mode, direction and Handled By - which the filters go by - are the Master Job's own. */
  kind: "job" | "masterJob";
  /** The shipment's id (the Master Job's for a row of that kind). */
  id: string;
  jobNumber: string;
  customer: string;
  /** "sea" | "air" | "rail" | "road", "" when the job has no Freight Mode (the Sea filter still counts it, as the app reads such a job as sea). */
  mode: string;
  tradeDirection: string;
  status: string;
  /** Handled By as stored (an e-mail), "" when nobody. */
  handledBy: string;
  holidayCover: string;
  /** Where the row's first tag is best worked on: the shipment tab the web opens. */
  area: "tracking" | "customs" | "finance" | "details";
  /** Every signal of the job, the urgent ones first; each with its `kind`, the family the tiles filter the cards by. */
  tags: CockpitTag[];
}

export interface OpsCockpitList {
  /** Every row of the card; `rows` holds at most COCKPIT_LIST_LIMIT of them. */
  total: number;
  rows: OpsCockpitRow[];
}

/** Counts over the active jobs read, of the chosen mode, direction and Handled By. */
export interface OpsCockpitTiles {
  active: number;
  /** Rows with an urgent cut-off tag: a Closing, VGM, SI, AMS or ISF due today or by the next working day, or missed before the job departed. */
  cutoffsDue: number;
  noHandledBy: number;
  /** Handled By names somebody who is not an active user of the company; null when the users could not be read. */
  handledByNotUser: number | null;
  /** Rows with a booking tag: Booking Confirmation still Pending with the cargo ready or the ETD close. */
  bookingPending: number;
  /** An ETD or ETA that moved lately. */
  etdEtaMoved: number;
  /** A container's free time ending or over. */
  freeTime: number;
  /** Customs priority Urgent, not released, the deadline within 24 hours or passed. */
  customsUrgent: number;
  /** Tax date reached, not yet in Billing — the same rule as the list's unbilled-arrivals. */
  notReleased: number;
  openClaims: number;
  /**
   * Per signal family (the `kind` of a tag: owner, not_user, cutoff, booking, cargo_ready, departure, arrival,
   * free_time, customs, paperwork, dangerous, bl, arrival_notice, delivery, warehouse, road, air,
   * request, import_instructions, remeasurement, status_stuck, credit, master_job, tracking,
   * billing, customer_told, todo, mention, not_touched): how many rows carry at least one tag of
   * it, after the filters. Every family is there, 0 for none.
   */
  signals: Record<string, number>;
}

/** One person named in Handled By, over the active jobs of the chosen mode and direction. */
export interface OpsCockpitPerson {
  /** The e-mail in Handled By, "" for nobody. */
  handledBy: string;
  /** False when the e-mail is not an active user (nobody is none); null when the users could not be read. */
  isUser: boolean | null;
  active: number;
  /** Of those, the jobs on the URGENT card… */
  urgent: number;
  /** …and on the ATTENTION card. */
  attention: number;
  /** Active jobs where this person is the Holiday Cover. */
  covers: number;
  /** Their active jobs by how they travel (lib/trackingEvents freightKindOf): the four add up to `active`. */
  byMode: { sea: number; air: number; rail: number; road: number };
  /** Open to-dos past their day on the jobs they handle; null when the to-dos could not be read. */
  todosLate: number | null;
  /** @mentions of this person they have not read for 4 office hours or longer, on the jobs they handle or cover; null when not known. */
  mentionsUnread: number | null;
  /** Their jobs carrying a "Not touched since …" tag; null when the jobs' last touches could not be read. */
  notTouched: number | null;
  /** The oldest day one of their covers was set (YYYY-MM-DD); null when they cover nothing, or when that is not known. */
  coversSince: string | null;
  /** More active jobs than 1.5 times the median of the people with at least one - said only among three such people or more, and never of "nobody". */
  highLoad: boolean;
}

/**
 * Whose jobs the cockpit counts: everyone's, or those handled by the users who report to the caller
 * (Settings → Users, "Reports to") - and, with them, those whose Handled By is no user of the company:
 * a report who was deactivated reports to nobody any more, and their jobs are every manager's to see.
 */
export type OpsCockpitReports = "all" | "mine";

/** One figure of the audit line: how often something a manager wants to know of happened. */
export interface OpsCockpitAuditItem {
  /**
   * prepayment_release | own_credit_check | own_document_approval | deleted | cancelled | tick_taken_back |
   * ata_atd_changed | warehouse_received_moved | handled_by_changed | requests_decided | handed_over |
   * cutoff_dismissed | release_requests_decided. The key GET /shipments/managers-audit lists the rows of.
   */
  key: string;
  count: number;
  /** Only on requests_decided and release_requests_decided, from 10 decided: the share approved, 0-1. Close to 1 is a rubber stamp. */
  approvalRate?: number;
}

/** The audit line: the company's last `days` days, whatever mode, direction or person the page is narrowed to. */
export interface OpsCockpitAudit {
  days: number;
  /** Every key whose part could be read, 0 for none; a key that is missing was not read and is named in `notKnown`. */
  items: OpsCockpitAuditItem[];
}

/** A row of the audit line's drill-down: one thing that happened on a job. */
export interface ManagersAuditRow {
  shipmentId: string;
  /** The job as it is called now; a deleted job keeps its number here. */
  jobNumber: string;
  /** Who did it, by e-mail; "" when the user is no longer known. */
  who: string;
  /** ISO time. */
  at: string;
  /** What happened, in a line. */
  what: string;
}

export interface ManagersAuditList {
  /** The newest first, at most 200. */
  rows: ManagersAuditRow[];
  /** True when there were more than listed. */
  capped: boolean;
}

export interface ShipmentsManagersCockpit {
  /** ISO time the answer was worked out. */
  asOf: string;
  /** The Prague business day (YYYY-MM-DD) every rule was judged on. */
  today: string;
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  /** The Handled By e-mail the tiles and cards are narrowed to, "nobody", or null for everyone. */
  handledBy: string | null;
  /** "mine": only the jobs handled by the users who report to the caller, and those whose Handled By is not a user - tiles, cards and `people` alike. */
  reports: OpsCockpitReports;
  tiles: OpsCockpitTiles;
  urgent: OpsCockpitList;
  attention: OpsCockpitList;
  /**
   * Everyone named in Handled By on an active job of the chosen mode and direction (NOT narrowed
   * by handledBy: the page picks a person from it), the most active first; "" (nobody) is among
   * them when it has jobs. Somebody who only covers jobs is there too, with `active` 0. With
   * `reports` "mine": only the users who report to the caller, and whoever is not a user.
   */
  people: OpsCockpitPerson[];
  /** The audit line; null when none of it could be read (then `notKnown` says so). */
  audit: OpsCockpitAudit | null;
  /** The updates the warehouse and Trucking owe the jobs of the page (after its filters): waiting too long, or failed. */
  handover: OpsCockpitHandover;
  /** True when the company has more active jobs than were read (COCKPIT_JOB_LIMIT, the newest): the counts cover only those read. */
  capped: boolean;
  /** False when the company's own holidays could not be read: working days then skip only the weekends and the statutory public holidays. */
  holidaysKnown: boolean;
  /** What could not be read right now, in words for the page ("tracking events", "containers"…): it gave no signal, which is not the same as none (D29). Empty when everything was read. */
  notKnown: string[];
}

/**
 * The hand-over line (step 5, D30): over the jobs of the page - its mode, direction, Handled By
 * and "My reports" - the updates the warehouse and Trucking have for them that wait longer than
 * that module's own stale limit, and those that failed for good. A figure is null - not 0 - when
 * that module, or its updates, could not be read (`notKnown` says so).
 */
export interface OpsCockpitHandover {
  warehouseUpdatesWaiting: number | null;
  warehouseUpdatesFailed: number | null;
  truckingUpdatesWaiting: number | null;
  truckingUpdatesFailed: number | null;
}

/** A fact a read document states, for a person to look over. */
export interface TrackingReadFact {
  kind: string;
  label: string;
  occurredOn: string;
  place: string;
  vessel: string;
  note: string;
  effect: "apply" | "propose" | "none";
  sets: string;
  alreadyKept: boolean;
  refusal: string;
}

export interface TrackingVesselChange {
  vessel: string;
  voyage: string;
}

/** The last free day a notice states, and the boxes it goes on. */
export interface TrackingLastFreeDayChange {
  day: string;
  containerIds: string[];
  containerNumbers: string[];
}

/** A shipment's customer link as the desk sees it; the URL isn't kept. */
export interface ShipmentCustomerLink {
  createdAt: string;
  createdBy: string;
  lastOpenedAt: string | null;
  /** The last day it opens; null until the job is delivered. */
  openUntil: string | null;
  /** False once the job is cancelled or that day has passed. */
  open: boolean;
}

/** One step on the customer's page. */
export interface PublicMilestone {
  key: string;
  label: string;
  leg: string;
  place: string;
  planned: string | null;
  actual: string | null;
  detail: string;
  state: "done" | "next" | "open";
}

/** All a customer's link shows: nothing else leaves the app through it. */
export interface PublicShipmentStatus {
  /** Whose page it is; "" when it couldn't be read. */
  ourCompany: string;
  reference: string;
  customerReference: string;
  direction: string;
  freightMode: string;
  pol: string;
  pod: string;
  vessel: string;
  containers: string[];
  milestones: PublicMilestone[];
  asOf: string;
}

/** One box's free time at the carrier, on the Tracking tab. */
export interface TrackingContainerClock {
  containerId: string;
  containerNumber: string;
  freeTimeDays: number | null;
  freeTimeFrom: string;
  /** The last free day the carrier stated; null when it is only counted. */
  lastFreeDayStated: string | null;
  state: "unknown" | "not_started" | "running" | "ending" | "chargeable" | "returned";
  startDay: string | null;
  lastFreeDay: string | null;
  daysLeft: number | null;
  chargeableDays: number;
  stopDay: string | null;
}

export interface TrackingReadingPreview {
  facts: TrackingReadFact[];
  /** The last free day it states, when the job has boxes that run a clock. */
  lastFreeDayChange: TrackingLastFreeDayChange | null;
  /** The vessel and voyage it names, when they differ and nothing has sailed yet. */
  vesselChange: TrackingVesselChange | null;
  containersFound: string[];
  otherShipment: boolean;
}

/** One house of a master job on the master job's Tracking tab. */
export interface MasterJobTrackingHouse {
  shipmentId: string;
  jobNumber: string;
  customer: string;
  departed: string | null;
  arrived: string | null;
  customsCleared: boolean;
  customsStatus: string;
  gateIn: string | null;
  delivered: string | null;
  lastEvent: string;
}

export interface ShipmentTracking {
  /** Free time per box; empty for a job that runs no clock. */
  containerClocks: TrackingContainerClock[];
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

// ── Main search (the app-wide search in the top bar) ──────────────────────────

/** GET /search/shipments and GET /search/master-jobs: the typed text and how many rows to give. */
export interface SearchShipmentsRequest {
  /** What was typed; fewer than 2 characters (trimmed) give no rows. */
  q: string & MaxLen<200>;
  /** Rows to give: 5 when left out, 1 to 50. */
  limit?: number;
}

/** A shipment found by the main search. */
export interface SearchShipmentItem {
  id: string;
  jobNumber: string;
  customer: string;
  customerId: string | null;
  pol: string;
  pod: string;
  status: string;
  tradeDirection: string;
  freightMode: string;
  /** Estimated departure, YYYY-MM-DD; null when not known. */
  etd: string | null;
  /** Estimated arrival, YYYY-MM-DD; null when not known. */
  eta: string | null;
}

export interface SearchShipmentsResponse {
  /** The newest matching shipments, at most `limit`. */
  items: SearchShipmentItem[];
  /** How many shipments match in all. */
  total: number;
}

/** GET /search/master-jobs: the typed text and how many rows to give. */
export interface SearchMasterJobsRequest {
  /** What was typed; fewer than 2 characters (trimmed) give no rows. */
  q: string & MaxLen<200>;
  /** Rows to give: 5 when left out, 1 to 50. */
  limit?: number;
}

/** A master job found by the main search. */
export interface SearchMasterJobItem {
  id: string;
  mczNumber: string;
  masterBolNumber: string;
  vessel: string;
  voyage: string;
  pol: string;
  pod: string;
  /** Its live house shipments. */
  shipmentCount: number;
}

export interface SearchMasterJobsResponse {
  /** The newest matching master jobs, at most `limit`. */
  items: SearchMasterJobItem[];
  /** How many master jobs match in all. */
  total: number;
}

/** GET /search/containers: the typed text and how many rows to give. */
export interface SearchContainersRequest {
  /** What was typed; a container is looked for from 4 characters (spaces left out). */
  q: string & MaxLen<200>;
  /** Rows to give: 5 when left out, 1 to 50. */
  limit?: number;
}

/** A container found by the main search, on the job it is on. */
export interface SearchContainerItem {
  /** The container row's id: the job's Container Details opens on it. */
  id: string;
  containerNumber: string;
  type: string;
  shipmentId: string;
  jobNumber: string;
  /** The job's master job, when it is on one. */
  masterJobId: string | null;
  mczNumber: string | null;
}

export interface SearchContainersResponse {
  /** The matching containers of the newest jobs, at most `limit`. */
  items: SearchContainerItem[];
  /** How many containers match in all. */
  total: number;
}

/** One shipment file as another service shows it: its name, type and signed link (it lasts an hour). */
export interface AttachmentFileLink {
  fileName: string;
  fileType: string;
  contentUrl: string;
}

/** A live shipment a document reading made already for a House B/L. */
export interface ReadingShipmentMatch {
  /** The House B/L as it was asked for. */
  houseBol: string;
  shipmentId: string;
  jobNumber: string;
}

/** What a document reading made already: shipments by House B/L, the master job of the Master B/L. */
export interface ReadingMatches {
  shipments: ReadingShipmentMatch[];
  masterJob: { id: string; mczNumber: string } | null;
}

// ─── Shipments → Managers, step 3: what a manager does (builder M's block; keep additions inside it) ───

/** What a release request asks to be released: the House BoL, or the cargo from the warehouse (Warehouse Released). */
export type ReleaseRequestWhat = "house_bol" | "warehouse";

/**
 * A request to release a job the prepayment stop holds, as the screens show it. Approving releases nothing: an
 * approved request is a pass for that job and that release - the release then goes through for whoever on the
 * job makes it, once, while the pass is good (`usable`, `validUntil`).
 */
export interface ReleaseRequestItem {
  id: string;
  shipmentId: string;
  jobNumber: string;
  customer: string;
  what: ReleaseRequestWhat;
  /** Why the one asking wants it released. */
  reason: string;
  /** closed: the job was released another way - while the request still waited (nobody answered it), or before its approval was used. */
  status: "pending" | "approved" | "rejected" | "closed";
  requestedById: string;
  requestedByName: string;
  requestedAt: string;
  /** "" while pending, and on a request closed while it waited. One closed after it was approved keeps who approved it. */
  decidedByName: string;
  /** null while pending, and on a request closed while it waited. One closed after it was approved keeps when. */
  decidedAt: string | null;
  /** The manager's reason, required either way: to release all the same (approved), or why not (rejected). Closed: "Released without it". */
  comment: string;
  answerSeenAt: string | null;
  /** When the approval was used for the release; null while it was not. */
  usedAt: string | null;
  /** Who released with it (their e-mail); "" while it was not used. */
  usedByName: string;
  /** Approved: until when it can be used (7 days from the decision). null otherwise. */
  validUntil: string | null;
  /** Approved, not used and not run out: the release goes through now. Worked out when the answer was made. */
  usable: boolean;
  /** Closed: when the job was released another way. null otherwise. */
  closedAt: string | null;
}

/** A job a hand-over left as it was, and why. */
export interface HandOverSkipped {
  shipmentId: string;
  /** "" when the job was not found. */
  jobNumber: string;
  why: string;
}

/** What a hand-over of many jobs did. */
export interface HandOverResult {
  /** Jobs whose Handled By or Holiday Cover changed. */
  changed: number;
  skipped: HandOverSkipped[];
}

/** A missed cut-off a manager dismissed (lib/cutoffDismissals). */
export interface CutoffDismissalItem {
  id: string;
  shipmentId: string;
  cutoff: "closingDate" | "vgmClosing" | "siClosing" | "amsDeadline" | "isfDeadline";
  /** The date the cut-off had when it was dismissed (YYYY-MM-DD): it stays dismissed while it keeps this date. */
  cutoffDate: string;
  reason: string;
  dismissedByName: string;
  dismissedAt: string;
}

/** What a manager's nudge left on the job. */
export interface NudgeResult {
  /** The to-do on the job's Notes To-Do tab. */
  note: ShipmentNoteItem;
  /** Who the chat line tagged (their e-mails), so it is under their bell: the job's Handled By and Holiday Cover, as far as they are users. */
  told: string[];
}

/** How many active jobs name a person, for the Users page's warning before one is deactivated. */
export interface HandledByCount {
  /** Active jobs with this e-mail in Handled By. */
  handledBy: number;
  /** Active jobs with this e-mail in Holiday Cover. */
  covers: number;
}

// ─── end of builder M's block ───

// ─── Shipments → Managers, step 4: the Money tab (builder S's block; keep additions inside it) ───

/** An amount in its own currency. Amounts of different currencies are never added (D24). */
export interface MoneyAmount {
  currency: string;
  amount: number;
}

/** One money signal of a job, as a tag: its words, whether it is urgent, and its family (lib/managersMoney MONEY_SIGNAL_KINDS). */
export interface OpsMoneyTag {
  text: string;
  urgent: boolean;
  /** margin | not_invoiced | unticked | cost_after_billing | accrual | supplier_invoice | cost_claim | credit | not_recharged */
  kind: string;
}

/** A row of a Money card: one job - active, or invoiced within the last 90 days - with everything its money asks of a manager. The web opens it on its Costs tab. */
export interface OpsMoneyRow {
  id: string;
  jobNumber: string;
  customer: string;
  /** "sea" | "air" | "rail" | "road", "" when the job has no Freight Mode - as on the cockpit's rows. */
  mode: string;
  tradeDirection: string;
  status: string;
  /** Handled By as stored (an e-mail), "" when nobody. */
  handledBy: string;
  holidayCover: string;
  /** The job reads Invoicing Status "Invoiced": no active job - it is here for a loss, a supplier invoice after billing, estimates nobody invoiced, supplier invoices, a cost claim or what was not recharged. */
  invoiced: boolean;
  /** Every money signal of the job, the urgent ones first. */
  tags: OpsMoneyTag[];
}

export interface OpsMoneyList {
  /** Every row of the card; `rows` holds at most 200 of them. */
  total: number;
  rows: OpsMoneyRow[];
}

/**
 * One person's money, over the jobs they are named on in Handled By (of the chosen mode and
 * direction, and with "My reports" only the caller's reports'; not narrowed by the Handled By
 * filter) - the jobs that read Invoiced since lately too, except in the work not yet invoiced.
 * No ranking (D27): the cockpit's people order, by their active jobs. A figure whose part could
 * not be read is null, never 0 (D29).
 */
export interface OpsMoneyPerson {
  /** The e-mail in Handled By, "" for nobody. */
  handledBy: string;
  /** False when the e-mail is not an active user (nobody is none); null when the users could not be read - as on the cockpit's people. */
  isUser: boolean | null;
  /** Their active jobs (those that read Invoiced are none): what the people are ordered by. */
  active: number;
  /** Work not yet invoiced on their active jobs, per currency ([] for none); null when Invoicing could not be read. */
  notYetInvoiced: MoneyAmount[] | null;
  /** Their jobs whose profit is below zero, at any stage - still being worked on, in Billing or invoiced (a job whose margin is not known is none of them); null when the selling and cost lines could not be read. */
  jobsAtLoss: number | null;
  /** Estimated buy lines with no supplier invoice yet, on their jobs; null when Invoicing could not be read. */
  estimatesOpen: number | null;
  /** Supplier invoices of their jobs waiting for approval; null when Invoicing could not be read. */
  supplierInvoicesWaiting: number | null;
  /** Open cost claims on their jobs; null when the cost claims could not be read. */
  costClaimsOpen: number | null;
}

export interface OpsMoneyTiles {
  /** Work not yet invoiced on the ACTIVE jobs counted, per currency ([] for none); null when Invoicing could not be read. */
  notYetInvoiced: MoneyAmount[] | null;
  /** The same as one CZK figure at today's ČNB rates - the only place currencies are added - with `label` "at today's ČNB rate (dd.mm.)"; `label` is "" when every amount is in CZK already (no rate was used: the page shows no CZK line). Null when a currency has no rate that day (`notKnown` names it) - and when Invoicing could not be read. */
  notYetInvoicedCzk: { amount: number; label: string } | null;
  /** How many of the jobs counted have work not yet invoiced; null when Invoicing could not be read. */
  notYetInvoicedJobs: number | null;
  /** Per signal family: the rows carrying a tag of that kind. Every family is there, 0 for none - but see `signalsNotKnown`. */
  signals: Record<string, number>;
  /** The families that could not be judged in this answer (their part was not read): their 0 in `signals` says nothing and the page shows no figure for them. */
  signalsNotKnown: string[];
  /** Jobs whose margin could not be worked out - a ČNB rate is missing, or the job's rates are not fixed yet and could not be read (`notKnown` says how many of each); null when Invoicing could not be read. */
  marginNotKnown: number | null;
}

/** GET /shipments/managers-money: the Money tab of Shipments → Managers. Read-only; its facts are kept for five minutes per company, mode, direction and "My reports" - picking a Handled By reads nothing. */
export interface ShipmentsManagersMoney {
  /** When the facts were read (the answer may be up to five minutes old). */
  asOf: string;
  /** The Prague business day everything was judged on. */
  today: string;
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  /** The Handled By e-mail the tiles and cards are narrowed to, "nobody", or null for everyone. */
  handledBy: string | null;
  reports: OpsCockpitReports;
  tiles: OpsMoneyTiles;
  urgent: OpsMoneyList;
  attention: OpsMoneyList;
  people: OpsMoneyPerson[];
  /** The company has more active jobs - or more jobs invoiced within the last 90 days - than were read. */
  capped: boolean;
  /** False when the company's own holidays could not be read: working days then skip only weekends and the statutory holidays. */
  holidaysKnown: boolean;
  /** What could not be read, in the words the page shows: it gives no figure and no signal. */
  notKnown: string[];
}

// ─── end of builder S's block ───
