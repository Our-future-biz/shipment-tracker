import type { MaxLen } from "encore.dev/validate";

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

/** One field of a section to save (Shipment Details is saved field by field). */
export interface WarehouseSectionChange {
  key: string;
  /** The new text; "" clears the field. */
  value: string;
  /** The text the client last saw ("" = not set); when given, the save is refused if it changed since. */
  expected?: string;
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

// ── Main search (the app-wide search in the top bar) ──────────────────────────

/** GET /search/warehouse: the typed text and how many rows to give. */
export interface SearchWarehouseRequest {
  /** What was typed; a reference is looked for from 4 characters (spaces left out). */
  q: string & MaxLen<200>;
  /** Rows to give: 5 when left out, 1 to 50. */
  limit?: number;
}

/** The Warehouse page a shipment is on: In Warehouse, Stock or Out Warehouse. */
export type WarehousePage = "in" | "stock" | "out";

/** A shipment's warehouse record found by the main search, with its job. */
export interface SearchWarehouseItem {
  id: string;
  /** Its warehouse reference (WHCZ…). */
  reference: string;
  shipmentId: string;
  jobNumber: string;
  customer: string;
  /** Where the shipment is in the warehouse now, so the record opens on that page. */
  page: WarehousePage;
}

export interface SearchWarehouseResponse {
  /** The newest matching records, at most `limit`. */
  items: SearchWarehouseItem[];
  /** How many records match in all. */
  total: number;
}
