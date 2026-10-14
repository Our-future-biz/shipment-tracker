export type GateCheckState = "g" | "a" | "r" | "n";

export interface GateChecklist {
  ht: GateCheckState;
  photos: GateCheckState;
  measure: GateCheckState;
  vgm: GateCheckState;
  seal: GateCheckState;
  dg: GateCheckState;
}

export interface GateReleaseLine {
  g: string;
  s: "OK" | "Pending" | "Blocked";
  note: string;
}

export interface GateTransportLeg {
  leg: "IN" | "OUT" | "CFS";
  company: string;
  plate: string;
  driver: string;
  /** Driver's phone number. */
  phone: string;
  gateTime: string;
}

/** A container of the position, from the warehouse container register. */
export interface GateContainer {
  id: string;
  number: string;
  type: string;
}

/** One survey line: a number of packages with the same packing and condition. */
export interface GateSurveyLine {
  qty: number | null;
  outerPacking: string;
  visual: string[];
  inner: string[];
}

export interface GateSurvey {
  /** Container number, or "" for a position-level survey. */
  container: string;
  phase: string;
  damaged: number;
  lost: number;
  lines: GateSurveyLine[];
  driverNote: string;
  warehouseNote: string;
  surveyedAt: string;
  surveyedBy: string;
}

/** What the survey form sends; who and when are stamped by the server. */
export interface GateSurveyInput {
  container: string;
  phase: string;
  damaged: number;
  lost: number;
  lines: GateSurveyLine[];
  driverNote: string;
  warehouseNote: string;
}

export interface GateSubPosition {
  /** YYYY-MM-DD */
  etw: string;
  qty: number | null;
  packing: string;
  /** cm */
  width: number | null;
  length: number | null;
  height: number | null;
  description: string;
  /** kg */
  weight: number | null;
  /** cbm */
  measure: number | null;
  /** kg */
  totalGross: number | null;
  /** SPZ — licence plate */
  plate: string;
  driver: string;
  transport: string;
  vgm: boolean;
  vgmDate: string;
  storageDays: number | null;
}

export interface GateFileItem {
  id: string;
  movementId: string;
  container: string;
  tag: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
  createdAt: string;
}

export interface GateEvent {
  kind: string;
  label: string;
  at: string;
  by: string;
  detail?: string;
}

/**
 * The shipment's pick-up, as the gate sees it on a linked outbound movement: whether the PIN
 * operations made in Shipments is set, its tries and lock, and the haulier / plate / driver
 * rows to compare with the truck. The PIN itself is not here — the gate checks it.
 */
export interface GatePickupInfo {
  pinSet: boolean;
  tries: number;
  locked: boolean;
  pinCreatedAt: string;
  pinCreatedBy: string;
  rows: { haulier: string; licensePlate: string; driver: string }[];
}

/**
 * A shipment update the gate still owes (the received / released date or the plate written to
 * the linked shipment). "pending" is being retried; "failed" stopped and needs a hand in Shipments.
 */
export interface GateShipmentUpdateState {
  state: "pending" | "failed";
  /** What is not on the shipment yet, e.g. "warehouse received date". */
  what: string[];
  attempts: number;
  lastError: string;
  /** Next try (pending only). */
  nextAttemptAt: string | null;
}

/**
 * The storage clock of a movement — the warehouse's one free-time calculation. Starts at the
 * receipt (inbound: the gate-in; outbound: the "Received in warehouse" date), stops at the WH
 * release or gate-out; calendar days in Prague time, the arrival day is day 1. CZK 22 per W/M per
 * day, at least CZK 120, after the free days.
 */
export interface GateStorageInfo {
  started: boolean;
  /** YYYY-MM-DD (Prague); "" when not started. */
  startDate: string;
  /** What started the clock: "gateIn" (inbound), "loadInDate" (outbound), "" (not started). */
  startSource: string;
  stopped: boolean;
  /** YYYY-MM-DD (Prague) of the WH release / gate-out; "" while the cargo is in the warehouse. */
  stopDate: string;
  daysInWarehouse: number;
  freeDays: number;
  freeDaysLeft: number;
  /** YYYY-MM-DD; "" when not started. */
  lastFreeDay: string;
  chargeableDays: number;
  /** Chargeable W/M from the gate figures: the larger of cbm and tonnes. */
  wm: number;
  dailyCzk: number;
  estimatedCzk: number;
  /** Not started | Within free time | Expiring (2 free days left or fewer) | Chargeable */
  state: string;
}

/** A damage / short / over exception of the movement; an open one holds the release. */
export interface GateExceptionItem {
  id: string;
  movementId: string;
  taskId: string | null;
  /** Damaged | Short | Over */
  type: string;
  pieces: number;
  note: string;
  container: string;
  surveyPhase: string;
  /** survey | manual */
  source: string;
  /** Photos of the movement (gate file ids). */
  fileIds: string[];
  /** open | resolved */
  status: string;
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string;
  resolutionNote: string;
}

/** A new exception, from a survey or by hand. */
export interface GateExceptionInput {
  /** Damaged | Short | Over */
  type: string;
  pieces: number;
  note?: string;
  container?: string;
  surveyPhase?: string;
  /** survey | manual (default) */
  source?: string;
  /** Photos of this movement to attach (gate file ids, at most 20). */
  fileIds?: string[];
}

