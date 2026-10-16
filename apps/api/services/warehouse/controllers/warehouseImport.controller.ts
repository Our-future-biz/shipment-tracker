import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { warehouseImportService } from "../services/warehouseImport.service";
import type { GateMovementItem, WarehouseImportResult } from "../interfaces/gate.interfaces";
import { requireModule } from "../../../lib/modules";

interface WarehouseImportRequest {
  /** Shipments to bring into the warehouse (up to 200 per request; duplicates count once). */
  shipmentIds: string[];
}

interface WarehouseImportResponse {
  /** One result per shipment, in the order sent. */
  results: WarehouseImportResult[];
}

// Imports shipments in one request: each gets its position (WCZ reference) and gate record in
// one transaction. Per shipment: created, already in the warehouse, or failed with the reason.
export const warehouseImport = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse/import" },
  async ({ shipmentIds }: WarehouseImportRequest): Promise<WarehouseImportResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { results: await warehouseImportService.importShipments(companyID, userID, shipmentIds) };
  },
);

interface GateRepairMissingResponse {
  created: number;
  failed: { taskId: string; ref: string; reason: string }[];
}

// Manager only: positions of shipments without a gate record (from before every import made
// one) get it now, from their shipment. Shipments that cannot be read are reported.
export const gateMovementRepairMissing = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/repair-missing" },
  async (): Promise<GateRepairMissingResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = requireRole("superadmin", "admin", "manager");
    return warehouseImportService.repairMissingRows(companyID, userID, role);
  },
);

interface GateRefreshFromShipmentResponse {
  movement: GateMovementItem;
  /** What changed, in words; empty when the record already matched the shipment. */
  changed: string[];
  /** Gate-checked values (pieces, weight, measure, packing, container, seal) kept on a stamped record although the shipment differs. */
  differs: string[];
}

// Copies the linked shipment's data onto the gate record again; any user, logged.
export const gateMovementRefreshFromShipment = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-gate/:id/refresh-from-shipment" },
  async ({ id }: { id: string }): Promise<GateRefreshFromShipmentResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return warehouseImportService.refreshFromShipment(id, companyID, userID);
  },
);
