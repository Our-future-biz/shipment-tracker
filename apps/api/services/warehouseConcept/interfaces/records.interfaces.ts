// ---------- Containers ----------

export interface WarehouseContainerFields {
  number: string;
  equipment: string;
  seal: string;
  pieces: number | null;
  packages: string;
  weightKg: number | null;
  cbm: number | null;
  /** Unloading | Loading */
  direction: string;
  note: string;
  carrier: string;
  masterJob: string;
  dischargePort: string;
  /** YYYY-MM-DDTHH:MM */
  arrivedAt: string;
  houses: number | null;
  dockSlot: string;
  /** Scheduled | Arrived | Devanning | Devanned | Empty returned */
  scheduleStatus: string;
  yardState: string;
  /** YYYY-MM-DD */
  gatedIn: string;
  gatedOut: string;
  detentionExpiry: string;
  yardStatus: string;
  tareKg: number | null;
  cargoKg: number | null;
  vgmMethod: string;
  vgmDeclaredBy: string;
  /** YYYY-MM-DDTHH:MM */
  vgmDeclaredAt: string;
  /** "" | Draft | Submitted */
  vgmStatus: string;
  bookingNumber: string;
  mblNumber: string;
  vessel: string;
  voyage: string;
  /** The truck that takes the container away; sent to the shipments of its stuffed positions. */
  plate: string;
}

/** One position (house) in a container. */
export interface WarehouseContainerHouse {
  /** Id of the house (the link). */
  id: string;
  movementId: string;
  taskId: string | null;
  /** WCZ reference of the position. */
  positionRef: string;
  gateRef: string;
  customer: string;
  /** příjem | výdej */
  visit: string;
  operationType: string;
  pod: string;
  etd: string;
  /** Expected figures of the position (gate figures). */
  pieces: number;
  weightKg: number;
  cbm: number;
  sequence: number;
  addedBy: string;
  /** Lifecycle stage of the position (expected · arrived · received · in_warehouse · stuffed · ready · left) and its label. */
  stage: string;
  stageLabel: string;
  stuffedAt: string | null;
  stuffedBy: string;
  /** "" (not tallied) | received | short | not_arrived */
  tallyOutcome: string;
  tallyPieces: number | null;
  tallyCondition: string;
  tallyLocation: string;
  tallyNote: string;
  tallyReason: string;
  tickedAt: string | null;
  tickedBy: string;
  /** LCL: re-weighed before the tick (import) or the receipt (export). */
  needsReweigh: boolean;
  /** The re-weighing that counts; null when none. */
  reweighKg: number | null;
  reweighFlagged: boolean;
  /** Open damage / short / over exceptions (the cargo is on hold). */
  openExceptions: number;
  /** A supervisor override lets the cargo move although exceptions are open (not on hold). */
  overridden: boolean;
  /** The position is archived. */
  archived: boolean;
}

/** Pieces / kg / cbm of the houses against the capacity of the equipment type. */
export interface WarehouseContainerTotals {
  pieces: number;
  kg: number;
  cbm: number;
  capacityCbm: number | null;
  capacityKg: number | null;
  fillCbmPct: number | null;
  fillKgPct: number | null;
  /** Over capacity by volume or weight (a warning; the plan may still be saved). */
  overCapacity: boolean;
}

