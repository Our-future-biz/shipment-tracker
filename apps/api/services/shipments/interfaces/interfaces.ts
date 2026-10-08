export interface ContainerLine {
  // Stable row id. Present on reads; clients echo it back on updates so cargo
  // lines keep pointing at the same container. Absent on brand-new rows.
  id?: string;
  containerNumber: string;
  sealNumber: string;
  type: string;
  // Derived from type on the server (20' → 1, 40' → 2); client values are ignored.
  teu: string;
  packages: string;
  packageType: string;
  grossWeight: string;
  volume: string;
}

// A goods line of the Cargo Description card. No volume by design — volume only
// exists on dimension lines. containerId is null for containerless cargo (LCL/air).
export interface CargoItemLine {
  containerId?: string | null;
  cargoDescription: string;
  hsCode: string;
  pieces: string;
  packageType: string;
  grossWeight: string;
  commercialInvoiceValue: string;
  currency: string;
}

// A dimension line of the Cargo Dimensions card: `pieces` identical pieces of
// L×W×H (cm) and weightPerPcKg each. Volume per piece is derived, never stored.
export interface CargoDimensionLine {
  containerId?: string | null;
  pieces: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightPerPcKg: string;
  packageType: string;
  stackable: string;
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
  customer: string;
  customerPic: string;
  customerReference: string;

  // Commercial parties
  pickupAddress: string;
  deliveryAddress: string;
  shipperContact: string;
  consigneeContact: string;
  shipperOpeningFrom: string;
  shipperOpeningTo: string;
  consigneeOpeningFrom: string;
  consigneeOpeningTo: string;

  // Status / mode
  freeComments: string;
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
  etaWarehouse: string | null;
  warehouseReceivedDate: string | null;
  warehouseReleasedDate: string | null;
  warehouseReference: string;
  warehouseTruck: string;
  plateNumber: string;
  plannedDeliveryDate: string | null;
  plannedDeliveryTime: string;

  // Commercial
  commercialInvoice: string;
  creditCheck: string;
  approvedBy: string;
  bookingConfirmation: string;
  customsProcedure: string;
  /** Customs Movement Reference Number. */
  mrn: string;
  /** Manual override of the Customs "received" ticks: "" | "yes" | "no". */
  csRecvInvoice: string;
  csRecvPacking: string;
  /** Business document types present on the shipment (Invoice, Packing list, …). */
  documentTypes: string[];
  equipmentDelivery: string;
  releaseReference: string;
  releaseDepot: string;
  redeliveryReference: string;
  redeliveryDepot: string;
  equipmentDeliveryDate: string | null;
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

  // Read-only projections computed from the rows above (never stored).
  // containerNumber/sealNumber/pcs/typeOfPackages/hsCode/cargoDescription are
  // also overridden with computed values when detail rows exist.
  containerTypeSummary: string; // e.g. "2× 40' HC, 1× 20' GP"
  totalTeu: string;
  totalGrossWeightKg: string;
  totalVolumeM3: string;
  civByCurrency: string; // e.g. "12 500 USD, 3 000 EUR"

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
  createdAt: string;
}

/** A chat message that tags the reader and that they have not opened yet. */
export interface CommentMentionItem {
  /** Id of the message. */
  id: string;
  shipmentId: string;
  jobNumber: string;
  authorName: string;
  message: string;
  createdAt: string;
}

/** A file sent with a chat message. */
export interface CommentAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export interface CommentItem {
  id: string;
  shipmentId: string;
  authorId: string;
  /** Who wrote it (display name, e-mail when they have none). */
  authorName: string;
  message: string;
  createdAt: string;
  attachments: CommentAttachment[];
  /** On the reader's own messages: a colleague has opened the chat since it was sent. */
  readByOthers: boolean;
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
  storageKey: string;
  createdAt: string;
  /** Business document type (Invoice, Packing list, …); "" until classified. */
  documentType: string;
  /** Customs review: "" (pending) | approved | declined. */
  customsStatus: string;
  customsNote: string;
  customsReviewedAt: string | null;
  /** Display name of the uploader; "Unknown" when it cannot be resolved. */
  uploadedByName: string;
  /** Display name of the customs reviewer; "" while the document is unreviewed. */
  customsReviewedByName: string;
}

export interface AuditItem {
  id: string;
  shipmentId: string;
  userId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
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
