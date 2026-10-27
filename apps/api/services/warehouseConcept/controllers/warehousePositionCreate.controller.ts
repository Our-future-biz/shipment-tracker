import { api } from "encore.dev/api";
import type { Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { warehouseImportService } from "../services/warehouseImport.service";
import { toTaskItem } from "../services/warehouse.service";
import type { WarehouseConceptTaskItem } from "../interfaces/interfaces";
import type { GateCustomsMode, GateCustomsStatus, GateHandling, GateMovementItem } from "../interfaces/gate.interfaces";

interface WarehousePositionCreateRequest {
  customer?: string;
  customerRef?: string;
  customerContact?: string;
  /** E-mail of a user of the company. */
  shipmentOwner?: string;
  customsStatus?: GateCustomsStatus;
  handling?: GateHandling;
  freightMode?: string;
  loadType?: string;
  customsMode?: GateCustomsMode;
  commodity?: string;
  packing?: string;
  colli?: number & Min<0>;
  weightKg?: number & Min<0>;
  measureCbm?: number & Min<0>;
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
  task: WarehouseConceptTaskItem;
  movement: GateMovementItem;
}

// "Create new" in the warehouse: a position of its own (WCZ reference) that is NOT paired
// with a shipment — no shipment job is created. Its data lives on the gate log movement; the
// position and its movement are created together (one transaction).
export const warehousePositionCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/positions" },
  async (req: WarehousePositionCreateRequest): Promise<WarehousePositionCreateResponse> => {
    const { companyID, userID } = getAuthData()!;
    const { task, movement } = await warehouseImportService.createPosition(companyID, userID, req);
    return { task: toTaskItem(task), movement };
  },
);