export interface WarehouseContainerItem extends WarehouseContainerFields {
  id: string;
  movementId: string | null;
  /** The position this container belongs to (from its gate movement), empty when none. */
  warehouseTaskId: string | null;
  positionRef: string;
  customer: string;
  handling: string;
  /** Tare + cargo, when both are known. */
  vgmKg: number | null;
  /** Whole days on our yard (gate-in to gate-out or today); null when not gated in. */
  daysOnYard: number | null;
  /** import (Unloading: stripped, houses tallied) | export (Loading: stuffed from a plan) */
  kind: string;
  /** Expected · Arrived · Stripping · Stripped (import) · Planning · Stuffing · Closed (export) · Gone out */
  status: string;
  /** Container stamps (ISO), null while not stamped. */
  gateInAt: string | null;
  strippingStartedAt: string | null;
  /** Import: when the last house was accounted for; null while houses are open. */
  strippingCompletedAt: string | null;
  closedAt: string | null;
  closedBy: string;
  gateOutAt: string | null;
  /** The houses, in their order. */
  positions: WarehouseContainerHouse[];
  totals: WarehouseContainerTotals;
  /** Shipment updates from this container's stamps not delivered yet (pending or failed). */
  shipmentUpdatesWaiting: number;
  events: { kind: string; label: string; at: string; by: string; detail?: string }[];
  createdAt: string;
  updatedAt: string;
}

/** Container stamps, in order: import gateIn → strippingStart → gateOut; export gateIn → close → gateOut. */
export type ContainerStampKind = "gateIn" | "strippingStart" | "close" | "gateOut";

/** The tally of one house at stripping. */
export interface ContainerTallyInput {
  /** received (tick off: the house is received) | short | not_arrived */
  outcome: string;
  /** Pieces counted. */
  pieces?: number | null;
  condition?: string;
  location?: string;
  note?: string;
  /** Required for short / not arrived. */
  reason?: string;
}

/** Stuff / ticks answer like stamps: what happened and a text for a toast. */
export interface ContainerActionOutcome {
  /** done · already_done (this request came before) · done_by_someone_else */
  outcome: "done" | "already_done" | "done_by_someone_else";
  notice: string;
}

export interface WarehouseContainerInput {
  movementId?: string | null;
  number?: string;
  equipment?: string;
  seal?: string;
  pieces?: number | null;
  packages?: string;
  weightKg?: number | null;
  cbm?: number | null;
  direction?: string;
  note?: string;
  carrier?: string;
  masterJob?: string;
  dischargePort?: string;
  arrivedAt?: string;
  houses?: number | null;
  dockSlot?: string;
  scheduleStatus?: string;
  yardState?: string;
  gatedIn?: string;
  gatedOut?: string;
  detentionExpiry?: string;
  yardStatus?: string;
  tareKg?: number | null;
  cargoKg?: number | null;
  vgmMethod?: string;
  vgmDeclaredBy?: string;
  vgmDeclaredAt?: string;
  vgmStatus?: string;
  bookingNumber?: string;
  mblNumber?: string;
  vessel?: string;
  voyage?: string;
  /** After the gate-out a new plate is sent to the shipments of the positions that left in it. */
  plate?: string;
}

// ---------- Dock slots ----------

