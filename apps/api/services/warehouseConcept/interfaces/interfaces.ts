export interface WarehouseConceptTaskItem {
  id: string;
  taskId: string;
  shipmentId: string | null;
  type: string;
  priority: string;
  status: string;
  /** E-mail of a user of the company ("" for nobody); an older task may still hold a name. */
  assignee: string;
  /** yyyy-mm-dd, or null when not set */
  dueDate: string | null;
  cargo: string;
  weight: string;
  notes: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

/** The parts of a shipment's warehouse record, each saved on its own. */
export const WAREHOUSE_SECTIONS = ["job", "customs", "pickup", "invoicing"] as const;
export type WarehouseSection = (typeof WAREHOUSE_SECTIONS)[number];

export interface WarehouseConceptSectionItem {
  id: string;
  /** The warehouse position the section belongs to; null for the pick-up section and for shipments with no position. */
  taskId: string | null;
  /** The shipment of the section (for information); null for a stand-alone position. */
  shipmentId: string | null;
  section: string;
  data: unknown;
  /** Bumped by every save of the section. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Per position: what the remeasurement worklist needs from its Shipment Details. */
export interface WarehouseSectionSummaryItem {
  taskId: string;
  /** Remeasured lines are saved. */
  hasLines: boolean;
  lineCount: number;
  /** When the remeasured lines were last saved (ISO); null when unknown. */
  linesSavedAt: string | null;
  /** Last "Remeasurement marked as sent" (ISO); null when never. */
  remeasurementSentAt: string | null;
  /** Last "Operations informed" (ISO); null when never. */
  operationsInformedAt: string | null;
  hasNotes: boolean;
  version: number;
  updatedAt: string;
}

export interface WarehouseTaskPatch {
  type?: string;
  priority?: string;
  status?: string;
  /** E-mail of a user of the company, "" for nobody; the task's current value is also accepted. */
  assignee?: string;
  /** yyyy-mm-dd; "" clears it */
  dueDate?: string;
  cargo?: string;
  weight?: string;
  notes?: string;
  data?: unknown;
}

// ─── Operations facts (Shipments → Managers, Council Outlay 11 step 5, D29/D30) ──────────────
// What the Warehouse cockpit itself says about the warehouse records of some shipments, so the
// Shipments cockpit never disagrees with it. Read only.

/** One signal of a record, in the Warehouse cockpit's own words ("Pick-up PIN: locked 23.10. 09:12"). */
export interface WarehouseOperationsSignal {
  text: string;
  /** Act today (red); otherwise attention (amber). */
  urgent: boolean;
}

/** A warehouse record of the shipment still in play: a position (gate record) or a container its cargo is on. */
export interface WarehouseOperationsRecord {
  /** The gate record's id, or the container's id. */
  id: string;
  /** WCZ ref of a position (its gate ref without one), or the container number ("(no number)"). */
  ref: string;
  /** The position's lifecycle label ("In warehouse", "Ready · Refused"); a container's status. */
  lifecycle: string;
  /** Its signals as the Warehouse cockpit tags them (urgent first, then by rank); empty when none. */
  signals: WarehouseOperationsSignal[];
}

export interface WarehouseShipmentFacts {
  shipmentId: string;
  /** Each warehouse record (position) of the shipment that is still in play, with the Warehouse cockpit's OWN signals for it */
  records: WarehouseOperationsRecord[];
  /**
   * Updates from the warehouse to this shipment waiting longer than the module's stale limit
   * (STALE_PENDING_MINUTES), or failed. null when they could not be read (`notKnown` says so) —
   * never 0 for "not known".
   */
  updatesWaiting: number | null;
  updatesFailed: number | null;
}

export interface WarehouseOperationsFacts {
  /** One per shipment id asked for (each once, in the order asked; ids that are not uuids are left out). */
  shipments: WarehouseShipmentFacts[];
  /** What could not be read, in plain words ("the warehouse's records"); none of its figures are given. */
  notKnown: string[];
}
