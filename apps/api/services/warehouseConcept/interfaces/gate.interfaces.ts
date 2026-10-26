import type { Min } from "encore.dev/validate";
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
  /** Set when a Trucking trip filled the leg ("From trip LCZ…"): read-only, cleared only by the trip. */
  source?: GateTripSource | null;
  /** IN leg of a trip: the gate figures that trip wrote (see `GateMovementItem.tripFigures`). */
  figures?: GateLegFigures | null;
}

export interface GateLegFigures {
  colli?: number;
  weightKg?: number;
  measureCbm?: number;
}

/** What a Trucking trip filled (transport leg, pick-up row, dock slot). */
export interface GateTripSource {
  kind: "trucking";
  tripRef: string;
  /** Trucking's trip kind (PICKUP_RUN, LINEHAUL, DELIVERY_RUN), when the trip sent it. */
  tripKind?: string;
  /** Trucking's trip id, when the trip sent it: the marker links to the trip. */
  tripId?: string;
}

/** Gate figures a Trucking trip wrote (pieces / kg / cbm), with the trip: "From trip LCZ…" while unchanged. */
export interface GateTripFigures {
  source: GateTripSource;
  colli?: number;
  weightKg?: number;
  measureCbm?: number;
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
  /** Id of the phone request that made it (floor mode, offline queue). */
  requestId?: string;
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
  /** A row a Trucking trip filled carries `source` ("From trip LCZ…", read-only). */
  rows: { haulier: string; licensePlate: string; driver: string; source?: GateTripSource | null }[];
}