export interface WarehouseDockSlotItem {
  id: string;
  /** Gate movement (position) the slot is for; null only on slots booked before the link existed. */
  movementId: string | null;
  /** Position of the movement: its WCZ reference, customer and gate visit (příjem / výdej). */
  warehouseTaskId: string | null;
  positionRef: string;
  customer: string;
  visit: string;
  /** YYYY-MM-DD (Prague) */
  date: string;
  /** HH:MM (Prague) */
  time: string;
  /** Minutes the dock door is booked for (15–480, in steps of 15). */
  durationMin: number;
  /** HH:MM (Prague) the slot ends; "" when unknown. */
  end: string;
  /** ISO; null on old slots whose date / time could not be read. */
  startsAt: string | null;
  endsAt: string | null;
  dock: string;
  /** IN | OUT — follows the position (příjem = IN, výdej = OUT). */
  direction: string;
  reference: string;
  party: string;
  vehicle: string;
  /** Booked | In progress | Completed | Overdue | Cancelled */
  status: string;
  note: string;
  /** The Trucking trip that booked the slot ("" when booked by hand). */
  tripRef: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A new slot needs `movementId` (the position), date, time and dock; reference, party and vehicle
 * default to the position's WCZ reference, customer and plate. The same dock door cannot be
 * booked twice for overlapping times (409 with the clashing slot named).
 */
export interface WarehouseDockSlotInput {
  movementId?: string | null;
  date?: string;
  time?: string;
  /** 15–480 minutes in steps of 15; default 60. */
  durationMin?: number;
  dock?: string;
  direction?: string;
  reference?: string;
  party?: string;
  vehicle?: string;
  status?: string;
  note?: string;
}

// ---------- Shift roster ----------

export interface WarehouseStaffItem {
  id: string;
  name: string;
  role: string;
  shift: string;
  area: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseStaffInput {
  name?: string;
  role?: string;
  shift?: string;
  area?: string;
  status?: string;
}

// ---------- Equipment ----------

export interface WarehouseEquipmentItem {
  id: string;
  code: string;
  kind: string;
  status: string;
  operator: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseEquipmentInput {
  code?: string;
  kind?: string;
  status?: string;
  operator?: string;
  note?: string;
}

// ---------- Claims ----------

export interface WarehouseClaimItem {
  id: string;
  ref: string;
  job: string;
  against: string;
  type: string;
  value: string;
  raised: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseClaimInput {
  job?: string;
  against?: string;
  type?: string;
  value?: string;
  raised?: string;
  status?: string;
}

// ---------- Report library ----------

export interface WarehouseSavedReportItem {
  id: string;
  name: string;
  owner: string;
  frequency: string;
  format: string;
  distribution: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseSavedReportInput {
  name?: string;
  owner?: string;
  frequency?: string;
  format?: string;
  distribution?: string;
}

// ---------- Calculated reports ----------

export interface ThroughputWeek {
  /** ISO week label, e.g. "W33" */
  week: string;
  receivedCbm: number;
  dispatchedCbm: number;
}

export interface TopCustomer {
  customer: string;
  jobs: number;
  cbm: number;
  /** Chargeable weight/measure: the greater of cbm and tonnes, per position. */
  wm: number;
  /** Share of this month's received volume, 0–100. */
  share: number;
}

export interface MonthlySummary {
  /** YYYY-MM, the current month marked by `monthToDate`. */
  month: string;
  monthToDate: boolean;
  receipts: number;
  cbmIn: number;
  dispatches: number;
  cbmOut: number;
  consolPositions: number;
  containersLoaded: number;
  fclStuffed: number;
  fclStripped: number;
  yardContainerDays: number;
}

export interface LaneFill {
  lane: string;
  containers: number;
  avgCbm: number;
  capacityCbm: number;
  /** Average fill, 0–100 */
  fill: number;
  avgPieces: number;
  /** Healthy ≥ 80 · Acceptable ≥ 60 · Below target */
  verdict: string;
}

export interface QualityMetrics {
  /** Damaged pieces / surveyed pieces this year, percent; null without surveys. */
  damageRate: number | null;
  /** Completed outbound dock slots that were not overdue, percent; null without slots. */
  onTimeDispatch: number | null;
  surveyedPieces: number;
  damagedPieces: number;
}

/** Cargo in the warehouse now, from the one storage calculation (gate records). */
export interface StorageSummary {
  /** Records whose storage clock runs (received, not released / gone out). */
  inWarehouse: number;
  /** Within the last 2 free days. */
  expiring: number;
  chargeable: number;
  /** Estimated storage charge to date of the chargeable records, CZK. */
  estimatedCzk: number;
}

/** Shipment updates the gate still owes (health line). */
export interface ShipmentUpdateHealth {
  /** Being retried. */
  pending: number;
  /** Stopped: need a hand in Shipments. */
  failed: number;
  /** Pending updates held back behind a stopped one of the same shipment (sent in order). */
  blockedByFailed: number;
  /** Oldest pending update (ISO); null when none. */
  oldestPendingAt: string | null;
}

export interface WarehouseReportSummary {
  throughput: ThroughputWeek[];
  topCustomers: TopCustomer[];
  monthly: MonthlySummary[];
  lanes: LaneFill[];
  quality: QualityMetrics;
  storage: StorageSummary;
  shipmentUpdates: ShipmentUpdateHealth;
}
