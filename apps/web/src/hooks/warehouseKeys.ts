import type { QueryClient } from "@tanstack/react-query";

// Query keys of the warehouse screens, in one place: every hook and every invalidation uses these
// factories, so a list can't be refreshed under a key nobody reads (or missed under one that is).

/** Gate Log: the list, the archived list, one movement, its files and a file's object URL. */
export const gateKeys = {
  all: ["warehouse-concept-gate"] as const,
  list: () => [...gateKeys.all] as const,
  archived: () => [...gateKeys.all, "archived"] as const,
  one: (id: string | undefined) => [...gateKeys.all, id] as const,
  files: (movementId: string) => [...gateKeys.all, movementId, "files"] as const,
  fileBlob: (movementId: string, fileId: string | undefined) => [...gateKeys.all, movementId, "files", fileId, "blob"] as const,
};

/** Warehouse positions (tasks) and a shipment's warehouse part (Shipments → Warehouse tab). */
export const warehouseTaskKeys = {
  all: ["warehouse-concept"] as const,
  list: () => [...warehouseTaskKeys.all] as const,
  byShipment: (shipmentId: string) => [...warehouseTaskKeys.all, "by-shipment", shipmentId] as const,
};

/** Warehouse record lists (stock, zones, bonded, containers, dock slots, reports …). */
export const warehouseRecordKeys = {
  all: ["warehouse-concept-records"] as const,
  of: (key: string) => [...warehouseRecordKeys.all, key] as const,
  container: (id: string) => [...warehouseRecordKeys.all, "containers", id] as const,
  reportSummary: () => [...warehouseRecordKeys.all, "report-summary"] as const,
  kpis: (from: string, to: string) => [...warehouseRecordKeys.all, "report-summary", "kpis", from, to] as const,
};

/** The stock-side lists a gate event changes on the server (Phase 5c builds them from gate events). */
export const STOCK_RECORD_KEYS = ["stock-lines", "zones", "stock-movements", "bonded", "report-summary"] as const;

/** Sections (job, pick-up, remeasurement …) of a shipment or a position, and their summary. */
export const sectionKeys = {
  all: ["warehouse-concept-section"] as const,
  ofShipment: (shipmentId: string, section: string) => [...sectionKeys.all, shipmentId, section] as const,
  ofTask: (taskId: string, section: string) => [...sectionKeys.all, "task", taskId, section] as const,
  summary: () => ["warehouse-concept-section-summary"] as const,
};

/** The shipment a position belongs to, as the Remeasurement tab reads it. */
export const warehouseShipmentKey = (shipmentId: string | null | undefined) => ["warehouse-concept-shipment", shipmentId] as const;

export const warehouseSettingsKey = ["warehouse-concept-settings"] as const;

export const supplierEmailAttemptsKey = (taskId: string) => ["warehouse-concept-supplier-emails", taskId] as const;

export const supplierEmailPreviewKey = (taskId: string, what: string) => ["warehouse-concept-supplier-email-preview", taskId, what] as const;

export const warehouseImportKeys = {
  shipments: (search: string) => ["warehouse-concept-import-shipments", search] as const,
  masters: () => ["warehouse-concept-import-masters"] as const,
  master: (id: string) => ["warehouse-concept-import-master", id] as const,
  copyJobs: (query: string) => ["warehouse-concept-copy-jobs", query] as const,
  copyQuotes: () => ["quotes", "warehouse-copy"] as const,
};

export const nextJobNumberKey = ["warehouse-concept-next-job-number"] as const;

/** The managers' cockpit (Warehouse Concept → Managers). */
export const managersCockpitKey = ["warehouse-concept-managers-cockpit"] as const;

/**
 * Everything a gate event (stamp, void, restore, archive, tally, container stamp) can change on the
 * server: the Gate Log, the stock / bonded / KPI lists built from gate events, the sections, and the
 * positions with a shipment's warehouse part.
 */
export function invalidateAfterGateEvent(qc: QueryClient): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: gateKeys.all }),
    ...STOCK_RECORD_KEYS.map((k) => qc.invalidateQueries({ queryKey: warehouseRecordKeys.of(k) })),
    qc.invalidateQueries({ queryKey: warehouseRecordKeys.of("containers") }),
    qc.invalidateQueries({ queryKey: sectionKeys.all }),
    qc.invalidateQueries({ queryKey: sectionKeys.summary() }),
    qc.invalidateQueries({ queryKey: warehouseTaskKeys.all }),
    qc.invalidateQueries({ queryKey: managersCockpitKey }),
  ]);
}
