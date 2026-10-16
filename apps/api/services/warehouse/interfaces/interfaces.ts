export interface WarehouseTaskItem {
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

export interface WarehouseSectionItem {
  id: string;
  shipmentId: string;
  section: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseRef {
  shipmentId: string;
  reference: string;
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
