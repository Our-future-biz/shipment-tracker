import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseService } from "../services/warehouse.service";
import type { WarehouseConceptTaskItem } from "../interfaces/interfaces";

interface WarehouseConceptListRequest {
  shipmentId?: string;
}

interface WarehouseConceptListResponse {
  tasks: WarehouseConceptTaskItem[];
}

// One shipment's positions (the Shipments → Warehouse tab) are there for every company; the whole
// list is the Warehouse Concept's Positions screen.
export const warehouseList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-concept" },
  async (req: WarehouseConceptListRequest): Promise<WarehouseConceptListResponse> => {
    const companyId = getAuthData()!.companyID;
    const tasks = req.shipmentId
      ? await warehouseService.listByShipmentId(req.shipmentId, companyId)
      : await warehouseService.listAll(companyId);
    return { tasks };
  },
);
