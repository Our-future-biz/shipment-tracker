// ---------- Customs counter ----------

/** Days under customs control and the EU temporary-storage deadline (display only). */
export interface StockCustomsClock {
  /** "" (not under customs control) | Temporary storage | Transit T1 | Customs warehouse */
  regime: string;
  /** none | not_started | ok | warning (≤ 10 days left) | overdue | stopped */
  state: string;
  /** YYYY-MM-DD (Prague) */
  startDate: string;
  stopDate: string;
  /** Receipt day = day 1. */
  daysUnderControl: number;
  /** YYYY-MM-DD: receipt day + 90 (UCC art. 149); "" for a customs warehouse. */
  deadline: string;
  /** Negative = overdue; null without a deadline. */
  daysLeft: number | null;
  note: string;
}

// ---------- Stock on hand ----------

export interface WarehouseStockLineItem {
  id: string;
  job: string;
  customer: string;
  shipper: string;
  pod: string;
  pieces: number;
  packageType: string;
  weightKg: number;
  cbm: number;
  /** Chargeable weight/measure: the larger of cbm and tonnes. */
  wm: number;
  location: string;
  /** YYYY-MM-DD */
  receivedAt: string;
  freeDays: number;
  /** Free circulation | T1 bonded | Temporary storage | Customs warehouse | Export cleared */
  customs: string;
  /** Available | Allocated | On hold | Picked (left) | Voided (receipt voided / position archived) */
  status: string;
  consol: string;
  marks: string;
  /** auto (follows the gate record) | manual (typed by hand) */
  source: string;
  /** The gate record (position) it belongs to; null = not linked. */
  movementId: string | null;
  taskId: string | null;
  /** WCZ ref of the linked position ("" when not linked). */
  positionRef: string;
  /** Job no. of the linked position. */
  jobNumber: string;
  /** The linked position is archived. */
  positionArchived: boolean;
  /** Not on hand any more (Picked / Voided). */
  closed: boolean;
  /** ISO; when it left or was voided. */
  closedAt: string | null;
  closedReason: string;
  /** ISO receipt stamp (auto lines). */
  receivedInstant: string | null;
  customsRegime: string;
  customsClock: StockCustomsClock;
  /** Calendar days in the warehouse (Prague dates); the receipt day is day 1. */
  daysInStock: number;
  /** Days past free time (negative = days left). */
  overFreeTime: number;
  /** Within free time | Expiring (2 free days left or fewer) | Chargeable */
  freeTimeState: string;
  /** YYYY-MM-DD */
  lastFreeDay: string;
  chargeableDays: number;
  /** Storage accrued to date in CZK (w/m × 22 per day, at least 120 per day). */
  accruedCzk: number;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseStockLineInput {
  /** Position picker (gate record id); "" / null = not linked (then `job` is typed). */
  movementId?: string | null;
  job?: string;
  customer?: string;
  shipper?: string;
  pod?: string;
  pieces?: number;
  packageType?: string;
  weightKg?: number;
  cbm?: number;
  location?: string;
  receivedAt?: string;
  freeDays?: number;
  customs?: string;
  status?: string;
  consol?: string;
  marks?: string;
}

// ---------- Zones ----------

export interface WarehouseZoneItem {
  id: string;
  code: string;
  name: string;
  bays: number;
  /** Pallet positions; 0 = floor storage counted by bays. */
  capacity: number;
  /** Comma list of blocked bay codes, e.g. "C-05". */
  blockedBays: string;
  note: string;
  /** Bays holding at least one stock line. */
  usedBays: number;
  /** Pieces stored in the zone. */
  occupied: number;
  /** How full the zone is, in %. */
  fullPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseZoneInput {
  code?: string;
  name?: string;
  bays?: number;
  capacity?: number;
  blockedBays?: string;
  note?: string;
}

// ---------- Movements ----------

export interface WarehouseStockMovementItem {
  id: string;
  /** YYYY-MM-DDTHH:MM */
  at: string;
  /** Receipt | Put-away | Transfer | Pick | Load | Adjustment | Rework */
  type: string;
  job: string;
  pieces: number;
  fromLocation: string;
  toLocation: string;
  userName: string;
  reference: string;
  /** auto (written by the gate) | manual */
  source: string;
  movementId: string | null;
  createdAt: string;
}

export interface WarehouseStockMovementInput {
  /** YYYY-MM-DDTHH:MM; defaults to now. */
  at?: string;
  type: string;
  job?: string;
  pieces?: number;
  fromLocation?: string;
  toLocation?: string;
  reference?: string;
}

// ---------- Bonded register ----------

export interface WarehouseBondedEntryItem {
  id: string;
  mrn: string;
  job: string;
  consignee: string;
  procedure: string;
  /** YYYY-MM-DD */
  entryDate: string;
  pieces: number;
  weightKg: number;
  customsValue: string;
  discharge: string;
  balance: number;
  /** In stock | Discharged (balance 0) | Voided (receipt voided / position archived) */
  status: string;
  /** auto (opened at the receipt, discharged when it leaves) | manual */
  source: string;
  movementId: string | null;
  taskId: string | null;
  positionRef: string;
  jobNumber: string;
  positionArchived: boolean;
  /** Temporary storage | Transit T1 | Customs warehouse ("" on old manual entries). */
  regime: string;
  /** ISO */
  enteredAt: string | null;
  dischargedAt: string | null;
  dischargeRef: string;
  /** YYYY-MM-DD; "" without a 90-day limit. */
  deadline: string;
  voidedReason: string;
  /** An entry without an MRN (still to be recorded). */
  mrnMissing: boolean;
  customsClock: StockCustomsClock;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseBondedEntryInput {
  /** Position picker (gate record id); "" / null = not linked. */
  movementId?: string | null;
  mrn?: string;
  job?: string;
  consignee?: string;
  procedure?: string;
  entryDate?: string;
  pieces?: number;
  weightKg?: number;
  customsValue?: string;
  discharge?: string;
  balance?: number;
  dischargeRef?: string;
}

// ---------- Build stock from gate records (manager) ----------

export interface WarehouseStockSyncRequest {
  /** Only count what would change. */
  dryRun?: boolean;
}

export interface WarehouseStockSyncResult {
  dryRun: boolean;
  /** Live gate records looked at. */
  positions: number;
  linesCreated: number;
  linesClosed: number;
  linesVoided: number;
  linesReopened: number;
  bondedOpened: number;
  bondedDischarged: number;
  bondedVoided: number;
  /** WCZ refs that already have a manual line linked (no automatic line made — check them). */
  manualLineExists: string[];
}