export interface GateMovementItem {
  id: string;
  gateRef: string;
  warehouseTaskId: string | null;
  /** WCZ reference of the linked warehouse task, empty when unlinked. */
  positionRef: string;
  /** Shipment of the linked warehouse task; null for walk-ins and positions without a shipment. */
  shipmentId: string | null;
  visit: string;
  handling: string;
  operationType: string;
  customsMode: string;
  customer: string;
  customerRef: string;
  customerContact: string;
  shipmentOwner: string;
  colli: number;
  packing: string;
  weightKg: number;
  measureCbm: number;
  customsDocs: string;
  mrn: string;
  customsStatus: string;
  freightMode: string;
  loadType: string;
  commodity: string;
  stackable: boolean | null;
  dangerousGoods: boolean | null;
  customerContactPhone: string;
  /** Shown only for dangerous goods (IMO / DG = yes). */
  unNumber: string;
  /** Copied once from the shipment job when recorded into the warehouse; never synced. */
  jobNumber: string;
  pol: string;
  pod: string;
  etd: string;
  eta: string;
  vessel: string;
  voyage: string;
  containerNumber: string;
  sealNumber: string;
  bookingNumber: string;
  hblNumber: string;
  mblNumber: string;
  cfsCustomsNumber: string;
  cfsCustomsProcedure: string;
  transportLegs: GateTransportLeg[];
  containers: GateContainer[];
  surveys: GateSurvey[];
  subPositions: GateSubPosition[];
  updatedBy: string;
  /**
   * The PIN itself is never returned — the gate only verifies it. On a linked outbound movement
   * these follow the shipment's pick-up PIN (see `pickup`).
   */
  hasPin: boolean;
  pinTries: number;
  pinLocked: boolean;
  /** Pick-up from Shipments; only on outbound movements linked to a shipment, else null. */
  pickup: GatePickupInfo | null;
  slot: string;
  carrier: string;
  driver: string;
  plate: string;
  status: string;
  gateIn: string | null;
  gateOut: string | null;
  impRelease: string | null;
  expDraft: string | null;
  expReceipt: string | null;
  checklist: GateChecklist;
  releaseGates: GateReleaseLine[];
  /** Follows the release gates; a refusal disarms, a supervisor override arms. Never set by hand. */
  armed: boolean;
  needsAttention: boolean;
  overridden: boolean;
  refusalLog: string;
  overrideLog: string;
  loadInDate: string;
  freeDays: number | null;
  note: string;
  events: GateEvent[];
  /** Set when the record is archived (or was deleted before archiving existed). */
  archivedAt: string | null;
  archivedBy: string;
  /** Empty for records deleted before archiving existed. */
  archiveReason: string;
  /** When the linked shipment's customs status was last read; null when never. */
  shipmentCheckedAt: string | null;
  /** Shipment update still owed by a stamp; null when everything reached the shipment. */
  shipmentUpdate: GateShipmentUpdateState | null;
  /** Days in the warehouse, free time and the estimated storage charge. */
  storage: GateStorageInfo;
  /** Damage / short / over exceptions, oldest first (open and resolved). */
  exceptions: GateExceptionItem[];
  /** Open exceptions: the cargo is ON HOLD while this is above 0. */
  openExceptions: number;
  createdAt: string;
  updatedAt: string;
}

/** Stamps a manager may void. */
export type GateStampKind = "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt";

/** Result of importing one shipment into the warehouse. */
export interface WarehouseImportResult {
  shipmentId: string;
  /** Job number of the shipment; empty when it could not be read. */
  jobNumber: string;
  /** created = new position; already = it was in the warehouse; failed = see reason (no reference used). */
  outcome: "created" | "already" | "failed";
  /** Warehouse task id and its WCZ reference (created / already). */
  taskId: string | null;
  ref: string;
  /** Gate record of the position, when it has one. */
  movementId: string | null;
  reason: string;
}

/**
 * Editable fields. `pin` sets a new 4-digit gate PIN (empty string clears it); outbound
 * movements linked to a shipment use the pick-up PIN from Shipments and refuse it.
 * Status, release gates and override are not here: they change only through the stamps,
 * Refuse and the supervisor override, each logged on the movement.
 */
export interface GateMovementInput {
  gateRef?: string;
  warehouseTaskId?: string | null;
  visit?: string;
  handling?: string;
  operationType?: string;
  customsMode?: string;
  customer?: string;
  customerRef?: string;
  customerContact?: string;
  shipmentOwner?: string;
  colli?: number;
  packing?: string;
  weightKg?: number;
  measureCbm?: number;
  customsDocs?: string;
  mrn?: string;
  customsStatus?: string;
  freightMode?: string;
  loadType?: string;
  commodity?: string;
  stackable?: boolean | null;
  dangerousGoods?: boolean | null;
  customerContactPhone?: string;
  unNumber?: string;
  jobNumber?: string;
  pol?: string;
  pod?: string;
  etd?: string;
  eta?: string;
  vessel?: string;
  voyage?: string;
  containerNumber?: string;
  sealNumber?: string;
  bookingNumber?: string;
  hblNumber?: string;
  mblNumber?: string;
  transportLegs?: GateTransportLeg[];
  subPositions?: GateSubPosition[];
  pin?: string;
  slot?: string;
  carrier?: string;
  driver?: string;
  plate?: string;
  checklist?: GateChecklist;
  cfsCustomsNumber?: string;
  cfsCustomsProcedure?: string;
  /** Outbound: the date the cargo was received in the warehouse (YYYY-MM-DD, "" clears); starts the storage clock. */
  loadInDate?: string;
  /** Free days of this position (0–365); null = the default (7). */
  freeDays?: number | null;
  note?: string;
}
