export interface WarehouseConceptTaskItem {
  id: string;
  taskId: string;
  shipmentId: string | null;
  type: string;
  priority: string;
  status: string;
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
  assignee?: string;
  /** yyyy-mm-dd; "" clears it */
  dueDate?: string;
  cargo?: string;
  weight?: string;
  notes?: string;
  data?: unknown;
}
