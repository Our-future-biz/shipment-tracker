import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import { CUSTOMS_STATUSES, gateMovementService } from "../services/gateMovement.service";
import type { WarehouseTaskItem } from "../interfaces/interfaces";
import type { GateMovementItem } from "../interfaces/gate.interfaces";

interface WarehousePositionCreateRequest {
  customer?: string;
  customerRef?: string;
  customerContact?: string;
  shipmentOwner?: string;
  customsStatus?: string;
  /** Import | Export */
  handling?: string;
  freightMode?: string;
  loadType?: string;
  customsMode?: string;
  commodity?: string;
  packing?: string;
  colli?: number;
  weightKg?: number;
  measureCbm?: number;
  note?: string;
  /** Job fields copied from a shipment ("Copy from job"); the position keeps no link to it. */
  jobNumber?: string;
  pol?: string;
  pod?: string;
  etd?: string;
  eta?: string;
  vessel?: string;
  voyage?: string;
  containerNumber?: string;
  sealNumber?: string;
  bookingNumber?: string;
  hblNumber?: string;
  mblNumber?: string;
}

interface WarehousePositionCreateResponse {
  task: WarehouseTaskItem;
  movement: GateMovementItem;
}

// "Create new" in the warehouse: a position of its own (WCZ reference) that is NOT paired
// with a shipment — no shipment job is created. Its data lives on the gate log movement.
export const warehousePositionCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-positions" },
  async (req: WarehousePositionCreateRequest): Promise<WarehousePositionCreateResponse> => {
    const { companyID, userID } = getAuthData()!;
    const task = await warehouseService.createPosition(companyID);
    const handling = req.handling === "Export" ? "Export" : "Import";
    const movement = await gateMovementService.create(companyID, userID, {
      ...req,
      // A job's customs status is kept only when the gate knows it; otherwise the gate default applies.
      customsStatus: req.customsStatus && CUSTOMS_STATUSES.includes(req.customsStatus) ? req.customsStatus : undefined,
      handling,
      // Import cargo leaves through the gate, export cargo arrives — as for shipment positions.
      visit: handling === "Import" ? "výdej" : "příjem",
      warehouseTaskId: task.id,
    });
    return { task: task as unknown as WarehouseTaskItem, movement };
  },
);
