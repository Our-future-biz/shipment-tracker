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
  createdAt: string;
  updatedAt: string;
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
}

// ---------- Dock slots ----------

export interface WarehouseDockSlotItem {
  id: string;
  date: string;
  time: string;
  dock: string;
  direction: string;
  reference: string;
  party: string;
  vehicle: string;
  status: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseDockSlotInput {
  date?: string;
  time?: string;
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

export interface WarehouseReportSummary {
  throughput: ThroughputWeek[];
  topCustomers: TopCustomer[];
  monthly: MonthlySummary[];
  lanes: LaneFill[];
  quality: QualityMetrics;
}
