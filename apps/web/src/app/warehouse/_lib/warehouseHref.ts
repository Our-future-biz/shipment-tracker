import type { interfaces } from "@/lib/api/client";

/** A shipment's warehouse record, on the Warehouse page it is on now (In Warehouse, Stock or Out Warehouse). */
export const warehouseRecordHref = (page: interfaces.WarehousePage, shipmentId: string) => `/warehouse/${page}/${encodeURIComponent(shipmentId)}`;
