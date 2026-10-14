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
  /** Free circulation | T1 bonded | Export cleared */
  customs: string;
  /** Available | Allocated | On hold | Picked */
  status: string;
  consol: string;
  marks: string;
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
  /** In stock | Discharged (balance 0) */
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseBondedEntryInput {
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
}
