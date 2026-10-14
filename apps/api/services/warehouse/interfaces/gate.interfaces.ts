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

export interface GateMovementItem {
  id: string;
  gateRef: string;
  warehouseTaskId: string | null;
  /** WCZ reference of the linked warehouse task, empty when unlinked. */
  positionRef: string;
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
  /** The PIN itself is never returned — the gate only verifies it. */
  hasPin: boolean;
  pinTries: number;
  pinLocked: boolean;
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
  createdAt: string;
  updatedAt: string;
}

/**
 * Editable fields. `pin` sets a new 4-digit PIN (empty string clears it).
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
  loadInDate?: string;
  freeDays?: number | null;
  note?: string;
}