/** "Shipment may need correcting": when it was found and what the history says. */
export interface GateCorrectionNeeded {
  /** ISO */
  at: string;
  detail: string;
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
 * receipt (inbound: the gate-in; outbound: the stripping tally tick, else the "Received in
 * warehouse" date), stops at the WH release (inbound stuffed in a container: that container's
 * gate-out; outbound: also the gate-out); calendar days in Prague time, the arrival day is day 1.
 * CZK 22 per W/M per day, at least CZK 120, after the free days.
 */
export interface GateStorageInfo {
  started: boolean;
  /** YYYY-MM-DD (Prague); "" when not started. */
  startDate: string;
  /**
   * What started the clock: "gateIn" (inbound), "tally" (outbound, ticked received at the
   * stripping tally), "loadInDate" (outbound without a tally), "" (not started).
   */
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
  /** survey | tally (found at the stripping tally) | manual (default) */
  source?: string;
  /** Photos of this movement to attach (gate file ids, at most 20). */
  fileIds?: string[];
  /** Floor mode: id the phone gave this exception; the same id sent again adds nothing. */
  clientRequestId?: string;
  /** Floor mode: when it was recorded on the phone (ISO), if it was sent later (offline). */
  recordedAt?: string;
}

/** A dock slot booked for the movement (Dock & Yard), as the gate job and floor mode show it. */
export interface GateDockSlot {
  id: string;
  /** YYYY-MM-DD (Prague) */
  date: string;
  /** HH:MM (Prague) */
  time: string;
  /** HH:MM (Prague) the slot ends; "" when unknown. */
  end: string;
  dock: string;
  /** IN | OUT */
  direction: string;
  /** Booked | In progress | Completed | Overdue */
  status: string;
  durationMin: number;
  /** ISO; null on old slots whose date / time could not be read. */
  startsAt: string | null;
  endsAt: string | null;
  /** The Trucking trip that booked the slot ("" when booked by hand). */
  tripRef: string;
}

/** One re-weighing of the position (LCL cargo is re-weighed on receipt; the latest counts). */
export interface GateReweighItem {
  id: string;
  movementId: string;
  weighedKg: number;
  /** The declared gross weight it was compared with; null when none was known. */
  declaredKg: number | null;
  /** shipment (its total weight) | gate (the gate figures) | "" */
  declaredSource: string;
  /** Weighed against declared, e.g. 0.046 = 4.6 % heavier; null when not compared. */
  variancePct: number | null;
  /** More than 5 % off the declared weight. */
  flagged: boolean;
  weighedBy: string;
  weighedAt: string;
  /** Scale photos (gate file ids). */
  fileIds: string[];
  note: string;
  createdAt: string;
}

/** A re-weighing as the gate (or a phone) records it; who is the caller. */
export interface GateReweighInput {
  /** Weighed gross weight in kg (more than 0, at most 100 000). */
  weighedKg: number;
  note?: string;
  /** Scale photos of this movement (gate file ids, at most 20). */
  fileIds?: string[];
  /** Floor mode: id the phone gave this weighing; the same id sent again adds nothing. */
  clientRequestId?: string;
  /** Floor mode: when it was weighed on the phone (ISO), if it was sent later (offline). */
  recordedAt?: string;
}

/** One step of the position's lifecycle. */
export interface GateLifecycleStep {
  /** expected | arrived | received | in_warehouse | stuffed | ready | left */
  stage: string;
  label: string;
  /** ISO time, or a YYYY-MM-DD day (a received date typed by hand); null when not reached. */
  at: string | null;
  done: boolean;
}

/**
 * The position's in-and-out lifecycle, derived from its stamps, the stripping tally and the
 * stuffing (never stored). Inbound: Expected → Arrived → Received → In warehouse → (Stuffed) →
 * Left. Outbound: Expected → Arrived → Received → In warehouse → Ready for release → Left.
 */
export interface GatePositionLifecycle {
  stage: string;
  label: string;
  at: string | null;
  /** The movement is refused (shown next to the stage). */
  refused: boolean;
  steps: GateLifecycleStep[];
}

/** The container the position is a house of, with the house's state in it. */
export interface GatePositionContainer {
  id: string;
  number: string;
  equipment: string;
  /** Unloading (import, stripped) | Loading (export, stuffed) */
  direction: string;
  /** import | export */
  kind: string;
  /** Expected · Arrived · Stripping · Stripped · Planning · Stuffing · Closed · Gone out */
  status: string;
  seal: string;
  gateInAt: string | null;
  gateOutAt: string | null;
  stuffedAt: string | null;
  stuffedBy: string;
  /** "" (not tallied) | received | short | not_arrived */
  tallyOutcome: string;
  tallyPieces: number | null;
  tickedAt: string | null;
  tickedBy: string;
  /**
   * Import: the house is received by its tick-off at the stripping tally (its WH release waits
   * for it). False for an old one-position container linked by migration 0017, which keeps the
   * "Received in warehouse" date typed by hand; false for export containers.
   */
  tallyRequired: boolean;
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
  /** E-mail of a user of the company ("" for nobody); an older record may still hold a name. */
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
  /** The shipment's closing date (cargo cut-off, YYYY-MM-DD), read with its customs status; "" when none. */
  closingDate: string;
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
  /** Gate figures written by a Trucking trip; null when none. */
  tripFigures: GateTripFigures | null;
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
  /**
   * A stamp was voided after its update reached the shipment, so the shipment may still carry the
   * date the warehouse took back; null when none is open (or it was dismissed).
   */
  correctionNeeded: GateCorrectionNeeded | null;
  /** Days in the warehouse, free time and the estimated storage charge. */
  storage: GateStorageInfo;
  /** Damage / short / over exceptions, oldest first (open and resolved). */
  exceptions: GateExceptionItem[];
  /** Open exceptions: the cargo is ON HOLD while this is above 0. */
  openExceptions: number;
  /** Dock slots booked for this movement (not cancelled), earliest first. */
  dockSlots: GateDockSlot[];
  /** Outbound: when the house was ticked received at the stripping tally; null otherwise. */
  receivedAt: string | null;
  /** Inbound: when it left stuffed in a container (that container's gate-out); null otherwise. */
  leftAt: string | null;
  leftContainerId: string | null;
  /** Where the position is in its in-and-out lifecycle. */
  lifecycle: GatePositionLifecycle;
  /** The container the position is a house of; null when none. */
  container: GatePositionContainer | null;
  /** LCL cargo: re-weighed before the receipt (export) or the tally tick (import). */
  needsReweigh: boolean;
  /** The re-weighing that counts (the latest); null when none. */
  reweigh: GateReweighItem | null;
  /** Every re-weighing, latest first. */
  reweighs: GateReweighItem[];
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
/** Gate visit: příjem (cargo comes in) | výdej (cargo goes out). */
export type GateVisit = "příjem" | "výdej";
/** Import = outbound (výdej), Export = inbound (příjem), Domestic = in at the hub, then out (no customs). */
export type GateHandling = "Import" | "Export" | "Domestic";
export type GateOperationType =
  | "LCL consolidation"
  | "FCL stuffing"
  | "FCL stripping"
  | "FCL transload (cross-stuff)"
  | "Cargo storage"
  | "Cargo storage (bonded)"
  | "Container yard storage";
export type GateCustomsMode = "SCP" | "JSD" | "T1" | "T2L" | "ATA Carnet" | "RDT" | "C-Goods";
/** Shared with Shipments; only the last one releases cargo. */
export type GateCustomsStatus =
  | "Waiting For Commercial Paperwork"
  | "Paperwork Verification Pending"
  | "Paperwork Verified"
  | "Under Customs Clearance"
  | "Customs Cleared/Released";

export interface GateMovementInput {
  gateRef?: string;
  warehouseTaskId?: string | null;
  visit?: GateVisit;
  handling?: GateHandling;
  operationType?: GateOperationType;
  customsMode?: GateCustomsMode;
  customer?: string;
  customerRef?: string;
  customerContact?: string;
  /** E-mail of a user of the company, "" for nobody; the record's current value is also accepted. */
  shipmentOwner?: string;
  colli?: number & Min<0>;
  packing?: string;
  weightKg?: number & Min<0>;
  measureCbm?: number & Min<0>;
  customsDocs?: string;
  mrn?: string;
  customsStatus?: GateCustomsStatus;
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

/** A stored person value the backfill could not tie to exactly one user of the company. */
export interface PeopleNormalizeUnmatched {
  field: string;
  value: string;
  /** Records holding it. */
  count: number;
}

/** What the people backfill did: values looked at, records changed, values left as they are. */
export interface PeopleNormalizeResult {
  checked: number;
  changed: number;
  unmatched: PeopleNormalizeUnmatched[];
}
